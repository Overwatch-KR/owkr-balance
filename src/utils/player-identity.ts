import type { Player } from '../types';
import type { UserSheetEntry } from './user-sheet';
import { normalizeUserSheetBattleTag } from './user-sheet';

export type RosterIdentityMatchKind =
    | 'DISCORD_ID'
    | 'BATTLE_TAG_AND_NAME'
    | 'BATTLE_TAG'
    | 'DISCORD_NAME'
    | 'AMBIGUOUS'
    | 'NEW';

export interface RosterIdentitySuggestion {
    candidateEntryIds: string[];
    matchKind: RosterIdentityMatchKind;
    player: Player;
    requiresDiscordUserId: boolean;
    selectedEntryId?: string;
}

/**
 * @description Discord 고유 ID에서 복사 과정에 섞인 멘션 기호와 공백을 제거한다.
 */
export const cleanDiscordUserId = (value: string): string => (
    value.replace(/[<@!>\s]/g, '').replace(/\D/g, '')
);

/**
 * @description Discord snowflake를 정수 변환 없이 문자열 형식으로 검증한다.
 */
export const isValidDiscordUserId = (value: string): boolean => (
    /^\d{17,20}$/.test(cleanDiscordUserId(value))
);

/**
 * @description 변경 가능한 Discord 표시 이름을 후보 검색용으로만 정규화한다.
 */
export const normalizeDiscordName = (value: string): string => value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ko-KR');

const uniqueIds = (entries: UserSheetEntry[]): string[] => (
    [...new Set(entries.map(entry => entry.id))]
);

/**
 * @description Discord ID와 배틀태그로 기존 행을 연결하고 표시 이름만 같으면 ID 확인 후보로 남긴다.
 */
export const suggestRosterIdentity = (
    player: Player,
    entries: UserSheetEntry[],
): RosterIdentitySuggestion => {
    const discordUserId = cleanDiscordUserId(player.discordUserId ?? '');
    const idMatches = discordUserId
        ? entries.filter(entry => entry.discordUserId === discordUserId)
        : [];
    if (idMatches.length === 1) {
        return {
            candidateEntryIds: [idMatches[0].id],
            matchKind: 'DISCORD_ID',
            player,
            requiresDiscordUserId: false,
            selectedEntryId: idMatches[0].id,
        };
    }

    const battleTag = normalizeUserSheetBattleTag(player.name);
    const discordName = normalizeDiscordName(player.discordName ?? '');
    const battleTagMatches = entries.filter(entry => (
        normalizeUserSheetBattleTag(entry.battleTag) === battleTag
    ));
    const nameMatches = discordName
        ? entries.filter(entry => normalizeDiscordName(entry.discordName) === discordName)
        : [];
    const bothMatches = battleTagMatches.filter(entry => nameMatches.some(
        nameEntry => nameEntry.id === entry.id,
    ));

    if (bothMatches.length === 1) {
        return {
            candidateEntryIds: uniqueIds([...bothMatches, ...battleTagMatches, ...nameMatches]),
            matchKind: 'BATTLE_TAG_AND_NAME',
            player,
            requiresDiscordUserId: !bothMatches[0].discordUserId,
            selectedEntryId: bothMatches[0].id,
        };
    }
    if (battleTagMatches.length === 1 && nameMatches.length <= 1) {
        return {
            candidateEntryIds: uniqueIds([...battleTagMatches, ...nameMatches]),
            matchKind: 'BATTLE_TAG',
            player,
            requiresDiscordUserId: !battleTagMatches[0].discordUserId,
            selectedEntryId: battleTagMatches[0].id,
        };
    }
    if (nameMatches.length === 1 && battleTagMatches.length === 0) {
        return {
            candidateEntryIds: [nameMatches[0].id],
            matchKind: 'DISCORD_NAME',
            player,
            requiresDiscordUserId: true,
        };
    }

    const candidateEntryIds = uniqueIds([...bothMatches, ...battleTagMatches, ...nameMatches]);
    return {
        candidateEntryIds,
        matchKind: candidateEntryIds.length > 0 ? 'AMBIGUOUS' : 'NEW',
        player,
        requiresDiscordUserId: true,
    };
};

/**
 * @description 한 번의 명단 가져오기에 포함된 모든 참가자의 식별 추천을 만든다.
 */
export const suggestRosterIdentities = (
    players: Player[],
    entries: UserSheetEntry[],
): RosterIdentitySuggestion[] => {
    const suggestions = players.map(player => suggestRosterIdentity(player, entries));
    const battleTagCounts = new Map<string, number>();
    players.forEach(player => {
        const battleTag = normalizeUserSheetBattleTag(player.name);
        battleTagCounts.set(battleTag, (battleTagCounts.get(battleTag) ?? 0) + 1);
    });
    return suggestions.map(suggestion => (
        (battleTagCounts.get(normalizeUserSheetBattleTag(suggestion.player.name)) ?? 0) > 1
            ? {
                ...suggestion,
                matchKind: 'AMBIGUOUS',
                requiresDiscordUserId: true,
            }
            : suggestion
    ));
};
