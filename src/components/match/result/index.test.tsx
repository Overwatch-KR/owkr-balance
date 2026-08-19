import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MatchResultData, Player, Rank } from '../../../types';
import MatchResult from './index';
import { AlternativeResultsDialog } from './alternative-results-dialog';

const rank: Rank = {
    tier: 'GOLD',
    div: 3,
    score: 1400,
    isPreferred: false,
    isAvoided: false,
};

const createPlayer = (id: number): Player => ({
    id,
    name: `Player${id}#1234`,
    tank: {
        ...rank,
        score: id === 1 ? 1700 : id === 6 ? 1400 : rank.score,
        isPreferred: id === 2,
    },
    dps: { ...rank, score: id === 7 || id === 8 ? 1600 : rank.score },
    sup: { ...rank },
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
    metrics: {
        totalDiff: 0,
        roleDiffs: { tank: 20, dps: 40, support: 60 },
        teamStdDevs: [120, 140],
        preferenceViolations: 1,
        avoidedAssignments: 0,
    },
};

const createAlternative = (rankValue: number): MatchResultData => {
    const teamAPlayers = players.slice(0, 5);
    const teamBPlayers = players.slice(5, 10);
    const combinationIndex = rankValue - 2;
    const teamAIndex = combinationIndex % 5;
    const teamBIndex = Math.floor(combinationIndex / 5) % 5;
    [teamAPlayers[teamAIndex], teamBPlayers[teamBIndex]] = [
        teamBPlayers[teamBIndex],
        teamAPlayers[teamAIndex],
    ];

    return {
        ...matchResult,
        teamA: {
            ...matchResult.teamA,
            assignment: {
                TANK: [teamAPlayers[0]],
                DPS: [teamAPlayers[1], teamAPlayers[2]],
                SUPPORT: [teamAPlayers[3], teamAPlayers[4]],
            },
        },
        teamB: {
            ...matchResult.teamB,
            assignment: {
                TANK: [teamBPlayers[0]],
                DPS: [teamBPlayers[1], teamBPlayers[2]],
                SUPPORT: [teamBPlayers[3], teamBPlayers[4]],
            },
        },
        diff: rankValue * 10,
        metrics: {
            ...matchResult.metrics!,
            totalDiff: rankValue * 10,
        },
        evaluation: {
            rank: rankValue,
            balanceCost: rankValue * 100,
        },
    };
};

const alternatives = Array.from({ length: 11 }, (_, index) => createAlternative(index + 2));

describe('MatchResult', () => {
    it('탱·딜·힐 티어 스위치를 OFF로 시작하고 화면 영역을 이미지 복사 대상으로 사용한다', () => {
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={matchResult}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).toContain('role="switch"');
        expect(markup).toContain('aria-checked="false"');
        expect(markup).toContain('탱·딜·힐 티어 표시');
        expect(markup).toContain('id="result-share-controls"');
        expect(markup).toContain('이번 내전 참여 등록');
        expect(markup).toContain('이미지 복사');
        expect(markup.indexOf('탱·딜·힐 티어 표시')).toBeLessThan(markup.indexOf('이미지 복사'));
        expect(markup.indexOf('이번 내전 참여 등록')).toBeLessThan(markup.indexOf('이미지 복사'));
        expect(markup.indexOf('이미지 복사')).toBeLessThan(markup.indexOf('data-capture-content="true"'));
        expect(markup).toContain('밸런스 요약');
        expect(markup).toContain('선호 역할 이탈 1명');
        expect(markup).toContain('Player2#1234');
        expect(markup).toContain('1팀 · 딜러');
        expect(markup).toContain('비선호 배정');
        expect(markup).not.toContain('data-export-render');
        expect(markup).not.toContain('data-display-mode');
    });

    it('현재 명단과 결과가 달라진 경우 이벤트 참여 등록을 비활성화한다', () => {
        const markup = renderToStaticMarkup(
            <MatchResult
                isStale
                matchResult={matchResult}
                onOpenEventRegistration={vi.fn()}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).toContain('변경된 명단으로 다시 매칭한 뒤 등록해 주세요.');
        expect(markup).toMatch(/disabled=""[^>]*>.*이번 내전 참여 등록/s);
    });

    it('역할별 티어 점수 차이를 밸런스 요약에 함께 표시한다', () => {
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={matchResult}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).not.toContain('포지션별 티어 차이');
        expect(markup).toContain('탱커');
        expect(markup).toContain('1팀 +300점');
        expect(markup).toContain('딜러');
        expect(markup).toContain('2팀 +200점');
        expect(markup).toContain('힐러');
        expect(markup).toContain('동일');
        expect(markup.match(/밸런스 요약/g)).toHaveLength(1);
        expect(markup).toContain('data-capture-content="true"');
    });

    it('교체할 플레이어를 선택하면 다음 행동과 취소 버튼을 바로 보여준다', () => {
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={matchResult}
                onSlotClick={vi.fn()}
                swapSource={{ teamIdx: 0, role: 'TANK', index: 0 }}
                onCancelSwap={vi.fn()}
            />,
        );

        expect(markup).toContain('Player1#1234</span> 선택됨 · 바꿀 플레이어를 선택하세요');
        expect(markup).toContain('선택 취소');
        expect(markup).toContain('aria-pressed="true"');
    });

    it('비선호 역할에 배정된 대상을 이름과 배정 위치로 알려준다', () => {
        const avoidedPlayer: Player = {
            ...players[2],
            dps: { ...players[2].dps, isAvoided: true },
        };
        const resultWithExceptions: MatchResultData = {
            ...matchResult,
            teamA: {
                ...matchResult.teamA,
                assignment: {
                    ...matchResult.teamA.assignment,
                    DPS: [players[1], avoidedPlayer],
                },
            },
        };
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={resultWithExceptions}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).toContain('비선호 배정 1명');
        expect(markup).toContain('Player3#1234');
        expect(markup).toContain('1팀 · 딜러');
        expect(markup).toContain('미배치 역할 0명');
    });

    it('미배치 역할에 배정된 대상을 이름과 배정 위치로 알려준다', () => {
        const unrankedPlayer: Player = {
            ...players[3],
            sup: {
                tier: 'UNRANKED',
                div: 0,
                score: 0,
                isPreferred: false,
                isAvoided: false,
            },
        };
        const resultWithUnrankedAssignment: MatchResultData = {
            ...matchResult,
            teamA: {
                ...matchResult.teamA,
                assignment: {
                    ...matchResult.teamA.assignment,
                    SUPPORT: [unrankedPlayer, players[4]],
                },
            },
        };
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={resultWithUnrankedAssignment}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).toContain('미배치 역할 1명');
        expect(markup).toContain('Player4#1234');
        expect(markup).toContain('1팀 · 힐러');
    });

    it('기본 결과 아래에는 추천 후보 2개와 전체 조합 Dialog 진입점만 보여준다', () => {
        const markup = renderToStaticMarkup(
            <MatchResult
                matchResult={{
                    ...matchResult,
                    evaluation: { rank: 1, balanceCost: 100 },
                }}
                alternatives={alternatives}
                onSelectAlternative={vi.fn()}
                onSlotClick={vi.fn()}
                swapSource={null}
            />,
        );

        expect(markup).toContain('다른 추천 조합');
        expect(markup).toContain('전체 12개 자세히 보기');
        expect(markup).toContain('추천 2위');
        expect(markup).toContain('추천 3위');
        expect(markup).not.toContain('추천 4위');
        expect(markup.match(/이 조합 적용/g)).toHaveLength(2);
        expect(markup.match(/data-assigned-rank=/g)).toHaveLength(20);
        expect(markup.match(/data-candidate-matchup-row=/g)).toHaveLength(10);
        expect(markup.match(/data-candidate-change-slot=/g)).toHaveLength(2);
        expect(markup).toContain('Player1');
        expect(markup).toContain('Player10');
        expect(markup).toContain('골3');
        expect(markup).not.toContain('전체 팀 조합 비교');
    });

    it('전체 조합 Dialog에서 현재 조합과 모든 추천 후보의 상세 구성을 보여준다', () => {
        const currentResult = {
            ...matchResult,
            evaluation: { rank: 1, balanceCost: 100 },
        };
        const markup = renderToStaticMarkup(
            <AlternativeResultsDialog
                alternatives={alternatives}
                currentResult={currentResult}
                onClose={vi.fn()}
                onSelectAlternative={vi.fn()}
            />,
        );

        expect(markup).toContain('role="dialog"');
        expect(markup).toContain('전체 팀 조합 비교');
        expect(markup).toContain('추천 후보 12개');
        expect(markup).toContain('현재 조합');
        expect(markup).toContain('추천 12위');
        expect(markup).toContain('1팀 합류');
        expect(markup).toContain('전체 로스터와 배정 티어');
        expect(markup.match(/data-assigned-rank=/g)).toHaveLength(120);
        expect(markup.match(/data-candidate-matchup-row=/g)).toHaveLength(60);
        expect(markup.match(/data-candidate-change-slot=/g)).toHaveLength(12);
        expect(markup).toContain('data-has-team-changes="false"');
        expect(markup).toContain('h-[18px] grid-cols-2');
        expect(markup.match(/이 조합 적용/g)).toHaveLength(11);
    });
});
