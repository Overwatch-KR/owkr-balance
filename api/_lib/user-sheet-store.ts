import { randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';

export interface StoredUserSheetEntry {
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
    battleTagHistory: string[];
}

export type PublicUserSheetEntry = Omit<StoredUserSheetEntry, 'battleTagHistory'>;

export interface UserSheetSnapshot {
    entries: PublicUserSheetEntry[];
    sheetVersion: number;
}

export type UserSheetMutationResult =
    | {
        status: 'OK';
        snapshot: UserSheetSnapshot;
        addedCount?: number;
        tierUpdatedCount?: number;
        updatedCount?: number;
    }
    | {
        status:
            | 'CONFLICT'
            | 'DUPLICATE'
            | 'DUPLICATE_DISCORD_ID'
            | 'INVALID'
            | 'NOT_FOUND';
    };

const LEGACY_USER_SHEET_KEY = 'user-sheet:v1';
const USER_SHEET_ENTRIES_KEY = 'user-sheet:v2:entries';
const USER_SHEET_BATTLE_TAGS_KEY = 'user-sheet:v2:battle-tags';
const USER_SHEET_VERSION_KEY = 'user-sheet:v2:version';
const MAX_ENTRIES = 1000;
const MAX_NOTE_LENGTH = 500;

const MIGRATE_USER_SHEET_SCRIPT = `
if redis.call('EXISTS', KEYS[4]) == 1 then
    redis.call('DEL', KEYS[1])
    return 0
end

local legacy = redis.call('GET', KEYS[1])
local count = 0
if legacy then
    local decoded = cjson.decode(legacy)
    for _, entry in ipairs(decoded) do
        if entry.id and entry.battleTag then
            entry.battleTagHistory = entry.battleTagHistory or { entry.battleTag }
            local normalized = string.lower(string.gsub(entry.battleTag, '^%s*(.-)%s*$', '%1'))
            redis.call('HSET', KEYS[2], entry.id, cjson.encode(entry))
            redis.call('HSET', KEYS[3], normalized, entry.id)
            count = count + 1
        end
    end
end

redis.call('SET', KEYS[4], count > 0 and 1 or 0)
redis.call('DEL', KEYS[1])
return count
`;

const READ_USER_SHEET_SCRIPT = `
local values = redis.call('HVALS', KEYS[1])
local entries = {}
for _, value in ipairs(values) do
    table.insert(entries, cjson.decode(value))
end
local version = tonumber(redis.call('GET', KEYS[2]) or '0')
return cjson.encode({ entries = entries, sheetVersion = version })
`;

const REPLACE_USER_SHEET_SCRIPT = `
local currentVersion = tonumber(redis.call('GET', KEYS[3]) or '0')
if currentVersion ~= tonumber(ARGV[1]) then
    return cjson.encode({ status = 'CONFLICT' })
end

local entries = cjson.decode(ARGV[2])
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
for _, entry in ipairs(entries) do
    redis.call('HSET', KEYS[1], entry.id, cjson.encode(entry))
    local normalized = string.lower(string.gsub(entry.battleTag, '^%s*(.-)%s*$', '%1'))
    redis.call('HSET', KEYS[2], normalized, entry.id)
end
local nextVersion = redis.call('INCR', KEYS[3])
return cjson.encode({ status = 'OK', sheetVersion = nextVersion })
`;

const UPDATE_USER_SHEET_ENTRY_SCRIPT = `
local currentJson = redis.call('HGET', KEYS[1], ARGV[1])
if not currentJson then
    return cjson.encode({ status = 'NOT_FOUND' })
end

local current = cjson.decode(currentJson)
if tonumber(current.updatedAt) ~= tonumber(ARGV[2]) then
    return cjson.encode({ status = 'CONFLICT' })
end

local values = redis.call('HVALS', KEYS[1])
for _, value in ipairs(values) do
    local other = cjson.decode(value)
    if other.id ~= ARGV[1] then
        local otherDiscordId = other.discordUserId or ''
        if ARGV[5] ~= '' and otherDiscordId == ARGV[5] then
            return cjson.encode({ status = 'DUPLICATE_DISCORD_ID' })
        end
        local otherBattleTag = string.lower(string.gsub(other.battleTag, '^%s*(.-)%s*$', '%1'))
        if otherBattleTag == ARGV[3] then
            if ARGV[5] == '' or otherDiscordId == '' or otherDiscordId == ARGV[5] then
                return cjson.encode({ status = 'DUPLICATE' })
            end
        end
    end
end

local previousNormalized = string.lower(string.gsub(current.battleTag, '^%s*(.-)%s*$', '%1'))
if previousNormalized ~= ARGV[3] then
    local indexedId = redis.call('HGET', KEYS[2], previousNormalized)
    if indexedId == ARGV[1] then
        redis.call('HDEL', KEYS[2], previousNormalized)
    end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
redis.call('HSET', KEYS[2], ARGV[3], ARGV[1])
local nextVersion = redis.call('INCR', KEYS[3])
return cjson.encode({ status = 'OK', sheetVersion = nextVersion })
`;

const DELETE_USER_SHEET_ENTRY_SCRIPT = `
local currentJson = redis.call('HGET', KEYS[1], ARGV[1])
if not currentJson then
    return cjson.encode({ status = 'NOT_FOUND' })
end

local current = cjson.decode(currentJson)
if tonumber(current.updatedAt) ~= tonumber(ARGV[2]) then
    return cjson.encode({ status = 'CONFLICT' })
end

local normalized = string.lower(string.gsub(current.battleTag, '^%s*(.-)%s*$', '%1'))
redis.call('HDEL', KEYS[1], ARGV[1])
local indexedId = redis.call('HGET', KEYS[2], normalized)
if indexedId == ARGV[1] then
    redis.call('HDEL', KEYS[2], normalized)
end
local nextVersion = redis.call('INCR', KEYS[3])
return cjson.encode({ status = 'OK', sheetVersion = nextVersion })
`;

const normalizeBattleTag = (value: string): string => value.trim().toLowerCase();

const normalizeDiscordUserId = (value: unknown): string => (
    typeof value === 'string' ? value.replace(/\D/g, '').trim() : ''
);

const sanitizeText = (value: unknown, maxLength: number): string => (
    typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const sanitizeRank = (value: unknown): string => (
    sanitizeText(value, 50).replace(/[!★?？]/g, '').trim()
);

const uniqueBattleTags = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const battleTag = sanitizeText(value, 100);
        const normalized = normalizeBattleTag(battleTag);
        if (!battleTag || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(battleTag);
    }
    return result;
};

const cleanStoredEntry = (entry: StoredUserSheetEntry): StoredUserSheetEntry => ({
    ...entry,
    discordUserId: normalizeDiscordUserId(entry.discordUserId) || undefined,
    tank: sanitizeRank(entry.tank),
    dps: sanitizeRank(entry.dps),
    support: sanitizeRank(entry.support),
    battleTagHistory: uniqueBattleTags([
        ...(Array.isArray(entry.battleTagHistory) ? entry.battleTagHistory : []),
        entry.battleTag,
    ]),
});

const toPublicEntry = (entry: StoredUserSheetEntry): PublicUserSheetEntry => ({
    id: entry.id,
    discordUserId: entry.discordUserId,
    discordName: entry.discordName,
    battleTag: entry.battleTag,
    tank: entry.tank,
    dps: entry.dps,
    support: entry.support,
    note: entry.note,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    updatedByName: entry.updatedByName,
});

const sortEntries = (entries: StoredUserSheetEntry[]): StoredUserSheetEntry[] => (
    entries
        .map(cleanStoredEntry)
        .sort((a, b) => (
            a.discordName.localeCompare(b.discordName, 'ko')
            || a.battleTag.localeCompare(b.battleTag)
        ))
);

const toPublicSnapshot = (
    entries: StoredUserSheetEntry[],
    sheetVersion: number,
): UserSheetSnapshot => ({
    entries: sortEntries(entries).map(toPublicEntry),
    sheetVersion,
});

const hasSameEditableFields = (
    current: StoredUserSheetEntry,
    next: Pick<
        StoredUserSheetEntry,
        'discordUserId' | 'discordName' | 'battleTag' | 'tank' | 'dps' | 'support' | 'note'
    >,
): boolean => (
    (current.discordUserId ?? '') === (next.discordUserId ?? '')
    && current.discordName === next.discordName
    && current.battleTag === next.battleTag
    && current.tank === next.tank
    && current.dps === next.dps
    && current.support === next.support
    && current.note === next.note
);

const hasValidIdentityConstraints = (entries: StoredUserSheetEntry[]): boolean => {
    const discordIds = new Set<string>();
    const entriesByBattleTag = new Map<string, StoredUserSheetEntry[]>();
    for (const entry of entries) {
        const discordUserId = normalizeDiscordUserId(entry.discordUserId);
        if (!/^\d{17,20}$/.test(discordUserId) || discordIds.has(discordUserId)) {
            return false;
        }
        discordIds.add(discordUserId);
        const battleTag = normalizeBattleTag(entry.battleTag);
        const matches = entriesByBattleTag.get(battleTag) ?? [];
        matches.push(entry);
        entriesByBattleTag.set(battleTag, matches);
    }

    return [...entriesByBattleTag.values()].every(matches => (
        matches.length <= 1
        || (
            matches.every(entry => Boolean(normalizeDiscordUserId(entry.discordUserId)))
            && new Set(matches.map(entry => normalizeDiscordUserId(entry.discordUserId))).size
                === matches.length
        )
    ));
};

const parseReplacementEntries = (
    value: unknown,
    currentEntries: StoredUserSheetEntry[],
    actorName: string,
): StoredUserSheetEntry[] | null => {
    if (!Array.isArray(value) || value.length > MAX_ENTRIES) return null;
    const currentById = new Map(currentEntries.map(entry => [entry.id, entry]));
    const currentByDiscordId = new Map(currentEntries.flatMap(entry => (
        entry.discordUserId
            ? [[normalizeDiscordUserId(entry.discordUserId), entry] as const]
            : []
    )));
    const currentByBattleTag = new Map<string, StoredUserSheetEntry[]>();
    currentEntries.forEach(entry => {
        const battleTag = normalizeBattleTag(entry.battleTag);
        const matches = currentByBattleTag.get(battleTag) ?? [];
        matches.push(entry);
        currentByBattleTag.set(battleTag, matches);
    });
    const seenIds = new Set<string>();
    const now = Date.now();
    const entries: StoredUserSheetEntry[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== 'object') return null;
        const source = raw as Partial<StoredUserSheetEntry>;
        const battleTag = sanitizeText(source.battleTag, 100);
        if (!battleTag.includes('#')) return null;
        const normalized = normalizeBattleTag(battleTag);

        const sourceId = sanitizeText(source.id, 200);
        const discordUserId = normalizeDiscordUserId(source.discordUserId);
        const battleTagMatches = currentByBattleTag.get(normalized) ?? [];
        const current = currentById.get(sourceId)
            ?? (discordUserId ? currentByDiscordId.get(discordUserId) : undefined)
            ?? (battleTagMatches.length === 1 ? battleTagMatches[0] : undefined);
        const id = current?.id ?? randomUUID();
        if (seenIds.has(id)) return null;
        seenIds.add(id);

        const editableFields = {
            discordUserId: discordUserId || undefined,
            discordName: sanitizeText(source.discordName, 100),
            battleTag,
            tank: sanitizeRank(source.tank),
            dps: sanitizeRank(source.dps),
            support: sanitizeRank(source.support),
            note: sanitizeText(source.note, MAX_NOTE_LENGTH),
        };
        const unchanged = current ? hasSameEditableFields(current, editableFields) : false;
        entries.push({
            id,
            ...editableFields,
            createdAt: current?.createdAt ?? now,
            updatedAt: unchanged && current
                ? current.updatedAt
                : Math.max(now, (current?.updatedAt ?? 0) + 1),
            updatedByName: unchanged && current ? current.updatedByName : actorName,
            battleTagHistory: uniqueBattleTags([
                ...(current?.battleTagHistory ?? []),
                ...(current ? [current.battleTag] : []),
                battleTag,
            ]),
        });
    }
    return hasValidIdentityConstraints(entries) ? entries : null;
};

