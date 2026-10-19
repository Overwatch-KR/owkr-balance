import { useLayoutEffect, type RefObject } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import type { Player } from '../../../types';
import { useDialogFocus } from '../../../hooks/use-dialog-focus';
import { PlayerIdentity } from '../../player/player-identity';

interface PlayerSheetNoteDialogProps {
    id: string;
    player: Player;
    note: string;
    align: 'left' | 'right';
    triggerRef: RefObject<HTMLButtonElement | null>;
    onClose: () => void;
}

/**
 * @description 특이사항 전체 내용을 데스크톱에서는 문구 옆 팝오버, 모바일에서는 하단 패널로 보여준다.
 */
export function PlayerSheetNoteDialog({
    id,
    player,
    note,
    align,
    triggerRef,
    onClose,
}: PlayerSheetNoteDialogProps) {
    const dialogRef = useDialogFocus({ onClose });

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        if (!dialog || !trigger) return;

        const updatePosition = () => {
            const anchor = trigger.getBoundingClientRect();
            const panel = dialog.getBoundingClientRect();
            const margin = 12;
            const gap = 8;
            const left = align === 'right' ? anchor.right - panel.width : anchor.left;
            const top = anchor.bottom + gap + panel.height <= window.innerHeight - margin
                ? anchor.bottom + gap
                : anchor.top - gap - panel.height;
            dialog.style.setProperty('--note-left', `${Math.max(margin, Math.min(left, window.innerWidth - panel.width - margin))}px`);
            dialog.style.setProperty('--note-top', `${Math.max(margin, Math.min(top, window.innerHeight - panel.height - margin))}px`);
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [align, dialogRef, triggerRef]);

    return (
        <div
            data-exclude-export
            data-html2canvas-ignore="true"
            className="fixed inset-0 z-[110] bg-slate-950/60 sm:bg-transparent"
            onClick={event => event.stopPropagation()}
            onFocus={event => event.stopPropagation()}
            onMouseDown={event => {
                event.stopPropagation();
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={dialogRef}
                id={id}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-content`}
                tabIndex={-1}
                className="absolute inset-x-0 bottom-0 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-lg border border-slate-700 bg-surface-elevated shadow-xl shadow-black/40 focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-[var(--note-left)] sm:top-[var(--note-top)] sm:max-h-[min(420px,calc(100dvh-24px))] sm:w-[min(360px,calc(100vw-24px))] sm:rounded-lg"
            >
                <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div className="min-w-0">
                        <h2 id={`${id}-title`} className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                            <MessageSquareText size={13} aria-hidden="true" />
                            특이사항
                        </h2>
                        <PlayerIdentity player={player} grow={false} />
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="특이사항 닫기"
                        className="btn-ghost h-8 min-h-8 w-8 shrink-0 rounded-md p-0"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </header>
                <div className="custom-scrollbar min-h-0 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                    <p id={`${id}-content`} className="whitespace-pre-wrap break-words text-left text-[10px] leading-relaxed text-slate-200">
                        {note}
                    </p>
                </div>
            </section>
        </div>
    );
}
