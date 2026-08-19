import { formatRank } from '../constants';
import type { Player } from '../types';
import { ApiError, requestJson } from './api';

export interface UserSheetEntry {
    id: string;
    discordUserId?: string;
    discordName: string;
    battleTag: string;
    tank: string;
    dps: string;
    support: string;
    note: string;
    createdAt: number;
    updatedAt: number;
    updatedByName: string;
}

export interface UserSheetChangeSummary {
    addedCount: number;
    removedCount: number;
    updatedCount: number;
}

export interface UserSheetSnapshot {
    entries: UserSheetEntry[];
    sheetVersion: number;
}

interface UserSheetConflictResponse {
    snapshot?: unknown;
}

export type UserSheetDraftEntry = Pick<
    UserSheetEntry,
    'id' | 'discordUserId' | 'discordName' | 'battleTag' | 'tank' | 'dps' | 'support' | 'note'
>;

export type UserSheetValidationError =
    | 'REQUIRED_DISCORD_USER_ID'
    | 'INVALID_BATTLE_TAG'
    | 'DUPLICATE_BATTLE_TAG'
    | 'INVALID_DISCORD_USER_ID'
    | 'DUPLICATE_DISCORD_USER_ID';

const USER_SHEET_DRAFT_FIELDS: ReadonlyArray<keyof UserSheetDraftEntry> = [
    'discordUserId',
    'discordName',
    'battleTag',
    'tank',
    'dps',
    'support',
    'note',
];

const normalizeDiscordUserId = (value: string | undefined): string => (
    value?.replace(/\D/g, '').trim() ?? ''
);

export const isActiveUserSheetEntry = (entry: UserSheetDraftEntry): boolean => (
    USER_SHEET_DRAFT_FIELDS.some(field => (entry[field] ?? '').trim())
);

/**
 * @description 저장 대상 행을 골라 배틀태그 형식과 중복 여부를 한 번에 검사한다.
 */
export const validateUserSheetEntries = (rows: UserSheetDraftEntry[]): {
    activeRows: UserSheetDraftEntry[];
    errors: Map<string, UserSheetValidationError>;
} => {
    const activeRows = rows.filter(isActiveUserSheetEntry);
    const rowsByBattleTag = new Map<string, UserSheetDraftEntry[]>();
    const discordIdCounts = new Map<string, number>();
    for (const row of activeRows) {
        const discordUserId = normalizeDiscordUserId(row.discordUserId);
        if (discordUserId) {
            discordIdCounts.set(
                discordUserId,
                (discordIdCounts.get(discordUserId) ?? 0) + 1,
            );
        }
        const key = normalizeUserSheetBattleTag(row.battleTag);
        if (!key) continue;
        const matches = rowsByBattleTag.get(key) ?? [];
        matches.push(row);
        rowsByBattleTag.set(key, matches);
    }

    const errors = new Map<string, UserSheetValidationError>();
    for (const row of activeRows) {
        const discordUserId = normalizeDiscordUserId(row.discordUserId);
        if (!discordUserId) {
            errors.set(row.id, 'REQUIRED_DISCORD_USER_ID');
        } else if (!/^\d{17,20}$/.test(discordUserId)) {
            errors.set(row.id, 'INVALID_DISCORD_USER_ID');
        } else if (discordUserId && (discordIdCounts.get(discordUserId) ?? 0) > 1) {
            errors.set(row.id, 'DUPLICATE_DISCORD_USER_ID');
        } else if (!row.battleTag.includes('#')) {
            errors.set(row.id, 'INVALID_BATTLE_TAG');
        } else {
            const matches = rowsByBattleTag.get(
                normalizeUserSheetBattleTag(row.battleTag),
            ) ?? [];
            if (matches.length <= 1) continue;
            const discordIds = matches.map(match => normalizeDiscordUserId(match.discordUserId));
            const hasDistinctDiscordIds = discordIds.every(Boolean)
                && new Set(discordIds).size === matches.length;
            if (!hasDistinctDiscordIds) errors.set(row.id, 'DUPLICATE_BATTLE_TAG');
        }
    }

    return { activeRows, errors };
};

