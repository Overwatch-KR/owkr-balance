import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

/**
 * @description 원격 저장소를 사용하지 않는 명시적 로컬 전용 실행 모드인지 확인한다.
 */
export const isLocalDataOnly = (): boolean => process.env.OWKR_LOCAL_DATA_ONLY === 'true';

/**
 * @description 환경변수가 준비된 경우에만 Upstash Redis 클라이언트를 지연 생성한다.
 */
export const getRedis = (): Redis | null => {
    if (isLocalDataOnly()) return null;
    if (redis) return redis;

    const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;

    redis = new Redis({ url, token });
    return redis;
};
