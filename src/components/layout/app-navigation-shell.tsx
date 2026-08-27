import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
    BookOpen,
    CalendarCheck2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    FileSpreadsheet,
    LogOut,
    MoreHorizontal,
    Swords,
    UserRound,
    Users,
    X,
} from 'lucide-react';
import { useAuth } from '../../hooks/use-auth';

export const APP_PATH_CHANGE_EVENT = 'owkr:navigation:path-change';
export const OPEN_USER_SHEET_EVENT = 'owkr:navigation:open-user-sheet';
export const OPEN_GUIDE_EVENT = 'owkr:navigation:open-guide';
export const NAVIGATION_STATE_EVENT = 'owkr:navigation:state';
export const PENDING_NAVIGATION_ACTION_KEY = 'owkr:navigation:pending-action';

const NAVIGATION_COLLAPSED_KEY = 'owkr:navigation:collapsed';

type PendingNavigationAction = 'user-sheet' | 'guide';

export interface AppNavigationStateDetail {
    isGuideOpen: boolean;
    isUserSheetOpen: boolean;
    userSheetHasError: boolean;
}

interface AppNavigationShellProps {
    children: ReactNode;
}

interface NavigationButtonProps {
    active?: boolean;
    collapsed?: boolean;
    icon: typeof Swords;
    label: string;
    onClick: () => void;
    showError?: boolean;
}

const normalizePathname = () => window.location.pathname.replace(/\/+$/, '') || '/';