/**
 * @description 유저 시트 역할 티어에서 선호·비선호 기호를 제거한다.
 */
export const cleanUserSheetRank = (value: string): string => (
    value.replace(/[!★?？]/g, '').trim()
);

/**
 * @description 관리자들이 함께 사용하는 유저 정보 시트를 가져온다.
 */
export const fetchUserSheet = async (): Promise<UserSheetSnapshot> => {
    return requestJson<UserSheetSnapshot>('/api/user-sheet', {
        credentials: 'same-origin',
    });
};

const isUserSheetEntry = (value: unknown): value is UserSheetEntry => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as Partial<UserSheetEntry>;
    return typeof entry.id === 'string'
        && typeof entry.discordName === 'string'
        && typeof entry.battleTag === 'string'
        && typeof entry.tank === 'string'
        && typeof entry.dps === 'string'
        && typeof entry.support === 'string'
        && typeof entry.note === 'string'
        && typeof entry.createdAt === 'number'
        && typeof entry.updatedAt === 'number'
        && typeof entry.updatedByName === 'string';
};

const isUserSheetSnapshot = (value: unknown): value is UserSheetSnapshot => {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as Partial<UserSheetSnapshot>;
    return Number.isSafeInteger(snapshot.sheetVersion)
        && Array.isArray(snapshot.entries)
        && snapshot.entries.every(isUserSheetEntry);
};

/**
 * @description 409 버전 충돌 응답에서 최신 시트를 꺼내고 구버전 서버 응답은 추가 조회로 보완한다.
 */
export const fetchUserSheetConflictSnapshot = async (
    error: unknown,
): Promise<UserSheetSnapshot | null> => {
    if (!(error instanceof ApiError) || error.status !== 409) return null;
    const isVersionConflict = error.code === 'USER_SHEET_CONFLICT'
        || (!error.code && /(먼저 수정|상태가 변경)/.test(error.message));
    if (!isVersionConflict) return null;

    const body = error.body as UserSheetConflictResponse | null;
    if (isUserSheetSnapshot(body?.snapshot)) return body.snapshot;
    return fetchUserSheet();
};

/**
 * @description 편집된 전체 유저 시트를 CSRF 검증과 함께 저장한다.
 */
export const saveUserSheet = async (
    entries: UserSheetDraftEntry[],
    sheetVersion: number,
    csrfToken: string,
): Promise<UserSheetSnapshot> => {
    return requestJson<UserSheetSnapshot>('/api/user-sheet', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ entries, sheetVersion }),
    });
};

/**
 * @description 상세 화면에서 수정한 유저 한 명만 저장해 다른 행의 동시 변경을 보존한다.
 */
export const updateUserSheetEntry = async (
    entry: UserSheetDraftEntry,
    expectedUpdatedAt: number,
    csrfToken: string,
): Promise<UserSheetSnapshot> => {
    return requestJson<UserSheetSnapshot>('/api/user-sheet', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ entry, expectedUpdatedAt }),
    });
};

export interface SyncRosterUserSheetResult extends UserSheetSnapshot {
    addedCount: number;
    tierUpdatedCount: number;
    updatedCount: number;
}

/**
 * @description 식별 검토가 끝난 Discord 명단의 프로필과 선택된 티어를 한 번에 동기화한다.
 */
export const syncRosterPlayersToUserSheet = async (
    players: Player[],
    syncTierPlayerIds: ReadonlySet<number>,
    sheetVersion: number,
    csrfToken: string,
): Promise<SyncRosterUserSheetResult> => {
    const entries = players.map(player => ({
        entryId: player.userSheetEntryId,
        clientPlayerId: player.id,
        discordUserId: normalizeDiscordUserId(player.discordUserId) || undefined,
        discordName: player.discordName?.trim() ?? '',
        battleTag: player.name.trim(),
        tank: cleanUserSheetRank(formatRank(player.tank)),
        dps: cleanUserSheetRank(formatRank(player.dps)),
        support: cleanUserSheetRank(formatRank(player.sup)),
        syncTiers: syncTierPlayerIds.has(player.id),
    }));
    return requestJson<SyncRosterUserSheetResult>('/api/user-sheet', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ entries, sheetVersion }),
    });
};