const readStoredUserSheet = async (
    redis: Redis,
): Promise<{ entries: StoredUserSheetEntry[]; sheetVersion: number }> => {
    const snapshot = await redis.eval<[], {
        entries: StoredUserSheetEntry[];
        sheetVersion: number;
    }>(
        READ_USER_SHEET_SCRIPT,
        [USER_SHEET_ENTRIES_KEY, USER_SHEET_VERSION_KEY],
        [],
    );
    return {
        entries: Array.isArray(snapshot.entries) ? snapshot.entries.map(cleanStoredEntry) : [],
        sheetVersion: Number(snapshot.sheetVersion) || 0,
    };
};

/**
 * @description 기존 배열 저장소를 행 단위 Hash와 버전 키로 한 번만 원자 이관한다.
 */
export const ensureUserSheetStorage = async (redis: Redis): Promise<void> => {
    await redis.eval(
        MIGRATE_USER_SHEET_SCRIPT,
        [
            LEGACY_USER_SHEET_KEY,
            USER_SHEET_ENTRIES_KEY,
            USER_SHEET_BATTLE_TAGS_KEY,
            USER_SHEET_VERSION_KEY,
        ],
        [],
    );
};

/**
 * @description 공용 시트의 행 목록과 전체 편집 충돌 감지용 버전을 같은 시점에 읽는다.
 */