const NavigationButton = ({
    active = false,
    collapsed = false,
    icon: Icon,
    label,
    onClick,
    showError = false,
}: NavigationButtonProps) => (
    <button
        type="button"
        aria-current={active ? 'page' : undefined}
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

const MobileNavigationButton = ({
    active = false,
    icon: Icon,
    label,
    onClick,
    showError = false,
}: Omit<NavigationButtonProps, 'collapsed'>) => (
    <button
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
            active ? 'text-cyan-200' : 'text-slate-500 hover:text-slate-200'
        }`}
    >
        <Icon size={19} aria-hidden="true" />
        <span className="max-w-full truncate">{label}</span>
        {showError && (
            <span className="absolute right-[calc(50%-14px)] top-2 h-2 w-2 rounded-full bg-amber-400" aria-label="연결 오류" />
        )}
    </button>
);

/**
 * @description 인증된 관리자 화면을 데스크톱 사이드바와 모바일 바텀 내비게이션으로 감싼다.
 */
export function AppNavigationShell({ children }: AppNavigationShellProps) {
    const { authMode, dataMode, isLoading, logout, user } = useAuth();
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
        isUserSheetOpen: false,
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

    const userName = user?.globalName ?? user?.username ?? '관리자';
    const accountStatus = useMemo(() => {
        if (authMode === 'discord') return 'Discord 관리자';
        return dataMode === 'local' ? '로컬 전용' : '로컬 인증';
    }, [authMode, dataMode]);
    const isWorkspacePath = pathname === '/' || pathname === '/participants';
    const isUserSheetActive = isWorkspacePath && navigationState.isUserSheetOpen;
    const isGuideActive = isWorkspacePath && navigationState.isGuideOpen;

    const navigate = (nextPathname: string) => {
        const normalized = nextPathname.replace(/\/+$/, '') || '/';
        setIsMoreOpen(false);
        if (normalized === pathname) return;
        window.history.pushState({}, '', normalized);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const requestWorkspaceAction = (action: PendingNavigationAction) => {
        setIsMoreOpen(false);
        if (isWorkspacePath) {
            window.dispatchEvent(new Event(
                action === 'user-sheet' ? OPEN_USER_SHEET_EVENT : OPEN_GUIDE_EVENT,
            ));
            return;
        }

        try {
            sessionStorage.setItem(PENDING_NAVIGATION_ACTION_KEY, action);
        } catch {
            // 저장소를 사용할 수 없어도 매칭 화면 이동은 유지한다.
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
                <div className={`flex h-20 items-center border-b border-slate-800/60 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
                    <button
                        type="button"
                        aria-label="매칭으로 이동"
                        title={isCollapsed ? 'OWKR Balance' : undefined}
                        onClick={() => navigate('/')}
                        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    >
                        <span className="block bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-lg font-bold tracking-tight text-transparent">
                            {isCollapsed ? 'OW' : 'OWKR Balance'}
                        </span>
                    </button>
                    {!isCollapsed && (
                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                            aria-label="사이드바 접기"
                        >
                            <ChevronLeft size={18} aria-hidden="true" />
                        </button>
                    )}
                </div>

                {isCollapsed && (
                    <div className="px-3 pt-3">
                        <button
                            type="button"
                            onClick={toggleCollapsed}
                            className="flex h-10 w-full items-center justify-center rounded-xl text-slate-500 transition hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                            aria-label="사이드바 펼치기"
                            title="사이드바 펼치기"
                        >
                            <ChevronRight size={18} aria-hidden="true" />
                        </button>
                    </div>
                )}

                <nav className="flex min-h-0 flex-1 flex-col px-3 py-4" aria-label="관리자 기능">
                    <div className="space-y-1">
                        <NavigationButton
                            active={pathname === '/'}
                            collapsed={isCollapsed}
                            icon={Swords}
                            label="매칭"
                            onClick={() => navigate('/')}
                        />
                        <NavigationButton
                            active={pathname === '/participants'}
                            collapsed={isCollapsed}
                            icon={Users}
                            label="참가자 관리"
                            onClick={() => navigate('/participants')}
                        />
                        <NavigationButton
                            active={pathname === '/scrims'}
                            collapsed={isCollapsed}
                            icon={CalendarDays}
                            label="내전 관리"
                            onClick={() => navigate('/scrims')}
                        />
                        <NavigationButton
                            active={isUserSheetActive}
                            collapsed={isCollapsed}
                            icon={FileSpreadsheet}
                            label="유저 시트"
                            onClick={() => requestWorkspaceAction('user-sheet')}
                            showError={navigationState.userSheetHasError}
                        />
                    </div>

                    <div className="mt-5 border-t border-slate-800/60 pt-4">
                        {!isCollapsed && (
                            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                                기타
                            </p>
                        )}
                        <NavigationButton
                            active={pathname === '/event-participants'}
                            collapsed={isCollapsed}
                            icon={CalendarCheck2}
                            label="이벤트 참여자"
                            onClick={() => navigate('/event-participants')}
                        />
                    </div>

                    <div className="mt-auto space-y-2 pt-4">
                        <NavigationButton
                            active={isGuideActive}
                            collapsed={isCollapsed}
                            icon={BookOpen}
                            label="매칭 가이드"
                            onClick={() => requestWorkspaceAction('guide')}
                        />

                        <div className={`rounded-xl border border-slate-800/70 bg-slate-900/70 ${isCollapsed ? 'p-2' : 'p-3'}`}>
                            <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'gap-3'}`}>
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-sm font-bold text-cyan-200 ring-1 ring-cyan-400/20">
                                    {userName.slice(0, 1).toUpperCase() || <UserRound size={16} />}
                                </div>
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

            <div className={`min-h-screen pb-20 transition-[padding] duration-200 lg:pb-0 ${
                isCollapsed ? 'lg:pl-20' : 'lg:pl-52'
            }`}>
                {children}
            </div>

            <nav
                className="fixed inset-x-0 bottom-0 z-[70] flex min-h-16 border-t border-slate-800/80 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
                aria-label="주요 메뉴"
            >
                <MobileNavigationButton
                    active={pathname === '/'}
                    icon={Swords}
                    label="매칭"
                    onClick={() => navigate('/')}
                />
                <MobileNavigationButton
                    active={pathname === '/participants'}
                    icon={Users}
                    label="참가자"
                    onClick={() => navigate('/participants')}
                />
                <MobileNavigationButton
                    active={pathname === '/scrims'}
                    icon={CalendarDays}
                    label="내전"
                    onClick={() => navigate('/scrims')}
                />
                <MobileNavigationButton
                    active={isUserSheetActive}
                    icon={FileSpreadsheet}
                    label="유저 시트"
                    onClick={() => requestWorkspaceAction('user-sheet')}
                    showError={navigationState.userSheetHasError}
                />
                <MobileNavigationButton
                    active={isMoreOpen || pathname === '/event-participants' || isGuideActive}
                    icon={MoreHorizontal}
                    label="더보기"
                    onClick={() => setIsMoreOpen(current => !current)}
                />
            </nav>

            {isMoreOpen && (
                <div className="fixed inset-0 z-[75] lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
                        aria-label="더보기 메뉴 닫기"
                        onClick={() => setIsMoreOpen(false)}
                    />
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-label="더보기 메뉴"
                        className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-slate-700/70 bg-slate-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
                    >
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" aria-hidden="true" />
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-white">더보기</h2>
                            <button
                                type="button"
                                onClick={() => setIsMoreOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200"
                                aria-label="더보기 메뉴 닫기"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="space-y-1">
                            <NavigationButton
                                active={pathname === '/event-participants'}
                                icon={CalendarCheck2}
                                label="이벤트 참여자"
                                onClick={() => navigate('/event-participants')}
                            />
                            <NavigationButton
                                active={isGuideActive}
                                icon={BookOpen}
                                label="매칭 가이드"
                                onClick={() => requestWorkspaceAction('guide')}
                            />
                        </div>

                        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 font-bold text-cyan-200 ring-1 ring-cyan-400/20">
                                {userName.slice(0, 1).toUpperCase() || <UserRound size={17} />}
                            </div>
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
