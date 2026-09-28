import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Layers3, Loader2, RefreshCcw, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import type { MatchResultData, Role, SwapSource } from '../../../types';
import type { UserSheetEntry } from '../../../utils/user-sheet';
import { useCopyImage } from '../../../hooks/use-copy-image';
import MatchupTable from './matchup-table';
import CopyButton from './copy-button';
import BalanceSummary from './balance-summary';
import { AlternativeResultsDialog } from './alternative-results-dialog';

interface MatchResultProps {
    matchResult: MatchResultData;
    onSlotClick: (teamIdx: number, role: Role, idx: number) => void;
    swapSource: SwapSource | null;
    alternatives?: MatchResultData[];
    onSelectAlternative?: (idx: number) => void;
    isGeneratingAlternatives?: boolean;
    isRematching?: boolean;
    isStale?: boolean;
    onCancelSwap?: () => void;
    onRematch?: () => void;
    onShowAllRanksChange?: (showAllRanks: boolean) => void;
    onShowSheetNotesChange?: (showSheetNotes: boolean) => void;
    showAllRanks?: boolean;
    showSheetNotes?: boolean;
    userSheetByBattleTag?: Map<string, UserSheetEntry>;
}

const getSelectedSwapPlayer = (
    matchResult: MatchResultData,
    swapSource: SwapSource | null,
) => {
    if (!swapSource) return null;
    const team = swapSource.teamIdx === 0 ? matchResult.teamA : matchResult.teamB;
    return team.assignment[swapSource.role][swapSource.index] ?? null;
};

