import { BookOpen, CalendarCheck2, CalendarDays, FileSpreadsheet, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import type { AuthMode, DataMode } from '../../hooks/use-auth';

interface AppHeaderProps {
    authMode: AuthMode;
    dataMode: DataMode;
    isGuideOpen: boolean;
    isLoggingOut: boolean;
    isUserSheetOpen: boolean;
    onLogout: () => void;
    onOpenEventParticipants: () => void;
    onOpenScrims: () => void;
    onOpenGuide: () => void;
    onOpenUserSheet: () => void;
    userName: string;
    userSheetHasError: boolean;
}

/**
 * @description 앱 전역 탐색과 로그인 사용자 동작을 독립된 상단 영역으로 제공한다.
 */
export function AppHeader({
    authMode,
    dataMode,
    isGuideOpen,
    isLoggingOut,
    isUserSheetOpen,
    onLogout,
    onOpenEventParticipants,
    onOpenScrims,
    onOpenGuide,
    onOpenUserSheet,
    userName,
    userSheetHasError,
}: AppHeaderProps) {
    return (
        <header className="sticky top-0 z-50 border-b border-slate-800/50 bg-surface/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 md:px-8">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                    <motion.h1
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="shrink-0 whitespace-nowrap bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-lg font-bold tracking-tight text-transparent sm:text-xl"
                    >
                        OWKR Balance
                    </motion.h1>
                    {authMode === 'local' && (
                        <span
                            title={dataMode === 'local'
                                ? '원격 Redis에 연결하지 않고 참가 명단과 결과를 현재 브라우저에만 저장합니다.'
                                : '연결된 Redis의 변경 사항이 즉시 반영됩니다.'}
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                dataMode === 'local'
                                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                    : 'border-amber-400/25 bg-amber-400/10 text-amber-200'
                            }`}
                        >
                            {dataMode === 'local' ? '로컬 전용' : '로컬 인증'}
                        </span>
                    )}
                </div>

                <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="주요 메뉴">
                    <button
                        type="button"
                        onClick={onOpenEventParticipants}
                        aria-label="이벤트 참여자"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:px-2.5"
                    >
                        <CalendarCheck2 size={15} aria-hidden="true" />
                        <span className="hidden sm:inline">이벤트 참여</span>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenScrims}
                        aria-label="내전 관리"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 sm:px-2.5"
                    >
                        <CalendarDays size={15} aria-hidden="true" />
                        <span className="hidden sm:inline">내전 관리</span>
                    </button>
                    <button
                        type="button"
                        onClick={onOpenUserSheet}
                        aria-haspopup="dialog"
                        aria-expanded={isUserSheetOpen}
                        aria-label="유저 시트"
                        className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 sm:px-2.5 ${
                            userSheetHasError
                                ? 'text-amber-300 hover:bg-amber-500/10'
                                : 'text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200'
                        }`}
                    >
                        <FileSpreadsheet size={15} aria-hidden="true" />
                        <span className="hidden sm:inline">유저 시트</span>
                        {userSheetHasError && (
                            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="유저 시트 연결 오류" />
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenGuide}
                        data-guide-control="true"
                        aria-expanded={isGuideOpen}
                        aria-label="매칭 가이드"
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 sm:px-2.5"
                    >
                        <BookOpen size={15} aria-hidden="true" />
                        <span className="hidden md:inline">매칭 가이드</span>
                    </button>
                    <div className="mx-1 hidden h-4 w-px bg-slate-800 sm:block" aria-hidden="true" />
                    <span className="hidden max-w-28 truncate px-1 text-xs text-slate-500 sm:block">{userName}</span>
                    {authMode === 'discord' && (
                        <button
                            type="button"
                            onClick={onLogout}
                            disabled={isLoggingOut}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:cursor-wait disabled:opacity-40"
                            aria-label="로그아웃"
                        >
                            <LogOut size={15} aria-hidden="true" />
                            <span className="hidden md:inline">{isLoggingOut ? '처리 중' : '로그아웃'}</span>
                        </button>
                    )}
                </nav>
            </div>
        </header>
    );
}
