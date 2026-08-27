import { useCallback, useState } from 'react';
import type { Player } from '#domain/player';
import { getTierScore } from '../../constants';
import { parseLineToPlayer } from '../../utils/parser';
import { normalizePlayerRolePreferences } from '../../utils/role-preference';
import {
    normalizeUserSheetBattleTag,
    type UserSheetEntry,
} from '../../utils/user-sheet';
import { usePlayerInput } from '../../hooks/use-player-input';
import type { UseRosterManagementOptions } from './types';

interface UseRosterEditorOptions extends Pick<
    UseRosterManagementOptions,
    'match' | 'onPlayerEditCompleted' | 'onRosterCompleted' | 'showDetailedError'
> {
    input: ReturnType<typeof usePlayerInput>;
}

const normalizePlayerName = (name: string) => name.trim().toLowerCase();

/**
 * @description 수동 참가자 편집과 유저 시트 직접 추가 흐름만 담당한다.
 */
export const useRosterEditor = ({
    input,
    match,
    onPlayerEditCompleted,
    onRosterCompleted,
    showDetailedError,
}: UseRosterEditorOptions) => {
    const [manualInputError, setManualInputError] = useState('');

    const resetPlayerInputs = useCallback(() => {
        input.resetInputs();
        setManualInputError('');
    }, [input]);

    const startEditingPlayer = useCallback((player: Player) => {
        input.editPlayer(player);
        setManualInputError('');
    }, [input]);

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
        input.setInputSummary(willJoinWaitlist
            ? `유저 시트에서 대기열 추가 · ${player.discordName ?? player.name}`
            : `유저 시트에서 참가자 추가 · ${player.discordName ?? player.name}`);
        if (match.players.length + 1 === 10) onRosterCompleted();
    }, [input, match, onRosterCompleted, showDetailedError]);

    const addPlayer = useCallback(() => {
        if (!input.inputs.name.trim()) {
            input.setIsInputCollapsed(false);
            setManualInputError('배틀태그를 Player#1234 형식으로 입력해 주세요.');
            return;
        }
        const rankedRoleCount = [input.inputs.tTier, input.inputs.dTier, input.inputs.sTier]
            .filter(tier => tier !== 'UNRANKED').length;
        if (rankedRoleCount < 2) {
            input.setIsInputCollapsed(false);
            setManualInputError('최소 2개 포지션의 정식 티어를 입력해 주세요.');
            return;
        }

        const normalizedName = normalizePlayerName(input.inputs.name);
        const duplicate = match.players.find(player => (
            player.id !== input.editingPlayerId
            && normalizePlayerName(player.name) === normalizedName
        ));
        if (duplicate) {
            input.setIsInputCollapsed(false);
            setManualInputError(
                `${duplicate.discordName ?? duplicate.name} 참가자가 이미 명단에 있습니다. 기존 참가자 카드를 수정해 주세요.`,
            );
            return;
        }

        const existingPlayer = input.editingPlayerId === null
            ? undefined
            : match.players.find(player => player.id === input.editingPlayerId);
        if (input.editingPlayerId !== null && !existingPlayer) {
            resetPlayerInputs();
            showDetailedError('수정할 참가자를 찾지 못했습니다.', {
                title: '참가자 정보가 변경되었습니다',
                description: '수정 중이던 참가자가 이미 삭제되었거나 명단이 갱신되었습니다.',
                hint: '현재 참가자 목록에서 대상을 다시 선택해 주세요.',
            });
            return;
        }

        const willJoinWaitlist = input.editingPlayerId === null && match.players.length >= 10;
        const newPlayer = normalizePlayerRolePreferences({
            id: input.editingPlayerId ?? Date.now(),
            name: input.inputs.name.trim(),
            discordName: input.inputs.discordName.trim() || undefined,
            discordUserId: existingPlayer?.discordUserId,
            userSheetEntryId: existingPlayer?.userSheetEntryId,
            tank: { tier: input.inputs.tTier, div: input.inputs.tDiv, score: getTierScore(input.inputs.tTier, input.inputs.tDiv), isPreferred: input.inputs.tPref, isAvoided: input.inputs.tAvoid },
            dps: { tier: input.inputs.dTier, div: input.inputs.dDiv, score: getTierScore(input.inputs.dTier, input.inputs.dDiv), isPreferred: input.inputs.dPref, isAvoided: input.inputs.dAvoid },
            sup: { tier: input.inputs.sTier, div: input.inputs.sDiv, score: getTierScore(input.inputs.sTier, input.inputs.sDiv), isPreferred: input.inputs.sPref, isAvoided: input.inputs.sAvoid },
        });
        const isEditing = input.editingPlayerId !== null;
        match.setPlayers(previous => isEditing
            ? previous.map(player => player.id === input.editingPlayerId ? newPlayer : player)
            : [...previous, newPlayer]);
        input.setFailedParses(previous => previous.filter(entry => {
            const battleTag = entry.match(/[^\s·]+#\d{4,}/)?.[0];
            return !battleTag || normalizePlayerName(battleTag) !== normalizePlayerName(newPlayer.name);
        }));
        resetPlayerInputs();
        if (isEditing) onPlayerEditCompleted();

        const hasOtherFailedParses = input.failedParses.some(entry => {
            const battleTag = entry.match(/[^\s·]+#\d{4,}/)?.[0];
            return !battleTag || normalizePlayerName(battleTag) !== normalizePlayerName(newPlayer.name);
        });
        if (hasOtherFailedParses) {
            input.setIsInputCollapsed(false);
            return;
        }

        input.setInputSummary(isEditing
            ? `참가자 수정 완료 · ${newPlayer.discordName ?? newPlayer.name}`
            : willJoinWaitlist
                ? `대기열에 추가 완료 · ${newPlayer.discordName ?? newPlayer.name}`
                : `참가자 1명 추가 완료 · ${newPlayer.discordName ?? newPlayer.name}`);
        input.setIsInputCollapsed(true);
        if (!isEditing && match.players.length + 1 === 10) onRosterCompleted();
    }, [input, match, onPlayerEditCompleted, onRosterCompleted, resetPlayerInputs, showDetailedError]);

    return {
        addPlayer,
        addUserSheetPlayer,
        manualInputError,
        resetPlayerInputs,
        setManualInputError,
        startEditingPlayer,
    };
};
