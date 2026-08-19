import { MessageSquareText } from 'lucide-react';

interface PlayerSheetNoteProps {
    align: 'left' | 'right';
    note?: string;
    reserveSpace?: boolean;
}

/**
 * @description 유저 시트 특이사항을 표시하고 맞은편에만 내용이 있어도 같은 줄 높이를 확보한다.
 */
export function PlayerSheetNote({
    align,
    note,
    reserveSpace = false,
}: PlayerSheetNoteProps) {
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
        <div
            data-match-note
            data-exclude-export
            data-html2canvas-ignore="true"
            className={`mt-1 flex min-h-[13px] w-full min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden text-[10px] leading-tight text-emerald-300/80 ${
                align === 'right' ? 'justify-end' : 'justify-start'
            }`}
            title={`시트 특이사항: ${cleanNote}`}
            aria-label={`시트 특이사항: ${cleanNote}`}
        >
            {align === 'left' && (
                <MessageSquareText size={11} className="shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate">{cleanNote}</span>
            {align === 'right' && (
                <MessageSquareText size={11} className="shrink-0" aria-hidden="true" />
            )}
        </div>
    );
}
