import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, ChevronDown, Layers3, Loader2, RefreshCcw, SlidersHorizontal, X } from 'lucide-react';
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
                <details className="group relative">
                    <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-sm px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 [&::-webkit-details-marker]:hidden">
                        <SlidersHorizontal size={14} aria-hidden="true" />
                        표시 설정
                        <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="absolute right-0 top-full z-30 mt-1 w-52 border border-slate-700 bg-[#0b0f14] p-1">
                        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5 focus-within:ring-2 focus-within:ring-inset focus-within:ring-cyan-400/70">
                            <span>특이사항 표시</span>
                            <input
                                type="checkbox"
                                name="show-sheet-notes"
                                checked={showSheetNotes}
                                onChange={event => onShowSheetNotesChange?.(event.target.checked)}
                                className="h-4 w-4 shrink-0 accent-cyan-400"
                            />
                        </label>
                        <label className="flex min-h-10 cursor-pointer items-center justify-between gap-4 border-t border-slate-800 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5 focus-within:ring-2 focus-within:ring-inset focus-within:ring-cyan-400/70">
                            <span>탱·딜·힐 전체 티어 표시</span>
                            <input
                                type="checkbox"
                                name="show-all-ranks"
                                checked={showAllRanks}
                                onChange={event => onShowAllRanksChange?.(event.target.checked)}
                                className="h-4 w-4 shrink-0 accent-cyan-400"
                            />
                        </label>
                    </div>
                </details>
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
