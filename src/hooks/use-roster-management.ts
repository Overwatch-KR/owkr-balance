import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { getTierScore } from '../constants';
import {
    getEligibleRosterPlayers,
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
        const existingPlayer = editingPlayerId === null
            ? undefined
            : match.players.find(player => player.id === editingPlayerId);
        if (editingPlayerId !== null && !existingPlayer) {
            resetPlayerInputs();
            showDetailedError('수정할 참가자를 찾지 못했습니다.', {
                title: '참가자 정보가 변경되었습니다',
                description: '수정 중이던 참가자가 이미 삭제되었거나 명단이 갱신되었습니다.',
                hint: '현재 참가자 목록에서 대상을 다시 선택해 주세요.',
            });
            return;
        }
        const willJoinWaitlist = editingPlayerId === null && match.players.length >= 10;
        const newPlayer = normalizePlayerRolePreferences({
            id: editingPlayerId ?? Date.now(),
            name: inputs.name.trim(),
            discordName: inputs.discordName.trim() || undefined,
            discordUserId: existingPlayer?.discordUserId,
            userSheetEntryId: existingPlayer?.userSheetEntryId,
            tank: { tier: inputs.tTier, div: inputs.tDiv, score: getTierScore(inputs.tTier, inputs.tDiv), isPreferred: inputs.tPref, isAvoided: inputs.tAvoid },
            dps: { tier: inputs.dTier, div: inputs.dDiv, score: getTierScore(inputs.dTier, inputs.dDiv), isPreferred: inputs.dPref, isAvoided: inputs.dAvoid },
            sup: { tier: inputs.sTier, div: inputs.sDiv, score: getTierScore(inputs.sTier, inputs.sDiv), isPreferred: inputs.sPref, isAvoided: inputs.sAvoid },
        });
        const isEditing = editingPlayerId !== null;
        match.setPlayers(previous => isEditing
            ? previous.map(player => player.id === editingPlayerId ? newPlayer : player)
            : [...previous, newPlayer]);
        setFailedParses(previous => previous.filter(entry => {
            const battleTag = entry.match(/[^\s·]+#\d{4,}/)?.[0];
            return !battleTag || normalizePlayerName(battleTag) !== normalizePlayerName(newPlayer.name);
        }));
        resetPlayerInputs();
        if (isEditing) onPlayerEditCompleted();
        const hasOtherFailedParses = failedParses.some(entry => {
            const battleTag = entry.match(/[^\s·]+#\d{4,}/)?.[0];
            return !battleTag || normalizePlayerName(battleTag) !== normalizePlayerName(newPlayer.name);
        });
        if (hasOtherFailedParses) {
            setIsInputCollapsed(false);
            return;
        }
        setInputSummary(isEditing
            ? `참가자 수정 완료 · ${newPlayer.discordName ?? newPlayer.name}`
            : willJoinWaitlist
                ? `대기열에 추가 완료 · ${newPlayer.discordName ?? newPlayer.name}`
                : `참가자 1명 추가 완료 · ${newPlayer.discordName ?? newPlayer.name}`);
        setIsInputCollapsed(true);
        if (!isEditing && match.players.length + 1 === 10) onRosterCompleted();
    };

    const commitRosterImport = (
        incoming: Player[],
        failedLines: string[],
        mode: RosterImportMode,
        sheetResult?: Pick<SyncRosterUserSheetResult, 'addedCount' | 'tierUpdatedCount' | 'updatedCount'>,
    ): void => {
        const eligibleIncoming = getEligibleRosterPlayers(incoming, failedLines, []);
        const reconciled = reconcilePlayers(match.players, eligibleIncoming, mode);
        const waitlistCount = Math.max(reconciled.players.length - 10, 0);
        const hasIssues = failedLines.length > 0 || failedParses.length > 0;
        const syncedResult = match.result
            ? syncMatchResultPlayerIdentities(match.result, reconciled.players)
            : null;
        const shouldClearMatchResult = syncedResult
            ? isMatchResultStale(syncedResult, reconciled.players.slice(0, 10))
            : false;

        if (failedLines.length > 0) {
            setFailedParses(previous => [...new Set([...previous, ...failedLines])]);
        }
        match.setPlayers(reconciled.players);
        match.setResult(shouldClearMatchResult ? null : syncedResult);
        match.setAlternatives(shouldClearMatchResult
            ? []
            : match.alternatives.map(alternative => (
                syncMatchResultPlayerIdentities(alternative, reconciled.players)
            )));
        setSwapSource(null);
        setPendingIdentityImport(null);
        setIdentityImportError('');
        resetPlayerInputs();

        const summaryParts = mode === 'replace'
            ? [
                `유지 ${reconciled.unchangedCount}명`,
                `갱신 ${reconciled.updatedCount}명`,
                `신규 ${reconciled.addedCount}명`,
                `제외 ${reconciled.removedCount}명`,
            ]
            : [
                `갱신 ${reconciled.updatedCount}명`,
                `신규 ${reconciled.addedCount}명`,
            ];
        if (waitlistCount > 0) summaryParts.push(`대기열 ${waitlistCount}명`);
        if (failedLines.length > 0) summaryParts.push(`보완 ${failedLines.length}명`);
        if (shouldClearMatchResult && reconciled.players.length >= 10) {
            summaryParts.push('팀 재배정 필요');
        }
        if (sheetResult) {
            if (sheetResult.addedCount > 0) summaryParts.push(`시트 신규 ${sheetResult.addedCount}명`);
            if (sheetResult.updatedCount > 0) summaryParts.push(`시트 갱신 ${sheetResult.updatedCount}명`);
            if (sheetResult.tierUpdatedCount > 0) summaryParts.push(`티어 반영 ${sheetResult.tierUpdatedCount}명`);
        }
        setInputSummary(`${mode === 'replace' ? '새 명단 적용' : '기존 명단에 추가'} · ${summaryParts.join(' · ')}`);

        if (hasIssues) {
            setIsInputCollapsed(false);
            return;
        }
        setIsInputCollapsed(true);
        setPasteText('');
        if (reconciled.players.length === 10) onRosterCompleted();
    };

    const requestRosterIdentityReview = (incoming: Player[], failedLines: string[]) => {
        setIdentityImportError('');
        setPendingIdentityImport({ incoming, failedLines });
        setIsInputCollapsed(false);
    };

    const attachUserSheetEntryIds = (
        incoming: Player[],
        sheetResult: SyncRosterUserSheetResult,
    ): Player[] => {
        const byEntryId = new Map(sheetResult.entries.map(entry => [entry.id, entry]));
        const byDiscordId = new Map(sheetResult.entries.flatMap(entry => (
            entry.discordUserId ? [[entry.discordUserId, entry] as const] : []
        )));
        const byBattleTag = new Map<string, typeof sheetResult.entries>();
        sheetResult.entries.forEach(entry => {
            const key = normalizeUserSheetBattleTag(entry.battleTag);
            byBattleTag.set(key, [...(byBattleTag.get(key) ?? []), entry]);
        });

        return incoming.map(player => {
            const battleTagMatches = byBattleTag.get(normalizeUserSheetBattleTag(player.name)) ?? [];
            const entry = (
                player.userSheetEntryId ? byEntryId.get(player.userSheetEntryId) : undefined
            ) ?? (
                player.discordUserId ? byDiscordId.get(player.discordUserId) : undefined
            ) ?? (battleTagMatches.length === 1 ? battleTagMatches[0] : undefined);
            return entry ? { ...player, userSheetEntryId: entry.id } : player;
        });
    };

    const handleIdentityImportConfirm = async (resolution: RosterIdentityResolution): Promise<void> => {
        if (!pendingIdentityImport || isApplyingIdentityImport) return;
        setIsApplyingIdentityImport(true);
        setIdentityImportError('');
        try {
            const sheetResult = await syncRosterPlayersToUserSheet(
                resolution.players,
                new Set(resolution.syncTierPlayerIds),
                userSheet.sheetVersion,
                csrfToken,
            );
            userSheet.updateSnapshot(sheetResult);
            commitRosterImport(
                attachUserSheetEntryIds(resolution.players, sheetResult),
                pendingIdentityImport.failedLines,
                resolution.mode,
                sheetResult,
            );
        } catch (error) {
            const conflictSnapshot = await fetchUserSheetConflictSnapshot(error).catch(() => null);
            if (conflictSnapshot) userSheet.updateSnapshot(conflictSnapshot);
            const message = getErrorMessage(error, '유저 시트 변경을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            setIdentityImportError(conflictSnapshot
                ? `${message} 최신 시트를 불러왔습니다. 연결과 변경 내용을 확인한 뒤 다시 시도해 주세요.`
                : message);
        } finally {
            setIsApplyingIdentityImport(false);
        }
    };

    const handleApplyIdentityRosterOnly = (resolution: RosterIdentityResolution) => {
        if (!pendingIdentityImport || isApplyingIdentityImport) return;
        commitRosterImport(resolution.players, pendingIdentityImport.failedLines, resolution.mode);
    };

    const cancelIdentityImport = () => {
        if (isApplyingIdentityImport) return;
        setPendingIdentityImport(null);
        setIdentityImportError('');
    };

    const handlePaste = () => {
        if (!pasteText.trim()) {
            showDetailedError('붙여넣을 디스코드 채팅이 없습니다.', {
                title: '가져올 명단이 비어 있습니다',
                description: '채팅 붙여넣기 입력란에서 읽어낼 내용이 없습니다.',
                hint: 'Discord에서 참가자 명단이 포함된 채팅을 복사해 입력란에 붙여넣어 주세요.',
            });
            return;
        }
        const { players, failedLines, avoidedRoleWarnings } = (
            pasteParseResult ?? parseMultipleLines(pasteText)
        );
        const warningLines = avoidedRoleWarnings.map(warning => (
            [
                warning.discordName,
                warning.playerName,
                `비선호 역할 ${warning.avoidedRoleCount}개`,
            ].filter(Boolean).join(' · ')
        ));
        const importFailedLines = [...new Set([...failedLines, ...warningLines])];
        if (players.length === 0) {
            if (importFailedLines.length > 0) {
                setFailedParses(previous => [...new Set([...previous, ...importFailedLines])]);
            }
            setIsInputCollapsed(false);
            showDetailedError('읽어낸 플레이어가 없습니다.', {
                title: 'Discord 명단을 해석하지 못했습니다',
                description: '붙여넣은 내용에서 올바른 배틀태그와 최소 두 역할 티어를 찾지 못했습니다.',
                items: importFailedLines,
                hint: 'Player#1234 다3/플2/미배치 형식이 포함되어 있는지 확인해 주세요.',
            });
            return;
        }
        requestRosterIdentityReview(players, importFailedLines);
    };

    return {
        addPlayer,
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
        pasteValidationIssues,
        pasteText,
        pendingIdentityImport,
        requestRosterIdentityReview,
        resetPlayerInputs,
        selectInputMode,
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
