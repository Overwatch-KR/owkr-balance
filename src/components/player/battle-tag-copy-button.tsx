import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface BattleTagCopyButtonProps {
    battleTag: string;
    className?: string;
}

type CopyStatus = 'idle' | 'success' | 'error';

/**
 * @description 배틀태그를 텍스트 클립보드에 복사하고 짧은 상태 피드백을 보여준다.
 */
export const BattleTagCopyButton = ({ battleTag, className = '' }: BattleTagCopyButtonProps) => {
    const [status, setStatus] = useState<CopyStatus>('idle');
    const resetTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    }, []);

    const handleCopy = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(battleTag);
            setStatus('success');
        } catch {
            setStatus('error');
        }

        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = window.setTimeout(() => setStatus('idle'), 1500);
    };

    const label = status === 'success'
        ? `${battleTag} 복사 완료`
        : status === 'error'
            ? `${battleTag} 복사 실패`
            : `${battleTag} 복사`;

    return (
        <button
            type="button"
            data-exclude-export
            data-html2canvas-ignore="true"
            onClick={(event) => {
                event.stopPropagation();
                void handleCopy();
            }}
            className={`-my-1 inline-flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                status === 'success'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : status === 'error'
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'text-slate-400 hover:bg-slate-700/60 hover:text-cyan-300'
            } ${className}`}
            aria-label={label}
            title={label}
        >
            {status === 'success'
                ? <Check size={14} aria-hidden="true" />
                : status === 'error'
                    ? <X size={14} aria-hidden="true" />
                    : <Copy size={14} aria-hidden="true" />}
            <span className="sr-only" aria-live="polite">
                {status === 'idle' ? '' : label}
            </span>
        </button>
    );
};
