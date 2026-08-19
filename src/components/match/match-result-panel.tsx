import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, RefreshCcw, Shuffle, StarOff } from 'lucide-react';
import type { MatchResultData, Role, SwapSource } from '../../types';
import type { UserSheetEntry } from '../../utils/user-sheet';
import { DouMascot } from '../common/dou-mascot';
import MatchResult from './result';

interface MatchResultPanelProps {
    alternatives: MatchResultData[];
    ignorePreferences: boolean;
    isBalancing: boolean;
    isReady: boolean;
    isResultStale: boolean;
    onCancelSwap: () => void;
    onClearResult: () => void;
    onIgnorePreferencesChange: (ignore: boolean) => void;
    onRunMatching: () => void;
    onSelectAlternative: (index: number) => void;
    onShowAllRanksChange: (show: boolean) => void;
    onSlotClick: (teamIndex: number, role: Role, index: number) => void;
    participantCount: number;
    result: MatchResultData | null;
    showAllRanks: boolean;
    swapSource: SwapSource | null;
    userSheetByBattleTag: Map<string, UserSheetEntry>;
}

/**
 * @description 팀 배정 실행 상태, 빈 화면, 결과와 대안 선택 UI를 독립적으로 렌더링한다.
 */
export function MatchResultPanel({
    alternatives,
    ignorePreferences,
    isBalancing,
    isReady,
    isResultStale,
    onCancelSwap,
    onClearResult,
    onIgnorePreferencesChange,
    onRunMatching,
    onSelectAlternative,
    onShowAllRanksChange,
    onSlotClick,
    participantCount,
    result,
    showAllRanks,
    swapSource,
    userSheetByBattleTag,
}: MatchResultPanelProps) {
    return (
        <section className="grid min-w-0 content-start gap-6" aria-labelledby="match-result-title">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
                <h2 id="match-result-title" className="text-lg font-semibold text-white">팀 배정 결과</h2>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        id="matching-preference-option"
                        type="button"
                        onClick={() => onIgnorePreferencesChange(!ignorePreferences)}
                        disabled={isBalancing}
                        aria-pressed={ignorePreferences}
                        title="선호 역할 위반 수를 후보 평가에서 제외합니다. 비선호 역할은 계속 피합니다."
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            ignorePreferences
                                ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
                                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                    >
                        <StarOff size={14} aria-hidden="true" />
                        선호 무시
                    </button>
                    {result && (
                        <button type="button" onClick={onClearResult} className="btn-ghost flex items-center gap-2 text-sm">
                            <RefreshCcw size={14} aria-hidden="true" />
                            결과 지우기
                        </button>
                    )}
                    <button
                        id="matching-action"
                        type="button"
                        onClick={onRunMatching}
                        disabled={isBalancing || !isReady}
                        className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isBalancing
                            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                            : <Shuffle size={16} aria-hidden="true" />}
                        {isReady
                            ? isResultStale ? '다시 매칭' : '팀 자동 배정'
                            : `${10 - participantCount}명 더 필요`}
                    </button>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {!result ? (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex h-[500px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-800"
                    >
                        {isBalancing ? (
                            <div className="flex flex-col items-center gap-4">
                                <DouMascot variant="loading" size={128} className="animate-pulse" decorative />
                                <p className="animate-pulse text-slate-500">최적의 조합을 계산 중…</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <DouMascot variant="empty" size={128} decorative />
                                <p className="text-center text-slate-500">
                                    {isReady
                                        ? '“팀 자동 배정” 버튼을 눌러주세요'
                                        : `플레이어 ${10 - participantCount}명을 더 추가하면 팀을 짤 수 있습니다`}
                                </p>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="result"
                        data-result-viewport="true"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="min-w-0 max-w-full overflow-hidden"
                    >
                        <MatchResult
                            matchResult={result}
                            onSlotClick={onSlotClick}
                            swapSource={swapSource}
                            alternatives={alternatives}
                            isStale={isResultStale}
                            isGeneratingAlternatives={isBalancing}
                            onCancelSwap={onCancelSwap}
                            onSelectAlternative={onSelectAlternative}
                            onShowAllRanksChange={onShowAllRanksChange}
                            showAllRanks={showAllRanks}
                            userSheetByBattleTag={userSheetByBattleTag}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
