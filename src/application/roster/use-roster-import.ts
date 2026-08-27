import { useState } from 'react';
import type { Player } from '#domain/player';
import {
    getEligibleRosterPlayers,
    parseMultipleLines,
} from '../../utils/parser';
import {
    isMatchResultStale,
    reconcilePlayers,
    syncMatchResultPlayerIdentities,
    type RosterImportMode,
} from '../../utils/player';
import {
    fetchUserSheetConflictSnapshot,
    normalizeUserSheetBattleTag,
    syncRosterPlayersToUserSheet,
    type SyncRosterUserSheetResult,
} from '../../utils/user-sheet';
import { getErrorMessage } from '../../utils/api';
import { usePlayerInput } from '../../hooks/use-player-input';
import type {
    PendingIdentityImport,
    RosterIdentityResolution,
    UseRosterManagementOptions,
} from './types';

interface UseRosterImportOptions extends Pick<
    UseRosterManagementOptions,
    'csrfToken' | 'match' | 'onRosterCompleted' | 'setSwapSource' | 'showDetailedError' | 'userSheet'
> {
    input: ReturnType<typeof usePlayerInput>;
    resetPlayerInputs: () => void;
}

/**
 * @description Discord 명단 가져오기, 식별 검토와 유저 시트 동기화 흐름만 담당한다.
 */
export const useRosterImport = ({
    csrfToken,
    input,
    match,
    onRosterCompleted,
    resetPlayerInputs,
    setSwapSource,
    showDetailedError,
    userSheet,
}: UseRosterImportOptions) => {
    const [pendingIdentityImport, setPendingIdentityImport] = useState<PendingIdentityImport | null>(null);
    const [identityImportError, setIdentityImportError] = useState('');
    const [isApplyingIdentityImport, setIsApplyingIdentityImport] = useState(false);

    const commitRosterImport = (
        incoming: Player[],
        failedLines: string[],
        mode: RosterImportMode,
        sheetResult?: Pick<SyncRosterUserSheetResult, 'addedCount' | 'tierUpdatedCount' | 'updatedCount'>,
    ): void => {
        const eligibleIncoming = getEligibleRosterPlayers(incoming, failedLines, []);
        const reconciled = reconcilePlayers(match.players, eligibleIncoming, mode);
        const waitlistCount = Math.max(reconciled.players.length - 10, 0);
        const hasIssues = failedLines.length > 0 || input.failedParses.length > 0;
        const syncedResult = match.result
            ? syncMatchResultPlayerIdentities(match.result, reconciled.players)
            : null;
        const shouldClearMatchResult = syncedResult
            ? isMatchResultStale(syncedResult, reconciled.players.slice(0, 10))
            : false;

        if (failedLines.length > 0) {
            input.setFailedParses(previous => [...new Set([...previous, ...failedLines])]);
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
        input.setInputSummary(`${mode === 'replace' ? '새 명단 적용' : '기존 명단에 추가'} · ${summaryParts.join(' · ')}`);

        if (hasIssues) {
            input.setIsInputCollapsed(false);
            return;
        }
        input.setIsInputCollapsed(true);
        input.setPasteText('');
        if (reconciled.players.length === 10) onRosterCompleted();
    };

    const requestRosterIdentityReview = (incoming: Player[], failedLines: string[]) => {
        setIdentityImportError('');
        setPendingIdentityImport({ incoming, failedLines });
        input.setIsInputCollapsed(false);
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
        if (!input.pasteText.trim()) {
            showDetailedError('붙여넣을 디스코드 채팅이 없습니다.', {
                title: '가져올 명단이 비어 있습니다',
                description: '채팅 붙여넣기 입력란에서 읽어낼 내용이 없습니다.',
                hint: 'Discord에서 참가자 명단이 포함된 채팅을 복사해 입력란에 붙여넣어 주세요.',
            });
            return;
        }
        const { players, failedLines, avoidedRoleWarnings } = (
            input.pasteParseResult ?? parseMultipleLines(input.pasteText)
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
                input.setFailedParses(previous => [...new Set([...previous, ...importFailedLines])]);
            }
            input.setIsInputCollapsed(false);
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
        cancelIdentityImport,
        handleApplyIdentityRosterOnly,
        handleIdentityImportConfirm,
        handlePaste,
        identityImportError,
        isApplyingIdentityImport,
        pendingIdentityImport,
        requestRosterIdentityReview,
    };
};
