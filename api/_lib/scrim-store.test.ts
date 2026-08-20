import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import { HEROES } from '../../domains/scrim/shared/rules';
import type { HeroVote, ScrimRecord } from '../../domains/scrim/shared/public';
import {
    activatePublicLink,
    deleteScrim,
    extendSatisfaction,
    getPublicScrims,
    getSuggestedBanDecision,
    resolveTiedBansRandomly,
    submitSatisfaction,
    updateScrimReview,
} from './scrim-store';

const createRecord = (votes: HeroVote[]): ScrimRecord => ({
    id: 'scrim-1',
    date: '2026-07-30',
    startTime: '21:00',
    customGameStartsAt: Date.now() + 60_000,
    satisfactionExpiresAt: Date.now() + 86_400_000,
    createdAt: Date.now(),
    createdBy: '관리자',
    rosterSnapshot: [],
    usedBanHeroIds: [],
    votes,
    satisfactionResponses: [],
});

const createVote = (participant: string, heroIds: string[]): HeroVote => ({
    rosterParticipantId: participant,
    heroIds,
    submittedAt: Date.now(),
});

const createRedis = (records: ScrimRecord[]) => {
    let storedRecords = structuredClone(records);
    const redis = {
        get: vi.fn(async () => structuredClone(storedRecords)),
        set: vi.fn(async (_key: string, value: ScrimRecord[]) => {
            storedRecords = structuredClone(value);
            return 'OK';
        }),
    } as unknown as Redis;
    return { redis, read: () => storedRecords };
};

describe('scrim hero ban decision', () => {
    it('첫 번째 영웅과 같은 역할군을 제외하고 두 번째 영웅을 자동 선정한다', () => {
        const record = createRecord([
            createVote('1', ['ana', 'juno', 'tracer']),
            createVote('2', ['ana', 'juno', 'tracer']),
            createVote('3', ['ana', 'juno', 'dva']),
            createVote('4', ['ana', 'tracer', 'dva']),
        ]);

        expect(getSuggestedBanDecision(record)).toMatchObject({
            heroIds: ['ana', 'tracer'],
            automaticallySelected: true,
            hasTie: false,
            resolvedBy: 'automatic',
        });
    });

    it('동점 랜덤 추첨도 서로 다른 역할군의 영웅 두 명만 확정한다', async () => {
        const record = createRecord([
            createVote('1', ['ana', 'tracer']),
            createVote('2', ['ana', 'tracer']),
            createVote('3', ['juno', 'dva']),
            createVote('4', ['juno', 'dva']),
        ]);
        const { redis, read } = createRedis([record]);

        const result = await resolveTiedBansRandomly(redis, record.id);
        const heroIds = result?.finalBanDecision?.heroIds ?? [];
        const roles = heroIds.map(heroId => HEROES.find(hero => hero.id === heroId)?.role);

        expect(heroIds).toHaveLength(2);
        expect(new Set(roles).size).toBe(2);
        expect(result?.finalBanDecision).toMatchObject({
            automaticallySelected: false,
            hasTie: true,
            resolvedBy: 'random',
        });
        expect(read()[0].finalBanDecision).toEqual(result?.finalBanDecision);
    });
});

describe('scrim satisfaction and admin review', () => {
    it('별점이나 기타 선택 여부와 관계없이 선택형 자유 의견을 저장한다', async () => {
        const record = {
            ...createRecord([]),
            customGameStartsAt: Date.now() - 60_000,
            publicLinks: {
                satisfaction: {
                    token: 'satisfaction-token',
                    active: true,
                    createdAt: Date.now(),
                },
            },
        };
        const { redis, read } = createRedis([record]);

        await expect(submitSatisfaction(
            redis,
            'satisfaction-token',
            record.id,
            {
                score: 5,
                disappointments: [],
                otherOpinion: '다음에도 같은 방식으로 진행해 주세요.',
            },
        )).resolves.toBe('OK');
        expect(read()[0].satisfactionResponses[0]).toMatchObject({
            score: 5,
            disappointments: [],
            otherOpinion: '다음에도 같은 방식으로 진행해 주세요.',
        });
    });

    it('만족도 응답 기간을 반복 연장하고 링크를 활성 상태로 유지한다', async () => {
        const record = {
            ...createRecord([]),
            satisfactionExpiresAt: Date.now() - 1_000,
            publicLinks: {
                satisfaction: {
                    token: 'satisfaction-token',
                    active: false,
                    createdAt: Date.now() - 60_000,
                },
            },
        };
        const { redis } = createRedis([record]);

        const first = await extendSatisfaction(redis, record.id);
        const second = await extendSatisfaction(redis, record.id);

        expect(first?.satisfactionExpiresAt).toBeGreaterThan(Date.now());
        expect(second?.satisfactionExpiresAt).toBe(
            first!.satisfactionExpiresAt + 86_400_000,
        );
        expect(second?.publicLinks?.satisfaction).toMatchObject({
            active: true,
            token: 'satisfaction-token',
        });
    });

    it('만료된 만족도 링크를 다시 활성화하면 응답 기간도 함께 복구한다', async () => {
        const record = {
            ...createRecord([]),
            satisfactionExpiresAt: Date.now() - 1_000,
            publicLinks: {
                satisfaction: {
                    token: 'satisfaction-token',
                    active: false,
                    createdAt: Date.now() - 60_000,
                },
            },
        };
        const { redis } = createRedis([record]);

        const activated = await activatePublicLink(
            redis,
            record.id,
            'satisfaction',
            false,
        );

        expect(activated?.satisfactionExpiresAt).toBeGreaterThan(Date.now());
        expect(activated?.publicLinks?.satisfaction).toMatchObject({
            active: true,
            token: 'satisfaction-token',
        });
    });

    it('관리자 후기는 저장하되 공개 참여 응답에서는 제외한다', async () => {
        const record = {
            ...createRecord([]),
            publicLinks: {
                satisfaction: {
                    token: 'satisfaction-token',
                    active: true,
                    createdAt: Date.now(),
                },
            },
        };
        const { redis } = createRedis([record]);

        const updated = await updateScrimReview(
            redis,
            record.id,
            '다음 내전에서는 시작 안내를 10분 먼저 진행',
            '운영자',
        );
        const participation = await getPublicScrims(redis, 'satisfaction-token');

        expect(updated).toMatchObject({
            adminReview: '다음 내전에서는 시작 안내를 10분 먼저 진행',
            adminReviewUpdatedBy: '운영자',
        });
        expect(participation?.scrims[0]).not.toHaveProperty('adminReview');
        expect(participation?.scrims[0]).not.toHaveProperty('adminReviewUpdatedAt');
        expect(participation?.scrims[0]).not.toHaveProperty('adminReviewUpdatedBy');
    });

    it('등록한 관리자 본인만 내전 기록을 삭제한다', async () => {
        const record = {
            ...createRecord([]),
            createdById: 'owner-id',
        };
        const { redis, read } = createRedis([record]);

        await expect(deleteScrim(redis, record.id, 'other-id')).resolves.toBe(false);
        expect(read()).toHaveLength(1);
        await expect(deleteScrim(redis, record.id, 'owner-id')).resolves.toBe(true);
        expect(read()).toHaveLength(0);
    });
});
