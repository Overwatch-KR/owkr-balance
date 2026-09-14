import { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    BookOpen,
    FileSpreadsheet,
    List,
    Loader2,
    RefreshCcw,
} from 'lucide-react';
import {
    formatUserSheetChangeSummary,
    getUserSheetChangeSummary,
    normalizeUserSheetBattleTag,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from '../../utils/user-sheet';
import { DouMascot } from '../common/dou-mascot';
import { PageHeader } from '../layout/page-header';
import { UserSheetBrowser } from './user-sheet-browser';
import { UserSheetEditor } from './user-sheet-editor';
import { UserSheetGuide } from './user-sheet-guide';
import {
    UserSheetTour,
    type UserSheetTourStepId,
} from './user-sheet-tour';

type UserSheetMode = 'BROWSE' | 'EDIT' | 'GUIDE';

interface UserSheetPageProps {
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
 * @description 유저 시트의 검색·상세·전체 편집과 단계별 가이드를 독립 관리 페이지에서 제공한다.
 */
export function UserSheetPage({
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
}: UserSheetPageProps) {
    const initialEntry = entries.find(entry => entry.id === initialEntryId)
        ?? (initialBattleTag ? entries.find(entry => (
            normalizeUserSheetBattleTag(entry.battleTag)
            === normalizeUserSheetBattleTag(initialBattleTag)
        )) : entries[0]);
    const [mode, setMode] = useState<UserSheetMode>('BROWSE');
    const [selectedId, setSelectedId] = useState<string | null>(initialEntry?.id ?? null);
    const [isMobileListOpen, setIsMobileListOpen] = useState(
        () => !initialBattleTag && !initialEntryId,
    );
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
            setMode('EDIT');
            return;
        }
        setIsMobileListOpen(stepId === 'search' || stepId === 'entry-actions');
        setMode('BROWSE');
    }, []);

    useEffect(() => {
        if (mode !== 'GUIDE' || isTourOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMode('BROWSE');
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isTourOpen, mode]);

    const showMobileDetail = mode === 'EDIT'
        || (Boolean(selectedEntry) && !isMobileListOpen);
    const isGuideActive = mode === 'GUIDE' || isTourOpen;

    return (
        <main className="min-h-screen bg-surface px-4 py-6 text-slate-200 md:px-8 md:py-8">
            <div className="mx-auto max-w-[1600px]">
                <div id="user-sheet-overview">
                    <PageHeader
                        breadcrumbs={[
                            { label: '대진표', onClick: onClose },
                            { label: '유저 시트' },
                        ]}
                        title="유저 시트"
                        description="자주 만나는 플레이어의 BattleTag, 티어, 메모를 저장합니다."
                        meta={(
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                                <FileSpreadsheet size={13} aria-hidden="true" />
                                저장된 유저 {entries.length}명
                            </span>
                        )}
                        actions={(
                            <div id="user-sheet-header-actions" className="flex flex-wrap items-center gap-2">
                                {showMobileDetail && mode === 'BROWSE' ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsMobileListOpen(true)}
                                        className="btn-ghost sm:hidden"
                                    >
                                        <List size={15} aria-hidden="true" />
                                        목록
                                    </button>
                                ) : null}
                                {mode !== 'EDIT' || isGuideActive ? (
                                    <button
                                        id="user-sheet-guide-button"
                                        type="button"
                                        onClick={() => {
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
                                        className={`btn-ghost ${isGuideActive ? 'bg-cyan-500/10 text-cyan-200' : ''}`}
                                        aria-label="유저 시트 사용법"
                                        aria-pressed={isGuideActive}
                                    >
                                        <BookOpen size={15} aria-hidden="true" />
                                        사용법
                                    </button>
                                ) : null}
                                {mode === 'BROWSE' ? (
                                    <button
                                        id="user-sheet-refresh"
                                        type="button"
                                        onClick={onRetry}
                                        disabled={isLoading}
                                        className="btn-ghost disabled:cursor-wait disabled:opacity-50"
                                    >
                                        {isLoading
                                            ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                                            : <RefreshCcw size={15} aria-hidden="true" />}
                                        {isLoading ? '불러오는 중' : '새로고침'}
                                    </button>
                                ) : null}
                            </div>
                        )}
                    />
                </div>

                {error ? (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" role="alert">
                        <span className="inline-flex items-center gap-2">
                            <AlertCircle size={15} aria-hidden="true" />
                            {error}
                        </span>
                        <button
                            type="button"
                            onClick={onRetry}
                            disabled={isLoading}
                            className="btn-ghost min-h-9 text-xs disabled:opacity-50"
                        >
                            {isLoading
                                ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                                : <RefreshCcw size={13} aria-hidden="true" />}
                            다시 불러오기
                        </button>
                    </div>
                ) : null}

                <section className="card flex min-h-[22rem] flex-col overflow-hidden p-0 sm:h-[calc(100dvh-12rem)] sm:min-h-[32rem]">
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
                                const nextSelected = previousIndex >= 0
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
                            onEditAll={() => setMode('EDIT')}
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
                </section>
            </div>

            {isTourOpen ? (
                <UserSheetTour
                    hasEntries={entries.length > 0}
                    onComplete={closeTour}
                    onDismiss={closeTour}
                    onOpenRules={openRules}
                    onStepChange={handleTourStepChange}
                />
            ) : null}
        </main>
    );
}
