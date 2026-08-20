import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { swapMatchResultPlayers } from '../domains/balance/shared/public';
import {
    isMatchResultStale,
} from './utils/player';
import {
    createUserSheetPlayerLookup,
    normalizeUserSheetBattleTag,
} from './utils/user-sheet';
import { useOnboardingGuide } from './hooks/use-onboarding-guide';
import { useToast } from './hooks/use-toast';
import { useMatchActions } from './hooks/use-match-actions';
import { useRosterManagement } from './hooks/use-roster-management';
import { useAuth, type AuthMode, type AuthUser, type DataMode } from './hooks/use-auth';
import { useMatchSession } from './hooks/use-match-session';
import { useUserSheet } from './hooks/use-user-sheet';
import { getErrorMessage } from './utils/api';
import { clearPlayerNoteCache } from './utils/player-note';
import { readUiPreferences, writeShowAllRanksPreference } from './utils/storage/ui-preferences';
import type { SwapSource } from './types';
import {
    RosterIdentityResolver,
} from './components/player/form/roster-identity-resolver';
import PlayerList from './components/player/list';
import { ParticipantDashboardSummary } from './components/player/participant-dashboard-summary';
import { ParticipantWorkspace } from './components/player/participant-workspace';
import { OnboardingGuide } from './components/onboarding-guide';
import { GuideResumePrompt } from './components/guide-resume-prompt';
import { AppToast } from './components/app-toast';
import LoginScreen from './components/auth/login-screen';
import LoadingScreen from './components/common/loading-screen';
import {
    ErrorDetailsModal,
    type ErrorDetails,
} from './components/common/error-details-modal';
import { AppHeader } from './components/layout/app-header';
import { MatchResultPanel } from './components/match/match-result-panel';
import { EventParticipantsPage } from './components/event/event-participants-page';
import { ScrimManager } from './components/scrim/scrim-manager';

const UserSheetModal = lazy(() => import('./components/user-sheet/user-sheet-modal').then(module => ({
    default: module.UserSheetModal,
})));
const EventParticipantRegistrationModal = lazy(() => (
    import('./components/event/event-participant-registration-modal').then(module => ({
        default: module.EventParticipantRegistrationModal,
    }))
));

interface MatchAppProps {
    authMode: AuthMode;
    csrfToken: string;
    dataMode: DataMode;
    isPageNavigating: boolean;
    logout: () => Promise<void>;
    navigate: (pathname: string) => void;
    pathname: string;
    user: AuthUser;
}

