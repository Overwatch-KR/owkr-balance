import { ArrowRight, Users } from 'lucide-react';

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
        ? '10명 준비 완료'
        : participantCount === 0
            ? '아직 참가자가 없습니다'
            : `${remainingCount}명 더 필요`;

    return (
        <header className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-pretty text-2xl font-semibold tracking-tight text-white">대진표</h1>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                        participantCount === 10
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-800/80 text-slate-300'
                    }`}>
                        <Users size={13} aria-hidden="true" />
                        {rosterStatus}
                    </span>
                    {waitlistCount > 0 && (
                        <span className="text-xs tabular-nums text-slate-500">대기 {waitlistCount}명</span>
                    )}
                </div>
                <p className="mt-2 text-sm text-slate-400">
                    {participantCount === 10
                        ? '자동 배정 후 선수를 눌러 자리를 바꿀 수 있습니다.'
                        : '현재 명단을 채우면 바로 팀을 나눌 수 있습니다.'}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    id="participant-workspace-button"
                    type="button"
                    onClick={onManageParticipants}
                    className="btn-ghost inline-flex min-h-10 items-center gap-2 px-3 text-sm"
                >
                    명단 관리
                    <ArrowRight size={15} aria-hidden="true" />
                </button>
            </div>
        </header>
    );
}
