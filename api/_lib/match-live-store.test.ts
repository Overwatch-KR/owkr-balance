import type { Redis } from '@upstash/redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MATCH_SHARE_POSITIONS,
    getMatchLiveExpiresAt,
    type MatchLiveParticipant,
} from '../../domains/balance/shared/public';
import {
    createMatchLiveSession,
    getMatchLiveSession,
    updateMatchLiveSession,
    type MatchLiveActor,
} from './match-live-store';

const participants: MatchLiveParticipant[] = Array.from({ length: 3 }, (_, index) => ({
    discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
    position: null,
}));
const actor: MatchLiveActor = {
    userId: 'discord-admin-1',
    displayName: '관리자 A',
    avatarUrl: 'https://cdn.discordapp.com/avatars/1/avatar.webp',
};

const createRedis = () => {
    const values = new Map<string, unknown>();
    const get = vi.fn(async (key: string) => structuredClone(values.get(key) ?? null));
    const set = vi.fn(async (
        key: string,
        value: unknown,
        options?: { ex?: number },
    ) => {
        void options;
        values.set(key, structuredClone(value));
        return 'OK';
    });
    const evalFn = vi.fn(async (
        _script: string,
        keys: string[],
        args: string[],
    ) => {
        const key = keys[0];
        const current = values.get(key) as {
            expiresAt: number;
            collaborators: Array<MatchLiveActor & { lastSeenAt: number }>;
            revision: number;
            participants: MatchLiveParticipant[];
            recentChange: unknown;
            updatedAt: number;
        } | undefined;
        if (!current) return { status: 'NOT_FOUND' };
        const now = Number(args[args.length === 5 ? 1 : 3]);
        if (!current.expiresAt || current.expiresAt <= now) {
            values.delete(key);
            return { status: 'NOT_FOUND' };
        }
        if (args.length === 5) {
            const nextActor = JSON.parse(args[0]) as MatchLiveActor;
            current.collaborators = [
                { ...nextActor, lastSeenAt: Number(args[1]) },
                ...current.collaborators.filter(item => item.userId !== nextActor.userId),
            ];
            values.set(key, structuredClone(current));
            return { status: 'OK', session: structuredClone(current) };
        }
        if (current.revision !== Number(args[0])) {
            return { status: 'CONFLICT', session: structuredClone(current) };
        }
        const nextActor = JSON.parse(args[2]) as MatchLiveActor;
        const next = {
            expiresAt: current.expiresAt,
            collaborators: [{ ...nextActor, lastSeenAt: Number(args[3]) }],
            revision: current.revision + 1,
            participants: JSON.parse(args[1]) as MatchLiveParticipant[],
            recentChange: {
                actor: nextActor,
                kind: args[4],
                updatedAt: Number(args[3]),
            },
            updatedAt: Number(args[3]),
        };
        values.set(key, structuredClone(next));
        return { status: 'OK', session: next };
    });
    return {
        eval: evalFn,
        get,
        set,
        redis: { get, set, eval: evalFn } as unknown as Redis,
    };
};

