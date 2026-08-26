import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import {
    MATCH_SHARE_POSITIONS,
    type MatchShareParticipant,
} from '../../domains/balance/shared/public';
import {
    createMatchShare,
    getMatchShare,
    MATCH_SHARE_TTL_SECONDS,
} from './match-share-store';

const participants: MatchShareParticipant[] = MATCH_SHARE_POSITIONS.map((position, index) => ({
    discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
    position,
}));

const createRedis = () => {
    const values = new Map<string, unknown>();
    const get = vi.fn(async (key: string) => structuredClone(values.get(key) ?? null));
    const set = vi.fn(async (
        key: string,
        value: unknown,
        _options?: { ex?: number },
    ) => {
        values.set(key, structuredClone(value));
        return 'OK';
    });
    return {
        get,
        set,
        redis: { get, set } as unknown as Redis,
    };
};

describe('match share store', () => {
    it('Redis 값에는 Discord ID와 position만 저장하고 24시간 TTL을 적용한다', async () => {
        const { redis, set } = createRedis();

        const created = await createMatchShare(redis, participants);

        expect(created?.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
        expect(set).toHaveBeenCalledTimes(1);
        expect(set.mock.calls[0]?.[0]).toBe(`match-shares:v1:${created?.code}`);
        expect(set.mock.calls[0]?.[1]).toEqual(participants);
        expect(set.mock.calls[0]?.[2]).toEqual({ ex: MATCH_SHARE_TTL_SECONDS });
        expect(Object.keys((set.mock.calls[0]?.[1] as MatchShareParticipant[])[0])).toEqual([
            'discordUserId',
            'position',
        ]);
    });

    it('생성한 코드를 다시 조회하면 같은 최소 명단을 반환한다', async () => {
        const { redis } = createRedis();
        const created = await createMatchShare(redis, participants);

        const loaded = await getMatchShare(redis, created!.code.toLowerCase());

        expect(loaded).toEqual({ code: created!.code, participants });
    });

    it('10명이 아니거나 중복 ID가 포함된 입력은 저장하지 않는다', async () => {
        const { redis, set } = createRedis();
        const invalid = participants.map(participant => ({ ...participant }));
        invalid[9].discordUserId = invalid[0].discordUserId;

        await expect(createMatchShare(redis, invalid)).resolves.toBeNull();
        expect(set).not.toHaveBeenCalled();
    });
});