const MatchResult = ({
    matchResult,
    onSlotClick,
    swapSource,
    alternatives = [],
    onSelectAlternative,
    isGeneratingAlternatives = false,
    isRematching = false,
    isStale = false,
    onCancelSwap,
    onRematch,
    onShowAllRanksChange,
    onShowSheetNotesChange,
    showAllRanks = false,
    showSheetNotes = true,
    userSheetByBattleTag,
}: MatchResultProps) => {
    const captureRef = useRef<HTMLDivElement>(null);
    const [isAlternativeDialogOpen, setIsAlternativeDialogOpen] = useState(false);
    const { copyStatus, handleCopyImage } = useCopyImage(captureRef);
    const selectedSwapPlayer = getSelectedSwapPlayer(matchResult, swapSource);
    const candidateCount = alternatives.length + 1;

    return (
        <div id="match-result" className="space-y-3">
            {isStale && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200" role="status">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">참가자 정보가 변경되었습니다.</p>
                        <p className="mt-0.5 text-xs text-amber-300/80">팀을 다시 배정해 주세요.</p>
                    </div>
                    {onRematch ? (
                        <button
                            type="button"
                            onClick={onRematch}
                            disabled={isRematching}
                            className="inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-300/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 disabled:cursor-wait disabled:opacity-60"
                        >
                            {isRematching
                                ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                : <RefreshCcw size={14} aria-hidden="true" />}
                            {isRematching ? '배정 중…' : '다시 배정'}
                        </button>
                    ) : null}
                </div>
            )}

            <BalanceSummary matchResult={matchResult} />

            <div
                id="swap-guide"
                data-exclude-export
                className={`flex min-h-10 flex-wrap items-center justify-between gap-2 border-l px-3 py-2 text-xs ${
                    selectedSwapPlayer
                        ? 'border-cyan-400 bg-cyan-500/[0.08] text-cyan-100'
                        : 'border-slate-700 text-slate-400'
                }`}
                role="status"
                aria-live="polite"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <ArrowLeftRight
                        size={14}
                        className={selectedSwapPlayer ? 'shrink-0 text-cyan-300' : 'shrink-0 text-slate-400'}
                        aria-hidden="true"
                    />
                    <p className="min-w-0">
                        {selectedSwapPlayer ? (
                            <>
                                <span className="font-semibold">
                                    {selectedSwapPlayer.discordName ?? selectedSwapPlayer.name}
                                </span>
                                {' '}선택됨 · 바꿀 플레이어를 선택하세요
                            </>
                        ) : (
                            '결과표에서 플레이어 두 명을 차례로 선택하면 자리를 바꿀 수 있습니다'
                        )}
                    </p>
                </div>
                {selectedSwapPlayer && (
                    <button
                        type="button"
                        onClick={onCancelSwap}
                        className="inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1 rounded-md px-2 text-cyan-200 transition-colors hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    >
                        <X size={13} aria-hidden="true" />
                        선택 취소
                    </button>
                )}
            </div>

            <div
                id="result-share-controls"
                data-exclude-export
                className="flex flex-wrap items-center justify-end gap-2"
            >
                <div className="flex flex-wrap items-center gap-1" aria-label="결과 표시 옵션">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={showSheetNotes}
                        onClick={() => onShowSheetNotesChange?.(!showSheetNotes)}
                        className="inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-lg px-2.5 text-xs text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    >
                        <span>특이사항 표시</span>
                        <span
                            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors motion-reduce:transition-none ${
                                showSheetNotes
                                    ? 'border-cyan-400/70 bg-cyan-500/70'
                                    : 'border-slate-600 bg-slate-800'
                            }`}
                            aria-hidden="true"
                        >
                            <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
                                showSheetNotes ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                        </span>
                    </button>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={showAllRanks}
                        onClick={() => onShowAllRanksChange?.(!showAllRanks)}
                        className="inline-flex min-h-10 touch-manipulation items-center gap-2 rounded-lg px-2.5 text-xs text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                    >
                        <span>전체 티어 표시</span>
                        <span
                            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors motion-reduce:transition-none ${
                                showAllRanks
                                    ? 'border-cyan-400/70 bg-cyan-500/70'
                                    : 'border-slate-600 bg-slate-800'
                            }`}
                            aria-hidden="true"
                        >
                            <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
                                showAllRanks ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                        </span>
                    </button>
                </div>
                <CopyButton status={copyStatus} onClick={handleCopyImage} />
            </div>

            <div
                className={`space-y-4 transition-opacity duration-200 ${isStale ? 'opacity-40' : 'opacity-100'}`}
                aria-disabled={isStale}
                inert={isStale}
            >
                {/* 이미지 캡처 영역 */}
                <div
                    ref={captureRef}
                    data-capture-content
                    className="bg-[#0b0c10] py-2.5 sm:py-3"
                >
                    <MatchupTable
                        matchResult={matchResult}
                        onSlotClick={onSlotClick}
                        swapSource={swapSource}
                        showAllRanks={showAllRanks}
                        showSheetNotes={showSheetNotes}
                        userSheetByBattleTag={userSheetByBattleTag}
                    />
                </div>

                {/* 다른 조합 (캡처 제외) */}
                <div id="alternative-results">
                {alternatives.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-800 py-2.5">
                        <p className="text-sm text-slate-400">
                            다른 추천 조합 <span className="ml-1 font-mono tabular-nums text-slate-200">{alternatives.length}</span>
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsAlternativeDialogOpen(true)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        >
                            <Layers3 size={14} aria-hidden="true" />
                            전체 {candidateCount}개 보기
                        </button>
                    </div>
                ) : isGeneratingAlternatives ? (
                    <div className="flex items-center gap-2 px-1 text-sm text-slate-400" role="status">
                        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        다른 조합 계산 중…
                    </div>
                ) : null}
                </div>
            </div>

            <AnimatePresence>
                {isAlternativeDialogOpen && (
                    <AlternativeResultsDialog
                        alternatives={alternatives}
                        currentResult={matchResult}
                        onClose={() => setIsAlternativeDialogOpen(false)}
                        onSelectAlternative={index => onSelectAlternative?.(index)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default MatchResult;