describe('match live store', () => {
    afterEach(() => vi.useRealTimers());

    it('밤 11시 30분에 시작하면 다음 날 2시 30분까지 유지되고 수정·접속으로 연장되지 않는다', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T23:30:00+09:00'));
        const { redis } = createRedis();
        const created = (await createMatchLiveSession(redis, participants, actor))!;
        expect(created.session.expiresAt).toBe(Date.parse('2026-10-13T02:30:00+09:00'));

        vi.setSystemTime(new Date('2026-10-13T00:00:00+09:00'));
        expect(await getMatchLiveSession(redis, created.code, actor)).not.toBeNull();

        vi.setSystemTime(new Date('2026-10-13T02:29:59+09:00'));
        const updated = await updateMatchLiveSession(redis, created.code, 1, participants, actor);
        expect(updated.status === 'OK' && updated.session.expiresAt).toBe(created.session.expiresAt);
        expect((await getMatchLiveSession(redis, created.code, actor))?.expiresAt).toBe(created.session.expiresAt);

        vi.setSystemTime(new Date('2026-10-13T02:30:00+09:00'));
        expect(await getMatchLiveSession(redis, created.code)).toBeNull();
        expect(await updateMatchLiveSession(redis, created.code, 2, participants, actor)).toEqual({ status: 'NOT_FOUND' });
        expect(await getMatchLiveSession(redis, created.code, actor)).toBeNull();
    });

    it('만료 시각이 없는 이전 세션은 재사용하지 않는다', async () => {
        const { redis, set } = createRedis();
        await set('match-live:v1:ABCDEFGH23', {
            revision: 1, participants, collaborators: [], recentChange: null, updatedAt: Date.now(),
        });
        expect(await getMatchLiveSession(redis, 'ABCDEFGH23')).toBeNull();
        expect(await getMatchLiveSession(redis, 'ABCDEFGH23', actor)).toBeNull();
    });
    it('공동 작업 세션에 revision과 최소 명단을 생성 시점부터 3시간 저장한다', async () => {
        const { redis, set } = createRedis();

        const created = await createMatchLiveSession(redis, participants, actor);

        expect(created?.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
        expect(created?.session.revision).toBe(1);
        expect(created?.session.participants).toEqual(participants);
        expect(created?.session.collaborators[0]).toMatchObject(actor);
        expect(created?.session.expiresAt).toBe(getMatchLiveExpiresAt(created!.session.updatedAt));
        expect(set.mock.calls[0]?.[2]).toEqual({ ex: 3 * 60 * 60 });
    });

    it('기대 revision이 맞을 때만 다음 revision으로 갱신한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchLiveSession(redis, participants, actor);
        const nextParticipants: MatchLiveParticipant[] = [
            ...participants,
            { discordUserId: '11111111111111103', position: null },
        ];

        const updated = await updateMatchLiveSession(
            redis,
            created!.code,
            created!.session.revision,
            nextParticipants,
            actor,
        );
        const loaded = await getMatchLiveSession(redis, created!.code);

        expect(updated.status).toBe('OK');
        expect(updated.status === 'OK' ? updated.session.revision : 0).toBe(2);
        expect(loaded?.participants).toEqual(nextParticipants);
        expect(updated.status === 'OK' ? updated.session.recentChange?.actor : null).toEqual(actor);
        expect(updated.status === 'OK' ? updated.session.recentChange?.kind : null).toBe('ROSTER');
    });

    it('오래된 revision으로 저장하면 최신 상태를 포함한 충돌을 반환한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchLiveSession(redis, participants, actor);
        const firstUpdate = await updateMatchLiveSession(
            redis,
            created!.code,
            1,
            participants,
            actor,
        );

        const conflict = await updateMatchLiveSession(
            redis,
            created!.code,
            1,
            participants,
            actor,
        );

        expect(firstUpdate.status).toBe('OK');
        expect(conflict.status).toBe('CONFLICT');
        expect(conflict.status === 'CONFLICT' ? conflict.session.revision : 0).toBe(2);
    });

    it('같은 명단의 배치만 달라지면 최근 활동을 팀 배정 수정으로 기록한다', async () => {
        const { redis } = createRedis();
        const roster = MATCH_SHARE_POSITIONS.map((_, index) => ({
            discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
            position: null,
        } satisfies MatchLiveParticipant));
        const created = await createMatchLiveSession(redis, roster, actor);
        const assigned = roster.map((participant, index) => ({
            ...participant,
            position: MATCH_SHARE_POSITIONS[index],
        }));

        const updated = await updateMatchLiveSession(redis, created!.code, 1, assigned, actor);

        expect(updated.status === 'OK' ? updated.session.recentChange?.kind : null).toBe('TEAMS');
    });

    it('조회한 관리자의 Discord 프로필을 현재 공동 작업자로 갱신한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchLiveSession(redis, participants, actor);
        const collaborator = {
            userId: 'discord-admin-2',
            displayName: '관리자 B',
        } satisfies MatchLiveActor;

        const loaded = await getMatchLiveSession(redis, created!.code, collaborator);

        expect(loaded?.collaborators.map(item => item.displayName)).toEqual([
            '관리자 B',
            '관리자 A',
        ]);
    });
});