export const readUserSheetSnapshot = async (redis: Redis): Promise<UserSheetSnapshot> => {
    await ensureUserSheetStorage(redis);
    const snapshot = await readStoredUserSheet(redis);
    return toPublicSnapshot(snapshot.entries, snapshot.sheetVersion);
};

/**
 * @description 전체 시트를 기대 버전이 일치할 때만 원자 교체한다.
 */
export const replaceUserSheet = async (
    redis: Redis,
    value: unknown,
    expectedSheetVersion: unknown,
    actorName: string,
): Promise<UserSheetMutationResult> => {
    if (
        typeof expectedSheetVersion !== 'number'
        || !Number.isSafeInteger(expectedSheetVersion)
        || expectedSheetVersion < 0
    ) {
        return { status: 'INVALID' };
    }
    await ensureUserSheetStorage(redis);
    const current = await readStoredUserSheet(redis);
    const entries = parseReplacementEntries(value, current.entries, actorName);
    if (!entries) return { status: 'INVALID' };

    const result = await redis.eval<string[], { status: 'CONFLICT' | 'OK' }>(
        REPLACE_USER_SHEET_SCRIPT,
        [USER_SHEET_ENTRIES_KEY, USER_SHEET_BATTLE_TAGS_KEY, USER_SHEET_VERSION_KEY],
        [String(expectedSheetVersion), JSON.stringify(entries)],
    );
    if (result.status !== 'OK') return { status: result.status };
    return { status: 'OK', snapshot: await readUserSheetSnapshot(redis) };
};

