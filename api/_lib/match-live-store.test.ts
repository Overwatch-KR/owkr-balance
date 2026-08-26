import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import type { MatchLiveParticipant } from '../../domains/balance/shared/public';
import {
    createMatchLiveSession,
    getMatchLiveSession,
    MATCH_LIVE_TTL_SECONDS,
    updateMatchLiveSession,
} from './match-live-store';

const participants: MatchLiveParticipant[] = Array.from({ length: 3 }, (_, index) => ({
    discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
    position: null,
}));

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
            revision: number;
            participants: MatchLiveParticipant[];
            updatedAt: number;
        } | undefined;
        if (!current) return { status: 'NOT_FOUND' };
        if (current.revision !== Number(args[0])) {
            return { status: 'CONFLICT', session: structuredClone(current) };
        }
        const next = {
            revision: current.revision + 1,
            participants: JSON.parse(args[1]) as MatchLiveParticipant[],
            updatedAt: Number(args[2]),
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
    it('공동 작업 세션에 revision과 최소 명단을 24시간 저장한다', async () => {
        const { redis, set } = createRedis();

        const created = await createMatchLiveSession(redis, participants);

        expect(created?.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
        expect(created?.session.revision).toBe(1);
        expect(created?.session.participants).toEqual(participants);
        expect(set.mock.calls[0]?.[2]).toEqual({ ex: MATCH_LIVE_TTL_SECONDS });
    });

    it('기대 revision이 맞을 때만 다음 revision으로 갱신한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchLiveSession(redis, participants);
        const nextParticipants = [
            ...participants,
            { discordUserId: '11111111111111103', position: null as const },
        ];

        const updated = await updateMatchLiveSession(
            redis,
            created!.code,
            created!.session.revision,
            nextParticipants,
        );
        const loaded = await getMatchLiveSession(redis, created!.code);

        expect(updated.status).toBe('OK');
        expect(updated.status === 'OK' ? updated.session.revision : 0).toBe(2);
        expect(loaded?.participants).toEqual(nextParticipants);
    });

    it('오래된 revision으로 저장하면 최신 상태를 포함한 충돌을 반환한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchLiveSession(redis, participants);
        const firstUpdate = await updateMatchLiveSession(
            redis,
            created!.code,
            1,
            participants,
        );

        const conflict = await updateMatchLiveSession(
            redis,
            created!.code,
            1,
            participants,
        );

        expect(firstUpdate.status).toBe('OK');
        expect(conflict.status).toBe('CONFLICT');
        expect(conflict.status === 'CONFLICT' ? conflict.session.revision : 0).toBe(2);
    });
});