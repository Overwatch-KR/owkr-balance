import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    Loader2,
    RefreshCcw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
    formatUserSheetChangeSummary,
    getUserSheetChangeSummary,
    normalizeUserSheetBattleTag,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../../utils/user-sheet';
import { UserSheetEditor } from './user-sheet-editor';
import { UserSheetGuide } from './user-sheet-guide';
import {
    UserSheetTour,
    type UserSheetTourStepId,
} from './user-sheet-tour';
import { UserSheetBrowser } from './user-sheet-browser';
import {
    UserSheetModalHeader,
    type UserSheetMode,
} from './user-sheet-modal-header';
import { DouMascot } from '../common/dou-mascot';
import { useDialogFocus } from '../../hooks/use-dialog-focus';

interface UserSheetModalProps {
    csrfToken: string;
    entries: UserSheetEntry[];
    error: string | null;
    initialBattleTag?: string;
    initialEntryId?: string;
    isLoading: boolean;
    noteCacheScope: string;
    participantBattleTags: Set<string>;
    onClose: () => void;
    onEntriesChange: (snapshot: UserSheetSnapshot, message: string) => void;
    onRetry: () => void;
    onSaveError: (message: string) => void;
    onSnapshotChange: (snapshot: UserSheetSnapshot) => void;
    sheetVersion: number;
}

/**
 * @description 유저 목록 조회·전체 편집과 실제 화면을 따르는 단계별 가이드를 제공한다.
 */
