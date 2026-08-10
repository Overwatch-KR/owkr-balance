import { BookOpen, RotateCcw, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { getGuideStepPosition } from '../utils/guide-progress';
import type { GuideProgress } from '../utils/guide-progress';

interface GuideResumePromptProps {
    onDismiss: () => void;
    onRestart: () => void;
    onResume: () => void;
    progress: GuideProgress;
}

/**
 * @description 저장된 가이드 진행 단계를 이어서 볼지 처음부터 시작할지 선택하게 한다.
 */
export const GuideResumePrompt = ({
    onDismiss,
    onRestart,
    onResume,
    progress,
}: GuideResumePromptProps) => {
    const dialogRef = useDialogFocus({ onClose: onDismiss });
    const position = getGuideStepPosition(progress.variant, progress.stepId);
    const guideLabel = progress.variant === 'result' ? '결과 활용 가이드' : '참가자·팀 편성 가이드';

    return (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
            <motion.aside
                ref={dialogRef}
                id="guide-resume-prompt"
                role="dialog"
                aria-modal="true"
                aria-labelledby="guide-resume-title"
                tabIndex={-1}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="w-full max-w-md overscroll-contain rounded-2xl border border-cyan-400/30 bg-slate-950 p-5 shadow-2xl shadow-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            >
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                        <BookOpen size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-cyan-300">
                            {guideLabel} · {position.current}/{position.total}
                        </p>
                        <h2 id="guide-resume-title" className="mt-1 text-pretty text-lg font-bold text-white">
                            이전 가이드를 이어서 볼까요?
                        </h2>
                        <p className="mt-1.5 text-pretty text-sm leading-relaxed text-slate-400">
                            중단한 단계가 이 브라우저에 저장되어 있습니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="inline-flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label="이어보기 선택 닫기"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={onRestart}
                        className="btn-ghost inline-flex min-h-10 touch-manipulation items-center justify-center gap-1.5 px-4 py-2 text-sm"
                    >
                        <RotateCcw size={15} aria-hidden="true" />
                        처음부터
                    </button>
                    <button
                        type="button"
                        onClick={onResume}
                        className="btn-primary inline-flex min-h-10 touch-manipulation items-center justify-center px-4 py-2 text-sm"
                    >
                        {position.current}단계부터 이어보기
                    </button>
                </div>
            </motion.aside>
        </div>
    );
};
