import { useMemo } from 'react';
import {
    MessageSquareText,
    Pencil,
    Plus,
    Search,
    X,
} from 'lucide-react';
import {
    normalizeUserSheetBattleTag,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../../utils/user-sheet';
import { DouMascot } from '../common/dou-mascot';
import { UserSheetEntryView } from './user-sheet-entry-view';

interface UserSheetBrowserProps {
    csrfToken: string;
    entries: UserSheetEntry[];
    noteCacheScope: string;
    participantBattleTags: Set<string>;
    query: string;
    selectedEntry: UserSheetEntry | null;
    showMobileDetail: boolean;
    onAdd: () => void;
    onEditAll: () => void;
    onQueryChange: (query: string) => void;
    onSaveError: (message: string) => void;
    onSaved: (snapshot: UserSheetSnapshot, message: string) => void;
    onDeleted: (snapshot: UserSheetSnapshot, entryId: string, message: string) => void;
    onSelect: (entryId: string) => void;
    onSnapshotChange: (snapshot: UserSheetSnapshot) => void;
}

/**
 * @description 유저 시트 검색·목록과 선택한 유저의 상세 정보를 함께 표시한다.
 */
export function UserSheetBrowser({
    csrfToken,
    entries,
    noteCacheScope,
    participantBattleTags,
    query,
    selectedEntry,
    showMobileDetail,
    onAdd,
    onEditAll,
    onQueryChange,
    onSaveError,
    onSaved,
    onDeleted,
    onSelect,
    onSnapshotChange,
}: UserSheetBrowserProps) {
    const filteredEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return entries;
        return entries.filter(entry => (
            entry.discordName.toLowerCase().includes(normalizedQuery)
            || entry.discordUserId?.includes(normalizedQuery)
            || entry.battleTag.toLowerCase().includes(normalizedQuery)
            || entry.note.toLowerCase().includes(normalizedQuery)
            || entry.tank.toLowerCase().includes(normalizedQuery)
            || entry.dps.toLowerCase().includes(normalizedQuery)
            || entry.support.toLowerCase().includes(normalizedQuery)
        ));
    }, [entries, query]);

    return (
        <div className="flex min-h-0 flex-1">
            <aside className={`${showMobileDetail ? 'hidden' : 'flex'} w-full shrink-0 flex-col border-r border-slate-800 sm:flex sm:w-80 lg:w-96`}>
                <div id="user-sheet-browse-tools" className="grid gap-2 border-b border-slate-800 p-3">
                    <div id="user-sheet-actions" className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={onAdd}
                            className="btn-primary inline-flex min-h-10 items-center justify-center gap-1.5"
                        >
                            <Plus size={14} aria-hidden="true" />
                            유저 추가
                        </button>
                        <button
                            type="button"
                            onClick={onEditAll}
                            className="btn-ghost inline-flex min-h-10 items-center justify-center gap-1.5 border border-slate-700/70"
                        >
                            <Pencil size={14} aria-hidden="true" />
                            전체 편집
                        </button>
                    </div>
                    <label id="user-sheet-search" className="relative">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" aria-hidden="true" />
                        <span className="sr-only">유저 검색</span>
                        <input
                            name="user-sheet-search"
                            type="search"
                            autoComplete="off"
                            spellCheck={false}
                            value={query}
                            onChange={event => onQueryChange(event.target.value)}
                            placeholder="이름·Discord ID·배틀태그 검색…"
                            className="form-control h-10 border-slate-800 pl-9 pr-9 text-xs"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => onQueryChange('')}
                                className="btn-ghost absolute right-1.5 top-1/2 min-h-7 h-7 w-7 -translate-y-1/2 rounded-md p-0 text-slate-600 focus-visible:ring-cyan-400/70"
                                aria-label="검색어 지우기"
                            >
                                <X size={13} aria-hidden="true" />
                            </button>
                        )}
                    </label>
                    <p className="px-1 text-[11px] text-slate-600">
                        {query.trim() ? `${filteredEntries.length}명 검색됨` : `총 ${entries.length}명 저장됨`}
                    </p>
                </div>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                    {filteredEntries.length === 0 ? (
                        <div className="flex flex-col items-center px-3 py-8 text-center text-xs leading-relaxed text-slate-600">
                            <DouMascot variant={entries.length === 0 ? 'empty' : 'search'} size={64} className="mb-3 opacity-80" decorative />
                            <p>{entries.length === 0 ? '저장된 유저가 없습니다. 유저 추가를 눌러 등록해 주세요.' : '검색 결과가 없습니다.'}</p>
                        </div>
                    ) : filteredEntries.map(entry => {
                        const isParticipant = participantBattleTags.has(
                            normalizeUserSheetBattleTag(entry.battleTag),
                        );
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                onClick={() => onSelect(entry.id)}
                                className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                                    selectedEntry?.id === entry.id
                                        ? 'border-cyan-500/30 bg-cyan-500/[0.08]'
                                        : 'border-transparent hover:border-slate-800 hover:bg-white/[0.03]'
                                }`}
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-slate-200">
                                        {entry.discordName || entry.battleTag}
                                    </span>
                                    {isParticipant && (
                                        <span className="shrink-0 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-300">참가 중</span>
                                    )}
                                </span>
                                <span className="mt-1 block truncate font-mono text-[11px] text-slate-600">{entry.battleTag}</span>
                                <span className={`mt-0.5 block truncate font-mono text-[10px] ${
                                    entry.discordUserId ? 'text-cyan-300/55' : 'text-rose-300/75'
                                }`}>
                                    Discord ID · {entry.discordUserId || '입력 필요'}
                                </span>
                                <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500">
                                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5">탱 {entry.tank || '-'}</span>
                                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5">딜 {entry.dps || '-'}</span>
                                    <span className="rounded bg-slate-800/80 px-1.5 py-0.5">힐 {entry.support || '-'}</span>
                                    {entry.note && (
                                        <span
                                            className="ml-auto inline-flex min-w-0 items-center gap-1 text-emerald-400/70"
                                            title={entry.note}
                                        >
                                            <MessageSquareText size={11} className="shrink-0" aria-hidden="true" />
                                            <span className="max-w-20 truncate">메모</span>
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </aside>

            <div className={`${showMobileDetail ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col sm:flex`}>
                {selectedEntry ? (
                    <UserSheetEntryView
                        key={selectedEntry.id}
                        csrfToken={csrfToken}
                        entries={entries}
                        entry={selectedEntry}
                        isCurrentParticipant={participantBattleTags.has(
                            normalizeUserSheetBattleTag(selectedEntry.battleTag),
                        )}
                        noteCacheScope={noteCacheScope}
                        onSnapshotChange={onSnapshotChange}
                        onSaveError={onSaveError}
                        onSaved={onSaved}
                        onDeleted={onDeleted}
                    />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                        <DouMascot variant="search" size={96} className="mb-3 opacity-80" decorative />
                        <p className="text-sm font-medium text-slate-400">조회할 유저를 선택해 주세요</p>
                        <p className="mt-1 text-xs text-slate-600">유저를 선택하면 상세 정보에서 바로 수정할 수 있습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
