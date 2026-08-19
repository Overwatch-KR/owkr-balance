import type { MatchResultData, Player, RoleAssignment } from '../../types';

const ROLES = ['TANK', 'DPS', 'SUPPORT'] as const;

const normalizeBattleTag = (name: string): string => name.trim().toLowerCase();

/**
 * @description Discord ID와 시트 UUID가 있으면 배틀태그보다 우선하는 참가자 식별 키를 만든다.
 */
export const getPlayerIdentityKey = (player: Player): string => {
    if (player.discordUserId?.trim()) return `discord:${player.discordUserId.trim()}`;
    if (player.userSheetEntryId?.trim()) return `sheet:${player.userSheetEntryId.trim()}`;
    return `battle-tag:${normalizeBattleTag(player.name)}`;
};

const getPlayerFingerprint = (player: Player): string => {
    const rankFingerprint = (rank: Player['tank']): string => [
        rank.tier,
        rank.div,
        rank.score,
        rank.isPreferred ? 1 : 0,
        rank.isAvoided ? 1 : 0,
    ].join(':');

    return [
        getPlayerIdentityKey(player),
        normalizeBattleTag(player.name),
        player.discordName?.trim() ?? '',
        rankFingerprint(player.tank),
        rankFingerprint(player.dps),
        rankFingerprint(player.sup),
    ].join('|');
};

export type RosterImportMode = 'replace' | 'append';

const COMPLETE_ROSTER_SIZE = 10;

/**
 * @description 기존 명단이 있을 때 일부 참가자만 가져오면 안전하게 추가하고, 완성된 명단은 교체하도록 기본 적용 방식을 정한다.
 */
export const getDefaultRosterImportMode = (
    existingPlayerCount: number,
    incomingPlayerCount: number,
): RosterImportMode => (
    existingPlayerCount > 0 && incomingPlayerCount < COMPLETE_ROSTER_SIZE
        ? 'append'
        : 'replace'
);

export interface PlayerReconciliationResult {
    players: Player[];
    addedCount: number;
    updatedCount: number;
    unchangedCount: number;
    removedCount: number;
}

/**
 * @description Discord ID 또는 시트 UUID가 같을 때만 동일 참가자로 보고 처음 등장한 순서를 유지한다.
 */
const dedupePlayersByIdentity = (players: Player[]): Player[] => {
    const seenIdentities = new Set<string>();

    return players.filter((player) => {
        const identity = getPlayerIdentityKey(player);
        if (seenIdentities.has(identity)) return false;
        seenIdentities.add(identity);
        return true;
    });
};

/**
 * @description 기존 참가자의 안정적인 ID를 유지하면서 새 명단의 최신 프로필을 반영한다.
 */
const resolveKnownPlayer = (existing: Player, incoming: Player): Player => ({
    ...incoming,
    id: existing.id,
    discordName: incoming.discordName?.trim() || existing.discordName?.trim() || undefined,
    discordUserId: incoming.discordUserId ?? existing.discordUserId,
    userSheetEntryId: incoming.userSheetEntryId ?? existing.userSheetEntryId,
});

const makePlayerIndexes = (players: Player[]) => {
    const byIdentity = new Map(players.map(player => [getPlayerIdentityKey(player), player]));
    const byBattleTag = new Map<string, Player[]>();
    players.forEach(player => {
        const battleTag = normalizeBattleTag(player.name);
        const matches = byBattleTag.get(battleTag) ?? [];
        matches.push(player);
        byBattleTag.set(battleTag, matches);
    });
    return { byBattleTag, byIdentity };
};

/**
 * @description 붙여넣은 명단을 현재 명단과 비교해 교체 또는 추가 결과와 변경 요약을 만든다.
 */
