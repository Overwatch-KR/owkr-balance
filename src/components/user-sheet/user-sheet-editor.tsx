import { useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { AlertCircle, Info, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import {
    cleanUserSheetRank,
    fetchUserSheetConflictSnapshot,
    mergeDiscordPlayersIntoUserSheet,
    normalizeUserSheetBattleTag,
    parseUserSheetRows,
    saveUserSheet,
    validateUserSheetEntries,
    type UserSheetDraftEntry,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../../utils/user-sheet';
import {
    mergeUserSheetDrafts,
    type UserSheetMergeChoice,
    type UserSheetMergeResolutions,
} from '../../utils/user-sheet-merge';
import { getErrorMessage } from '../../utils/api';
import { parseMultipleLines } from '../../utils/parser';
import {
    DiscordSheetImport,
    type DiscordSheetImportResult,
} from './discord-sheet-import';
import { UserSheetConflictResolver } from './user-sheet-conflict-resolver';
import {
    UserSheetEditorTable,
    type UserSheetEditorField,
} from './user-sheet-editor-table';

interface UserSheetEditorProps {
    csrfToken: string;
    disableAutoFocus?: boolean;
    entries: UserSheetEntry[];
    focusBattleTag?: string;
    onCancel: () => void;
    onSnapshotChange: (snapshot: UserSheetSnapshot) => void;
    onSaveError: (message: string) => void;
    onSaved: (snapshot: UserSheetSnapshot) => void;
    sheetVersion: number;
}

interface UserSheetEditorConflict {
    baseRows: UserSheetDraftEntry[];
    draftRows: UserSheetDraftEntry[];
    latestSnapshot: UserSheetSnapshot;
    resolutions: UserSheetMergeResolutions;
}

const FIELDS: readonly UserSheetEditorField[] = [
    'discordName',
    'discordUserId',
    'battleTag',
    'tank',
    'dps',
    'support',
    'note',
];

const makeEmptyEntry = (): UserSheetDraftEntry => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    discordUserId: '',
    discordName: '',
    battleTag: '',
    tank: '',
    dps: '',
    support: '',
    note: '',
});

/**
 * @description 전체 유저 정보를 Google Sheets처럼 붙여넣고 한 화면에서 수정한다.
 */
export function UserSheetEditor({
    csrfToken,
    disableAutoFocus = false,
    entries,
    focusBattleTag,
    onCancel,
    onSnapshotChange,
    onSaveError,
    onSaved,
    sheetVersion,
}: UserSheetEditorProps) {
    const [rows, setRows] = useState<UserSheetDraftEntry[]>(() => (
        entries.length > 0
            ? [
                ...entries.map(entry => ({ ...entry })),
            ]
            : Array.from({ length: 10 }, makeEmptyEntry)
    ));
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [tableQuery, setTableQuery] = useState('');
    const [isClearConfirming, setIsClearConfirming] = useState(false);
    const [conflict, setConflict] = useState<UserSheetEditorConflict | null>(null);
    const baseSheetVersionRef = useRef(sheetVersion);
    const baseRowsRef = useRef<UserSheetDraftEntry[]>(
        entries.map(entry => ({ ...entry })),
    );
    const focusRowId = rows.find(row => (
        focusBattleTag
        && normalizeUserSheetBattleTag(row.battleTag)
            === normalizeUserSheetBattleTag(focusBattleTag)
    ))?.id;

    const validation = useMemo(() => validateUserSheetEntries(rows), [rows]);
    const conflictMerge = useMemo(() => (
        conflict
            ? mergeUserSheetDrafts(
                conflict.baseRows,
                conflict.draftRows,
                conflict.latestSnapshot.entries,
                conflict.resolutions,
            )
            : null
    ), [conflict]);
    const invalidRowNumbers = rows
        .map((row, index) => validation.errors.has(row.id) ? index + 1 : null)
        .filter((rowNumber): rowNumber is number => rowNumber !== null);
    const visibleRows = useMemo(() => {
        const normalizedQuery = tableQuery.trim().toLowerCase();
        return rows.map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => (
            !normalizedQuery || FIELDS.some(field => (
                (row[field] ?? '').toLowerCase().includes(normalizedQuery)
            ))
        ));
    }, [rows, tableQuery]);

    const updateCell = (rowId: string, field: UserSheetEditorField, value: string) => {
        const nextValue = field === 'tank' || field === 'dps' || field === 'support'
            ? cleanUserSheetRank(value)
            : field === 'discordUserId'
                ? value.replace(/\D/g, '')
                : value;
        setIsClearConfirming(false);
        setMessage('');
        setRows(current => current.map(row => row.id === rowId ? { ...row, [field]: nextValue } : row));
    };

    const handlePaste = (
        event: ClipboardEvent<HTMLInputElement>,
        startRowIndex: number,
        startColumnIndex: number,
    ) => {
        const text = event.clipboardData.getData('text/plain');
        if (!text.includes('\t') && !text.includes('\n')) return;
        event.preventDefault();
        const pastedRows = parseUserSheetRows(text);
        if (pastedRows.length === 0) return;

        setRows(current => {
            const next = [...current];
            while (next.length < startRowIndex + pastedRows.length) next.push(makeEmptyEntry());
            pastedRows.forEach((pasted, rowOffset) => {
                const target = { ...next[startRowIndex + rowOffset] };
                FIELDS.slice(startColumnIndex).forEach((field, fieldOffset) => {
                    const sourceField = FIELDS[fieldOffset];
                    if (sourceField) target[field] = pasted[sourceField] ?? '';
                });
                next[startRowIndex + rowOffset] = target;
            });
            return next;
        });
        setIsClearConfirming(false);
        setMessage('');
    };

    const handleDiscordImport = (text: string): DiscordSheetImportResult | null => {
        const parsed = parseMultipleLines(text);
        if (parsed.players.length === 0) return null;
        const merged = mergeDiscordPlayersIntoUserSheet(rows, parsed.players);
        setRows(merged.rows);
        setIsClearConfirming(false);
        setMessage('');
        return {
            addedCount: merged.addedCount,
            updatedCount: merged.updatedCount,
            failedCount: parsed.failedLines.length,
            warningCount: parsed.avoidedRoleWarnings.length,
        };
    };

    const openConflictResolver = async (
        error: unknown,
        baseRows: UserSheetDraftEntry[],
        draftRows: UserSheetDraftEntry[],
    ): Promise<boolean> => {
        try {
            const latestSnapshot = await fetchUserSheetConflictSnapshot(error);
            if (!latestSnapshot) return false;
            onSnapshotChange(latestSnapshot);
            setConflict({
                baseRows: baseRows.map(row => ({ ...row })),
                draftRows: draftRows.map(row => ({ ...row })),
                latestSnapshot,
                resolutions: {},
            });
            return true;
        } catch (conflictError) {
            const errorMessage = getErrorMessage(
                conflictError,
                '병합할 최신 시트를 불러오지 못했습니다.',
            );
            setMessage(errorMessage);
            onSaveError(errorMessage);
            return true;
        }
    };

    const saveRows = async (
        nextRows: UserSheetDraftEntry[],
        expectedSheetVersion: number,
        conflictBaseRows: UserSheetDraftEntry[],
    ): Promise<void> => {
        setIsSaving(true);
        try {
            const snapshot = await saveUserSheet(
                nextRows,
                expectedSheetVersion,
                csrfToken,
            );
            onSaved(snapshot);
        } catch (error) {
            const didOpenConflict = await openConflictResolver(
                error,
                conflictBaseRows,
                nextRows,
            );
            if (!didOpenConflict) {
                const errorMessage = getErrorMessage(error, '유저 시트를 저장하지 못했습니다.');
                setMessage(errorMessage);
                onSaveError(errorMessage);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        setMessage('');
        if (validation.errors.size > 0) {
            const validationMessage = `입력 오류 ${validation.errors.size}개를 먼저 확인해 주세요.`;
            setMessage(validationMessage);
            onSaveError(validationMessage);
            return;
        }
        await saveRows(
            validation.activeRows,
            baseSheetVersionRef.current,
            baseRowsRef.current,
        );
    };

    const resolveConflict = (conflictId: string, choice: UserSheetMergeChoice) => {
        setConflict(current => current ? {
            ...current,
            resolutions: { ...current.resolutions, [conflictId]: choice },
        } : current);
    };

    const resolveAllConflicts = (choice: UserSheetMergeChoice) => {
        setConflict(current => current ? {
            ...current,
            resolutions: Object.fromEntries(
                mergeUserSheetDrafts(
                    current.baseRows,
                    current.draftRows,
                    current.latestSnapshot.entries,
                ).conflicts.map(item => [item.id, choice]),
            ),
        } : current);
    };

    const applyConflictMerge = async () => {
        if (!conflict || !conflictMerge) return;
        const unresolved = conflictMerge.conflicts.some(item => !conflict.resolutions[item.id]);
        if (unresolved) return;

        const mergedValidation = validateUserSheetEntries(conflictMerge.rows);
        if (mergedValidation.errors.size > 0) {
            const validationMessage = '병합 결과의 Discord ID 또는 배틀태그 오류를 수정해 주세요.';
            setRows(conflictMerge.rows);
            baseRowsRef.current = conflict.latestSnapshot.entries.map(entry => ({ ...entry }));
            baseSheetVersionRef.current = conflict.latestSnapshot.sheetVersion;
            setConflict(null);
            setMessage(validationMessage);
            onSaveError(validationMessage);
            return;
        }

        setRows(conflictMerge.rows);
        setMessage('');
        await saveRows(
            mergedValidation.activeRows,
            conflict.latestSnapshot.sheetVersion,
            conflict.latestSnapshot.entries.map(entry => ({ ...entry })),
        );
    };

    if (conflict && conflictMerge) {
        return (
            <section
                id="user-sheet-editor"
                className="flex min-h-0 min-w-0 flex-1 flex-col"
                aria-labelledby="user-sheet-editor-title"
            >
                <UserSheetConflictResolver
                    autoMergedCount={conflictMerge.autoMergedCount}
                    conflicts={conflictMerge.conflicts}
                    isApplying={isSaving}
                    onApply={() => void applyConflictMerge()}
                    onDismiss={() => setConflict(null)}
                    onResolve={resolveConflict}
                    onResolveAll={resolveAllConflicts}
                    resolutions={conflict.resolutions}
                />
            </section>
        );
    }

    return (
        <section
            id="user-sheet-editor"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            aria-labelledby="user-sheet-editor-title"
        >
            <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-slate-800 bg-slate-900/70 px-4 py-3.5 md:px-6">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id="user-sheet-editor-title" className="font-semibold text-white">전체 시트 편집</h2>
                        <span className="whitespace-nowrap rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                            {validation.activeRows.length}명 입력
                        </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Google Sheets의 7개 열을 첫 셀에 붙여넣거나 각 칸을 직접 수정하세요.
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                        <Info size={12} className="shrink-0" aria-hidden="true" />
                        배틀태그는 Player#1234 형식 · 역할 티어의 !, ?, ★는 자동 제거
                    </p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={onCancel} className="btn-ghost min-h-9">취소</button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={isSaving}
                        className="btn-primary inline-flex min-h-9 items-center gap-2 disabled:opacity-40"
                        aria-busy={isSaving}
                    >
                        {isSaving
                            ? <Loader2 size={14} className="button-spinner" aria-hidden="true" />
                            : <Save size={14} aria-hidden="true" />}
                        {isSaving ? '저장 중…' : '시트 저장'}
                    </button>
                </div>
                <label className="relative w-full md:ml-auto md:w-80">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" aria-hidden="true" />
                    <span className="sr-only">편집 표 검색</span>
                    <input
                        type="search"
                        value={tableQuery}
                        onChange={event => setTableQuery(event.target.value)}
                        placeholder="이름·Discord ID·배틀태그 검색…"
                        className="form-control pl-9 pr-9 text-xs"
                    />
                    {tableQuery && (
                        <button
                            type="button"
                            onClick={() => setTableQuery('')}
                            className="btn-ghost absolute right-1.5 top-1/2 min-h-7 h-7 w-7 -translate-y-1/2 rounded-md p-0 text-slate-500"
                            aria-label="편집 표 검색어 지우기"
                        >
                            <X size={13} aria-hidden="true" />
                        </button>
                    )}
                </label>
            </header>

            <DiscordSheetImport onImport={handleDiscordImport} />

            {(validation.errors.size > 0 || message) && (
                <div
                    className="flex shrink-0 items-start gap-2 border-b border-rose-500/20 bg-rose-500/[0.08] px-4 py-2.5 text-xs leading-relaxed text-rose-200 md:px-6"
                    role="alert"
                    aria-live="polite"
                >
                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
                    <div>
                        {validation.errors.size > 0 && (
                            <p>
                                <strong className="font-semibold">{invalidRowNumbers.join(', ')}행</strong>의
                                입력값을 확인해 주세요. 오류 칸을 붉은색으로 표시했습니다.
                            </p>
                        )}
                        {message && <p>{message}</p>}
                    </div>
                </div>
            )}

            <UserSheetEditorTable
                disableAutoFocus={disableAutoFocus}
                errors={validation.errors}
                focusRowId={focusRowId}
                onCellChange={updateCell}
                onPaste={handlePaste}
                onRemoveRow={(rowId) => {
                    setRows(current => current.filter(item => item.id !== rowId));
                }}
                rows={visibleRows}
                emptyMessage={tableQuery.trim() ? '검색 결과가 없습니다.' : '표시할 유저가 없습니다.'}
            />

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/95 px-4 py-3 md:px-6">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-slate-400">
                        저장 대상 <strong className="font-semibold text-slate-200">{validation.activeRows.length}명</strong>
                    </span>
                    {tableQuery.trim() && (
                        <span className="text-slate-500">검색 결과 {visibleRows.length}명</span>
                    )}
                    {validation.errors.size > 0 && (
                        <span className="whitespace-nowrap text-rose-300">오류 {validation.errors.size}개</span>
                    )}
                    <span className="hidden text-slate-600 sm:inline">가로 스크롤로 모든 열을 확인할 수 있습니다.</span>
                </div>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            setIsClearConfirming(false);
                            setRows(current => [...current, ...Array.from({ length: 5 }, makeEmptyEntry)]);
                        }}
                        className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-slate-400 hover:bg-white/5 hover:text-white"
                    >
                        <Plus size={13} aria-hidden="true" />
                        5행 추가
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!isClearConfirming) {
                                setIsClearConfirming(true);
                                return;
                            }
                            setRows(Array.from({ length: 10 }, makeEmptyEntry));
                            setIsClearConfirming(false);
                            setMessage('');
                        }}
                        className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs transition-colors ${
                            isClearConfirming
                                ? 'bg-rose-500/15 font-medium text-rose-200'
                                : 'text-slate-500 hover:bg-rose-500/10 hover:text-rose-300'
                        }`}
                    >
                        <Trash2 size={13} aria-hidden="true" />
                        {isClearConfirming ? '한 번 더 눌러 비우기' : '전체 비우기'}
                    </button>
                </div>
            </footer>
        </section>
    );
}