/**
 * @description 한 행을 기대 수정 시각이 일치할 때만 원자 갱신한다.
 */
export const updateUserSheetEntry = async (
    redis: Redis,
    value: unknown,
    expectedUpdatedAt: unknown,
    actorName: string,
): Promise<UserSheetMutationResult> => {
    if (
        !value
        || typeof value !== 'object'
        || typeof expectedUpdatedAt !== 'number'
        || !Number.isSafeInteger(expectedUpdatedAt)
    ) {
        return { status: 'INVALID' };
    }
    const source = value as Partial<StoredUserSheetEntry>;
    const id = sanitizeText(source.id, 200);
    const battleTag = sanitizeText(source.battleTag, 100);
    const discordUserId = normalizeDiscordUserId(source.discordUserId);
    if (!id || !battleTag.includes('#')) return { status: 'INVALID' };
    if (!/^\d{17,20}$/.test(discordUserId)) {
        return { status: 'INVALID' };
    }

    await ensureUserSheetStorage(redis);
    const current = await redis.hget<StoredUserSheetEntry>(USER_SHEET_ENTRIES_KEY, id);
    if (!current) return { status: 'NOT_FOUND' };

    const editableFields = {
        discordUserId: discordUserId || undefined,
        discordName: sanitizeText(source.discordName, 100),
        battleTag,
        tank: sanitizeRank(source.tank),
        dps: sanitizeRank(source.dps),
        support: sanitizeRank(source.support),
        note: sanitizeText(source.note, MAX_NOTE_LENGTH),
    };
    const cleanedCurrent = cleanStoredEntry(current);
    if (hasSameEditableFields(cleanedCurrent, editableFields)) {
        return { status: 'OK', snapshot: await readUserSheetSnapshot(redis) };
    }

    const nextEntry: StoredUserSheetEntry = {
        ...cleanedCurrent,
        ...editableFields,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        updatedByName: actorName,
        battleTagHistory: uniqueBattleTags([
            ...current.battleTagHistory,
            current.battleTag,
            battleTag,
        ]),
    };
    const result = await redis.eval<string[], {
        status:
            | 'CONFLICT'
            | 'DUPLICATE'
            | 'DUPLICATE_DISCORD_ID'
            | 'NOT_FOUND'
            | 'OK';
    }>(
        UPDATE_USER_SHEET_ENTRY_SCRIPT,
        [USER_SHEET_ENTRIES_KEY, USER_SHEET_BATTLE_TAGS_KEY, USER_SHEET_VERSION_KEY],
        [
            id,
            String(expectedUpdatedAt),
            normalizeBattleTag(battleTag),
            JSON.stringify(nextEntry),
            discordUserId,
        ],
    );
    if (result.status !== 'OK') return { status: result.status };
    return { status: 'OK', snapshot: await readUserSheetSnapshot(redis) };
};

