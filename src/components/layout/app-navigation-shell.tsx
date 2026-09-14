import {
    type MouseEvent as ReactMouseEvent,
    type Ref,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    BookOpen,
    CalendarCheck2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    FileSpreadsheet,
    LogOut,
    MoreHorizontal,
    Radio,
    Swords,
    UserRound,
    Users,
    X,
} from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';

export const APP_PATH_CHANGE_EVENT = 'owkr:navigation:path-change';
export const OPEN_GUIDE_EVENT = 'owkr:navigation:open-guide';
export const NAVIGATION_STATE_EVENT = 'owkr:navigation:state';
export const PENDING_NAVIGATION_ACTION_KEY = 'owkr:navigation:pending-action';

const NAVIGATION_COLLAPSED_KEY = 'owkr:navigation:collapsed';

export interface AppNavigationStateDetail {
    isGuideOpen: boolean;
    isLiveConnected: boolean;
    isLivePublishing: boolean;
    liveSessionCode?: string;
    liveSyncError: string;
    userSheetHasError: boolean;
}

interface AppNavigationShellProps {
    children: ReactNode;
}

interface LiveSessionStatusBarProps {
    state: AppNavigationStateDetail;
    onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

interface UserProfileAvatarProps {
    avatarUrl?: string;
    className: string;
    userName: string;
}

interface NavigationButtonProps {
    active?: boolean;
    ariaControls?: string;
    ariaExpanded?: boolean;
    ariaHasPopup?: 'dialog';
    buttonRef?: Ref<HTMLButtonElement>;
    collapsed?: boolean;
    icon: typeof Swords;
    label: string;
    onClick: () => void;
    showError?: boolean;
}

interface NavigationLinkProps extends Omit<NavigationButtonProps, 'ariaControls' | 'ariaExpanded' | 'ariaHasPopup' | 'buttonRef' | 'onClick'> {
    href: string;
    onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

const normalizePathname = () => window.location.pathname.replace(/\/+$/, '') || '/';

const UserProfileAvatar = ({
    avatarUrl,
    className,
    userName,
}: UserProfileAvatarProps) => (
    <div
        role="img"
        aria-label={`${userName} 프로필`}
        title={`${userName} 프로필`}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-400/10 font-bold text-cyan-200 ring-1 ring-cyan-400/20 ${className}`}
    >
        <span aria-hidden="true">
            {userName.slice(0, 1).toUpperCase() || <UserRound size={16} />}
        </span>
        {avatarUrl ? (
            <img
                src={avatarUrl}
                alt=""
                aria-hidden="true"
                width={40}
                height={40}
                decoding="async"
                referrerPolicy="no-referrer"
                data-discord-avatar="true"
                className="absolute inset-0 h-full w-full object-cover"
                onError={event => {
                    event.currentTarget.hidden = true;
                }}
            />
        ) : null}
    </div>
);

/**
 * @description 어느 관리자 페이지에서든 현재 공동 작업 연결과 저장 상태를 표시한다.
 */
export const LiveSessionStatusBar = ({
    state,
    onNavigate,
}: LiveSessionStatusBarProps) => {
    if (!state.isLiveConnected && !state.liveSyncError) return null;

    const hasError = Boolean(state.liveSyncError);
    const statusLabel = hasError
        ? '실시간 공유 연결 확인 필요'
        : state.isLivePublishing
            ? '실시간 변경 저장 중…'
            : '실시간 공유 중';

    return (
        <div
            className={`sticky top-0 z-[60] border-b backdrop-blur-xl ${
                hasError
                    ? 'border-amber-500/25 bg-amber-950/90'
                    : 'border-emerald-500/20 bg-slate-950/[0.92]'
            }`}
            role="status"
            aria-live="polite"
        >
            <div className="mx-auto flex min-h-11 max-w-[1600px] items-center justify-between gap-3 px-4 md:px-8">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        hasError ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                    }`}>
                        <Radio size={13} aria-hidden="true" />
                    </span>
                    <span className={`truncate text-xs font-medium sm:text-sm ${
                        hasError ? 'text-amber-200' : 'text-emerald-200'
                    }`}>
                        {statusLabel}
                    </span>
                    {state.liveSessionCode && (
                        <code
                            translate="no"
                            className="hidden rounded bg-white/[0.06] px-2 py-1 font-mono text-xs tracking-[0.08em] text-slate-300 sm:inline"
                        >
                            {state.liveSessionCode}
                        </code>
                    )}
                </div>
                <a
                    href="/"
                    onClick={onNavigate}
                    className="shrink-0 rounded-md px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                >
                    대진표 보기
                </a>
            </div>
        </div>
    );
};