export function UserSheetModal({
    csrfToken,
    entries,
    error,
    initialBattleTag,
    initialEntryId,
    isLoading,
    noteCacheScope,
    participantBattleTags,
    onClose,
    onEntriesChange,
    onRetry,
    onSaveError,
    onSnapshotChange,
    sheetVersion,
}: UserSheetModalProps) {
    const dialogRef = useDialogFocus({ closeOnEscape: false, onClose });
    const initialEntry = entries.find(entry => entry.id === initialEntryId)
        ?? (initialBattleTag ? entries.find(entry => (
            normalizeUserSheetBattleTag(entry.battleTag)
            === normalizeUserSheetBattleTag(initialBattleTag)
        )) : entries[0]);
    const [mode, setMode] = useState<UserSheetMode>('BROWSE');
    const [selectedId, setSelectedId] = useState<string | null>(initialEntry?.id ?? null);
    const [editorTarget, setEditorTarget] = useState<'ALL' | 'NEW'>('ALL');
    const [isMobileListOpen, setIsMobileListOpen] = useState(false);
    const [isTourOpen, setIsTourOpen] = useState(false);
    const [query, setQuery] = useState('');
    const selectedEntry = entries.find(entry => entry.id === selectedId)
        ?? entries.find(entry => entry.id === initialEntryId)
        ?? (initialBattleTag
            ? entries.find(entry => (
                normalizeUserSheetBattleTag(entry.battleTag)
                === normalizeUserSheetBattleTag(initialBattleTag)
            ))
            : entries[0])
        ?? null;

    const startTour = useCallback(() => {
        setIsMobileListOpen(false);
        setMode('BROWSE');
        setIsTourOpen(true);
    }, []);

    const closeTour = useCallback(() => {
        setIsTourOpen(false);
        setIsMobileListOpen(false);
        setMode('BROWSE');
    }, []);

    const openRules = useCallback(() => {
        setIsTourOpen(false);
        setMode('GUIDE');
    }, []);

    const handleTourStepChange = useCallback((stepId: UserSheetTourStepId) => {
        if (stepId === 'bulk-edit') {
            setIsMobileListOpen(false);
            setEditorTarget('ALL');
            setMode('EDIT');
            return;
        }
        setIsMobileListOpen(stepId === 'search' || stepId === 'entry-actions');
        setMode('BROWSE');
    }, []);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isTourOpen) return;
            if (mode === 'GUIDE') {
                setMode('BROWSE');
                return;
            }
            onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTourOpen, mode, onClose]);

    const showMobileDetail = mode === 'EDIT'
        || (Boolean(selectedEntry) && !isMobileListOpen);

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-sm md:p-5"
                role="presentation"
                onMouseDown={event => {
                    if (event.target !== event.currentTarget) return;
                    if (isTourOpen) {
                        closeTour();
                        return;
                    }
                    onClose();
                }}
            >
                <motion.section
                    ref={dialogRef}
                    initial={{ opacity: 0, y: 16, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.99 }}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="user-sheet-title"
                    tabIndex={-1}
                    className="flex h-[calc(100dvh-1rem)] w-full max-w-[1560px] flex-col overscroll-contain overflow-hidden rounded-2xl border border-slate-700/70 bg-surface-elevated shadow-2xl focus:outline-none md:h-[calc(100dvh-2.5rem)]"
                >
                <UserSheetModalHeader
                    entryCount={entries.length}
                    isGuideActive={mode === 'GUIDE' || isTourOpen}
                    isLoading={isLoading}
                    mode={mode}
                    showMobileDetail={showMobileDetail}
                    onClose={onClose}
                    onGuideToggle={() => {
                        if (mode === 'GUIDE') {
                            setMode('BROWSE');
                            return;
                        }
                        if (isTourOpen) {
                            closeTour();
                            return;
                        }
                        startTour();
                    }}
                    onOpenList={() => setIsMobileListOpen(true)}
                    onRetry={onRetry}
                />

                {error && (
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 md:px-6" role="alert">
                        <span className="inline-flex items-center gap-2">
                            <AlertCircle size={14} aria-hidden="true" />
                            {error}
                        </span>
                        <button
                            type="button"
                            onClick={onRetry}
                            disabled={isLoading}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 font-medium hover:bg-amber-500/10 disabled:opacity-50"
                        >
                            {isLoading
                                ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                                : <RefreshCcw size={12} aria-hidden="true" />}
                            다시 불러오기
                        </button>
                    </div>
                )}

                {mode === 'GUIDE' ? (
                    <UserSheetGuide
                        onClose={() => setMode('BROWSE')}
                        onStartTour={startTour}
                    />
                ) : isLoading && entries.length === 0 ? (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center text-sm text-slate-500" role="status">
                        <DouMascot variant="loading" size={112} className="animate-pulse" decorative />
                        <p className="mt-4">유저 시트를 불러오는 중</p>
                    </div>
                ) : mode === 'EDIT' ? (
                    <UserSheetEditor
                        key={editorTarget}
                        appendEmptyRow={editorTarget === 'NEW'}
                        csrfToken={csrfToken}
                        disableAutoFocus={isTourOpen}
                        entries={entries}
                        onCancel={() => setMode('BROWSE')}
                        onSnapshotChange={onSnapshotChange}
                        onSaveError={onSaveError}
                        onSaved={(snapshot) => {
                            const savedEntries = snapshot.entries;
                            onEntriesChange(
                                snapshot,
                                formatUserSheetChangeSummary(
                                    getUserSheetChangeSummary(entries, savedEntries),
                                ),
                            );
                            const previousIndex = selectedEntry
                                ? entries.findIndex(entry => entry.id === selectedEntry.id)
                                : -1;
                            const nextSelected = editorTarget === 'NEW'
                                ? savedEntries[savedEntries.length - 1]
                                : previousIndex >= 0
                                    ? savedEntries[previousIndex]
                                    : savedEntries[0];
                            setSelectedId(nextSelected?.id ?? null);
                            setMode('BROWSE');
                        }}
                        sheetVersion={sheetVersion}
                    />
                ) : (
                    <UserSheetBrowser
                        csrfToken={csrfToken}
                        entries={entries}
                        noteCacheScope={noteCacheScope}
                        participantBattleTags={participantBattleTags}
                        query={query}
                        selectedEntry={selectedEntry}
                        showMobileDetail={showMobileDetail}
                        onAdd={() => {
                            setEditorTarget('NEW');
                            setMode('EDIT');
                        }}
                        onEditAll={() => {
                            setEditorTarget('ALL');
                            setMode('EDIT');
                        }}
                        onQueryChange={setQuery}
                        onSaveError={onSaveError}
                        onSaved={onEntriesChange}
                        onDeleted={(snapshot, entryId, message) => {
                            onEntriesChange(snapshot, message);
                            const deletedIndex = entries.findIndex(entry => entry.id === entryId);
                            const nextSelected = snapshot.entries[deletedIndex]
                                ?? snapshot.entries[deletedIndex - 1]
                                ?? null;
                            setSelectedId(nextSelected?.id ?? null);
                            setIsMobileListOpen(false);
                        }}
                        onSelect={(entryId) => {
                            setSelectedId(entryId);
                            setIsMobileListOpen(false);
                        }}
                        onSnapshotChange={onSnapshotChange}
                    />
                )}
                </motion.section>
            </motion.div>
            {isTourOpen && (
                <UserSheetTour
                    hasEntries={entries.length > 0}
                    onComplete={closeTour}
                    onDismiss={closeTour}
                    onOpenRules={openRules}
                    onStepChange={handleTourStepChange}
                />
            )}
        </>
    );
}
