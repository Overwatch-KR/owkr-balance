import { describe, expect, it } from 'vitest';
import {
    MATCH_LIVE_ACTIVE_POLL_INTERVAL_MS,
    MATCH_LIVE_ACTIVITY_WINDOW_MS,
    MATCH_LIVE_IDLE_POLL_INTERVAL_MS,
    getMatchLiveActiveUntil,
    getMatchLivePollDelay,
} from './match-live-polling';

describe('match live adaptive polling', () => {
    it('연속 장애에서는 요청 간격을 늘리고 성공 후 정상 간격으로 복귀한다', () => {
        expect([1, 2, 3, 4, 5, 1000].map(errors => getMatchLivePollDelay(1000, 31000, errors)))
            .toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
        expect(getMatchLivePollDelay(1000, 31000, 0)).toBe(MATCH_LIVE_ACTIVE_POLL_INTERVAL_MS);
    });
    it('최근 활동 후에는 빠른 간격으로 서버 변경을 확인한다', () => {
        const now = 1_000;
        const activeUntil = getMatchLiveActiveUntil(now);

        expect(activeUntil).toBe(now + MATCH_LIVE_ACTIVITY_WINDOW_MS);
        expect(getMatchLivePollDelay(now, activeUntil)).toBe(
            MATCH_LIVE_ACTIVE_POLL_INTERVAL_MS,
        );
    });

    it('활동 구간이 끝나면 유휴 간격으로 요청 수를 줄인다', () => {
        const activeUntil = 31_000;

        expect(getMatchLivePollDelay(activeUntil, activeUntil)).toBe(
            MATCH_LIVE_IDLE_POLL_INTERVAL_MS,
        );
    });
});