/**
 * @description 한 행을 기대 수정 시각이 일치할 때만 원자 삭제한다.
 */
export const deleteUserSheetEntry = async (
    redis: Redis,
    entryId: unknown,
    expectedUpdatedAt: unknown,
): Promise<UserSheetMutationResult> => {
    const id = sanitizeText(entryId, 200);
    if (
        !id
        || typeof expectedUpdatedAt !== 'number'
        || !Number.isSafeInteger(expectedUpdatedAt)
    ) {
        return { status: 'INVALID' };
    }

    await ensureUserSheetStorage(redis);
    const result = await redis.eval<string[], {
        status: 'CONFLICT' | 'NOT_FOUND' | 'OK';
    }>(
        DELETE_USER_SHEET_ENTRY_SCRIPT,
        [USER_SHEET_ENTRIES_KEY, USER_SHEET_BATTLE_TAGS_KEY, USER_SHEET_VERSION_KEY],
        [id, String(expectedUpdatedAt)],
    );
    if (result.status !== 'OK') return { status: result.status };
    return { status: 'OK', snapshot: await readUserSheetSnapshot(redis) };
};

/**
 * @description 식별된 참가자 프로필과 선택된 티어 변경을 시트 버전 기준으로 한 번에 저장한다.
 */
export const syncRosterUserSheetEntries = async (
    redis: Redis,
    value: unknown,
    expectedSheetVersion: unknown,
    actorName: string,
): Promise<UserSheetMutationResult> => {
    if (
        !Array.isArray(value)
        || value.length > MAX_ENTRIES
        || typeof expectedSheetVersion !== 'number'
        || !Number.isSafeInteger(expectedSheetVersion)
        || expectedSheetVersion < 0
    ) {
        return { status: 'INVALID' };
    }

    await ensureUserSheetStorage(redis);
    const current = await readStoredUserSheet(redis);
    if (current.sheetVersion !== expectedSheetVersion) return { status: 'CONFLICT' };

    const currentById = new Map(current.entries.map(entry => [entry.id, entry]));
    const currentByDiscordId = new Map(current.entries.flatMap(entry => (
        entry.discordUserId
            ? [[normalizeDiscordUserId(entry.discordUserId), entry] as const]
            : []
    )));
    const nextById = new Map(current.entries.map(entry => [entry.id, cleanStoredEntry(entry)]));
    const usedEntryIds = new Set<string>();
    const now = Date.now();
    let addedCount = 0;
    let updatedCount = 0;
    let tierUpdatedCount = 0;

    for (const raw of value) {
        if (!raw || typeof raw !== 'object') return { status: 'INVALID' };
        const source = raw as Partial<StoredUserSheetEntry> & {
            entryId?: unknown;
            syncTiers?: unknown;
        };
        const requestedEntryId = sanitizeText(source.entryId, 200);
        const discordUserId = normalizeDiscordUserId(source.discordUserId);
        const battleTag = sanitizeText(source.battleTag, 100);
        if (!battleTag.includes('#')) return { status: 'INVALID' };
        if (!/^\d{17,20}$/.test(discordUserId)) {
            return { status: 'INVALID' };
        }

        const entryMatch = requestedEntryId ? currentById.get(requestedEntryId) : undefined;
        const discordMatch = discordUserId ? currentByDiscordId.get(discordUserId) : undefined;
        if (entryMatch && discordMatch && entryMatch.id !== discordMatch.id) {
            return { status: 'INVALID' };
        }
        const existing = entryMatch ?? discordMatch;
        if (
            existing?.discordUserId
            && discordUserId
            && normalizeDiscordUserId(existing.discordUserId) !== discordUserId
        ) {
            return { status: 'INVALID' };
        }
        if (existing && usedEntryIds.has(existing.id)) return { status: 'INVALID' };
        if (existing) usedEntryIds.add(existing.id);

        const shouldSyncTiers = !existing || source.syncTiers === true;
        const tank = shouldSyncTiers ? sanitizeRank(source.tank) : existing?.tank ?? '';
        const dps = shouldSyncTiers ? sanitizeRank(source.dps) : existing?.dps ?? '';
        const support = shouldSyncTiers ? sanitizeRank(source.support) : existing?.support ?? '';
        const editableFields = {
            discordUserId: discordUserId || existing?.discordUserId || undefined,
            discordName: sanitizeText(source.discordName, 100)
                || existing?.discordName
                || '',
            battleTag,
            tank,
            dps,
            support,
            note: existing?.note ?? '',
        };

        if (!existing) {
            const id = randomUUID();
            nextById.set(id, {
                id,
                ...editableFields,
                createdAt: now,
                updatedAt: now,
                updatedByName: actorName,
                battleTagHistory: [battleTag],
            });
            addedCount++;
            continue;
        }

        const tiersChanged = existing.tank !== tank
            || existing.dps !== dps
            || existing.support !== support;
        const unchanged = hasSameEditableFields(existing, editableFields);
        nextById.set(existing.id, {
            ...cleanStoredEntry(existing),
            ...editableFields,
            updatedAt: unchanged ? existing.updatedAt : Math.max(now, existing.updatedAt + 1),
            updatedByName: unchanged ? existing.updatedByName : actorName,
            battleTagHistory: uniqueBattleTags([
                ...existing.battleTagHistory,
                existing.battleTag,
                battleTag,
            ]),
        });
        if (!unchanged) updatedCount++;
        if (shouldSyncTiers && tiersChanged) tierUpdatedCount++;
    }

    const nextEntries = [...nextById.values()];
    if (!hasValidIdentityConstraints(nextEntries)) return { status: 'INVALID' };
    if (addedCount === 0 && updatedCount === 0) {
        return {
            status: 'OK',
            addedCount,
            tierUpdatedCount,
            updatedCount,
            snapshot: toPublicSnapshot(current.entries, current.sheetVersion),
        };
    }

    const result = await redis.eval<string[], { status: 'CONFLICT' | 'OK' }>(
        REPLACE_USER_SHEET_SCRIPT,
        [USER_SHEET_ENTRIES_KEY, USER_SHEET_BATTLE_TAGS_KEY, USER_SHEET_VERSION_KEY],
        [String(expectedSheetVersion), JSON.stringify(nextEntries)],
    );
    if (result.status !== 'OK') return { status: result.status };
    return {
        status: 'OK',
        addedCount,
        tierUpdatedCount,
        updatedCount,
        snapshot: await readUserSheetSnapshot(redis),
    };
};

/**
 * @description 개인 메모의 행 ID 이관에 사용할 현재·과거 BattleTag를 조회한다.
 */
export const getUserSheetBattleTagHistory = async (
    redis: Redis,
    entryId: string,
    currentBattleTag: string,
): Promise<string[]> => {
    await ensureUserSheetStorage(redis);
    const entry = await redis.hget<StoredUserSheetEntry>(
        USER_SHEET_ENTRIES_KEY,
        sanitizeText(entryId, 200),
    );
    return uniqueBattleTags([
        ...(entry?.battleTagHistory ?? []),
        ...(entry ? [entry.battleTag] : []),
        currentBattleTag,
    ]);
};