const NavigationButton = ({
    active = false,
    ariaControls,
    ariaExpanded,
    ariaHasPopup,
    buttonRef,
    collapsed = false,
    icon: Icon,
    label,
    onClick,
    showError = false,
}: NavigationButtonProps) => (
    <button
        ref={buttonRef}
        type="button"
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
        aria-label={label}
        title={collapsed ? label : undefined}
        onClick={onClick}
        className={`relative flex min-h-11 w-full items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
            collapsed ? 'justify-center px-2' : 'gap-3 px-3'
        } ${
            active
                ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-inset ring-cyan-400/20'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
        }`}
    >
        <Icon size={18} className="shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
        {showError && (
            <span
                className={`absolute h-2 w-2 rounded-full bg-amber-400 ${collapsed ? 'right-2 top-2' : 'right-3'}`}
                aria-label="연결 오류"
            />
        )}
    </button>
);

const NavigationLink = ({
    active = false,
    collapsed = false,
    href,
    icon: Icon,
    label,
    onNavigate,
    showError = false,
}: NavigationLinkProps) => (
    <a
        href={href}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        title={collapsed ? label : undefined}
        onClick={onNavigate}
        className={`relative flex min-h-11 w-full items-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
            collapsed ? 'justify-center px-2' : 'gap-3 px-3'
        } ${
            active
                ? 'bg-cyan-400/10 text-cyan-100 ring-1 ring-inset ring-cyan-400/20'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
        }`}
    >
        <Icon size={18} className="shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
        {showError && (
            <span
                className={`absolute h-2 w-2 rounded-full bg-amber-400 ${collapsed ? 'right-2 top-2' : 'right-3'}`}
                aria-label="연결 오류"
            />
        )}
    </a>
);

const MobileNavigationButton = ({
    active = false,
    ariaControls,
    ariaExpanded,
    ariaHasPopup,
    buttonRef,
    icon: Icon,
    label,
    onClick,
    showError = false,
}: Omit<NavigationButtonProps, 'collapsed'>) => (
    <button
        ref={buttonRef}
        type="button"
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
        onClick={onClick}
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
            active ? 'text-cyan-200' : 'text-slate-400 hover:text-slate-200'
        }`}
    >
        <Icon size={19} aria-hidden="true" />
        <span className="max-w-full truncate">{label}</span>
        {showError && (
            <span className="absolute right-[calc(50%-14px)] top-2 h-2 w-2 rounded-full bg-amber-400" aria-label="연결 오류" />
        )}
    </button>
);

const MobileNavigationLink = ({
    active = false,
    href,
    icon: Icon,
    label,
    onNavigate,
    showError = false,
}: Omit<NavigationLinkProps, 'collapsed'>) => (
    <a
        href={href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
            active ? 'text-cyan-200' : 'text-slate-400 hover:text-slate-200'
        }`}
    >
        <Icon size={19} aria-hidden="true" />
        <span className="max-w-full truncate">{label}</span>
        {showError && (
            <span className="absolute right-[calc(50%-14px)] top-2 h-2 w-2 rounded-full bg-amber-400" aria-label="연결 오류" />
        )}
    </a>
);

/**
 * @description 인증된 관리자 화면을 데스크톱 사이드바와 모바일 바텀 내비게이션으로 감싼다.
 */
