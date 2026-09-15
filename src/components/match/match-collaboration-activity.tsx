import { UserRound } from 'lucide-react';
import type { MatchLiveRecentChange } from '#domain/balance';

interface MatchCollaborationActivityProps {
    recentChange: MatchLiveRecentChange;
}

const CHANGE_LABELS = {
    ROSTER: '명단 수정',
    TEAMS: '팀 배정 수정',
    ROSTER_AND_TEAMS: '명단·팀 배정 수정',
} as const;

const formatChangeTime = (timestamp: number): string => new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
}).format(timestamp);

/**
 * @description 팀 결과 가까이에 가장 최근 공동 편집자의 Discord 프로필과 작업을 표시한다.
 */
export function MatchCollaborationActivity({
    recentChange,
}: MatchCollaborationActivityProps) {
    const { actor, kind, updatedAt } = recentChange;
    const label = CHANGE_LABELS[kind];

    return (
        <div
            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.055] py-1 pl-1 pr-2.5"
            title={`${actor.displayName} · ${label} · ${formatChangeTime(updatedAt)}`}
        >
            <span
                role="img"
                aria-label={`${actor.displayName} 프로필`}
                className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 text-[9px] font-bold text-cyan-200 ring-1 ring-inset ring-cyan-400/20"
            >
                <span aria-hidden="true">
                    {actor.displayName.slice(0, 1).toUpperCase() || <UserRound size={12} />}
                </span>
                {actor.avatarUrl ? (
                    <img
                        src={actor.avatarUrl}
                        alt=""
                        aria-hidden="true"
                        width={24}
                        height={24}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={event => {
                            event.currentTarget.hidden = true;
                        }}
                    />
                ) : null}
            </span>
            <span className="min-w-0 truncate text-[11px] text-slate-400">
                <strong className="font-semibold text-slate-200">{actor.displayName}</strong>
                <span aria-hidden="true"> · </span>
                {label}
                <span className="hidden sm:inline"> · {formatChangeTime(updatedAt)}</span>
            </span>
        </div>
    );
}
