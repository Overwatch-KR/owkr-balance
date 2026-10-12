import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import type { ClearRosterCollaborationChoice } from '@application/roster/clear-roster';

interface ClearRosterDialogProps {
    onCancel: () => void;
    onConfirm: (choice: ClearRosterCollaborationChoice) => void;
}

/**
 * @description 전체 명단 삭제 전에 공동 작업 연결을 유지할지 종료할지 선택하게 한다.
 */
export function ClearRosterDialog({ onCancel, onConfirm }: ClearRosterDialogProps) {
    const dialogRef = useDialogFocus({ onClose: onCancel });
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}
        >
            <section
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="clear-roster-title"
                aria-describedby="clear-roster-description"
                tabIndex={-1}
                className="w-full max-w-lg rounded-lg border border-slate-700 bg-surface-elevated p-5 shadow-xl focus:outline-none"
            >
                <h2 id="clear-roster-title" className="text-base font-semibold text-white">명단 전체 삭제</h2>
                <p id="clear-roster-description" className="mt-2 text-sm leading-relaxed text-slate-300">
                    참가자와 대기열, 팀 배정 결과를 모두 비웁니다. 현재 협업 연결을 유지할까요?
                </p>
                <div className="mt-4 space-y-2 border-y border-slate-800 py-3 text-xs leading-relaxed text-slate-400">
                    <p><strong className="text-slate-200">협업 유지:</strong> 같은 코드로 계속 편집하며, 빈 명단도 다른 관리자에게 반영됩니다.</p>
                    <p><strong className="text-slate-200">내 연결 종료:</strong> 내 화면의 명단만 비우며, 다른 관리자의 연결과 공유 명단은 유지됩니다.</p>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={onCancel} className="btn-ghost">취소</button>
                    <button type="button" onClick={() => onConfirm('leave')} className="btn-ghost border border-slate-700">내 연결 종료하고 삭제</button>
                    <button type="button" onClick={() => onConfirm('keep')} className="btn-primary">협업 유지하고 삭제</button>
                </div>
            </section>
        </motion.div>
    );
}
