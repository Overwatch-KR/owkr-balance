import {
    BookOpen,
    FileSpreadsheet,
    Loader2,
    RefreshCcw,
    X,
} from 'lucide-react';

export type UserSheetMode = 'BROWSE' | 'EDIT' | 'GUIDE';

interface UserSheetModalHeaderProps {
    entryCount: number;
    isGuideActive: boolean;
    isLoading: boolean;
    mode: UserSheetMode;
    showMobileDetail: boolean;
    onClose: () => void;
    onGuideToggle: () => void;
    onOpenList: () => void;
    onRetry: () => void;
}

/**
 * @description 유저 시트 제목과 가이드·새로고침·닫기 액션을 표시한다.
 */
export function UserSheetModalHeader({
    entryCount,
    isGuideActive,
    isLoading,
    mode,
    showMobileDetail,
    onClose,
    onGuideToggle,
    onOpenList,
    onRetry,
}: UserSheetModalHeaderProps) {
    return (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
                    <FileSpreadsheet size={20} aria-hidden="true" />
                </span>
                <div id="user-sheet-overview" className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 id="user-sheet-title" className="font-semibold text-white">유저 시트</h1>
                        <span className="whitespace-nowrap rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            {entryCount}명
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Discord ID를 기준으로 유저 정보와 특이사항을 관리합니다.
                    </p>
                </div>
            </div>
            <div id="user-sheet-header-actions" className="flex items-center gap-1">
                {showMobileDetail && mode === 'BROWSE' && (
                    <button
                        type="button"
                        onClick={onOpenList}
                            className="btn-ghost min-h-9 px-2 text-xs sm:hidden"
                    >
                        목록
                    </button>
                )}
                {(mode !== 'EDIT' || isGuideActive) && (
                    <>
                        <button
                            id="user-sheet-guide-button"
                            type="button"
                            onClick={onGuideToggle}
                            className={`btn-ghost min-h-9 px-2.5 text-xs ${
                                isGuideActive
                                    ? 'bg-cyan-500/10 text-cyan-200'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                            aria-label="시트 가이드"
                            aria-pressed={isGuideActive}
                        >
                            <BookOpen size={15} aria-hidden="true" />
                            <span className="hidden md:inline">시트 가이드</span>
                        </button>
                        {mode === 'BROWSE' && (
                            <button
                                id="user-sheet-refresh"
                                type="button"
                                onClick={onRetry}
                                disabled={isLoading}
                                className="btn-ghost min-h-9 px-2.5 text-xs disabled:cursor-wait disabled:opacity-50"
                                aria-label="유저 시트 최신 데이터 불러오기"
                                title="최신 데이터 불러오기"
                            >
                                {isLoading
                                    ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                                    : <RefreshCcw size={15} aria-hidden="true" />}
                                <span className="hidden md:inline">새로고침</span>
                            </button>
                        )}
                    </>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="btn-ghost btn-icon-sm text-slate-500"
                    aria-label="유저 시트 닫기"
                >
                    <X size={18} aria-hidden="true" />
                </button>
            </div>
        </header>
    );
}
