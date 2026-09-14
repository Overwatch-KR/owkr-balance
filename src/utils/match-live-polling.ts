export const MATCH_LIVE_ACTIVE_POLL_INTERVAL_MS = 500;
export const MATCH_LIVE_IDLE_POLL_INTERVAL_MS = 1_500;
export const MATCH_LIVE_ACTIVITY_WINDOW_MS = 30_000;

/**
 * @description 최근 공동 작업 활동 여부에 따라 다음 서버 확인 간격을 선택한다.
 */
export const getMatchLivePollDelay = (
    now: number,
    activeUntil: number,
): number => (
    now < activeUntil
        ? MATCH_LIVE_ACTIVE_POLL_INTERVAL_MS
        : MATCH_LIVE_IDLE_POLL_INTERVAL_MS
);

/**
 * @description 마지막 활동 시점부터 빠른 폴링을 유지할 종료 시각을 계산한다.
 */
export const getMatchLiveActiveUntil = (now: number): number => (
    now + MATCH_LIVE_ACTIVITY_WINDOW_MS
);
