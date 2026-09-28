import { ArrowRight } from 'lucide-react';

interface MatchWorkspaceHeaderProps {
    participantCount: number;
    waitlistCount: number;
    onManageParticipants: () => void;
}

/**
 * @description 대진표 화면의 준비 상태와 공동 작업 연결 상태를 간결하게 안내한다.
 */
export function MatchWorkspaceHeader({
    participantCount,
    waitlistCount,
    onManageParticipants,
}: MatchWorkspaceHeaderProps) {
    const remainingCount = Math.max(10 - participantCount, 0);
    const rosterStatus = participantCount === 10
        ? '준비 완료'
        : participantCount === 0
            ? '명단 없음'
            : `${remainingCount}명 부족`;

    return (
        <header className="flex flex-col gap-3 border-b border-slate-700/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
                <h1 className="text-pretty text-[30px] font-semibold tracking-[-0.035em] text-white">대진표</h1>
                <p className="text-sm text-slate-400">
                    현재 명단
                    <strong className="ml-2 font-mono text-base font-semibold tabular-nums text-slate-100">
                        {participantCount}/10
                    </strong>
                    <span className={`ml-2 text-xs ${participantCount === 10 ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {rosterStatus}
                    </span>
                    {waitlistCount > 0 && (
                        <span className="ml-3 text-xs tabular-nums text-slate-500">대기 {waitlistCount}</span>
                    )}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    id="participant-workspace-button"
                    type="button"
                    onClick={onManageParticipants}
                    className="btn-ghost inline-flex min-h-9 items-center gap-2 px-2 text-sm text-cyan-300"
                >
                    명단 관리
                    <ArrowRight size={15} aria-hidden="true" />
                </button>
            </div>
        </header>
    );
}
