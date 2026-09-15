import { Loader2 } from 'lucide-react';

interface DataLoadingStateProps {
    className?: string;
    label: string;
}

/**
 * @description 데이터 화면의 구조를 바꾸지 않고 짧고 일관된 로딩 상태를 표시한다.
 */
export const DataLoadingState = ({ className = '', label }: DataLoadingStateProps) => (
    <div
        role="status"
        aria-live="polite"
        className={`flex min-h-24 items-center justify-center gap-2 text-sm text-slate-400 ${className}`}
    >
        <Loader2 size={17} className="animate-spin text-cyan-300" aria-hidden="true" />
        <span>{label}</span>
    </div>
);
