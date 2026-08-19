import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Rank } from '../../types';
import RankBadge from './rank-badge';

const emeraldRank: Rank = {
    tier: 'EMERALD',
    div: 2,
    score: 3200,
    isPreferred: false,
    isAvoided: false,
};

const unrankedRank: Rank = {
    tier: 'UNRANKED',
    div: 0,
    score: 0,
    isPreferred: false,
    isAvoided: false,
};

describe('RankBadge', () => {
    it('에메랄드 티어와 현재 배정 상태를 함께 표시한다', () => {
        const markup = renderToStaticMarkup(
            <RankBadge role="SUPPORT" rank={emeraldRank} isAssigned />,
        );

        expect(markup).toContain('data-tier="EMERALD"');
        expect(markup).toContain('aria-label="지원 에메랄드 2 디비전, 현재 배정 역할"');
        expect(markup).toContain('에2');
        expect(markup).toContain('data-assigned="true"');
        expect(markup).toContain('lucide-check');
    });

    it('미배치를 중립 라벨로 표시하고 디비전을 읽지 않는다', () => {
        const markup = renderToStaticMarkup(
            <RankBadge role="SUPPORT" rank={unrankedRank} isAssigned />,
        );

        expect(markup).toContain('data-tier="UNRANKED"');
        expect(markup).toContain('aria-label="지원 미배치, 현재 배정 역할"');
        expect(markup).toContain('lucide-shield-question-mark');
        expect(markup).not.toContain('0 디비전');
    });
});
