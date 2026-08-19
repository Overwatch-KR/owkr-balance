import { AlertTriangle, Lightbulb, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDialogFocus } from '../../hooks/use-dialog-focus';

export interface ErrorDetails {
    description: string;
    hint?: string;
    items?: string[];
    title: string;
}

interface ErrorDetailsModalProps {
    details: ErrorDetails;
    onClose: () => void;
}

/**
 * @description 짧은 오류 토스트에서 선택한 상세 원인과 해결 방법을 모달로 보여준다.
 */
export function ErrorDetailsModal({ details, onClose }: ErrorDetailsModalProps) {
    const dialogRef = useDialogFocus({ onClose });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.section
                ref={dialogRef}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="error-details-title"
                aria-describedby="error-details-description"
                tabIndex={-1}
                className="flex max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-xl flex-col overscroll-contain overflow-hidden rounded-2xl border border-rose-500/25 bg-slate-900 shadow-2xl shadow-black/50 focus:outline-none"
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-300">
                            <AlertTriangle size={19} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-rose-300">오류 상세 정보</p>
                            <h2 id="error-details-title" className="mt-0.5 text-base font-semibold text-white">
                                {details.title}
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                        aria-label="오류 상세 정보 닫기"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </header>

                <div className="custom-scrollbar min-h-0 overflow-y-auto px-5 py-4">
                    <p id="error-details-description" className="break-keep text-sm leading-relaxed text-slate-300">
                        {details.description}
                    </p>

                    {details.items && details.items.length > 0 && (
                        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                            <p className="mb-2 text-xs font-medium text-slate-400">
                                확인할 항목 {details.items.length}개
                            </p>
                            <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs text-slate-300">
                                {details.items.map((item, index) => (
                                    <li
                                        key={`${index}-${item}`}
                                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-lg border border-rose-500/15 bg-rose-500/[0.06] px-3 py-2 leading-relaxed"
                                    >
                                        <span className="font-mono text-rose-400">{index + 1}.</span>
                                        <span className="break-words">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {details.hint && (
                        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3 text-xs leading-relaxed text-amber-100/80">
                            <Lightbulb size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                            <p className="break-keep">{details.hint}</p>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 justify-end border-t border-slate-800 px-5 py-3">
                    <button type="button" onClick={onClose} className="btn-primary min-h-9">
                        확인
                    </button>
                </footer>
            </motion.section>
        </motion.div>
    );
}
