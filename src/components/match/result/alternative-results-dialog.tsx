import { useEffect, useMemo } from 'react';
import { Layers3, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MatchResultData } from '../../../types';
import { useDialogFocus } from '../../../hooks/use-dialog-focus';
import { AlternativeResultCard } from './alternative-result-card';

interface AlternativeResultsDialogProps {
    alternatives: MatchResultData[];
    currentResult: MatchResultData;
    onClose: () => void;
    onSelectAlternative: (index: number) => void;
}

interface CandidateEntry {
    alternativeIndex: number | null;
    isCurrent: boolean;
    result: MatchResultData;
}

const getAssignmentKey = (result: MatchResultData): string => {
    const getTeamKey = (assignment: MatchResultData['teamA']['assignment']): string => [
        `T:${assignment.TANK.map(player => player.id).toSorted((first, second) => first - second).join(',')}`,
        `D:${assignment.DPS.map(player => player.id).toSorted((first, second) => first - second).join(',')}`,
        `S:${assignment.SUPPORT.map(player => player.id).toSorted((first, second) => first - second).join(',')}`,
    ].join('|');

    return [getTeamKey(result.teamA.assignment), getTeamKey(result.teamB.assignment)].join('||');
};

export function AlternativeResultsDialog({
    alternatives,
    currentResult,
    onClose,
    onSelectAlternative,
}: AlternativeResultsDialogProps) {
    const dialogRef = useDialogFocus({ onClose });
    const candidates = useMemo(() => {
        const currentKey = getAssignmentKey(currentResult);
        const entries: CandidateEntry[] = [{
            alternativeIndex: null,
            isCurrent: true,
            result: currentResult,
        }];

        alternatives.forEach((result, alternativeIndex) => {
            if (getAssignmentKey(result) === currentKey) return;
            entries.push({ alternativeIndex, isCurrent: false, result });
        });

        return entries.toSorted((first, second) => {
            if (!first.result.evaluation && first.isCurrent) return -1;
            if (!second.result.evaluation && second.isCurrent) return 1;
            return (first.result.evaluation?.rank ?? Number.MAX_SAFE_INTEGER)
                - (second.result.evaluation?.rank ?? Number.MAX_SAFE_INTEGER);
        });
    }, [alternatives, currentResult]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-sm md:p-5"
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <motion.section
                ref={dialogRef}
                initial={{ opacity: 0, y: 16, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.99 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="alternative-results-dialog-title"
                tabIndex={-1}
                className="flex h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overscroll-contain overflow-hidden rounded-2xl border border-slate-700/80 bg-surface-elevated shadow-2xl focus:outline-none md:h-[min(900px,calc(100dvh-2.5rem))]"
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 md:px-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <Layers3 size={18} className="text-cyan-300" aria-hidden="true" />
                            <h2 id="alternative-results-dialog-title" className="font-semibold text-white">
                                전체 팀 조합 비교
                            </h2>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            추천 후보 {candidates.length}개의 전체 로스터와 배정 티어를 비교하세요.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label="전체 팀 조합 비교 닫기"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </header>

                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
                    <div className="grid gap-3 lg:grid-cols-2">
                        {candidates.map(entry => (
                            <AlternativeResultCard
                                key={`${entry.result.evaluation?.rank ?? 'custom'}-${getAssignmentKey(entry.result)}`}
                                candidate={entry.result}
                                currentResult={currentResult}
                                isCurrent={entry.isCurrent}
                                showComposition
                                onApply={entry.alternativeIndex === null ? undefined : () => {
                                    onSelectAlternative(entry.alternativeIndex as number);
                                    onClose();
                                }}
                            />
                        ))}
                    </div>
                </div>

                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-3 md:px-6">
                    <p className="text-[11px] text-slate-600">
                        조합을 적용하기 전까지 현재 결과는 변경되지 않습니다.
                    </p>
                    <button type="button" onClick={onClose} className="btn-ghost min-h-9 shrink-0 text-xs">
                        닫기
                    </button>
                </footer>
            </motion.section>
        </motion.div>
    );
}
