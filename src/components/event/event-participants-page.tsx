import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { EventParticipationSnapshot } from '#domain/scrim/rules';
import type { ScrimRosterParticipant } from '#domain/scrim';
import { useToast } from '../../hooks/use-toast';
import { getErrorMessage, requestJson } from '../../utils/api';
import { AppToast } from '../app-toast';
import { DataLoadError } from '../common/data-load-error';
import { PageHeader } from '../layout/page-header';
import { EventParticipantActions } from './event-participant-actions';
import { EventParticipantSummary } from './event-participant-summary';
import { EventUserSheetPicker } from './event-user-sheet-picker';

interface EventParticipantsPageProps {
    csrfToken: string;
    onClose: () => void;
    userId: string;
}

interface EventParticipantsCache {
    snapshot: EventParticipationSnapshot;
    userId: string;
}

let eventParticipantsCache: EventParticipantsCache | null = null;

const getCachedSnapshot = (userId: string): EventParticipationSnapshot | null => (
    eventParticipantsCache?.userId === userId ? eventParticipantsCache.snapshot : null
);

const hasSameIds = (left: Set<string>, right: Set<string>): boolean => (
    left.size === right.size && [...left].every(id => right.has(id))
);

/**
 * @description 상단 메뉴에서 이벤트 실제 참여자를 직접 확인하고 저장하는 전용 화면이다.
 */
export function EventParticipantsPage({ csrfToken, onClose, userId }: EventParticipantsPageProps) {
    const [initialSnapshot] = useState(() => getCachedSnapshot(userId));
    const [snapshot, setSnapshot] = useState<EventParticipationSnapshot>(() => initialSnapshot ?? {
        candidates: [],
        participantIds: [],
    });
    const [draftParticipantIds, setDraftParticipantIds] = useState<Set<string>>(
        () => new Set(initialSnapshot?.participantIds ?? []),
    );
    const [isInitialLoading, setIsInitialLoading] = useState(initialSnapshot === null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(
        () => initialSnapshot !== null && initialSnapshot.updatedAt === undefined,
    );
    const [error, setError] = useState('');
    const { dismissToast, showToast, toast } = useToast();

    const applySnapshot = useCallback((next: EventParticipationSnapshot) => {
        eventParticipantsCache = { snapshot: next, userId };
        setSnapshot(next);
        setDraftParticipantIds(new Set(next.participantIds));
    }, [userId]);

    const load = useCallback(async (mode: 'initial' | 'refresh') => {
        if (mode === 'initial') setIsInitialLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const result = await requestJson<EventParticipationSnapshot>('/api/event-participants', {
                credentials: 'same-origin',
            });
            applySnapshot(result);
            setIsEditing(result.updatedAt === undefined);
        } catch (loadError) {
            setError(getErrorMessage(loadError, '이벤트 참여자를 불러오지 못했습니다.'));
        } finally {
            if (mode === 'initial') setIsInitialLoading(false);
            else setIsRefreshing(false);
        }
    }, [applySnapshot]);

    useEffect(() => {
        const timer = window.setTimeout(
            () => void load(initialSnapshot === null ? 'initial' : 'refresh'),
            0,
        );
        return () => window.clearTimeout(timer);
    }, [initialSnapshot, load]);

    const savedParticipantIds = useMemo(
        () => new Set(snapshot.participantIds),
        [snapshot.participantIds],
    );
    const isDirty = !hasSameIds(draftParticipantIds, savedParticipantIds);
    const displayedCandidates = useMemo(() => (
        isEditing
            ? snapshot.candidates
            : snapshot.candidates.filter(candidate => savedParticipantIds.has(candidate.id))
    ), [isEditing, savedParticipantIds, snapshot.candidates]);
    const canShowContent = !error
        || initialSnapshot !== null
        || snapshot.candidates.length > 0
        || snapshot.updatedAt !== undefined;

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
            setIsEditing(false);
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
                <PageHeader
                    breadcrumbs={[
                        { label: '대진표', onClick: onClose },
                        { label: '이벤트 참여자' },
                    ]}
                    eyebrow="2026 넥슨 이벤트"
                    title="이벤트 참여자"
                    description="팀 결과에서 등록한 실제 참여자를 확인하고 수정합니다."
                    actions={(
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
                    )}
                />

                {error ? (
                    <DataLoadError
                        isRetrying={isInitialLoading || isRefreshing}
                        message={error}
                        onRetry={() => void load(snapshot.candidates.length === 0 ? 'initial' : 'refresh')}
                        title="이벤트 참여자를 불러오지 못했습니다"
                    />
                ) : null}
                {canShowContent && !isInitialLoading && (
                    snapshot.candidates.length > 0 || snapshot.updatedAt !== undefined
                ) ? (
                    <EventParticipantActions
                        hasSaved={snapshot.updatedAt !== undefined}
                        isDirty={isDirty}
                        isEditing={isEditing}
                        isSaving={isSaving}
                        participantCount={draftParticipantIds.size}
                        onSelectAll={() => setDraftParticipantIds(new Set(
                            snapshot.candidates.map(candidate => candidate.id),
                        ))}
                        onClear={() => setDraftParticipantIds(new Set())}
                        onEdit={() => setIsEditing(true)}
                        onCancel={() => {
                            setDraftParticipantIds(new Set(snapshot.participantIds));
                            setIsEditing(false);
                        }}
                        onSave={() => void save()}
                    />
                ) : null}
                {canShowContent && !isInitialLoading && isEditing ? (
                    <EventUserSheetPicker
                        participantIds={draftParticipantIds}
                        onAdd={addUserSheetParticipant}
                    />
                ) : null}
                {canShowContent ? (
                    <EventParticipantSummary
                        candidates={displayedCandidates}
                        isEditing={isEditing}
                        isLoading={isInitialLoading}
                        participantIds={draftParticipantIds}
                        onToggle={toggleParticipant}
                    />
                ) : null}
            </div>
            {toast ? <AppToast toast={toast} onDismiss={dismissToast} /> : null}
        </main>
    );
}
