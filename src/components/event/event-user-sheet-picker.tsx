import { useMemo, useState } from 'react';
import { Loader2, Search, UserPlus } from 'lucide-react';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';
import { getErrorMessage, requestJson } from '../../utils/api';

interface EventUserSheetPickerProps {
    onAdd: (participant: ScrimRosterParticipant) => void;
    participantIds: Set<string>;
}

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase('ko-KR');

/**
 * @description 이벤트 로스터에 없던 참여자를 유저 시트에서 검색해 현재 저장 초안에 추가한다.
 */
export function EventUserSheetPicker({ onAdd, participantIds }: EventUserSheetPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [candidates, setCandidates] = useState<ScrimRosterParticipant[]>([]);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');

    const open = async () => {
        setIsOpen(true);
        if (hasLoaded || isLoading) return;
        setIsLoading(true);
        setError('');
        try {
            const result = await requestJson<ScrimRosterParticipant[]>(
                '/api/event-participants?source=user-sheet',
                { credentials: 'same-origin' },
            );
            setCandidates(result);
            setHasLoaded(true);
        } catch (loadError) {
            setError(getErrorMessage(loadError, '유저 시트를 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    };

    const normalizedQuery = normalizeSearchText(query);
    const results = useMemo(() => {
        if (!normalizedQuery) return [];
        return candidates.filter(candidate => (
            normalizeSearchText(candidate.name).includes(normalizedQuery)
            || normalizeSearchText(candidate.discordName ?? '').includes(normalizedQuery)
        )).slice(0, 10);
    }, [candidates, normalizedQuery]);

    return (
        <section className="card mt-4" aria-labelledby="event-user-sheet-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 id="event-user-sheet-title" className="font-semibold text-white">누락 참여자 추가</h2>
                    <p className="mt-1 text-sm text-slate-400">내전 후보에 없는 사람을 유저 시트에서 검색합니다.</p>
                </div>
                {!isOpen ? (
                    <button type="button" className="btn-ghost" onClick={() => void open()}>
                        <UserPlus size={16} className="mr-1 inline" aria-hidden="true" />
                        유저 시트에서 추가
                    </button>
                ) : null}
            </div>

            {isOpen ? (
                <div className="mt-4">
                    <label htmlFor="event-user-sheet-search" className="sr-only">유저 시트 검색</label>
                    <div className="relative">
                        <Search
                            size={16}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                            aria-hidden="true"
                        />
                        <input
                            id="event-user-sheet-search"
                            type="search"
                            className="input-base pl-9"
                            placeholder="배틀태그 또는 Discord 이름 검색"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            disabled={isLoading}
                        />
                    </div>

                    {isLoading ? (
                        <p className="mt-4 flex items-center gap-2 text-sm text-slate-400" role="status">
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                            유저 시트를 불러오는 중입니다.
                        </p>
                    ) : error ? (
                        <div className="mt-4" role="alert">
                            <p className="text-sm text-rose-300">{error}</p>
                            <button type="button" className="btn-ghost mt-2" onClick={() => void open()}>
                                다시 시도
                            </button>
                        </div>
                    ) : normalizedQuery && results.length > 0 ? (
                        <ul className="mt-3 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900">
                            {results.map(candidate => {
                                const isAdded = participantIds.has(candidate.id);
                                return (
                                    <li key={candidate.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                        <span className="min-w-0 text-sm">
                                            <span className="block truncate font-medium text-slate-200">{candidate.name}</span>
                                            {candidate.discordName ? (
                                                <span className="block truncate text-xs text-slate-500">{candidate.discordName}</span>
                                            ) : null}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-ghost shrink-0"
                                            disabled={isAdded}
                                            onClick={() => onAdd(candidate)}
                                        >
                                            {isAdded ? '추가됨' : '추가'}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : normalizedQuery ? (
                        <p className="mt-4 text-sm text-slate-500">검색 결과가 없습니다.</p>
                    ) : (
                        <p className="mt-3 text-xs text-slate-500">관리자 계정은 검색 결과에서 제외됩니다.</p>
                    )}
                </div>
            ) : null}
        </section>
    );
}
