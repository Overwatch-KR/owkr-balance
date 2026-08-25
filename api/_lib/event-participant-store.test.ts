import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import type { ScrimRecord } from '../../domains/scrim/shared/public';
import {
    addEventParticipation,
    getEventParticipation,
    getEventUserSheetCandidates,
    saveEventParticipation,
} from './event-participant-store';

const ADMIN_USER_ID = '579176046817968128';

const scrims = [{
    id: 'scrim-1',
    date: '2026-08-20',
    startTime: '21:00',
    customGameStartsAt: 1,
    satisfactionExpiresAt: 2,
    createdAt: 0,
    createdBy: '관리자',
    rosterSnapshot: [
        { id: 'player-1', name: '참여 후보 1' },
        { id: 'player-2', name: '참여 후보 2' },
    ],
    usedBanHeroIds: [],
    votes: [],
    satisfactionResponses: [],
}] satisfies ScrimRecord[];

const createRedis = () => {
    let stored: unknown = null;
    return {
        redis: {
            get: vi.fn(async () => structuredClone(stored)),
            set: vi.fn(async (_key: string, value: unknown) => {
                stored = structuredClone(value);
                return 'OK';
            }),
        } as unknown as Redis,
    };
};

describe('event participant store', () => {
    it('유저 시트 후보는 Discord ID를 우선 사용하고 관리자 계정을 제외한다', () => {
        const candidates = getEventUserSheetCandidates([
            {
                id: 'sheet-player',
                discordUserId: '11111111111111111',
                discordName: '시트 유저',
                battleTag: 'Sheet#1111',
                tank: '', dps: '', support: '', note: '',
                createdAt: 0, updatedAt: 0, updatedByName: '관리자',
            },
            {
                id: 'sheet-admin',
                discordUserId: ADMIN_USER_ID,
                discordName: '관리자',
                battleTag: 'Admin#1111',
                tank: '', dps: '', support: '', note: '',
                createdAt: 0, updatedAt: 0, updatedByName: '관리자',
            },
        ]);

        expect(candidates).toEqual([{
            id: '11111111111111111',
            name: 'Sheet#1111',
            discordName: '시트 유저',
            discordUserId: '11111111111111111',
        }]);
    });

    it('로스터는 후보로만 반환하고 자동으로 참여 처리하지 않는다', async () => {
        const { redis } = createRedis();

        const result = await getEventParticipation(redis, scrims);

        expect(result.candidates).toHaveLength(2);
        expect(result.participantIds).toEqual([]);
    });

    it('관리자가 선택한 후보만 실제 참여자로 저장한다', async () => {
        const { redis } = createRedis();

        const saved = await saveEventParticipation(redis, scrims, ['player-2']);
        const loaded = await getEventParticipation(redis, scrims);

        expect(saved?.participantIds).toEqual(['player-2']);
        expect(loaded.participantIds).toEqual(['player-2']);
    });

    it('관리자 계정은 로스터 후보와 저장된 참여 집계에서 제외한다', async () => {
        const { redis } = createRedis();
        const scrimsWithAdmin = [{
            ...scrims[0],
            rosterSnapshot: [
                ...scrims[0].rosterSnapshot,
                { id: ADMIN_USER_ID, name: '관리자 참가자' },
            ],
        }];
        await redis.set('ignored-by-mock', {
            participants: [
                { id: 'player-1', name: '참여 후보 1' },
                { id: ADMIN_USER_ID, name: '관리자 참가자' },
            ],
            updatedAt: 100,
        });

        const result = await getEventParticipation(redis, scrimsWithAdmin);

        expect(result.candidates.map(participant => participant.id)).toEqual(['player-1', 'player-2']);
        expect(result.participantIds).toEqual(['player-1']);
    });

    it('로스터 후보에 없는 ID는 저장하지 않는다', async () => {
        const { redis } = createRedis();

        await expect(saveEventParticipation(redis, scrims, ['unknown'])).resolves.toBeNull();
        expect(redis.set).not.toHaveBeenCalled();
    });

    it('유저 시트에서 제공한 후보는 로스터에 없어도 저장한다', async () => {
        const { redis } = createRedis();
        const sheetParticipant = { id: 'sheet-player', name: 'Sheet#1111', discordName: '시트 유저' };

        const saved = await saveEventParticipation(
            redis,
            scrims,
            ['sheet-player'],
            [sheetParticipant],
        );

        expect(saved?.participantIds).toEqual(['sheet-player']);
        expect(saved?.candidates).toContainEqual(sheetParticipant);
    });

    it('팀 결과 참여자를 기존 명단과 합치고 같은 ID는 중복 저장하지 않는다', async () => {
        const { redis } = createRedis();
        await saveEventParticipation(redis, scrims, ['player-1']);

        const result = await addEventParticipation(redis, scrims, [
            { id: 'player-1', name: '갱신된 이름' },
            { id: 'direct-player', name: '직접 등록' },
        ]);

        expect(result?.participantIds).toEqual(['player-1', 'direct-player']);
        expect(result?.candidates).toContainEqual({ id: 'player-1', name: '갱신된 이름' });
        expect(result?.candidates).toContainEqual({ id: 'direct-player', name: '직접 등록' });
    });

    it('이미 저장된 팀 결과 참여자를 다시 보내면 저장소를 갱신하지 않는다', async () => {
        const { redis } = createRedis();
        const participants = [{ id: 'direct-player', name: '직접 등록' }];
        await addEventParticipation(redis, scrims, participants);
        vi.mocked(redis.set).mockClear();

        const result = await addEventParticipation(redis, scrims, participants);

        expect(result?.participantIds).toEqual(['direct-player']);
        expect(redis.set).not.toHaveBeenCalled();
    });

    it('팀 결과에서 관리자 계정을 보내도 참여 집계에 추가하지 않는다', async () => {
        const { redis } = createRedis();

        const result = await addEventParticipation(redis, scrims, [
            { id: ADMIN_USER_ID, name: '관리자 참가자' },
            { id: 'direct-player', name: '직접 등록' },
        ]);

        expect(result?.participantIds).toEqual(['direct-player']);
        expect(result?.candidates.map(participant => participant.id)).not.toContain(ADMIN_USER_ID);
    });

    it('팀 결과 참여자는 10명 이하의 유효한 고유 ID만 허용한다', async () => {
        const { redis } = createRedis();

        await expect(addEventParticipation(redis, scrims, [
            { id: 'same', name: '첫 번째' },
            { id: 'same', name: '두 번째' },
        ])).resolves.toBeNull();
        expect(redis.set).not.toHaveBeenCalled();
    });
});
