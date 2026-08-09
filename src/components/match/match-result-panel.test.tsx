import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatchResultData, Player, Rank } from '../../types';
import { MatchResultPanel } from './match-result-panel';

const rank: Rank = {
    tier: 'GOLD',
    div: 3,
    score: 1400,
    isPreferred: false,
    isAvoided: false,
};

const players: Player[] = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    name: `Player${index + 1}#1234`,
    tank: { ...rank },
    dps: { ...rank },
    sup: { ...rank },
}));

const result: MatchResultData = {
    teamA: {
        name: 'TEAM 1',
        assignment: {
            TANK: [players[0]],
            DPS: [players[1], players[2]],
            SUPPORT: [players[3], players[4]],
        },
        realScore: 7000,
    },
    teamB: {
        name: 'TEAM 2',
        assignment: {
            TANK: [players[5]],
            DPS: [players[6], players[7]],
            SUPPORT: [players[8], players[9]],
        },
        realScore: 7000,
    },
    diff: 0,
};

describe('MatchResultPanel', () => {
    it('긴 결과 콘텐츠가 패널의 Grid 열 너비를 확장하지 않도록 제한한다', () => {
        const markup = renderToStaticMarkup(
            <MatchResultPanel
                alternatives={[]}
                ignorePreferences={false}
                isBalancing={false}
                isReady
                isResultStale={false}
                onCancelSwap={vi.fn()}
                onClearResult={vi.fn()}
                onIgnorePreferencesChange={vi.fn()}
                onRunMatching={vi.fn()}
                onSelectAlternative={vi.fn()}
                onShowAllRanksChange={vi.fn()}
                onSlotClick={vi.fn()}
                participantCount={10}
                result={result}
                showAllRanks={false}
                swapSource={null}
                userSheetByBattleTag={new Map()}
            />,
        );

        expect(markup).toContain('data-result-viewport="true"');
        expect(markup).toContain('min-w-0 max-w-full overflow-hidden');
    });
});
