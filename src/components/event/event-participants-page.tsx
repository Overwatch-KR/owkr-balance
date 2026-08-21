import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { getErrorMessage, requestJson } from '../../utils/api';
import type { EventParticipationSnapshot } from '../../../domains/scrim/shared/rules';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';
import { AppToast } from '../app-toast';
import { EventParticipantSummary } from './event-participant-summary';
import { EventUserSheetPicker } from './event-user-sheet-picker';

interface EventParticipantsPageProps {
    csrfToken: string;
    onClose: () => void;
}

const hasSameIds = (left: Set<string>, right: Set<string>): boolean => (
    left.size === right.size && [...left].every(id => right.has(id))
);

/**
 * @description 상단 메뉴에서 이벤트 실제 참여자를 직접 확인하고 저장하는 전용 화면이다.
 */
export function EventParticipantsPage({ csrfToken, onClose }: EventParticipantsPageProps) {
    const [snapshot, setSnapshot] = useState<EventParticipationSnapshot>({
        candidates: [],
        participantIds: [],
    });
    const [draftParticipantIds, setDraftParticipantIds] = useState<Set<string>>(new Set());
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const { dismissToast, showToast, toast } = useToast();

    const applySnapshot = useCallback((next: EventParticipationSnapshot) => {
        setSnapshot(next);
        setDraftParticipantIds(new Set(next.participantIds));
    }, []);

    const load = useCallback(async (mode: 'initial' | 'refresh') => {
        if (mode === 'initial') setIsInitialLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const result = await requestJson<EventParticipationSnapshot>('/api/event-participants', {
                credentials: 'same-origin',
            });
            applySnapshot(result);
        } catch (loadError) {
            setError(getErrorMessage(loadError, '이벤트 참여자를 불러오지 못했습니다.'));
        } finally {
            if (mode === 'initial') setIsInitialLoading(false);
            else setIsRefreshing(false);
        }
    }, [applySnapshot]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load('initial'), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const savedParticipantIds = useMemo(
        () => new Set(snapshot.participantIds),
        [snapshot.participantIds],
    );
    const isDirty = !hasSameIds(draftParticipantIds, savedParticipantIds);

    const toggleParticipant = (participantId: string) => {
        setDraftParticipantIds(current => {
            const next = new Set(current);
            if (next.has(participantId)) next.delete(participantId);
            else next.add(participantId);
            return next;
        });
    };

    const addUserSheetParticipant = (participant: ScrimRosterParticipant) => {
        setSnapshot(current => current.candidates.some(candidate => candidate.id === participant.id)
            ? current
            : {
                ...current,
                candidates: [...current.candidates, participant].sort((a, b) => (
                    a.name.localeCompare(b.name, 'ko-KR')
                )),
            });
        setDraftParticipantIds(current => new Set(current).add(participant.id));
    };

    const save = async () => {
        if (!isDirty || isSaving) return;
        setIsSaving(true);
        try {
            const result = await requestJson<EventParticipationSnapshot>('/api/event-participants', {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ participantIds: [...draftParticipantIds] }),
            });
            applySnapshot(result);
            showToast('success', `이벤트 참여자 ${result.participantIds.length}명을 저장했습니다.`);
        } catch (saveError) {
            showToast('error', getErrorMessage(saveError, '이벤트 참여자를 저장하지 못했습니다.'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-surface px-4 py-6 text-slate-200 md:px-8 md:py-8">
            <div className="mx-auto max-w-4xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-cyan-300">2026 넥슨 이벤트</p>
                        <h1 className="mt-1 text-2xl font-bold text-white">이벤트 참여자</h1>
                        <p className="mt-1 text-sm text-slate-400">팀 결과에서 등록한 실제 참여자를 확인하고 수정합니다.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="btn-ghost"
                            disabled={isInitialLoading || isRefreshing || isSaving}
                            onClick={() => void load('refresh')}
                        >
                            <RefreshCw
                                size={16}
                                className={`mr-1 inline ${isRefreshing ? 'animate-spin' : ''}`}
                                aria-hidden="true"
                            />
                            {isRefreshing ? '새로고침 중' : '새로고침'}
                        </button>
                        <button type="button" className="btn-ghost" onClick={onClose}>
                            <ArrowLeft size={16} className="mr-1 inline" aria-hidden="true" />
                            매칭으로 돌아가기
                        </button>
                    </div>
                </header>

                {error ? (
                    <section className="card mt-6 border border-rose-400/20" role="alert">
                        <h2 className="font-semibold text-rose-200">참여자 명단을 불러오지 못했습니다</h2>
                        <p className="mt-2 text-sm text-slate-400">{error}</p>
                        <button type="button" className="btn-ghost mt-4" onClick={() => void load('refresh')}>
                            다시 시도
                        </button>
                    </section>
                ) : (
                    <>
                        <EventParticipantSummary
                            candidates={snapshot.candidates}
                            isLoading={isInitialLoading}
                            participantIds={draftParticipantIds}
                            onToggle={toggleParticipant}
                        />
                        {!isInitialLoading ? (
                            <EventUserSheetPicker
                                participantIds={draftParticipantIds}
                                onAdd={addUserSheetParticipant}
                            />
                        ) : null}
                        {!isInitialLoading && snapshot.candidates.length > 0 ? (
                            <section className="card mt-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => setDraftParticipantIds(new Set(
                                            snapshot.candidates.map(candidate => candidate.id),
                                        ))}
                                    >
                                        전원 선택
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => setDraftParticipantIds(new Set())}
                                    >
                                        선택 해제
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    className="btn-primary min-w-32"
                                    disabled={!isDirty || isSaving}
                                    onClick={() => void save()}
                                >
                                    <Save size={15} className="mr-1 inline" aria-hidden="true" />
                                    {isSaving ? '저장 중' : `${draftParticipantIds.size}명 저장`}
                                </button>
                            </section>
                        ) : null}
                    </>
                )}
            </div>
            {toast ? <AppToast toast={toast} onDismiss={dismissToast} /> : null}
        </main>
    );
}
