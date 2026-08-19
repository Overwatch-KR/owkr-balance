import { useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, CalendarCheck2, Layers3, Loader2, X } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import type { MatchResultData, Role, SwapSource } from '../../../types';
import type { UserSheetEntry } from '../../../utils/user-sheet';
import { useCopyImage } from '../../../hooks/use-copy-image';
import MatchupTable from './matchup-table';
import CopyButton from './copy-button';
import BalanceSummary from './balance-summary';
import { AlternativeResultCard } from './alternative-result-card';
import { AlternativeResultsDialog } from './alternative-results-dialog';

interface MatchResultProps {
    matchResult: MatchResultData;
    onSlotClick: (teamIdx: number, role: Role, idx: number) => void;
    swapSource: SwapSource | null;
    alternatives?: MatchResultData[];
    onSelectAlternative?: (idx: number) => void;
    isGeneratingAlternatives?: boolean;
    isEventRegistrationAvailable?: boolean;
    isStale?: boolean;
    onCancelSwap?: () => void;
    onOpenEventRegistration?: () => void;
    onShowAllRanksChange?: (showAllRanks: boolean) => void;
    showAllRanks?: boolean;
    userSheetByBattleTag?: Map<string, UserSheetEntry>;
}

const getMatchResultKey = (result: MatchResultData): string => [
    ...result.teamA.assignment.TANK,
    ...result.teamA.assignment.DPS,
    ...result.teamA.assignment.SUPPORT,
    ...result.teamB.assignment.TANK,
    ...result.teamB.assignment.DPS,
    ...result.teamB.assignment.SUPPORT,
].map((player) => player.id).join('-');

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
    isEventRegistrationAvailable = true,
    isStale = false,
    onCancelSwap,
    onOpenEventRegistration,
    onShowAllRanksChange,
    showAllRanks = false,
    userSheetByBattleTag,
}: MatchResultProps) => {
    const captureRef = useRef<HTMLDivElement>(null);
    const [isAlternativeDialogOpen, setIsAlternativeDialogOpen] = useState(false);
    const { copyStatus, handleCopyImage } = useCopyImage(captureRef);
    const canRegisterEvent = isEventRegistrationAvailable && Boolean(onOpenEventRegistration);
    const selectedSwapPlayer = getSelectedSwapPlayer(matchResult, swapSource);
    const currentResultKey = getMatchResultKey(matchResult);
    const previewAlternatives = alternatives
        .map((alternative, index) => ({ alternative, index }))
        .filter(({ alternative }) => getMatchResultKey(alternative) !== currentResultKey)
        .toSorted((first, second) => (
            (first.alternative.evaluation?.rank ?? first.index + 2)
            - (second.alternative.evaluation?.rank ?? second.index + 2)
        ))
        .slice(0, 2);
    const candidateCount = alternatives.length + 1;

    return (
        <div id="match-result" className="space-y-4">
            {isStale && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200" role="status">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-semibold">참가자 정보가 변경되었습니다.</p>
                        <p className="mt-0.5 text-xs text-amber-300/80">다시 매칭해 주세요.</p>
                    </div>
                </div>
            )}

            <BalanceSummary matchResult={matchResult} />

            <div
                id="swap-guide"
                data-exclude-export
                className={`flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                    selectedSwapPlayer
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
                        : 'border-slate-800/70 bg-surface-elevated/50 text-slate-400'
                }`}
                role="status"
                aria-live="polite"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <ArrowLeftRight
                        size={14}
                        className={selectedSwapPlayer ? 'shrink-0 text-cyan-300' : 'shrink-0 text-slate-500'}
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
                className="flex flex-wrap items-center justify-end gap-2 px-1"
            >
                <button
                    type="button"
                    role="switch"
                    aria-checked={showAllRanks}
                    onClick={() => onShowAllRanksChange?.(!showAllRanks)}
                    className="group inline-flex min-h-9 touch-manipulation items-center gap-2.5 rounded-lg px-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                >
                    탱·딜·힐 티어 표시
                    <span
                        aria-hidden="true"
                        className={`relative h-5 w-9 rounded-full border transition-colors ${
                            showAllRanks
                                ? 'border-cyan-400/50 bg-cyan-500/30'
                                : 'border-slate-600 bg-slate-800'
                        }`}
                    >
                        <span
                            className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color] ${
                                showAllRanks
                                    ? 'left-[18px] bg-cyan-300'
                                    : 'left-0.5 bg-slate-400'
                            }`}
                        />
                    </span>
                </button>
                <button
                    type="button"
                    disabled={isStale || !canRegisterEvent}
                    onClick={onOpenEventRegistration}
                    title={!isEventRegistrationAvailable
                        ? '원격 저장소에 연결된 실행 모드에서 등록할 수 있습니다.'
                        : !onOpenEventRegistration
                            ? '이벤트 참여 등록을 사용할 수 없습니다.'
                        : isStale
                            ? '변경된 명단으로 다시 매칭한 뒤 등록해 주세요.'
                            : '현재 팀 배정 인원을 이벤트 실제 참여자로 등록합니다.'}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                    <CalendarCheck2 size={14} aria-hidden="true" />
                    이번 내전 참여 등록
                </button>
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
                    className="rounded-xl bg-[#0b0c10] py-2.5 sm:py-5"
                >
                    <MatchupTable
                        matchResult={matchResult}
                        onSlotClick={onSlotClick}
                        swapSource={swapSource}
                        showAllRanks={showAllRanks}
                        userSheetByBattleTag={userSheetByBattleTag}
                    />
                </div>

                {/* 다른 조합 (캡처 제외) */}
                <div id="alternative-results" className="rounded-lg">
                {alternatives.length > 0 ? (
                    <div className="space-y-3 px-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-medium text-slate-300">다른 추천 조합</p>
                                <p className="mt-0.5 text-[11px] text-slate-600">
                                    현재 조합과 팀 구성이 의미 있게 다른 후보입니다.
                                </p>
                            </div>
                            {candidateCount > previewAlternatives.length + 1 && (
                                <button
                                    type="button"
                                    onClick={() => setIsAlternativeDialogOpen(true)}
                                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-400/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                                >
                                    <Layers3 size={14} aria-hidden="true" />
                                    전체 {candidateCount}개 자세히 보기
                                </button>
                            )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {previewAlternatives.map(({ alternative, index }) => (
                                <AlternativeResultCard
                                    key={getMatchResultKey(alternative)}
                                    candidate={alternative}
                                    currentResult={matchResult}
                                    showComposition
                                    onApply={() => onSelectAlternative?.(index)}
                                />
                            ))}
                        </div>
                    </div>
                ) : isGeneratingAlternatives ? (
                    <div className="flex items-center gap-2 px-1 text-sm text-slate-500" role="status">
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        다른 팀 조합 계산 중…
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
