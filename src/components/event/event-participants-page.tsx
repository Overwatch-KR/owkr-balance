import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
    userId: string;
}

const EMPTY_EVENT_SNAPSHOT: EventParticipationSnapshot = {
    candidates: [],
    participantIds: [],
};

const hasSameIds = (left: Set<string>, right: Set<string>): boolean => (
    left.size === right.size && [...left].every(id => right.has(id))
);

/**
 * @description 상단 메뉴에서 이벤트 실제 참여자를 직접 확인하고 저장하는 전용 화면이다.
 */
export function EventParticipantsPage({ csrfToken, userId }: EventParticipantsPageProps) {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['event-participants', userId] as const, [userId]);
    const participantsQuery = useQuery({
        queryKey,
        queryFn: () => requestJson<EventParticipationSnapshot>('/api/event-participants', {
            credentials: 'same-origin',
        }),
        refetchOnWindowFocus: false,
    });
    const cachedSnapshot = participantsQuery.data ?? EMPTY_EVENT_SNAPSHOT;
    const [snapshot, setSnapshot] = useState<EventParticipationSnapshot>(cachedSnapshot);
    const [draftParticipantIds, setDraftParticipantIds] = useState<Set<string>>(
        () => new Set(cachedSnapshot.participantIds),
    );
    const isInitialLoading = participantsQuery.isPending;
    const isRefreshing = participantsQuery.isFetching && !participantsQuery.isPending;
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(() => cachedSnapshot.updatedAt === undefined);
    const error = participantsQuery.error
        ? getErrorMessage(participantsQuery.error, '이벤트 참여자를 불러오지 못했습니다.')
        : '';
    const { dismissToast, showToast, toast } = useToast();

    const applySnapshot = useCallback((next: EventParticipationSnapshot) => {
        queryClient.setQueryData(queryKey, next);
        setSnapshot(next);
        setDraftParticipantIds(new Set(next.participantIds));
    }, [queryClient, queryKey]);

    useEffect(() => {
        if (!participantsQuery.data) return;
        setSnapshot(participantsQuery.data);
        setDraftParticipantIds(new Set(participantsQuery.data.participantIds));
        setIsEditing(participantsQuery.data.updatedAt === undefined);
    }, [participantsQuery.data, participantsQuery.dataUpdatedAt]);

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
        || participantsQuery.data !== undefined
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
        <>
            <div>
                <PageHeader
                    eyebrow="2026 넥슨 이벤트"
                    title="이벤트 참여자"
                    description="팀 결과에서 등록한 실제 참여자를 확인하고 수정합니다."
                    actions={(
                        <button
                            type="button"
                            className="btn-ghost"
                            disabled={isInitialLoading || isRefreshing || isSaving}
                            onClick={() => void participantsQuery.refetch()}
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
                        onRetry={() => void participantsQuery.refetch()}
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
        </>
    );
}
