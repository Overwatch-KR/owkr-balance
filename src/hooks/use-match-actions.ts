import type { Dispatch, SetStateAction } from 'react';
import { SAMPLE_ROSTER } from '../constants';
import {
    swapMatchResultPlayers,
    type BalanceOptions,
} from '../utils/balance';
import { parseMultipleLines } from '../utils/parser';
import { getErrorMessage } from '../utils/api';
import type { MatchResultData, Player, Role, SwapSource } from '../types';
import type { ErrorDetails } from '../components/common/error-details-modal';

interface MatchActionState {
    alternatives: MatchResultData[];
    players: Player[];
    result: MatchResultData | null;
    setAlternatives: Dispatch<SetStateAction<MatchResultData[]>>;
    setPlayers: Dispatch<SetStateAction<Player[]>>;
    setResult: Dispatch<SetStateAction<MatchResultData | null>>;
}

interface PlayerInputActionState {
    editingPlayerId: number | null;
    inputSummary: string;
    isInputCollapsed: boolean;
    resetPlayerInputs: () => void;
    setInputSummary: Dispatch<SetStateAction<string>>;
    setIsInputCollapsed: Dispatch<SetStateAction<boolean>>;
}

interface ToastAction {
    label: string;
    onClick: () => void;
}

interface UseMatchActionsOptions {
    balanceTeams: (players: Player[], options?: BalanceOptions) => Promise<void>;
    match: MatchActionState;
    playerInput: PlayerInputActionState;
    requestRosterIdentityReview: (players: Player[], failedLines: string[]) => void;
    setSwapSource: Dispatch<SetStateAction<SwapSource | null>>;
    showDetailedError: (message: string, details: ErrorDetails) => void;
    showToast: (type: 'success' | 'error', message: string, action?: ToastAction) => void;
    swapSource: SwapSource | null;
}

/**
 * @description 팀 배정 실행과 결과 조작, 참가자 명단 변경에 따른 후속 상태를 관리한다.
 */
export const useMatchActions = ({
    balanceTeams,
    match,
    playerInput,
    requestRosterIdentityReview,
    setSwapSource,
    showDetailedError,
    showToast,
    swapSource,
}: UseMatchActionsOptions) => {
    const handleRunMatching = async (options: BalanceOptions = {}): Promise<boolean> => {
        const participants = match.players.slice(0, 10);
        if (participants.length !== 10) {
            showToast('error', '팀을 짜려면 참가자 10명이 필요합니다.');
            return false;
        }
        match.setAlternatives([]);
        setSwapSource(null);
        try {
            await balanceTeams(participants, options);
            return true;
        } catch (error) {
            const errorMessage = getErrorMessage(error, '매칭 중 오류가 발생했습니다.');
            showDetailedError(errorMessage, {
                title: '팀 자동 배정을 완료하지 못했습니다',
                description: errorMessage,
                hint: '참가자 역할 티어를 확인한 뒤 다시 시도해 주세요. 계속 실패하면 페이지를 새로고침해 주세요.',
            });
            return false;
        }
    };

    const handleSlotClick = (teamIdx: number, role: Role, index: number) => {
        if (!match.result) return;
        if (!swapSource) {
            setSwapSource({ teamIdx, role, index });
            return;
        }
        if (swapSource.teamIdx === teamIdx && swapSource.role === role && swapSource.index === index) {
            setSwapSource(null);
            return;
        }
        match.setResult(swapMatchResultPlayers(
            match.result,
            swapSource,
            { teamIdx, role, index },
        ));
        setSwapSource(null);
    };

    const handleRemovePlayer = (playerId: number) => {
        const removedIndex = match.players.findIndex(player => player.id === playerId);
        const removedPlayer = match.players[removedIndex];
        if (!removedPlayer) return;
        const previousResult = match.result;
        const previousAlternatives = match.alternatives;
        const previousSwapSource = swapSource;

        match.setPlayers(previous => previous.filter(player => player.id !== playerId));
        if (removedIndex < 10) {
            match.setResult(null);
            match.setAlternatives([]);
            setSwapSource(null);
        }
        if (playerInput.editingPlayerId === playerId) playerInput.resetPlayerInputs();
        showToast('success', `${removedPlayer.discordName ?? removedPlayer.name}을 명단에서 제외했습니다.`, {
            label: '실행 취소',
            onClick: () => {
                match.setPlayers(current => {
                    if (current.some(player => player.id === removedPlayer.id)) return current;
                    const restored = [...current];
                    restored.splice(Math.min(removedIndex, restored.length), 0, removedPlayer);
                    return restored;
                });
                if (removedIndex < 10) {
                    match.setResult(previousResult);
                    match.setAlternatives(previousAlternatives);
                    setSwapSource(previousSwapSource);
                }
            },
        });
    };

    const handleClearAll = () => {
        if (match.players.length === 0) return;
        const previousPlayers = match.players;
        const previousInputSummary = playerInput.inputSummary;
        const previousInputCollapsed = playerInput.isInputCollapsed;
        const previousResult = match.result;
        const previousAlternatives = match.alternatives;
        const previousSwapSource = swapSource;

        match.setPlayers([]);
        match.setResult(null);
        match.setAlternatives([]);
        playerInput.setInputSummary('');
        playerInput.setIsInputCollapsed(false);
        setSwapSource(null);
        playerInput.resetPlayerInputs();
        showToast('success', '전체 참여 명단을 비웠습니다.', {
            label: '실행 취소',
            onClick: () => {
                match.setPlayers(previousPlayers);
                playerInput.setInputSummary(previousInputSummary);
                playerInput.setIsInputCollapsed(previousInputCollapsed);
                match.setResult(previousResult);
                match.setAlternatives(previousAlternatives);
                setSwapSource(previousSwapSource);
            },
        });
    };

    const handleClearResult = () => {
        if (!match.result) return;
        const previousResult = match.result;
        const previousAlternatives = match.alternatives;
        const previousSwapSource = swapSource;

        match.setResult(null);
        match.setAlternatives([]);
        setSwapSource(null);
        showToast('success', '팀 배정 결과를 지웠습니다.', {
            label: '실행 취소',
            onClick: () => {
                match.setResult(previousResult);
                match.setAlternatives(previousAlternatives);
                setSwapSource(previousSwapSource);
            },
        });
    };

    const handleUseExampleRoster = () => {
        if (match.players.length > 0) {
            showToast('error', '기존 명단이 있어 더미 참가자를 추가하지 않았습니다.');
            return;
        }
        const {
            players,
            failedLines,
            avoidedRoleWarnings,
        } = parseMultipleLines(SAMPLE_ROSTER);
        if (players.length !== 10 || failedLines.length > 0 || avoidedRoleWarnings.length > 0) {
            showToast('error', '더미 참가자 명단을 불러오지 못했습니다.');
            return;
        }
        requestRosterIdentityReview(players, []);
    };

    const handleSelectAlternative = (index: number) => {
        const alternative = match.alternatives[index];
        if (!alternative || !match.result) return;
        const remaining = match.alternatives.filter((_, alternativeIndex) => alternativeIndex !== index);
        remaining.unshift(match.result);
        match.setResult(alternative);
        match.setAlternatives(remaining);
        setSwapSource(null);
    };

    return {
        handleClearAll,
        handleClearResult,
        handleRemovePlayer,
        handleRunMatching,
        handleSelectAlternative,
        handleSlotClick,
        handleUseExampleRoster,
    };
};
