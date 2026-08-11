import { describe, expect, it } from 'vitest';
import {
    EMERALD_RELEASE_AT,
    formatRank,
    getAvailableTiers,
    getTierScore,
} from './index';

describe('tier constants', () => {
    it('한국 시간 8월 12일 새벽 3시부터 에메랄드를 플레와 다이아 사이에 추가한다', () => {
        expect(getAvailableTiers(EMERALD_RELEASE_AT - 1)).toEqual([
            'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND',
            'MASTER', 'GRANDMASTER', 'CHAMPION',
        ]);
        expect(getAvailableTiers(EMERALD_RELEASE_AT)).toEqual([
            'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND',
            'MASTER', 'GRANDMASTER', 'CHAMPION',
        ]);
    });

    it('도입 전 다이아 점수를 유지하고 도입 후 에메랄드와 상위 티어 간격을 반영한다', () => {
        expect(getTierScore('DIAMOND', 3, EMERALD_RELEASE_AT - 1)).toBe(3000);
        expect(getTierScore('EMERALD', 3, EMERALD_RELEASE_AT)).toBe(3000);
        expect(getTierScore('DIAMOND', 3, EMERALD_RELEASE_AT)).toBe(4080);
    });

    it('에메랄드 랭크를 짧은 UI 문자열로 표시한다', () => {
        expect(formatRank({
            tier: 'EMERALD',
            div: 2,
            score: 3200,
            isPreferred: true,
            isAvoided: false,
        })).toBe('에2★');
    });
});
