import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchResultData, Player, Rank, SwapSource } from '../types';
import { useMatchActions } from './use-match-actions';

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

describe('useMatchActions', () => {
    it('플레이어 교체 직후 토스트에서 직전 결과로 되돌린다', () => {
        let currentResult: MatchResultData | null = result;
        let currentSwapSource: SwapSource | null = { teamIdx: 0, role: 'TANK', index: 0 };
        const setResult: Dispatch<SetStateAction<MatchResultData | null>> = next => {
            currentResult = typeof next === 'function' ? next(currentResult) : next;
        };
        const setSwapSource: Dispatch<SetStateAction<SwapSource | null>> = next => {
            currentSwapSource = typeof next === 'function' ? next(currentSwapSource) : next;
        };
        const showToast = vi.fn();
        const { handleSlotClick } = useMatchActions({
            balanceTeams: vi.fn(),
            match: {
                alternatives: [],
                players,
                result,
                setAlternatives: vi.fn(),
                setPlayers: vi.fn(),
                setResult,
            },
            playerInput: {
                editingPlayerId: null,
                inputSummary: '',
                isInputCollapsed: false,
                resetPlayerInputs: vi.fn(),
                setInputSummary: vi.fn(),
                setIsInputCollapsed: vi.fn(),
            },
            requestRosterIdentityReview: vi.fn(),
            setSwapSource,
            showDetailedError: vi.fn(),
            showToast,
            swapSource: currentSwapSource,
        });

        handleSlotClick(1, 'TANK', 0);

        expect(currentResult).not.toBe(result);
        expect(currentResult?.teamA.assignment.TANK[0].id).toBe(6);
        expect(currentSwapSource).toBeNull();
        expect(showToast).toHaveBeenCalledWith(
            'success',
            '두 플레이어의 자리를 바꿨습니다.',
            expect.objectContaining({ label: '되돌리기' }),
        );

        const undo = showToast.mock.calls[0]?.[2]?.onClick as (() => void) | undefined;
        undo?.();

        expect(currentResult).toBe(result);
        expect(currentSwapSource).toBeNull();
    });

    it('교체 후 결과가 달라졌으면 오래된 되돌리기로 덮어쓰지 않는다', () => {
        let currentResult: MatchResultData | null = result;
        const setResult: Dispatch<SetStateAction<MatchResultData | null>> = next => {
            currentResult = typeof next === 'function' ? next(currentResult) : next;
        };
        const showToast = vi.fn();
        const { handleSlotClick } = useMatchActions({
            balanceTeams: vi.fn(),
            match: {
                alternatives: [],
                players,
                result,
                setAlternatives: vi.fn(),
                setPlayers: vi.fn(),
                setResult,
            },
            playerInput: {
                editingPlayerId: null,
                inputSummary: '',
                isInputCollapsed: false,
                resetPlayerInputs: vi.fn(),
                setInputSummary: vi.fn(),
                setIsInputCollapsed: vi.fn(),
            },
            requestRosterIdentityReview: vi.fn(),
            setSwapSource: vi.fn(),
            showDetailedError: vi.fn(),
            showToast,
            swapSource: { teamIdx: 0, role: 'TANK', index: 0 },
        });

        handleSlotClick(1, 'TANK', 0);
        const undo = showToast.mock.calls[0]?.[2]?.onClick as (() => void) | undefined;
        const newerResult = { ...result, diff: 99 };
        currentResult = newerResult;
        undo?.();

        expect(currentResult).toBe(newerResult);
    });
});
