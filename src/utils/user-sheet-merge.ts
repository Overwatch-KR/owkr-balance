import type {
    UserSheetDraftEntry,
    UserSheetEntry,
} from './user-sheet';

export type UserSheetMergeChoice = 'DRAFT' | 'LATEST';
export type UserSheetMergeField =
    | 'discordName'
    | 'discordUserId'
    | 'battleTag'
    | 'tank'
    | 'dps'
    | 'support'
    | 'note'
    | 'presence';

export interface UserSheetMergeConflict {
    baseValue: string;
    draftValue: string;
    field: UserSheetMergeField;
    fieldLabel: string;
    id: string;
    latestValue: string;
    rowId: string;
    rowLabel: string;
}

export interface UserSheetMergeResult {
    autoMergedCount: number;
    conflicts: UserSheetMergeConflict[];
    rows: UserSheetDraftEntry[];
}

export type UserSheetMergeResolutions = Readonly<Record<string, UserSheetMergeChoice>>;

const MERGE_FIELDS: ReadonlyArray<Exclude<UserSheetMergeField, 'presence'>> = [
    'discordName',
    'discordUserId',
    'battleTag',
    'tank',
    'dps',
    'support',
    'note',
];

const FIELD_LABELS: Record<UserSheetMergeField, string> = {
    discordName: '디스코드 이름',
    discordUserId: '디스코드 ID',
    battleTag: '배틀태그',
    tank: '탱커 티어',
    dps: '딜러 티어',
    support: '힐러 티어',
    note: '특이사항',
    presence: '행 유지 여부',
};

const toDraftEntry = (
    entry: UserSheetDraftEntry | UserSheetEntry,
): UserSheetDraftEntry => ({
    id: entry.id,
    discordUserId: entry.discordUserId ?? '',
    discordName: entry.discordName,
    battleTag: entry.battleTag,
    tank: entry.tank,
    dps: entry.dps,
    support: entry.support,
    note: entry.note,
});

const isSameEntry = (
    first: UserSheetDraftEntry,
    second: UserSheetDraftEntry,
): boolean => MERGE_FIELDS.every(field => (
    (first[field] ?? '') === (second[field] ?? '')
));

const getRowLabel = (
    ...entries: Array<UserSheetDraftEntry | undefined>
): string => {
    for (const entry of entries) {
        if (entry?.discordName.trim()) return entry.discordName.trim();
        if (entry?.battleTag.trim()) return entry.battleTag.trim();
    }
    return '이름 없는 유저';
};

const makeFieldConflict = (
    rowId: string,
    rowLabel: string,
    field: Exclude<UserSheetMergeField, 'presence'>,
    baseValue: string,
    draftValue: string,
    latestValue: string,
): UserSheetMergeConflict => ({
    id: `${rowId}:${field}`,
    rowId,
    rowLabel,
    field,
    fieldLabel: FIELD_LABELS[field],
    baseValue,
    draftValue,
    latestValue,
});

const makePresenceConflict = (
    rowId: string,
    rowLabel: string,
    base: UserSheetDraftEntry,
    draft: UserSheetDraftEntry | undefined,
    latest: UserSheetDraftEntry | undefined,
): UserSheetMergeConflict => ({
    id: `${rowId}:presence`,
    rowId,
    rowLabel,
    field: 'presence',
    fieldLabel: FIELD_LABELS.presence,
    baseValue: `유저 유지 · ${base.battleTag || base.discordName}`,
    draftValue: draft ? `유저 유지 · ${draft.battleTag || draft.discordName}` : '행 삭제',
    latestValue: latest ? `유저 유지 · ${latest.battleTag || latest.discordName}` : '행 삭제',
});

/**
 * @description 편집 시작값·내 초안·서버 최신값을 3-way 비교해 안전한 자동 병합과 수동 충돌 목록을 만든다.
 */
export const mergeUserSheetDrafts = (
    baseEntries: ReadonlyArray<UserSheetDraftEntry | UserSheetEntry>,
    draftEntries: ReadonlyArray<UserSheetDraftEntry | UserSheetEntry>,
    latestEntries: ReadonlyArray<UserSheetDraftEntry | UserSheetEntry>,
    resolutions: UserSheetMergeResolutions = {},
): UserSheetMergeResult => {
    const baseById = new Map(baseEntries.map(entry => [entry.id, toDraftEntry(entry)]));
    const draftById = new Map(draftEntries.map(entry => [entry.id, toDraftEntry(entry)]));
    const latestById = new Map(latestEntries.map(entry => [entry.id, toDraftEntry(entry)]));
    const orderedIds = [
        ...draftEntries.map(entry => entry.id),
        ...latestEntries
            .map(entry => entry.id)
            .filter(id => !draftById.has(id)),
    ];
    const conflicts: UserSheetMergeConflict[] = [];
    const rows: UserSheetDraftEntry[] = [];
    let autoMergedCount = 0;

    for (const rowId of orderedIds) {
        const base = baseById.get(rowId);
        const draft = draftById.get(rowId);
        const latest = latestById.get(rowId);

        if (!base) {
            if (draft) rows.push({ ...draft });
            else if (latest) {
                rows.push({ ...latest });
                autoMergedCount += 1;
            }
            continue;
        }

        if (!draft && !latest) continue;

        if (!draft && latest) {
            if (isSameEntry(base, latest)) continue;
            const conflict = makePresenceConflict(
                rowId,
                getRowLabel(latest, base),
                base,
                draft,
                latest,
            );
            conflicts.push(conflict);
            if (resolutions[conflict.id] === 'LATEST') rows.push({ ...latest });
            continue;
        }

        if (draft && !latest) {
            if (isSameEntry(base, draft)) {
                autoMergedCount += 1;
                continue;
            }
            const conflict = makePresenceConflict(
                rowId,
                getRowLabel(draft, base),
                base,
                draft,
                latest,
            );
            conflicts.push(conflict);
            if (resolutions[conflict.id] !== 'LATEST') rows.push({ ...draft });
            continue;
        }

        if (!draft || !latest) continue;
        const merged = { ...draft };
        const rowLabel = getRowLabel(draft, latest, base);
        for (const field of MERGE_FIELDS) {
            const baseValue = base[field] ?? '';
            const draftValue = draft[field] ?? '';
            const latestValue = latest[field] ?? '';
            if (draftValue === latestValue) {
                merged[field] = draftValue;
            } else if (draftValue === baseValue) {
                merged[field] = latestValue;
                autoMergedCount += 1;
            } else if (latestValue === baseValue) {
                merged[field] = draftValue;
            } else {
                const conflict = makeFieldConflict(
                    rowId,
                    rowLabel,
                    field,
                    baseValue,
                    draftValue,
                    latestValue,
                );
                conflicts.push(conflict);
                merged[field] = resolutions[conflict.id] === 'LATEST'
                    ? latestValue
                    : draftValue;
            }
        }
        rows.push(merged);
    }

    return { autoMergedCount, conflicts, rows };
};