/**
 * @description Google Sheets의 6·7열을 변환하되 저장 전 모든 행에 필수 Discord ID 입력을 요구한다.
 */
export const parseUserSheetRows = (text: string): UserSheetDraftEntry[] => {
    const lines = text.replace(/\r/g, '').split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    const headerAliases = ['디스코드', 'discord', '배틀태그', '탱커', '딜러', '힐러', '특이사항'];
    const firstCells = lines[0].split('\t').map(cell => cell.trim().toLowerCase());
    const hasHeader = firstCells.some(cell => headerAliases.some(alias => cell.includes(alias)));
    const hasDiscordIdColumn = firstCells.some(cell => (
        cell.includes('discord id')
        || cell.includes('디스코드 id')
        || cell.includes('고유 id')
    )) || (
        !hasHeader
        && (
            firstCells.length >= 7
            || /^\d{17,20}$/.test(firstCells[1] ?? '')
        )
    );
    return lines.slice(hasHeader ? 1 : 0).map((line, index) => {
        const cells = line.split('\t');
        const [
            discordName = '',
            secondCell = '',
            thirdCell = '',
            fourthCell = '',
            fifthCell = '',
            sixthCell = '',
            seventhCell = '',
        ] = cells;
        const discordUserId = hasDiscordIdColumn ? secondCell : '';
        const battleTag = hasDiscordIdColumn ? thirdCell : secondCell;
        const tank = hasDiscordIdColumn ? fourthCell : thirdCell;
        const dps = hasDiscordIdColumn ? fifthCell : fourthCell;
        const support = hasDiscordIdColumn ? sixthCell : fifthCell;
        const note = hasDiscordIdColumn ? seventhCell : sixthCell;
        return {
            id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            discordUserId: normalizeDiscordUserId(discordUserId) || undefined,
            discordName: discordName.trim(),
            battleTag: battleTag.trim(),
            tank: cleanUserSheetRank(tank),
            dps: cleanUserSheetRank(dps),
            support: cleanUserSheetRank(support),
            note: note.trim(),
        };
    });
};

export const normalizeUserSheetBattleTag = (value: string): string => value.trim().toLowerCase();

/**
 * @description 참가자의 가장 안정적인 식별자로 유저 시트 조회 키를 만든다.
 */
export const getPlayerUserSheetLookupKey = (player: Player): string => {
    if (player.userSheetEntryId?.trim()) return `entry:${player.userSheetEntryId.trim()}`;
    if (player.discordUserId?.trim()) return `discord:${player.discordUserId.trim()}`;
    return normalizeUserSheetBattleTag(player.name);
};

/**
 * @description 시트 UUID·Discord ID를 우선하고 유일한 배틀태그만 보조 키로 등록한다.
 */
export const createUserSheetPlayerLookup = (
    entries: UserSheetEntry[],
): Map<string, UserSheetEntry> => {
    const lookup = new Map<string, UserSheetEntry>();
    const battleTagCounts = new Map<string, number>();
    entries.forEach(entry => {
        const battleTag = normalizeUserSheetBattleTag(entry.battleTag);
        battleTagCounts.set(battleTag, (battleTagCounts.get(battleTag) ?? 0) + 1);
    });
    entries.forEach(entry => {
        lookup.set(`entry:${entry.id}`, entry);
        if (entry.discordUserId) lookup.set(`discord:${entry.discordUserId}`, entry);
        const battleTag = normalizeUserSheetBattleTag(entry.battleTag);
        if (battleTagCounts.get(battleTag) === 1) lookup.set(battleTag, entry);
    });
    return lookup;
};

const USER_SHEET_COMPARISON_FIELDS: ReadonlyArray<
    keyof Pick<UserSheetDraftEntry, 'discordUserId' | 'discordName' | 'battleTag' | 'tank' | 'dps' | 'support' | 'note'>
> = ['discordUserId', 'discordName', 'battleTag', 'tank', 'dps', 'support', 'note'];

/**
 * @description 저장 전후의 실제 추가·수정·삭제 건수를 계산한다.
 */
