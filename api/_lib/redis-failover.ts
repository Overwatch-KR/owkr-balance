import type { Requester, UpstashRequest, UpstashResponse } from '@upstash/redis';

interface StorageEndpoint { url: string; token: string }
const READ_COMMANDS = new Set('GET EXISTS TTL PTTL HGET HGETALL HVALS HLEN HMGET MGET ZRANGE ZRANGEBYSCORE ZCARD SCAN PING TIME'.split(' '));
const RETRY_AFTER_MS = 30_000;

class StorageUnavailable extends Error {}

/** @description 명령 전 로컬 상태를 확인하고 장애 시 Upstash로 전환하며 응답을 잃은 쓰기는 재실행하지 않는다. */
export function createStorageRequester(primary: StorageEndpoint, fallback: StorageEndpoint | null): Requester {
    let retryAt = 0;
    let fallbackSince = 0;
    let checking: Promise<boolean> | null = null;

    const post = async (endpoint: StorageEndpoint, path: string[], body: unknown, timeoutMs: number, headers?: Record<string, string>) => {
        let response: Response;
        try {
            response = await fetch([endpoint.url.replace(/\/$/, ''), ...path].join('/'), {
                method: 'POST', cache: 'no-store',
                headers: { ...headers, Authorization: `Bearer ${endpoint.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new StorageUnavailable('저장소 연결을 확인해 주세요.');
        }
        if (response.status >= 500) throw new StorageUnavailable('저장소가 일시적으로 응답하지 않습니다.');
        if (!response.ok) throw new Error(`저장소 요청이 거부되었습니다. (${response.status})`);
        try { return await response.json() as unknown; }
        catch { throw new StorageUnavailable('저장소 응답을 확인하지 못했습니다.'); }
    };

    const usePrimary = async (): Promise<boolean> => {
        if (Date.now() < retryAt) return false;
        checking ??= (async () => {
            try {
                const status = await post(primary, ['status'], {}, 1500) as { backend?: string; lastSyncAt?: number };
                if (status.backend !== 'local' || (fallbackSince && (!status.lastSyncAt || status.lastSyncAt <= fallbackSince))) {
                    throw new StorageUnavailable('로컬 저장소 복구 동기화를 기다리고 있습니다.');
                }
                fallbackSince = 0;
                return true;
            } catch (error) {
                if (!(error instanceof StorageUnavailable) || !fallback) throw error;
                retryAt = Date.now() + RETRY_AFTER_MS;
                fallbackSince ||= Date.now();
                return false;
            }
        })();
        try { return await checking; } finally { checking = null; }
    };

    return {
        request: async <TResult>(request: UpstashRequest): Promise<UpstashResponse<TResult>> => {
            const commands = request.path?.length ? request.body : [request.body];
            const readonly = Array.isArray(commands) && commands.every(command => Array.isArray(command)
                && typeof command[0] === 'string' && READ_COMMANDS.has(command[0].toUpperCase()));
            const local = await usePrimary();
            const endpoint = local ? primary : fallback;
            if (!endpoint) throw new StorageUnavailable('폴백 저장소가 설정되지 않았습니다.');
            try {
                const result = await post(endpoint, request.path ?? [], request.body, local ? 5000 : 8000, request.headers);
                if (!local && !readonly) fallbackSince = Date.now();
                return result as UpstashResponse<TResult>;
            } catch (error) {
                if (!local || !fallback || !(error instanceof StorageUnavailable)) throw error;
                retryAt = Date.now() + RETRY_AFTER_MS;
                fallbackSince = Date.now();
                if (!readonly) throw new Error('저장 결과를 확인하지 못했습니다. 새로고침하여 반영 여부를 확인해 주세요.');
                return await post(fallback, request.path ?? [], request.body, 8000, request.headers) as UpstashResponse<TResult>;
            }
        },
    };
}
