import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { getTierScore } from '../constants';
import {
    getEligibleRosterPlayers,
    parseLineToPlayer,
    parseMultipleLines,
} from '../utils/parser';
import {
    isMatchResultStale,
    reconcilePlayers,
    syncMatchResultPlayerIdentities,
    type RosterImportMode,
} from '../utils/player';
import { normalizePlayerRolePreferences } from '../utils/role-preference';
import {
    fetchUserSheetConflictSnapshot,
    normalizeUserSheetBattleTag,
    syncRosterPlayersToUserSheet,
    type SyncRosterUserSheetResult,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../utils/user-sheet';
import type { MatchResultData, Player, SwapSource } from '../types';
import type { ErrorDetails } from '../components/common/error-details-modal';
import type { RosterIdentityResolution } from '../components/player/form/roster-identity-resolver';
import { usePlayerInput } from './use-player-input';
import { getErrorMessage } from '../utils/api';

interface PendingIdentityImport {
    failedLines: string[];
    incoming: Player[];
}

interface RosterMatchState {
    alternatives: MatchResultData[];
    players: Player[];
    result: MatchResultData | null;
    setAlternatives: Dispatch<SetStateAction<MatchResultData[]>>;
    setPlayers: Dispatch<SetStateAction<Player[]>>;
    setResult: Dispatch<SetStateAction<MatchResultData | null>>;
}

interface RosterUserSheetState {
    sheetVersion: number;
    updateSnapshot: (snapshot: UserSheetSnapshot) => void;
}

interface UseRosterManagementOptions {
    csrfToken: string;
    match: RosterMatchState;
    onPlayerEditCompleted: () => void;
    onRosterCompleted: () => void;
    setSwapSource: Dispatch<SetStateAction<SwapSource | null>>;
    showDetailedError: (message: string, details: ErrorDetails) => void;
    userSheet: RosterUserSheetState;
}

const normalizePlayerName = (name: string) => name.trim().toLowerCase();

/**
 * @description 참가자 추가·가져오기·Discord ID 확인과 유저 시트 동기화 흐름을 관리한다.
 */
export const useRosterManagement = ({
    csrfToken,
    match,
    onPlayerEditCompleted,
    onRosterCompleted,
    setSwapSource,
    showDetailedError,
    userSheet,
}: UseRosterManagementOptions) => {
    const {
        editingPlayerId,
        editPlayer,
        failedParses,
        inputMode,
        inputSummary,
        inputs,
        isInputCollapsed,
        isPasteValidationPending,
        pasteParseResult,
        pasteText,
        pasteValidationIssues,
        resetInputs,
        selectInputMode,
        setFailedParses,
        setInputMode,
        setInputSummary,
        setInputs,
        setIsInputCollapsed,
        setPasteText,
        updatePasteText,
    } = usePlayerInput(match.players.length);
    const [manualInputError, setManualInputError] = useState('');
    const [pendingIdentityImport, setPendingIdentityImport] = useState<PendingIdentityImport | null>(null);
    const [identityImportError, setIdentityImportError] = useState('');
    const [isApplyingIdentityImport, setIsApplyingIdentityImport] = useState(false);

    const resetPlayerInputs = useCallback(() => {
        resetInputs();
        setManualInputError('');
    }, [resetInputs]);

    const startEditingPlayer = useCallback((player: Player) => {
        editPlayer(player);
        setManualInputError('');
    }, [editPlayer]);

    const addUserSheetPlayer = useCallback((entry: UserSheetEntry) => {
        const discordUserId = entry.discordUserId?.replace(/\D/g, '').trim() ?? '';
        if (!/^\d{17,20}$/.test(discordUserId)) {
            showDetailedError('Discord ID가 없는 유저는 참가자로 추가할 수 없습니다.', {
                title: '유저 시트 연결 정보가 필요합니다',
                description: `${entry.discordName || entry.battleTag} 유저의 Discord ID를 먼저 유저 시트에 저장해 주세요.`,
                hint: '유저 시트에서 Discord ID를 보완한 뒤 다시 추가해 주세요.',
            });
            return;
        }

        const duplicate = match.players.find(player => (
            player.userSheetEntryId === entry.id
            || player.discordUserId === discordUserId
            || normalizeUserSheetBattleTag(player.name) === normalizeUserSheetBattleTag(entry.battleTag)
        ));
        if (duplicate) {
            showDetailedError('이미 참가 명단에 있는 유저입니다.', {
                title: '중복 참가자를 추가할 수 없습니다',
                description: `${duplicate.discordName ?? duplicate.name} 참가자가 현재 명단 또는 대기열에 이미 있습니다.`,
                hint: '기존 참가자 카드를 수정하거나 먼저 제거한 뒤 다시 추가해 주세요.',
            });
            return;
        }

        const parsed = parseLineToPlayer(
            `${entry.battleTag} ${entry.tank || '-'}/${entry.dps || '-'}/${entry.support || '-'}`,
            entry.discordName,
        );
        const rankedRoleCount = parsed
            ? [parsed.tank, parsed.dps, parsed.sup].filter(rank => rank.tier !== 'UNRANKED').length
            : 0;
        if (!parsed || rankedRoleCount < 2) {
            showDetailedError('유저 시트의 티어 정보로 참가자를 만들지 못했습니다.', {
                title: '역할 티어를 확인해 주세요',
                description: `${entry.discordName || entry.battleTag} 유저는 최소 2개 포지션의 정식 티어가 필요합니다.`,
                hint: '유저 시트의 탱커·딜러·힐러 티어를 보완한 뒤 다시 추가해 주세요.',
            });
            return;
        }

        const willJoinWaitlist = match.players.length >= 10;
        const player: Player = {
            ...parsed,
            id: Date.now() + match.players.length,
            discordName: entry.discordName.trim() || undefined,
            discordUserId,
            userSheetEntryId: entry.id,
        };
        match.setPlayers(previous => [...previous, player]);
        setInputSummary(willJoinWaitlist
            ? `유저 시트에서 대기열 추가 · ${player.discordName ?? player.name}`
            : `유저 시트에서 참가자 추가 · ${player.discordName ?? player.name}`);
        if (match.players.length + 1 === 10) onRosterCompleted();
    }, [match, onRosterCompleted, setInputSummary, showDetailedError]);

    const addPlayer = () => {
        if (!inputs.name.trim()) {
            setIsInputCollapsed(false);
            setManualInputError('배틀태그를 Player#1234 형식으로 입력해 주세요.');
            return;
        }
        const rankedRoleCount = [inputs.tTier, inputs.dTier, inputs.sTier]
            .filter(tier => tier !== 'UNRANKED').length;
        if (rankedRoleCount < 2) {
            setIsInputCollapsed(false);
            setManualInputError('최소 2개 포지션의 정식 티어를 입력해 주세요.');
            return;
        }
        const normalizedName = normalizePlayerName(inputs.name);
        if (match.players.some(player => (
            player.id !== editingPlayerId
            && normalizePlayerName(player.name) === normalizedName
        ))) {
            setIsInputCollapsed(false);
            const duplicate = match.players.find(player => (
                player.id !== editingPlayerId
                && normalizePlayerName(player.name) === normalizedName
            ));
            setManualInputError(
                `${duplicate?.discordName ?? duplicate?.name ?? inputs.name} 참가자가 이미 명단에 있습니다. 기존 참가자 카드를 수정해 주세요.`,
            );
            return;
        }
        const normalizedInputs = normalizePlayerRolePreferences(inputs);
        const player: Player = {
            id: editingPlayerId ?? Date.now(),
            name: inputs.name.trim(),
            tank: {
                tier: normalizedInputs.tTier,
                div: normalizedInputs.tDiv,
                score: getTierScore(normalizedInputs.tTier, normalizedInputs.tDiv),
                isPreferred: normalizedInputs.tPreferred,
                isAvoided: normalizedInputs.tAvoided,
            },
            dps: {
                tier: normalizedInputs.dTier,
                div: normalizedInputs.dDiv,
                score: getTierScore(normalizedInputs.dTier, normalizedInputs.dDiv),
                isPreferred: normalizedInputs.dPreferred,
                isAvoided: normalizedInputs.dAvoided,
            },
            sup: {
                tier: normalizedInputs.sTier,
                div: normalizedInputs.sDiv,
                score: getTierScore(normalizedInputs.sTier, normalizedInputs.sDiv),
                isPreferred: normalizedInputs.sPreferred,
                isAvoided: normalizedInputs.sAvoided,
            },
        };

        if (editingPlayerId !== null) {
            match.setPlayers(previous => previous.map(current => (
                current.id === editingPlayerId ? { ...current, ...player } : current
            )));
            if (match.result) {
                match.setResult(syncMatchResultPlayerIdentities(match.result, [player]));
            }
            onPlayerEditCompleted();
        } else {
            match.setPlayers(previous => [...previous, player]);
            if (match.players.length + 1 === 10) onRosterCompleted();
        }
        resetPlayerInputs();
        setInputSummary('');
    };

    const handlePaste = () => {
        const parsed = parseMultipleLines(pasteText);
        if (parsed.players.length === 0) {
            setFailedParses(parsed.failedLines);
            return;
        }
        if (parsed.failedLines.length > 0) {
            setPendingIdentityImport({
                failedLines: parsed.failedLines,
                incoming: parsed.players,
            });
            setIdentityImportError('');
            return;
        }
        const next = reconcilePlayers(match.players, parsed.players, 'append');
        match.setPlayers(next);
        setPasteText('');
        setFailedParses([]);
        setInputSummary(`채팅 명단 ${parsed.players.length}명 추가`);
        if (next.length >= 10 && match.players.length < 10) onRosterCompleted();
    };

    const requestRosterIdentityReview = useCallback((
        incomingPlayers: Player[],
        failedLines: string[],
    ) => {
        if (incomingPlayers.length === 0) {
            setFailedParses(failedLines);
            return;
        }
        setPendingIdentityImport({ failedLines, incoming: incomingPlayers });
        setIdentityImportError('');
    }, [setFailedParses]);

    const cancelIdentityImport = useCallback(() => {
        setPendingIdentityImport(null);
        setIdentityImportError('');
    }, []);

    const handleApplyIdentityRosterOnly = useCallback((resolution: RosterIdentityResolution) => {
        if (!pendingIdentityImport) return;
        const incoming = resolution.players.map(player => ({
            ...player,
            userSheetEntryId: resolution.entryIdByPlayerId.get(player.id),
        }));
        const next = reconcilePlayers(match.players, incoming, 'append');
        match.setPlayers(next);
        setPasteText('');
        setFailedParses(pendingIdentityImport.failedLines);
        setInputSummary(`검토한 명단 ${incoming.length}명 추가`);
        setPendingIdentityImport(null);
        setIdentityImportError('');
        if (next.length >= 10 && match.players.length < 10) onRosterCompleted();
    }, [match, onRosterCompleted, pendingIdentityImport, setFailedParses, setInputSummary, setPasteText]);

    const handleIdentityImportConfirm = useCallback(async (
        resolution: RosterIdentityResolution,
        syncTiers: boolean,
    ) => {
        if (!pendingIdentityImport) return;
        setIsApplyingIdentityImport(true);
        setIdentityImportError('');
        try {
            const incoming = resolution.players.map(player => ({
                ...player,
                userSheetEntryId: resolution.entryIdByPlayerId.get(player.id),
            }));
            const eligiblePlayers = getEligibleRosterPlayers(incoming);
            const response = await syncRosterPlayersToUserSheet(
                eligiblePlayers,
                userSheet.sheetVersion,
                csrfToken,
                resolution.entryIdByPlayerId,
                syncTiers,
            );
            userSheet.updateSnapshot(response.snapshot);
            const next = reconcilePlayers(match.players, incoming, 'append');
            match.setPlayers(next);
            setPasteText('');
            setFailedParses(pendingIdentityImport.failedLines);
            setInputSummary(buildSyncSummary(response, incoming.length));
            setPendingIdentityImport(null);
            if (next.length >= 10 && match.players.length < 10) onRosterCompleted();
        } catch (error) {
            const conflictSnapshot = await fetchUserSheetConflictSnapshot(error);
            if (conflictSnapshot) userSheet.updateSnapshot(conflictSnapshot);
            setIdentityImportError(getErrorMessage(error, '유저 시트 동기화에 실패했습니다. 다시 시도해 주세요.'));
        } finally {
            setIsApplyingIdentityImport(false);
        }
    }, [
        csrfToken,
        match,
        onRosterCompleted,
        pendingIdentityImport,
        setFailedParses,
        setInputSummary,
        setPasteText,
        userSheet,
    ]);

    const selectRosterInputMode = useCallback((mode: typeof inputMode) => {
        selectInputMode(mode);
        setManualInputError('');
    }, [selectInputMode]);

    return {
        addPlayer,
        addUserSheetPlayer,
        cancelIdentityImport,
        editingPlayerId,
        failedParses,
        handleApplyIdentityRosterOnly,
        handleIdentityImportConfirm,
        handlePaste,
        identityImportError,
        inputMode,
        inputSummary,
        inputs,
        isApplyingIdentityImport,
        isInputCollapsed,
        isPasteValidationPending,
        manualInputError,
        pasteParseResult,
        pasteText,
        pasteValidationIssues,
        pendingIdentityImport,
        requestRosterIdentityReview,
        resetPlayerInputs,
        selectInputMode: selectRosterInputMode,
        setFailedParses,
        setInputMode,
        setInputSummary,
        setInputs,
        setIsInputCollapsed,
        setManualInputError,
        startEditingPlayer,
        updatePasteText,
    };
};

const buildSyncSummary = (
    result: SyncRosterUserSheetResult,
    importedCount: number,
): string => {
    const parts = [`검토한 명단 ${importedCount}명 추가`];
    if (result.addedCount > 0) parts.push(`유저 시트 ${result.addedCount}명 추가`);
    if (result.updatedCount > 0) parts.push(`기본 정보 ${result.updatedCount}명 갱신`);
    if (result.tierUpdatedCount > 0) parts.push(`티어 ${result.tierUpdatedCount}명 갱신`);
    return parts.join(' · ');
};
