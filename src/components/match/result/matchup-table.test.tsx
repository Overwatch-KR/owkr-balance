import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MatchResultData, Player, Rank } from '../../../types';
import type { UserSheetEntry } from '../../../utils/user-sheet';
import MatchupTable from './matchup-table';

const createRank = (
    tier: Rank['tier'],
    div: number,
    state: Partial<Pick<Rank, 'isPreferred' | 'isAvoided'>> = {},
): Rank => ({
    tier,
    div,
    score: 2000,
    isPreferred: state.isPreferred ?? false,
    isAvoided: state.isAvoided ?? false,
});

const createPlayer = (id: number): Player => ({
    id,
    name: `VeryLongBattleTag${id}#12345`,
    discordName: `아주 긴 디스코드 닉네임 ${id}`,
    tank: createRank('BRONZE', 1, id === 1 ? { isPreferred: true } : {}),
    dps: createRank('DIAMOND', 3, id === 3 ? { isAvoided: true } : {}),
    sup: createRank('EMERALD', 3),
});

const players = Array.from({ length: 10 }, (_, index) => createPlayer(index + 1));

const matchResult: MatchResultData = {
    teamA: {
        name: 'TEAM 1',
        assignment: {
            TANK: [players[0]],
            DPS: [players[1], players[2]],
            SUPPORT: [players[3], players[4]],
        },
        realScore: 10000,
    },
    teamB: {
        name: 'TEAM 2',
        assignment: {
            TANK: [players[5]],
            DPS: [players[6], players[7]],
            SUPPORT: [players[8], players[9]],
        },
        realScore: 10000,
    },
    diff: 0,
};

const countMatches = (value: string, pattern: RegExp): number => value.match(pattern)?.length ?? 0;

const expectEqualHeightMatchupSlots = (markup: string): void => {
    expect(countMatches(markup, /data-matchup-row="true"/g)).toBe(5);
    expect(countMatches(markup, /data-match-slot="true"/g)).toBe(10);
    expect(countMatches(markup, /flex items-stretch gap-1\.5/g)).toBe(5);
    expect(countMatches(markup, /relative flex min-w-0 flex-1/g)).toBe(10);
};

describe('MatchupTable', () => {
    it('스위치가 꺼지면 플레이어마다 현재 배정 티어 하나만 표시한다', () => {
        const markup = renderToStaticMarkup(
            <MatchupTable
                matchResult={matchResult}
                onSlotClick={() => undefined}
                swapSource={null}
            />,
        );

        expect(markup).not.toContain('현재 배정');
        expect(countMatches(markup, /<img /g)).toBe(20);
        expect(markup).toContain('/tier/emerald.png');
        expect(markup).toContain('sm:hidden');
        expect(markup).toContain('hidden w-full min-w-0');
        expect(markup).toContain('id="matchup-table"');
        expect(markup).toContain('id="matchup-tank-row"');
        expect(countMatches(markup, /data-match-player-id=/g)).toBe(10);
        expect(countMatches(markup, /data-match-team="1"/g)).toBe(5);
        expect(countMatches(markup, /data-match-team="2"/g)).toBe(5);
        expectEqualHeightMatchupSlots(markup);
    });

    it('전체 티어를 탱커, 딜러, 지원 순서로 표시하고 현재 배정 역할만 강조한다', () => {
        const markup = renderToStaticMarkup(
            <MatchupTable
                matchResult={matchResult}
                onSlotClick={() => undefined}
                swapSource={null}
                showAllRanks
            />,
        );

        expect(markup).toMatch(/title="탱커 [^"]+"[\s\S]*title="딜러 [^"]+"[\s\S]*title="힐러 [^"]+"/);
        expect(countMatches(markup, /title="탱커 /g)).toBe(10);
        expect(countMatches(markup, /title="딜러 /g)).toBe(10);
        expect(countMatches(markup, /title="힐러 /g)).toBe(10);
        expect(countMatches(markup, /· 현재 배정"/g)).toBe(10);
        expect(countMatches(markup, /border-cyan-400\/40/g)).toBe(10);
        expect(countMatches(markup, /data-tier="EMERALD"/g)).toBe(10);
        expect(countMatches(markup, /<img /g)).toBe(0);
        expectEqualHeightMatchupSlots(markup);
    });

    it('선호·비선호 상태와 긴 이름을 전체 티어 모드에 유지한다', () => {
        const markup = renderToStaticMarkup(
            <MatchupTable
                matchResult={matchResult}
                onSlotClick={() => undefined}
                swapSource={null}
                showAllRanks
            />,
        );

        expect(markup).toContain('title="탱커 브1★ · 현재 배정"');
        expect(markup).toContain('title="딜러 다3? · 현재 배정"');
        expect(markup).toContain('title="힐러 에3');
        expect(markup).toContain('아주 긴 디스코드 닉네임 1');
        expect(markup).toContain('VeryLongBattleTag1#12345');
    });

    it('한쪽에만 특이사항이 있어도 토글 양쪽 상태에서 맞은편에 같은 줄 높이를 확보한다', () => {
        const sheetEntry: UserSheetEntry = {
            id: 'sheet-1',
            discordName: '시트 닉네임',
            battleTag: players[0].name,
            tank: '브1',
            dps: '다3',
            support: '에메랄드',
            note: '탱커 픽 조율 필요',
            createdAt: 1,
            updatedAt: 1,
            updatedByName: '관리자',
        };
        for (const showAllRanks of [false, true]) {
            const markup = renderToStaticMarkup(
                <MatchupTable
                    matchResult={matchResult}
                    onSlotClick={() => undefined}
                    swapSource={null}
                    showAllRanks={showAllRanks}
                    userSheetByBattleTag={new Map([
                        [sheetEntry.battleTag.toLowerCase(), sheetEntry],
                    ])}
                />,
            );

            expect(markup).toContain('탱커 픽 조율 필요');
            expect(markup).toContain('aria-label="시트 특이사항: 탱커 픽 조율 필요"');
            expect(countMatches(markup, /data-match-note-spacer="true"/g)).toBe(1);
            expect(markup).toMatch(
                /data-match-note-spacer="true" data-exclude-export="true" data-html2canvas-ignore="true"/,
            );
            expect(markup).toMatch(
                /data-exclude-export="true" data-html2canvas-ignore="true"[^>]*>[\s\S]*탱커 픽 조율 필요/,
            );
        }
    });

    it('긴 특이사항이 플레이어 열 너비를 늘리지 않고 말줄임 처리된다', () => {
        const longNote = '공백 없이'.repeat(40);
        const sheetEntry: UserSheetEntry = {
            id: 'sheet-long-note',
            discordName: '시트 닉네임',
            battleTag: players[0].name,
            tank: '브1',
            dps: '다3',
            support: '에메랄드',
            note: longNote,
            createdAt: 1,
            updatedAt: 1,
            updatedByName: '관리자',
        };
        const markup = renderToStaticMarkup(
            <MatchupTable
                matchResult={matchResult}
                onSlotClick={() => undefined}
                swapSource={null}
                userSheetByBattleTag={new Map([
                    [sheetEntry.battleTag.toLowerCase(), sheetEntry],
                ])}
            />,
        );

        expect(markup).toContain('data-match-note="true"');
        expect(markup).toContain('w-full min-w-0 max-w-full');
        expect(markup).toContain('gap-1 overflow-hidden');
        expect(markup).toContain('min-w-0 flex-1 truncate');
        expect(markup).toContain(longNote);
    });
});
