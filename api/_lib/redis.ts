import { Redis } from '@upstash/redis';
import { createHmac } from 'node:crypto';

let redis: Redis | null = null;

/**
 * @description 원격 저장소를 사용하지 않는 명시적 로컬 전용 실행 모드인지 확인한다.
 */
export const isLocalDataOnly = (): boolean => process.env.OWKR_LOCAL_DATA_ONLY === 'true';

/**
 * @description Upstash 우선 조회·장애 전환·동기화를 조정하는 게이트웨이에 서버 전용 인증으로 연결한다.
 */
export const getRedis = (): Redis | null => {
    if (isLocalDataOnly()) return null;
    if (redis) return redis;

    const serverStorage = process.env.OWKR_STORAGE_BACKEND !== 'upstash'
        && process.env.DRAFT_REALTIME_URL && process.env.DRAFT_BRIDGE_SECRET;
    const url = serverStorage
        ? new URL('/storage', process.env.DRAFT_REALTIME_URL!).toString()
        : process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token = serverStorage
        ? createHmac('sha256', process.env.DRAFT_BRIDGE_SECRET!).update('owkr-local-storage-v1').digest('hex')
        : process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    if (!url || !token) return null;

    redis = new Redis({ url, token });
    return redis;
};
