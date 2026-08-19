import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRedis, isLocalDataOnly } from './redis';

describe('local-only Redis guard', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('자격 증명이 있어도 로컬 전용 모드에서는 Redis 클라이언트를 만들지 않는다', () => {
        vi.stubEnv('OWKR_LOCAL_DATA_ONLY', 'true');
        vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.invalid');
        vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');

        expect(isLocalDataOnly()).toBe(true);
        expect(getRedis()).toBeNull();
    });
});
