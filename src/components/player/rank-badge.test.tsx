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
});
