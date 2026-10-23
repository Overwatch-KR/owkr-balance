export const APP_UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

interface VersionResponse {
    version?: unknown;
}

/** @description 보이는 온라인 화면에서만 확인 주기를 지키고 안정된 URL의 HTTP 재검증으로 새 배포를 감지한다. */
export function watchAppVersion(currentVersion: string, onAvailable: () => void): () => void {
    let disposed = false;
    let lastAttemptAt: number | null = null;
    let isChecking = false;
    let timer: number | undefined;
    let request: AbortController | null = null;

    const canCheck = () => !disposed && document.visibilityState === 'visible' && navigator.onLine;
    const schedule = () => {
        window.clearTimeout(timer);
        if (!canCheck() || isChecking) return;
        const delay = lastAttemptAt === null ? 0 : Math.max(0, lastAttemptAt + APP_UPDATE_CHECK_INTERVAL_MS - Date.now());
        timer = window.setTimeout(() => void check(), delay);
    };
    const stop = () => {
        disposed = true;
        window.clearTimeout(timer);
        request?.abort();
        document.removeEventListener('visibilitychange', handleActivity);
        window.removeEventListener('focus', handleActivity);
        window.removeEventListener('online', handleActivity);
        window.removeEventListener('offline', handleActivity);
    };
    const check = async () => {
        window.clearTimeout(timer);
        if (!canCheck() || isChecking) return;
        if (lastAttemptAt !== null && Date.now() - lastAttemptAt < APP_UPDATE_CHECK_INTERVAL_MS) {
            schedule(); return;
        }
        lastAttemptAt = Date.now();
        isChecking = true;
        const controller = new AbortController();
        request = controller;
        const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-cache', signal: controller.signal });
            if (!response.ok || disposed) return;
            const result = await response.json() as VersionResponse;
            if (!disposed && typeof result.version === 'string' && result.version.trim() && result.version !== currentVersion) {
                stop(); onAvailable();
            }
        } catch {
            // 일시적인 오류는 다음 확인 주기에 재시도한다.
        } finally {
            window.clearTimeout(timeout);
            request = null;
            isChecking = false;
            schedule();
        }
    };
    const handleActivity = () => { void check(); };
    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('focus', handleActivity);
    window.addEventListener('online', handleActivity);
    window.addEventListener('offline', handleActivity);
    void check();
    return stop;
}
