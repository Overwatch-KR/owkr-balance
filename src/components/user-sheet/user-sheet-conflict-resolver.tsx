import { Check, GitMerge, Loader2, RotateCcw, Server, Undo2 } from 'lucide-react';
import type {
    UserSheetMergeChoice,
    UserSheetMergeConflict,
    UserSheetMergeResolutions,
} from '../../utils/user-sheet-merge';

interface UserSheetConflictResolverProps {
    autoMergedCount: number;
    conflicts: UserSheetMergeConflict[];
    isApplying: boolean;
    onApply: () => void;
    onDismiss: () => void;
    onResolve: (conflictId: string, choice: UserSheetMergeChoice) => void;
    onResolveAll: (choice: UserSheetMergeChoice) => void;
    resolutions: UserSheetMergeResolutions;
}

const displayValue = (value: string): string => value || '(비어 있음)';

/**
 * @description 409 동시 수정 충돌을 수정 전·내 초안·최신값으로 비교하고 필드별 선택을 받는다.
 */
export function UserSheetConflictResolver({
    autoMergedCount,
    conflicts,
    isApplying,
    onApply,
    onDismiss,
    onResolve,
    onResolveAll,
    resolutions,
}: UserSheetConflictResolverProps) {
    const unresolvedCount = conflicts.filter(conflict => !resolutions[conflict.id]).length;
    const canApply = unresolvedCount === 0 && !isApplying;

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-surface-elevated" role="dialog" aria-labelledby="user-sheet-conflict-title">
            <header className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-4 md:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                            <GitMerge size={18} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="user-sheet-conflict-title" className="font-semibold text-white">
                                다른 관리자의 변경과 겹쳤습니다
                            </h2>
                            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
                                겹친 항목만 어느 값을 남길지 선택해 주세요. 선택하지 않은 초안은 저장되지 않습니다.
                            </p>
                            {autoMergedCount > 0 && (
                                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
                                    <Check size={12} aria-hidden="true" />
                                    서로 겹치지 않은 변경 {autoMergedCount}개는 자동으로 합쳤습니다.
                                </p>
                            )}
                        </div>
                    </div>
                    {conflicts.length > 1 && (
                        <div className="flex shrink-0 gap-1.5">
                            <button
                                type="button"
                                onClick={() => onResolveAll('DRAFT')}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.07] px-2.5 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/15"
                            >
                                <Undo2 size={12} aria-hidden="true" />
                                모두 내 초안
                            </button>
                            <button
                                type="button"
                                onClick={() => onResolveAll('LATEST')}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-2.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/15"
                            >
                                <Server size={12} aria-hidden="true" />
                                모두 최신값
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
                <div className="mx-auto grid max-w-5xl gap-3">
                    {conflicts.length === 0 ? (
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm text-emerald-200">
                            직접 선택할 충돌은 없습니다. 자동 병합된 내용을 확인하고 다시 저장해 주세요.
                        </div>
                    ) : conflicts.map(conflict => {
                        const selected = resolutions[conflict.id];
                        return (
                            <section
                                key={conflict.id}
                                className="overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/35"
                                aria-labelledby={`user-sheet-conflict-${conflict.id}`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2.5">
                                    <h3 id={`user-sheet-conflict-${conflict.id}`} className="text-xs font-medium text-slate-200">
                                        {conflict.rowLabel}
                                        <span className="ml-2 text-slate-400">· {conflict.fieldLabel}</span>
                                    </h3>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                        selected
                                            ? 'bg-emerald-500/10 text-emerald-300'
                                            : 'bg-amber-500/10 text-amber-300'
                                    }`}>
                                        {selected ? '선택 완료' : '선택 필요'}
                                    </span>
                                </div>
                                <div className="grid md:grid-cols-3">
                                    <div className="border-b border-slate-800 p-3 md:border-b-0 md:border-r">
                                        <p className="text-[11px] font-medium tracking-wide text-slate-400">수정 전</p>
                                        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-400">
                                            {displayValue(conflict.baseValue)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onResolve(conflict.id, 'DRAFT')}
                                        aria-pressed={selected === 'DRAFT'}
                                        className={`min-h-20 border-b p-3 text-left transition-colors md:border-b-0 md:border-r ${
                                            selected === 'DRAFT'
                                                ? 'border-cyan-400/50 bg-cyan-500/[0.11] ring-1 ring-inset ring-cyan-400/50'
                                                : 'border-slate-800 hover:bg-cyan-500/[0.05]'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-cyan-300">
                                            내 초안
                                            {selected === 'DRAFT' && <Check size={12} aria-hidden="true" />}
                                        </span>
                                        <span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">
                                            {displayValue(conflict.draftValue)}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onResolve(conflict.id, 'LATEST')}
                                        aria-pressed={selected === 'LATEST'}
                                        className={`min-h-20 p-3 text-left transition-colors ${
                                            selected === 'LATEST'
                                                ? 'bg-emerald-500/[0.11] ring-1 ring-inset ring-emerald-400/50'
                                                : 'hover:bg-emerald-500/[0.05]'
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                                            서버 최신값
                                            {selected === 'LATEST' && <Check size={12} aria-hidden="true" />}
                                        </span>
                                        <span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-200">
                                            {displayValue(conflict.latestValue)}
                                        </span>
                                    </button>
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>

            <footer className="shrink-0 border-t border-slate-800 bg-slate-900/80 px-4 py-3 md:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-400" role="status" aria-live="polite">
                        {unresolvedCount > 0
                            ? `${unresolvedCount}개 항목의 값을 선택해 주세요.`
                            : '병합할 값 선택을 완료했습니다.'}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onDismiss}
                            disabled={isApplying}
                            className="btn-ghost min-h-9 disabled:opacity-40"
                        >
                            <RotateCcw size={13} aria-hidden="true" />
                            초안으로 돌아가기
                        </button>
                        <button
                            type="button"
                            onClick={onApply}
                            disabled={!canApply}
                            className="btn-primary inline-flex min-h-9 items-center gap-2 disabled:opacity-40"
                        >
                            {isApplying
                                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                : <GitMerge size={14} aria-hidden="true" />}
                            {isApplying ? '병합 저장 중…' : '병합 내용 저장'}
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
}
