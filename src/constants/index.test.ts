import { describe, expect, it } from 'vitest';
import {
    formatRank,
    getTierScore,
    TIERS,
} from './index';

describe('tier constants', () => {
    it('에메랄드를 플레와 다이아 사이의 정식 티어로 고정한다', () => {
        expect(TIERS).toEqual([
            'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND',
            'MASTER', 'GRANDMASTER', 'CHAMPION',
        ]);
    });

    it('에메랄드와 상위 티어 간격을 점수에 반영한다', () => {
        expect(getTierScore('EMERALD', 3)).toBe(3000);
        expect(getTierScore('DIAMOND', 3)).toBe(4080);
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