export function AppNavigationShell({ children }: AppNavigationShellProps) {
    const { authMode, dataMode, isLoading, logout, user } = useAuth();
    const moreDialogRef = useRef<HTMLElement>(null);
    const moreTriggerRef = useRef<HTMLButtonElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const [pathname, setPathname] = useState(normalizePathname);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            return localStorage.getItem(NAVIGATION_COLLAPSED_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [navigationState, setNavigationState] = useState<AppNavigationStateDetail>({
        isGuideOpen: false,
        isLiveConnected: false,
        isLivePublishing: false,
        liveSyncError: '',
        userSheetHasError: false,
    });

    useEffect(() => {
        const syncPathname = () => setPathname(normalizePathname());
        const originalPushState = window.history.pushState;
        const patchedPushState: History['pushState'] = function (data, unused, url) {
            originalPushState.call(window.history, data, unused, url);
            window.dispatchEvent(new Event(APP_PATH_CHANGE_EVENT));
        };

        window.history.pushState = patchedPushState;
        window.addEventListener('popstate', syncPathname);
        window.addEventListener(APP_PATH_CHANGE_EVENT, syncPathname);
        return () => {
            window.history.pushState = originalPushState;
            window.removeEventListener('popstate', syncPathname);
            window.removeEventListener(APP_PATH_CHANGE_EVENT, syncPathname);
        };
    }, []);

    useEffect(() => {
        const handleNavigationState = (event: Event) => {
            const detail = (event as CustomEvent<AppNavigationStateDetail>).detail;
            if (detail) setNavigationState(detail);
        };
        window.addEventListener(NAVIGATION_STATE_EVENT, handleNavigationState);
        return () => window.removeEventListener(NAVIGATION_STATE_EVENT, handleNavigationState);
    }, []);

    useEffect(() => {
        if (!isMoreOpen) return;

        previousFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const dialog = moreDialogRef.current;
        const getFocusableElements = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []);
        const animationFrame = window.requestAnimationFrame(() => {
            getFocusableElements()[0]?.focus();
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsMoreOpen(false);
                return;
            }
            if (event.key !== 'Tab') return;

            const focusableElements = getFocusableElements();
            const firstElement = focusableElements[0];
            const lastElement = focusableElements.at(-1);
            if (!firstElement || !lastElement) {
                event.preventDefault();
                return;
            }
            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(animationFrame);
            document.removeEventListener('keydown', handleKeyDown);
            const previousFocus = previousFocusRef.current;
            previousFocusRef.current = null;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [isMoreOpen]);

    useEffect(() => {
        const desktopMedia = window.matchMedia('(min-width: 1024px)');
        const closeMobileMenu = (event: MediaQueryListEvent) => {
            if (event.matches) setIsMoreOpen(false);
        };
        desktopMedia.addEventListener('change', closeMobileMenu);
        return () => desktopMedia.removeEventListener('change', closeMobileMenu);
    }, []);

    const userName = user?.globalName ?? user?.username ?? '관리자';
    const accountStatus = useMemo(() => {
        if (authMode === 'discord') return 'Discord 관리자';
        return dataMode === 'local' ? '로컬 전용' : '로컬 인증';
    }, [authMode, dataMode]);
    const isWorkspacePath = pathname === '/' || pathname === '/participants';
    const isUserSheetActive = pathname === '/user-sheet';
    const isGuideActive = isWorkspacePath && navigationState.isGuideOpen;
    const hasWorkspaceOverlay = isGuideActive;

    const isRouteActive = (route: string) => pathname === route && !hasWorkspaceOverlay;

    const navigate = (nextPathname: string) => {
        const normalized = nextPathname.replace(/\/+$/, '') || '/';
        setIsMoreOpen(false);
        if (normalized === pathname) return;
        window.history.pushState({}, '', normalized);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const handleNavigationLink = (
        event: ReactMouseEvent<HTMLAnchorElement>,
        nextPathname: string,
    ) => {
        if (
            event.defaultPrevented
            || event.button !== 0
            || event.metaKey
            || event.ctrlKey
            || event.shiftKey
            || event.altKey
        ) {
            return;
        }
        event.preventDefault();
        navigate(nextPathname);
    };

    const requestGuide = () => {
        setIsMoreOpen(false);
        if (isWorkspacePath) {
            window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
            return;
        }

        try {
            sessionStorage.setItem(PENDING_NAVIGATION_ACTION_KEY, 'guide');
        } catch {
            // 저장소를 사용할 수 없어도 대진표 이동은 유지한다.
        }
        navigate('/');
    };

    const toggleCollapsed = () => {
        setIsCollapsed(current => {
            const next = !current;
            try {
                localStorage.setItem(NAVIGATION_COLLAPSED_KEY, String(next));
            } catch {
                // 저장소 사용이 차단된 환경에서도 현재 세션의 접힘 상태는 유지한다.
            }
            return next;
        });
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await logout();
            window.location.assign('/');
        } catch {
            window.alert('로그아웃하지 못했습니다. 다시 시도해 주세요.');
            setIsLoggingOut(false);
        }
    };

    if (isLoading || !user) return <>{children}</>;

    return (
        <div className="min-h-screen bg-surface">
            <aside
                aria-label="주요 메뉴"
                className={`fixed inset-y-0 left-0 z-[70] hidden border-r border-slate-800/70 bg-slate-950/95 backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col ${
                    isCollapsed ? 'w-20' : 'w-52'
                }`}
            >
                <div
                    data-sidebar-header="true"
                    className={`relative flex h-20 items-center border-b border-slate-800/60 ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}
                >
                    <a
                        href="/"
                        aria-label="대진표로 이동"
                        title={isCollapsed ? 'OWKR Balance' : undefined}
                        onClick={event => handleNavigationLink(event, '/')}
                        data-sidebar-logo={isCollapsed ? 'compact' : 'full'}
                        className="min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    >
                        {isCollapsed ? (
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-400/10 text-cyan-200 ring-1 ring-inset ring-cyan-400/25">
                                <Swords size={20} aria-hidden="true" />
                            </span>
                        ) : (
                            <span className="block bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                                OWKR Balance
                            </span>
                        )}
                    </a>
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        data-sidebar-toggle="true"
                        className="absolute -right-3 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700/80 bg-slate-950 text-slate-500 shadow-lg transition hover:border-slate-600 hover:bg-slate-900 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                        title={isCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
                    >
                        {isCollapsed ? (
                            <ChevronRight size={18} aria-hidden="true" />
                        ) : (
                            <ChevronLeft size={18} aria-hidden="true" />
                        )}
                    </button>
                </div>

                <nav className="flex min-h-0 flex-1 flex-col px-3 py-4" aria-label="관리자 기능">
                    <div className="space-y-1">
                        <NavigationLink
                            active={isRouteActive('/')}
                            collapsed={isCollapsed}
                            href="/"
                            icon={Swords}
                            label="대진표"
                            onNavigate={event => handleNavigationLink(event, '/')}
                        />
                        <NavigationLink
                            active={isRouteActive('/participants')}
                            collapsed={isCollapsed}
                            href="/participants"
                            icon={Users}
                            label="참가자"
                            onNavigate={event => handleNavigationLink(event, '/participants')}
                        />
                        <NavigationLink
                            active={isRouteActive('/scrims')}
                            collapsed={isCollapsed}
                            href="/scrims"
                            icon={CalendarDays}
                            label="내전"
                            onNavigate={event => handleNavigationLink(event, '/scrims')}
                        />
                        <NavigationLink
                            active={isUserSheetActive}
                            collapsed={isCollapsed}
                            href="/user-sheet"
                            icon={FileSpreadsheet}
                            label="유저 시트"
                            onNavigate={event => handleNavigationLink(event, '/user-sheet')}
                            showError={navigationState.userSheetHasError}
                        />
                    </div>

                    <div className="mt-5 border-t border-slate-800/60 pt-4">
                        {!isCollapsed && (
                            <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.08em] text-slate-500">
                                기타
                            </p>
                        )}
                        <NavigationLink
                            active={isRouteActive('/event-participants')}
                            collapsed={isCollapsed}
                            href="/event-participants"
                            icon={CalendarCheck2}
                            label="이벤트 참여자"
                            onNavigate={event => handleNavigationLink(event, '/event-participants')}
                        />
                    </div>

                    <div className="mt-auto space-y-2 pt-4">
                        <NavigationButton
                            active={isGuideActive}
                            ariaExpanded={isGuideActive}
                            ariaHasPopup="dialog"
                            collapsed={isCollapsed}
                            icon={BookOpen}
                            label="대진표 사용법"
                            onClick={requestGuide}
                        />

                        <div className={`rounded-xl border border-slate-800/70 bg-slate-900/70 ${isCollapsed ? 'p-2' : 'p-3'}`}>
                            <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-3'}`}>
                                <UserProfileAvatar
                                    avatarUrl={user.avatarUrl}
                                    className="h-9 w-9 text-sm"
                                    userName={userName}
                                />
                                {!isCollapsed && (
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-100">{userName}</p>
                                        <p className="mt-0.5 truncate text-[11px] text-slate-500">{accountStatus}</p>
                                    </div>
                                )}
                                {authMode === 'discord' && (
                                    <button
                                        type="button"
                                        onClick={() => void handleLogout()}
                                        disabled={isLoggingOut}
                                        aria-label="로그아웃"
                                        title="로그아웃"
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:cursor-wait disabled:opacity-40"
                                    >
                                        <LogOut size={16} aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </nav>
            </aside>

            <div className={`min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] transition-[padding] duration-200 lg:pb-0 ${
                isCollapsed ? 'lg:pl-20' : 'lg:pl-52'
            }`}>
                <LiveSessionStatusBar
                    state={navigationState}
                    onNavigate={event => handleNavigationLink(event, '/')}
                />
                {children}
            </div>

            <nav
                className="fixed inset-x-0 bottom-0 z-[70] flex min-h-16 border-t border-slate-800/80 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
                aria-label="주요 메뉴"
            >
                <MobileNavigationLink
                    active={isRouteActive('/')}
                    href="/"
                    icon={Swords}
                    label="대진표"
                    onNavigate={event => handleNavigationLink(event, '/')}
                />
                <MobileNavigationLink
                    active={isRouteActive('/participants')}
                    href="/participants"
                    icon={Users}
                    label="참가자"
                    onNavigate={event => handleNavigationLink(event, '/participants')}
                />
                <MobileNavigationLink
                    active={isRouteActive('/scrims')}
                    href="/scrims"
                    icon={CalendarDays}
                    label="내전"
                    onNavigate={event => handleNavigationLink(event, '/scrims')}
                />
                <MobileNavigationLink
                    active={isUserSheetActive}
                    href="/user-sheet"
                    icon={FileSpreadsheet}
                    label="유저 시트"
                    onNavigate={event => handleNavigationLink(event, '/user-sheet')}
                    showError={navigationState.userSheetHasError}
                />
                <MobileNavigationButton
                    active={isMoreOpen || pathname === '/event-participants' || isGuideActive}
                    ariaControls="mobile-more-dialog"
                    ariaExpanded={isMoreOpen}
                    ariaHasPopup="dialog"
                    icon={MoreHorizontal}
                    label="더보기"
                    onClick={() => setIsMoreOpen(current => !current)}
                    buttonRef={moreTriggerRef}
                />
            </nav>

            {isMoreOpen && (
                <div className="fixed inset-0 z-[75] lg:hidden">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
                        aria-label="더보기 메뉴 닫기"
                        onClick={() => setIsMoreOpen(false)}
                    />
                    <section
                        id="mobile-more-dialog"
                        ref={moreDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="mobile-more-title"
                        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-slate-700/70 bg-slate-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
                    >
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" aria-hidden="true" />
                        <div className="mb-2 flex items-center justify-between">
                            <h2 id="mobile-more-title" className="text-sm font-semibold text-white">더보기</h2>
                            <button
                                type="button"
                                onClick={() => setIsMoreOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                                aria-label="더보기 메뉴 닫기"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="space-y-1">
                            <NavigationLink
                                active={isRouteActive('/event-participants')}
                                href="/event-participants"
                                icon={CalendarCheck2}
                                label="이벤트 참여자"
                                onNavigate={event => handleNavigationLink(event, '/event-participants')}
                            />
                            <NavigationButton
                                active={isGuideActive}
                                ariaExpanded={isGuideActive}
                                ariaHasPopup="dialog"
                                icon={BookOpen}
                                label="대진표 사용법"
                                onClick={requestGuide}
                            />
                        </div>

                        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
                            <UserProfileAvatar
                                avatarUrl={user.avatarUrl}
                                className="h-10 w-10 text-base"
                                userName={userName}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-white">{userName}</p>
                                <p className="mt-0.5 text-xs text-slate-500">{accountStatus}</p>
                            </div>
                            {authMode === 'discord' && (
                                <button
                                    type="button"
                                    onClick={() => void handleLogout()}
                                    disabled={isLoggingOut}
                                    className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 disabled:cursor-wait disabled:opacity-40"
                                >
                                    <LogOut size={16} aria-hidden="true" />
                                    {isLoggingOut ? '처리 중' : '로그아웃'}
                                </button>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
