import { RefreshCw, Sparkles, X } from 'lucide-react';

interface UpdateAvailableNoticeProps {
    onDismiss: () => void;
    onReload: () => void;
}

/**
 * @description 새 배포본을 감지했을 때 작업 손실 없이 사용자가 직접 새로고침 시점을 선택하도록 안내한다.
 */
export function UpdateAvailableNotice({ onDismiss, onReload }: UpdateAvailableNoticeProps) {
    return (
        <aside
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[190] w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-cyan-400/25 bg-slate-950/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-5"
            role="status"
            aria-live="polite"
        >
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-inset ring-cyan-400/20">
                    <Sparkles size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 pr-6">
                    <p className="font-semibold text-white">새 버전이 준비됐어요</p>
                    <p className="mt-1 break-keep text-sm leading-6 text-slate-400">
                        <span className="block">더 나은 최신 버전을 사용할 수 있습니다.</span>
                        <span className="block">현재 작업을 마친 뒤 새로고침해 주세요.</span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    aria-label="업데이트 안내 닫기"
                >
                    <X size={17} aria-hidden="true" />
                </button>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 min-[360px]:flex-row min-[360px]:justify-end">
                <button type="button" className="btn-ghost min-h-10" onClick={onDismiss}>
                    나중에
                </button>
                <button type="button" className="btn-primary min-h-10" onClick={onReload}>
                    <RefreshCw size={16} className="mr-1.5 inline" aria-hidden="true" />
                    지금 새로고침
                </button>
            </div>
        </aside>
    );
}
