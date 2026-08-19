import { useMemo, useRef, useState } from 'react';
import {
    cleanUserSheetRank,
    fetchUserSheetConflictSnapshot,
    updateUserSheetEntry,
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
import { cleanDiscordUserId, isValidDiscordUserId } from '../../utils/player-identity';
import { UserSheetConflictResolver } from './user-sheet-conflict-resolver';
import {
    UserSheetEntryContent,
    type UserSheetEntryField,
} from './user-sheet-entry-content';

interface UserSheetEntryViewProps {
    csrfToken: string;
    entries: UserSheetEntry[];
    entry: UserSheetEntry;
    isCurrentParticipant: boolean;
    noteCacheScope: string;
    onSnapshotChange: (snapshot: UserSheetSnapshot) => void;
    onSaveError: (message: string) => void;
    onSaved: (snapshot: UserSheetSnapshot, message: string) => void;
}

interface UserSheetEntryConflict {
    baseEntry: UserSheetDraftEntry;
    draftEntry: UserSheetDraftEntry;
    latestEntry: UserSheetEntry;
    latestSnapshot: UserSheetSnapshot;
    resolutions: UserSheetMergeResolutions;
}

const EDITABLE_FIELDS: ReadonlyArray<keyof UserSheetDraftEntry> = [
    'discordUserId',
    'discordName',
    'battleTag',
    'tank',
    'dps',
    'support',
    'note',
];

/**
 * @description 공용 정보 초안에 저장할 변경이 있는지 확인한다.
 */
const hasUserSheetEntryChanges = (
    draft: UserSheetDraftEntry,
    baseEntry: UserSheetDraftEntry,
): boolean => EDITABLE_FIELDS.some(field => draft[field] !== baseEntry[field]);

/**
 * @description 선택한 유저의 정보를 조회하고 같은 상세 화면에서 바로 수정한다.
 */
export function UserSheetEntryView({
    csrfToken,
    entries,
    entry,
    isCurrentParticipant,
    noteCacheScope,
    onSnapshotChange,
    onSaveError,
    onSaved,
}: UserSheetEntryViewProps) {
    const [draft, setDraft] = useState<UserSheetDraftEntry>({ ...entry });
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [validationMessage, setValidationMessage] = useState('');
    const [conflict, setConflict] = useState<UserSheetEntryConflict | null>(null);
    const editBaseUpdatedAtRef = useRef(entry.updatedAt);
    const editBaseEntryRef = useRef<UserSheetDraftEntry>({ ...entry });
    const conflictMerge = useMemo(() => (
        conflict
            ? mergeUserSheetDrafts(
                [conflict.baseEntry],
                [conflict.draftEntry],
                [conflict.latestEntry],
                conflict.resolutions,
            )
            : null
    ), [conflict]);

    const updateField = (field: UserSheetEntryField, value: string) => {
        const nextValue = field === 'tank' || field === 'dps' || field === 'support'
            ? cleanUserSheetRank(value)
            : value;
        setDraft(current => ({ ...current, [field]: nextValue }));
        setValidationMessage('');
    };

    const startEditing = () => {
        setDraft({ ...entry });
        editBaseUpdatedAtRef.current = entry.updatedAt;
        editBaseEntryRef.current = { ...entry };
        setValidationMessage('');
        setIsEditing(true);
    };

    const cancelEditing = () => {
        setDraft({ ...entry });
        setValidationMessage('');
        setIsEditing(false);
    };

    const validateDraft = (
        nextDraft: UserSheetDraftEntry,
        latestEntries: UserSheetEntry[] = entries,
    ): string => {
        const discordUserId = cleanDiscordUserId(nextDraft.discordUserId ?? '');
        if (!discordUserId) {
            return 'Discord ID는 필수입니다.';
        }
        if (!isValidDiscordUserId(discordUserId)) {
            return 'Discord ID는 17~20자리 숫자로 입력해 주세요.';
        }
        if (discordUserId && latestEntries.some(current => (
            current.id !== entry.id
            && current.discordUserId === discordUserId
        ))) {
            return '같은 Discord ID가 다른 유저에게 이미 등록되어 있습니다.';
        }
        const rows = latestEntries.map(current => (
            current.id === entry.id ? nextDraft : current
        ));
        const error = validateUserSheetEntries(rows).errors.get(nextDraft.id);
        if (error) {
            if (error === 'REQUIRED_DISCORD_USER_ID') {
                return 'Discord ID는 필수입니다.';
            }
            return error === 'DUPLICATE_BATTLE_TAG'
                ? '같은 배틀태그를 구분하려면 각 유저의 Discord ID가 필요합니다.'
                : '배틀태그에 #과 숫자 태그를 포함해 주세요. 예: Player#1234';
        }
        return '';
    };

    const openConflictResolver = async (
        error: unknown,
        baseEntry: UserSheetDraftEntry,
        draftEntry: UserSheetDraftEntry,
    ): Promise<boolean> => {
        try {
            const latestSnapshot = await fetchUserSheetConflictSnapshot(error);
            if (!latestSnapshot) return false;
            const latestEntry = latestSnapshot.entries.find(current => current.id === entry.id);
            if (!latestEntry) {
                const message = '다른 관리자가 이 유저를 삭제했습니다. 최신 시트를 확인해 주세요.';
                onSnapshotChange(latestSnapshot);
                setValidationMessage(message);
                onSaveError(message);
                return true;
            }
            onSnapshotChange(latestSnapshot);
            setConflict({
                baseEntry: { ...baseEntry },
                draftEntry: { ...draftEntry },
                latestEntry,
                latestSnapshot,
                resolutions: {},
            });
            return true;
        } catch (conflictError) {
            const message = getErrorMessage(
                conflictError,
                '병합할 최신 유저 정보를 불러오지 못했습니다.',
            );
            setValidationMessage(message);
            onSaveError(message);
            return true;
        }
    };

    const saveDraft = async (
        nextDraft: UserSheetDraftEntry,
        expectedUpdatedAt: number,
        baseEntry: UserSheetDraftEntry,
    ): Promise<void> => {
        setIsSaving(true);
        setValidationMessage('');
        try {
            const snapshot = await updateUserSheetEntry(
                nextDraft,
                expectedUpdatedAt,
                csrfToken,
            );
            const savedEntry = snapshot.entries.find(saved => saved.id === entry.id);
            if (savedEntry) setDraft({ ...savedEntry });
            onSaved(
                snapshot,
                `${savedEntry?.discordName || savedEntry?.battleTag || nextDraft.battleTag} 정보를 수정했습니다.`,
            );
            setIsEditing(false);
        } catch (error) {
            const didOpenConflict = await openConflictResolver(
                error,
                baseEntry,
                nextDraft,
            );
            if (!didOpenConflict) {
                const message = getErrorMessage(
                    error,
                    '공유 유저 정보를 저장하지 못했습니다.',
                );
                setValidationMessage(message);
                onSaveError(message);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (!hasUserSheetEntryChanges(draft, editBaseEntryRef.current)) return;
        const validationError = validateDraft(draft);
        if (validationError) {
            setValidationMessage(validationError);
            return;
        }
        await saveDraft(
            draft,
            editBaseUpdatedAtRef.current,
            editBaseEntryRef.current,
        );
    };

    const resolveConflict = (conflictId: string, choice: UserSheetMergeChoice) => {
        setConflict(current => current ? {
            ...current,
            resolutions: { ...current.resolutions, [conflictId]: choice },
        } : current);
    };

    const applyConflictMerge = async () => {
        if (!conflict || !conflictMerge) return;
        const unresolved = conflictMerge.conflicts.some(item => !conflict.resolutions[item.id]);
        const mergedEntry = conflictMerge.rows[0];
        if (unresolved || !mergedEntry) return;

        const validationError = validateDraft(mergedEntry, conflict.latestSnapshot.entries);
        if (validationError) {
            setDraft(mergedEntry);
            editBaseEntryRef.current = { ...conflict.latestEntry };
            editBaseUpdatedAtRef.current = conflict.latestEntry.updatedAt;
            setConflict(null);
            setValidationMessage(validationError);
            return;
        }

        setDraft(mergedEntry);
        await saveDraft(
            mergedEntry,
            conflict.latestEntry.updatedAt,
            conflict.latestEntry,
        );
    };

    if (conflict && conflictMerge) {
        return (
            <section
                id="user-sheet-entry-detail"
                className="flex min-h-0 flex-1 flex-col"
                aria-labelledby="user-sheet-conflict-title"
            >
                <UserSheetConflictResolver
                    autoMergedCount={conflictMerge.autoMergedCount}
                    conflicts={conflictMerge.conflicts}
                    isApplying={isSaving}
                    onApply={() => void applyConflictMerge()}
                    onDismiss={() => setConflict(null)}
                    onResolve={resolveConflict}
                    onResolveAll={(choice) => setConflict(current => current ? {
                        ...current,
                        resolutions: Object.fromEntries(
                            conflictMerge.conflicts.map(item => [item.id, choice]),
                        ),
                    } : current)}
                    resolutions={conflict.resolutions}
                />
            </section>
        );
    }

    return (
        <UserSheetEntryContent
            csrfToken={csrfToken}
            draft={draft}
            entry={entry}
            isCurrentParticipant={isCurrentParticipant}
            isDirty={hasUserSheetEntryChanges(draft, editBaseEntryRef.current)}
            isEditing={isEditing}
            isSaving={isSaving}
            noteCacheScope={noteCacheScope}
            onCancel={cancelEditing}
            onEdit={startEditing}
            onFieldChange={updateField}
            onSave={() => void handleSave()}
            validationMessage={validationMessage}
        />
    );
}
