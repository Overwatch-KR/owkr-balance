import { AlertCircle, Loader2, RefreshCcw } from 'lucide-react';

interface DataLoadErrorProps {
    isRetrying: boolean;
    message: string;
    onRetry: () => void;
    title?: string;
}

/**
 * @description 관리 페이지의 데이터 연결 오류와 재시도 동작을 한 가지 형태로 안내한다.
 */
export function DataLoadError({
    isRetrying,
    message,
    onRetry,
    title = '데이터를 불러오지 못했습니다',
}: DataLoadErrorProps) {
    return (
        <section
            className="mb-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber-400 bg-amber-400/[0.07] px-4 py-3"
            role="alert"
        >
            <div className="flex min-w-0 items-start gap-2.5">
                <AlertCircle className="mt-0.5 shrink-0 text-amber-300" size={16} aria-hidden="true" />
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-amber-100">{title}</h2>
                    <p className="mt-0.5 text-sm text-slate-300">{message}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className="btn-ghost min-h-9 text-xs disabled:cursor-wait disabled:opacity-50"
            >
                {isRetrying
                    ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    : <RefreshCcw size={13} aria-hidden="true" />}
                {isRetrying ? '다시 연결 중' : '다시 연결'}
            </button>
        </section>
    );
}