const PageLoadingBar = () => (
    <motion.div
        aria-label="페이지 이동 중"
        className="fixed inset-x-0 top-0 z-[200] h-1 origin-left bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 shadow-lg shadow-cyan-400/40"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 0.88, opacity: 1 }}
        exit={{ scaleX: 1, opacity: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
    />
);

const MatchApp = ({
    authMode,
    csrfToken,
    dataMode,
    isPageNavigating,
    logout,
    navigate,
    pathname,
    user,
}: MatchAppProps) => {
    const {
        alternatives,
        balanceTeams,
        isBalancing,
        participantIncludesAdmin,
        participantMentions,
        players,
        result,
        setAlternatives,
        setParticipantIncludesAdmin,
        setParticipantMentions,
        setPlayers,
        setResult,
    } = useMatchSession(user.id);

    const [swapSource, setSwapSource] = useState<SwapSource | null>(null);
    const [showAllRanks, setShowAllRanks] = useState(() => readUiPreferences().showAllRanks);
    const [ignorePreferences, setIgnorePreferences] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [isEventRegistrationOpen, setIsEventRegistrationOpen] = useState(false);
    const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
    const playerEditReturnPathRef = useRef(pathname);
    const isGuideActiveRef = useRef(false);
    const userSheet = useUserSheet();
    const { dismissToast, showToast, toast } = useToast();
    const showDetailedError = useCallback((message: string, details: ErrorDetails) => {
        showToast('error', message, {
            label: '자세히 보기',
            onClick: () => setErrorDetails(details),
        });
    }, [showToast]);
    const handlePlayerEditCompleted = useCallback(() => {
        navigate(playerEditReturnPathRef.current);
    }, [navigate]);
    const handleRosterCompleted = useCallback(() => {
        if (!isGuideActiveRef.current) navigate('/');
    }, [navigate]);
    const {
        addPlayer,
        cancelIdentityImport,
        editingPlayerId,
        failedParses,
        handleApplyIdentityRosterOnly,
        handleIdentityImportConfirm,
        handlePaste,
        identityImportError,
        inputMode,
        inputSummary,
        inputs,
        isApplyingIdentityImport,
        isInputCollapsed,
        isPasteValidationPending,
        manualInputError,
        pasteValidationIssues,
        pasteText,
        pendingIdentityImport,
        requestRosterIdentityReview,
        resetPlayerInputs,
        selectInputMode: handleGuideInputMode,
        setFailedParses,
        setInputMode,
        setInputSummary,
        setInputs,
        setIsInputCollapsed,
        setManualInputError,
        startEditingPlayer,
        updatePasteText,
    } = useRosterManagement({
        csrfToken,
        match: {
            alternatives,
            players,
            result,
            setAlternatives,
            setPlayers,
            setResult,
        },
        onPlayerEditCompleted: handlePlayerEditCompleted,
        onRosterCompleted: handleRosterCompleted,
        setSwapSource,
        showDetailedError,
        userSheet: {
            sheetVersion: userSheet.sheetVersion,
            updateSnapshot: userSheet.updateSnapshot,
        },
    });

    const {
        handleClearAll,
        handleClearResult,
        handleRemovePlayer,
        handleRunMatching,
        handleSelectAlternative,
        handleSlotClick,
        handleUseExampleRoster,
    } = useMatchActions({
        balanceTeams,
        match: {
            alternatives,
            players,
            result,
            setAlternatives,
            setPlayers,
            setResult,
        },
        playerInput: {
            editingPlayerId,
            inputSummary,
            isInputCollapsed,
            resetPlayerInputs,
            setInputSummary,
            setIsInputCollapsed,
        },
        requestRosterIdentityReview,
        setSwapSource,
        showDetailedError,
        showToast,
        swapSource,
    });

    const {
        activeGuide,
        completeGuide: handleCompleteGuide,
        dismissGuide: handleDismissGuide,
        handleGuideStepChange,
        initialGuideStep,
        isGuideOpen,
        isGuideResumePromptOpen,
        restartGuide: handleRestartGuide,
        resumableProgress,
        resumeGuide: handleResumeGuide,
        toggleGuide: handleToggleGuide,
    } = useOnboardingGuide({
        alternativeCount: alternatives.length,
        hasResult: Boolean(result),
        onApplyAlternative: () => handleSelectAlternative(0),
        onPrepareOpen: () => {
            setSwapSource(null);
            if (!result) setIsInputCollapsed(false);
            navigate(result ? '/' : '/participants');
        },
        onSelectInputMode: (mode) => {
            handleGuideInputMode(mode);
            navigate('/participants');
        },
        onSwapExample: () => {
            if (!result) return;
            setResult(swapMatchResultPlayers(
                result,
                { teamIdx: 0, role: 'TANK', index: 0 },
                { teamIdx: 1, role: 'TANK', index: 0 },
            ));
            setSwapSource(null);
        },
        onUseExampleRoster: handleUseExampleRoster,
        playerCount: players.length,
    });
    useEffect(() => {
        isGuideActiveRef.current = isGuideOpen || isGuideResumePromptOpen;
    }, [isGuideOpen, isGuideResumePromptOpen]);
    const handleInterruptGuide = useCallback(() => {
        handleDismissGuide();
    }, [handleDismissGuide]);
    const handleAppGuideStepChange = useCallback((
        step: Parameters<typeof handleGuideStepChange>[0],
    ) => {
        if (step === 'start-matching' || step.startsWith('result-')) navigate('/');
        else if (step.startsWith('start-')) navigate('/participants');
        handleGuideStepChange(step);
    }, [handleGuideStepChange, navigate]);

    // 참여 명단 (첫 10명)과 대기 명단 (나머지) 분리
    const participants = players.slice(0, 10);
    const waitlist = players.slice(10);
    const isReady = participants.length === 10;
    const isResultStale = result ? isMatchResultStale(result, participants) : false;
    const userSheetByBattleTag = useMemo(
        () => createUserSheetPlayerLookup(userSheet.entries),
        [userSheet.entries],
    );
    const participantBattleTags = useMemo(() => new Set(
        players.slice(0, 10).map(player => normalizeUserSheetBattleTag(player.name)),
    ), [players]);
    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            userSheet.close();
            await logout();
            clearPlayerNoteCache(user.id);
        } catch (error) {
            showToast('error', getErrorMessage(error, '로그아웃하지 못했습니다. 다시 시도해 주세요.'));
            setIsLoggingOut(false);
        }
    };
    const currentAdminName = user.globalName ?? user.username;
    const handleShowAllRanksChange = useCallback((show: boolean) => {
        setShowAllRanks(show);
        writeShowAllRanksPreference(show);
    }, []);
    const handleStartEditingPlayer = useCallback((player: Parameters<typeof startEditingPlayer>[0]) => {
        playerEditReturnPathRef.current = pathname;
        startEditingPlayer(player);
        navigate('/participants');
    }, [navigate, pathname, startEditingPlayer]);
    const playerFormProps = {
        players,
        participantMentions,
        setParticipantMentions,
        participantIncludesAdmin,
        setParticipantIncludesAdmin,
        currentAdminName,
        inputs,
        setInputs,
        addPlayer,
        pasteText,
        pasteValidationIssues,
        isPasteValidationPending,
        onPasteTextChange: updatePasteText,
        handlePaste,
        failedParses,
        setFailedParses,
        isCollapsed: isInputCollapsed,
        summary: inputSummary,
        onExpand: () => setIsInputCollapsed(false),
        onCollapse: () => setIsInputCollapsed(true),
        mode: inputMode,
        onModeChange: setInputMode,
        isEditing: editingPlayerId !== null,
        manualInputError,
        onCancelEdit: resetPlayerInputs,
        onClearManualInputError: () => setManualInputError(''),
        onRemovePlayer: handleRemovePlayer,
    };
    const playerListProps = {
        participants,
        waitlist,
        onEditPlayer: handleStartEditingPlayer,
        onRemovePlayer: handleRemovePlayer,
        onClearAll: handleClearAll,
        csrfToken,
        noteCacheScope: user.id,
        userSheetByBattleTag,
        onOpenUserSheet: (battleTag: string, entryId?: string) => {
            userSheet.open(battleTag, entryId);
        },
    };

    if (pathname === '/scrims') {
        return (
            <MotionConfig reducedMotion="user">
                <ScrimManager
                    csrfToken={csrfToken}
                    players={players}
                    userId={user.id}
                    onClose={() => navigate('/')}
                />
                <AnimatePresence>{isPageNavigating && <PageLoadingBar />}</AnimatePresence>
            </MotionConfig>
        );
    }

    return (
        <MotionConfig reducedMotion="user">
        <div className="min-h-screen bg-surface text-slate-200 font-sans">
            <a
                href="#main-content"
                className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-0"
            >
                본문으로 건너뛰기
            </a>
            <AppHeader
                authMode={authMode}
                dataMode={dataMode}
                isGuideOpen={isGuideOpen || isGuideResumePromptOpen}
                isLoggingOut={isLoggingOut}
                isUserSheetOpen={userSheet.isOpen}
                onLogout={() => void handleLogout()}
                onOpenEventParticipants={() => navigate('/event-participants')}
                onOpenGuide={handleToggleGuide}
                onOpenScrims={() => navigate('/scrims')}
                onOpenUserSheet={() => {
                    setSwapSource(null);
                    userSheet.open();
                }}
                userName={currentAdminName}
                userSheetHasError={Boolean(userSheet.error)}
            />

            {/* Main Content */}
            <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto max-w-[1600px] scroll-mt-20 px-4 py-6 focus:outline-none md:px-8 md:py-8"
            >
                {pathname === '/participants' ? (
                    <ParticipantWorkspace
                        formProps={playerFormProps}
                        listProps={playerListProps}
                        participantCount={participants.length}
                        waitlistCount={waitlist.length}
                        reviewCount={failedParses.length}
                        onContinueToMatching={() => navigate('/')}
                        onClose={() => navigate('/')}
                    />
                ) : (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(380px,430px)_minmax(0,1fr)] xl:items-start">
                        <div className="flex min-h-0 min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
                            <ParticipantDashboardSummary
                                participantCount={participants.length}
                                waitlistCount={waitlist.length}
                                reviewCount={failedParses.length}
                                onOpen={() => navigate('/participants')}
                            />
                            <PlayerList {...playerListProps} />
                        </div>

                        <MatchResultPanel
                            alternatives={alternatives}
                            ignorePreferences={ignorePreferences}
                            isBalancing={isBalancing}
                            isEventRegistrationAvailable={dataMode === 'remote'}
                            isReady={isReady}
                            isResultStale={isResultStale}
                            onCancelSwap={() => setSwapSource(null)}
                            onClearResult={handleClearResult}
                            onIgnorePreferencesChange={setIgnorePreferences}
                            onOpenEventRegistration={() => setIsEventRegistrationOpen(true)}
                            onRunMatching={() => void handleRunMatching({ ignorePreferences })}
                            onSelectAlternative={handleSelectAlternative}
                            onShowAllRanksChange={handleShowAllRanksChange}
                            onSlotClick={handleSlotClick}
                            participantCount={participants.length}
                            result={result}
                            showAllRanks={showAllRanks}
                            swapSource={swapSource}
                            userSheetByBattleTag={userSheetByBattleTag}
                        />
                    </div>
                )}
            </main>
            <AnimatePresence>
                {userSheet.isOpen && (
                    <Suspense
                        fallback={(
                            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 text-sm text-slate-400 backdrop-blur-sm">
                                유저 시트를 여는 중…
                            </div>
                        )}
                    >
                        <UserSheetModal
                            key={userSheet.selectedEntryId ?? userSheet.selectedBattleTag ?? 'all-users'}
                            csrfToken={csrfToken}
                            entries={userSheet.entries}
                            error={userSheet.error}
                            initialBattleTag={userSheet.selectedBattleTag}
                            initialEntryId={userSheet.selectedEntryId}
                            isLoading={userSheet.isLoading}
                            noteCacheScope={user.id}
                            participantBattleTags={participantBattleTags}
                            sheetVersion={userSheet.sheetVersion}
                            onEntriesChange={(snapshot, message) => {
                                userSheet.updateSnapshot(snapshot);
                                showToast('success', message);
                            }}
                            onRetry={() => void userSheet.retry()}
                            onSaveError={(message) => {
                                showDetailedError(message, {
                                    title: '유저 시트를 저장하지 못했습니다',
                                    description: message,
                                    hint: '동시 수정 충돌은 표시되는 병합 화면에서 내 초안과 최신값을 비교해 해결할 수 있습니다. 그 외에는 배틀태그 오류와 중복 행을 확인해 주세요.',
                                });
                            }}
                            onSnapshotChange={userSheet.updateSnapshot}
                            onClose={userSheet.close}
                        />
                    </Suspense>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isEventRegistrationOpen ? (
                    <Suspense
                        fallback={(
                            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 text-sm text-slate-400 backdrop-blur-sm">
                                이벤트 참여 등록을 여는 중…
                            </div>
                        )}
                    >
                        <EventParticipantRegistrationModal
                            csrfToken={csrfToken}
                            players={participants}
                            onClose={() => setIsEventRegistrationOpen(false)}
                            onSuccess={(addedCount, totalCount) => {
                                setIsEventRegistrationOpen(false);
                                showToast(
                                    'success',
                                    `이번 내전 ${addedCount}명을 등록했습니다. 누적 참여자 ${totalCount}명`,
                                );
                            }}
                        />
                    </Suspense>
                ) : null}
            </AnimatePresence>
            <AnimatePresence>
                {pendingIdentityImport && (
                    <RosterIdentityResolver
                        currentPlayers={players}
                        entries={userSheet.entries}
                        failedLines={pendingIdentityImport.failedLines}
                        isSubmitting={isApplyingIdentityImport}
                        isLocalOnly={dataMode === 'local'}
                        players={pendingIdentityImport.incoming}
                        submitError={identityImportError}
                        onApplyRosterOnly={handleApplyIdentityRosterOnly}
                        onCancel={cancelIdentityImport}
                        onConfirm={resolution => void handleIdentityImportConfirm(resolution)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isGuideResumePromptOpen && resumableProgress && (
                    <GuideResumePrompt
                        key="guide-resume-prompt"
                        progress={resumableProgress}
                        onDismiss={handleDismissGuide}
                        onRestart={handleRestartGuide}
                        onResume={handleResumeGuide}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {activeGuide && (
                    <OnboardingGuide
                        key={activeGuide}
                        initialStep={initialGuideStep ?? undefined}
                        isWorking={isBalancing}
                        variant={activeGuide}
                        onComplete={handleCompleteGuide}
                        onDismiss={handleDismissGuide}
                        onInterrupt={handleInterruptGuide}
                        onStepChange={handleAppGuideStepChange}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {errorDetails && (
                    <ErrorDetailsModal
                        details={errorDetails}
                        onClose={() => setErrorDetails(null)}
                    />
                )}
            </AnimatePresence>
            <AnimatePresence>
                {toast && (
                    <AppToast toast={toast} onDismiss={dismissToast} />
                )}
            </AnimatePresence>
            <AnimatePresence>{isPageNavigating && <PageLoadingBar />}</AnimatePresence>
        </div>
        </MotionConfig>
    );
};

type AuthenticatedAppProps = Omit<
    MatchAppProps,
    'isPageNavigating' | 'navigate' | 'pathname'
>;

/**
 * @description 경로를 먼저 분기해 이벤트 화면에서 매칭·유저 시트 데이터를 불필요하게 불러오지 않는다.
 */
const AuthenticatedApp = (props: AuthenticatedAppProps) => {
    const [pathname, setPathname] = useState(() => (
        window.location.pathname.replace(/\/+$/, '') || '/'
    ));
    const [isPageNavigating, setIsPageNavigating] = useState(false);

    useEffect(() => {
        const syncPathname = () => setPathname(window.location.pathname.replace(/\/+$/, '') || '/');
        window.addEventListener('popstate', syncPathname);
        return () => window.removeEventListener('popstate', syncPathname);
    }, []);

    const navigate = useCallback((nextPathname: string) => {
        if (nextPathname === pathname) return;
        setIsPageNavigating(true);
        window.setTimeout(() => {
            window.history.pushState({}, '', nextPathname);
            setPathname(nextPathname);
            window.setTimeout(() => setIsPageNavigating(false), 180);
        }, 120);
    }, [pathname]);

    if (pathname === '/event-participants') {
        return (
            <MotionConfig reducedMotion="user">
                <EventParticipantsPage
                    csrfToken={props.csrfToken}
                    onClose={() => navigate('/')}
                />
                <AnimatePresence>{isPageNavigating && <PageLoadingBar />}</AnimatePresence>
            </MotionConfig>
        );
    }

    return (
        <MatchApp
            {...props}
            isPageNavigating={isPageNavigating}
            navigate={navigate}
            pathname={pathname}
        />
    );
};

const App = () => {
    const { authMode, csrfToken, dataMode, error, isLoading, logout, retry, user } = useAuth();
    if (isLoading) return <LoadingScreen />;
    if (!user) return <LoginScreen serviceError={error} onRetry={retry} />;
    return (
        <AuthenticatedApp
            authMode={authMode}
            csrfToken={csrfToken}
            dataMode={dataMode}
            logout={logout}
            user={user}
        />
    );
};

export default App;