export const getUserSheetChangeSummary = (
    previousEntries: UserSheetDraftEntry[],
    nextEntries: UserSheetDraftEntry[],
): UserSheetChangeSummary => {
    const previousById = new Map(
        previousEntries.map(entry => [entry.id, entry]),
    );
    const nextById = new Map(
        nextEntries.map(entry => [entry.id, entry]),
    );
    let addedCount = 0;
    let removedCount = 0;
    let updatedCount = 0;

    for (const [id, entry] of nextById) {
        const previous = previousById.get(id);
        if (!previous) {
            addedCount += 1;
        } else if (USER_SHEET_COMPARISON_FIELDS.some(field => previous[field] !== entry[field])) {
            updatedCount += 1;
        }
    }
    for (const id of previousById.keys()) {
        if (!nextById.has(id)) removedCount += 1;
    }

    return { addedCount, removedCount, updatedCount };
};

/**
 * @description 시트 변경 건수를 저장 완료 토스트용 문장으로 바꾼다.
 */
export const formatUserSheetChangeSummary = ({
    addedCount,
    removedCount,
    updatedCount,
}: UserSheetChangeSummary): string => {
    const changes = [
        addedCount > 0 ? `추가 ${addedCount}명` : '',
        updatedCount > 0 ? `수정 ${updatedCount}명` : '',
        removedCount > 0 ? `삭제 ${removedCount}명` : '',
    ].filter(Boolean);
    return changes.length > 0
        ? `유저 시트를 저장했습니다. (${changes.join(' · ')})`
        : '변경된 내용이 없습니다.';
};

export interface UserSheetMergeResult {
    rows: UserSheetDraftEntry[];
    addedCount: number;
    updatedCount: number;
}

const isBlankDraftEntry = (entry: UserSheetDraftEntry): boolean => (
    !(entry.discordUserId ?? '').trim()
    && !entry.discordName.trim()
    && !entry.battleTag.trim()
    && !entry.tank.trim()
    && !entry.dps.trim()
    && !entry.support.trim()
    && !entry.note.trim()
);

const rankToSheetText = (player: Player, role: 'tank' | 'dps' | 'sup'): string => (
    cleanUserSheetRank(formatRank(player[role]))
);

/**
 * @description Discord 파싱 결과를 BattleTag 기준으로 신규 추가하거나 기존 시트 행에 병합한다.
 */
export const mergeDiscordPlayersIntoUserSheet = (
    currentRows: UserSheetDraftEntry[],
    players: Player[],
): UserSheetMergeResult => {
    const rows = currentRows.map(row => ({ ...row }));
    const indexByBattleTag = new Map<string, number>();
    rows.forEach((row, index) => {
        const key = normalizeUserSheetBattleTag(row.battleTag);
        if (key) indexByBattleTag.set(key, index);
    });
    let addedCount = 0;
    let updatedCount = 0;

    for (const player of players) {
        const key = normalizeUserSheetBattleTag(player.name);
        const existingIndex = indexByBattleTag.get(key);
        const nextValues = {
            battleTag: player.name.trim(),
            tank: rankToSheetText(player, 'tank'),
            dps: rankToSheetText(player, 'dps'),
            support: rankToSheetText(player, 'sup'),
        };

        if (existingIndex !== undefined) {
            const current = rows[existingIndex];
            rows[existingIndex] = {
                ...current,
                ...nextValues,
                discordName: player.discordName?.trim() || current.discordName,
                note: current.note,
            };
            updatedCount += 1;
            continue;
        }

        const blankIndex = rows.findIndex(isBlankDraftEntry);
        const newEntry: UserSheetDraftEntry = {
            id: blankIndex >= 0
                ? rows[blankIndex].id
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            discordUserId: '',
            discordName: player.discordName?.trim() ?? '',
            ...nextValues,
            note: '',
        };
        if (blankIndex >= 0) rows[blankIndex] = newEntry;
        else rows.push(newEntry);
        indexByBattleTag.set(key, blankIndex >= 0 ? blankIndex : rows.length - 1);
        addedCount += 1;
    }

    return { rows, addedCount, updatedCount };
};
