import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, UserPlus } from 'lucide-react';
import type { Player } from '../../types';
import {
    normalizeUserSheetBattleTag,
    type UserSheetEntry,
} from '../../utils/user-sheet';

interface ParticipantUserSheetPickerProps {
    entries: UserSheetEntry[];
    error: string | null;
    isLoading: boolean;
    players: Player[];
    onAdd: (entry: UserSheetEntry) => void;
    onRetry: () => void;
}

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase('ko-KR');

/**
 * @description 참가자 작업실에서 공유 유저 시트를 검색해 현재 로스터에 바로 추가한다.
 */
export function ParticipantUserSheetPicker({
    entries,
    error,
    isLoading,
    players,
    onAdd,
    onRetry,
}: ParticipantUserSheetPickerProps) {
    const [query, setQuery] = useState('');
    const normalizedQuery = normalizeSearchText(query);
    const existingEntryIds = useMemo(
        () => new Set(players.flatMap(player => player.userSheetEntryId ? [player.userSheetEntryId] : [])),
        [players],
    );
    const existingDiscordIds = useMemo(
        () => new Set(players.flatMap(player => player.discordUserId ? [player.discordUserId] : [])),
        [players],
    );
    const existingBattleTags = useMemo(
        () => new Set(players.map(player => normalizeUserSheetBattleTag(player.name))),
        [players],
    );
    const results = useMemo(() => {
        if (!normalizedQuery) return [];
        return entries.filter(entry => (
            normalizeSearchText(entry.discordName).includes(normalizedQuery)
            || normalizeSearchText(entry.battleTag).includes(normalizedQuery)
            || normalizeSearchText(entry.discordUserId ?? '').includes(normalizedQuery)
        )).slice(0, 20);
    }, [entries, normalizedQuery]);

    const isEntryAdded = (entry: UserSheetEntry): boolean => (
        existingEntryIds.has(entry.id)
        || Boolean(entry.discordUserId && existingDiscordIds.has(entry.discordUserId))
        || existingBattleTags.has(normalizeUserSheetBattleTag(entry.battleTag))
    );

    return (
        <section className="card min-h-[34rem] p-5" aria-labelledby="participant-user-sheet-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <UserPlus size={17} className="text-cyan-300" aria-hidden="true" />
                        <h3 id="participant-user-sheet-title" className="font-semibold text-white">
                            유저 시트에서 참가자 추가
                        </h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        저장된 Discord ID와 최신 BattleTag·역할 티어를 그대로 참가 명단에 사용합니다.
                    </p>
                </div>
                <button
                    type="button"
                    className="btn-ghost inline-flex items-center gap-2 text-sm"
                    onClick={onRetry}
                    disabled={isLoading}
                >
                    {isLoading
                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        : <RefreshCw size={14} aria-hidden="true" />}
                    새로고침
                </button>
            </div>

            <div className="relative mt-5">
                <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                />
                <label htmlFor="participant-user-sheet-search" className="sr-only">유저 시트 검색</label>
                <input
                    id="participant-user-sheet-search"
                    type="search"
                    className="input-base pl-9"
                    placeholder="Discord 이름, ID 또는 배틀태그 검색"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    disabled={isLoading}
                    autoFocus
                />
            </div>

            {isLoading ? (
                <p className="mt-5 flex items-center gap-2 text-sm text-slate-400" role="status">
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    유저 시트를 불러오는 중입니다.
                </p>
            ) : error ? (
                <div className="mt-5 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4" role="alert">
                    <p className="text-sm text-rose-300">{error}</p>
                    <button type="button" className="btn-ghost mt-3" onClick={onRetry}>
                        다시 시도
                    </button>
                </div>
            ) : normalizedQuery && results.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/35">
                    {results.map(entry => {
                        const isAdded = isEntryAdded(entry);
                        return (
                            <li key={entry.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <strong className="truncate text-sm font-semibold text-white">
                                            {entry.discordName || entry.battleTag}
                                        </strong>
                                        <span className="truncate font-mono text-xs text-slate-500">{entry.battleTag}</span>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                                        <span className="rounded-md bg-slate-900 px-2 py-1">탱 {entry.tank || '-'}</span>
                                        <span className="rounded-md bg-slate-900 px-2 py-1">딜 {entry.dps || '-'}</span>
                                        <span className="rounded-md bg-slate-900 px-2 py-1">힐 {entry.support || '-'}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={isAdded || !entry.discordUserId}
                                    onClick={() => onAdd(entry)}
                                    title={!entry.discordUserId ? 'Discord ID가 없는 유저는 추가할 수 없습니다.' : undefined}
                                >
                                    {isAdded ? '추가됨' : entry.discordUserId ? '참가자 추가' : 'ID 없음'}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : normalizedQuery ? (
                <p className="mt-5 text-sm text-slate-500">검색 결과가 없습니다.</p>
            ) : (
                <div className="mt-5 rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center">
                    <Search size={22} className="mx-auto text-slate-600" aria-hidden="true" />
                    <p className="mt-2 text-sm text-slate-400">검색어를 입력해 참가자를 찾으세요.</p>
                    <p className="mt-1 text-xs text-slate-600">현재 유저 시트 {entries.length}명</p>
                </div>
            )}
        </section>
    );
}