export const reconcilePlayers = (
    existing: Player[],
    incoming: Player[],
    mode: RosterImportMode,
): PlayerReconciliationResult => {
    const currentPlayers = dedupePlayersByIdentity(existing);
    const incomingPlayers = dedupePlayersByIdentity(incoming);
    const currentIndexes = makePlayerIndexes(currentPlayers);

    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    const matchedExistingIds = new Set<number>();
    const resolvedByExistingId = new Map<number, Player>();

    const resolvedIncoming = incomingPlayers.map((player) => {
        const identityMatch = currentIndexes.byIdentity.get(getPlayerIdentityKey(player));
        const battleTagMatches = currentIndexes.byBattleTag.get(
            normalizeBattleTag(player.name),
        ) ?? [];
        const existingPlayer = identityMatch
            ?? (battleTagMatches.length === 1 ? battleTagMatches[0] : undefined);

        if (!existingPlayer) {
            addedCount++;
            return player;
        }

        matchedExistingIds.add(existingPlayer.id);
        const resolvedPlayer = resolveKnownPlayer(existingPlayer, player);
        resolvedByExistingId.set(existingPlayer.id, resolvedPlayer);
        if (getPlayerFingerprint(existingPlayer) === getPlayerFingerprint(resolvedPlayer)) {
            unchangedCount++;
        } else {
            updatedCount++;
        }

        return resolvedPlayer;
    });

    const removedCount = mode === 'replace'
        ? currentPlayers.filter(player => !matchedExistingIds.has(player.id)).length
        : 0;

    if (mode === 'replace') {
        return {
            players: resolvedIncoming,
            addedCount,
            updatedCount,
            unchangedCount,
            removedCount,
        };
    }

    const appendedPlayers = currentPlayers.map((player) => (
        resolvedByExistingId.get(player.id) ?? player
    ));

    for (const player of resolvedIncoming) {
        if (![...resolvedByExistingId.values()].includes(player)) {
            appendedPlayers.push(player);
        }
    }

    return {
        players: appendedPlayers,
        addedCount,
        updatedCount,
        unchangedCount,
        removedCount,
    };
};

const syncAssignmentIdentities = (
    assignment: RoleAssignment,
    players: Player[],
): RoleAssignment => {
    const syncedAssignment = { ...assignment };
    const indexes = makePlayerIndexes(players);

    for (const role of ROLES) {
        syncedAssignment[role] = assignment[role].map((player) => {
            const identityMatch = indexes.byIdentity.get(getPlayerIdentityKey(player));
            const battleTagMatches = indexes.byBattleTag.get(normalizeBattleTag(player.name)) ?? [];
            const currentPlayer = identityMatch
                ?? (battleTagMatches.length === 1 ? battleTagMatches[0] : undefined);
            if (!currentPlayer) return player;
            return {
                ...player,
                discordName: currentPlayer.discordName?.trim() || player.discordName,
                discordUserId: currentPlayer.discordUserId ?? player.discordUserId,
                userSheetEntryId: currentPlayer.userSheetEntryId ?? player.userSheetEntryId,
            };
        });
    }

    return syncedAssignment;
};

/**
 * @description 참가자 명단의 최신 디스코드 이름을 저장된 매칭 결과의 플레이어에도 반영한다.
 */
export const syncMatchResultPlayerIdentities = (
    result: MatchResultData,
    players: Player[],
): MatchResultData => {
    return {
        ...result,
        teamA: {
            ...result.teamA,
            assignment: syncAssignmentIdentities(result.teamA.assignment, players),
        },
        teamB: {
            ...result.teamB,
            assignment: syncAssignmentIdentities(result.teamB.assignment, players),
        },
    };
};

/**
 * @description 현재 참가자 10명의 정보와 저장된 매칭 결과가 서로 다른지 확인한다.
 */
export const isMatchResultStale = (result: MatchResultData, participants: Player[]): boolean => {
    if (participants.length !== 10) return true;

    const resultPlayers = [result.teamA, result.teamB].flatMap(team => (
        ROLES.flatMap(role => team.assignment[role])
    ));
    if (resultPlayers.length !== 10) return true;

    const currentFingerprints = participants.map(getPlayerFingerprint).sort();
    const resultFingerprints = resultPlayers.map(getPlayerFingerprint).sort();

    return currentFingerprints.some((fingerprint, index) => fingerprint !== resultFingerprints[index]);
};
