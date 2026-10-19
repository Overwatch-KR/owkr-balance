import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText } from 'lucide-react';
import type { Player } from '../../../types';
import { PlayerSheetNoteDialog } from './player-sheet-note-dialog';

interface PlayerSheetNoteProps {
    align: 'left' | 'right';
    note?: string;
    reserveSpace?: boolean;
    player: Player;
    onOpen: () => void;
}

/**
 * @description 유저 시트 특이사항을 한 줄로 표시하고 클릭하면 전체 내용을 열며 맞은편 줄 높이를 유지한다.
 */
export function PlayerSheetNote({
    align,
    note,
    reserveSpace = false,
    player,
    onOpen,
}: PlayerSheetNoteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dialogId = useId();
    const cleanNote = note?.trim();
    if (!cleanNote) {
        return reserveSpace ? (
            <div
                data-match-note-spacer
                data-exclude-export
                data-html2canvas-ignore="true"
                className="mt-1 h-[13px] shrink-0"
                aria-hidden="true"
            />
        ) : null;
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                data-match-note
                data-exclude-export
                data-html2canvas-ignore="true"
                className={`pointer-events-auto mt-1 flex min-h-[13px] w-full min-w-0 max-w-full shrink-0 touch-manipulation items-center gap-1 overflow-hidden rounded-sm text-[10px] leading-tight text-emerald-300/80 transition-colors hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 ${
                    align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
                }`}
                title="특이사항 전체 보기"
                aria-label={`시트 특이사항: ${cleanNote}`}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? dialogId : undefined}
                onClick={event => {
                    event.stopPropagation();
                    onOpen();
                    setIsOpen(true);
                }}
            >
                {align === 'left' && (
                    <MessageSquareText size={11} className="shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{cleanNote}</span>
                {align === 'right' && (
                    <MessageSquareText size={11} className="shrink-0" aria-hidden="true" />
                )}
            </button>
            {isOpen && createPortal(
                <PlayerSheetNoteDialog
                    id={dialogId}
                    player={player}
                    note={cleanNote}
                    align={align}
                    triggerRef={triggerRef}
                    onClose={() => setIsOpen(false)}
                />,
                document.body,
            )}
        </>
    );
}
