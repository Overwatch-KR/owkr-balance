import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';

interface EventParticipantIdentityProps {
    participant: ScrimRosterParticipant;
}

const DISCORD_USER_ID_PATTERN = /^\d{17,20}$/;

const getDiscordUserId = (participant: ScrimRosterParticipant): string | undefined => (
    participant.discordUserId
    ?? (DISCORD_USER_ID_PATTERN.test(participant.id) ? participant.id : undefined)
);

/**
 * @description Discord 이름과 고유 ID를 우선하고 배틀태그를 보조 정보로 표시한다.
 */
export function EventParticipantIdentity({ participant }: EventParticipantIdentityProps) {
    const discordUserId = getDiscordUserId(participant);
    const displayName = participant.discordName || participant.name;
    const initial = displayName.trim().charAt(0).toLocaleUpperCase('ko-KR') || '?';

    return (
        <span className="flex min-w-0 flex-1 items-center gap-3">
            <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-200 ring-1 ring-inset ring-indigo-400/20"
                aria-hidden="true"
            >
                {initial}
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold text-slate-100">{displayName}</span>
                    {!participant.discordName ? (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            Discord 이름 없음
                        </span>
                    ) : null}
                </span>
                <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={discordUserId ? 'font-mono text-indigo-300' : 'text-amber-300/80'}>
                        Discord ID {discordUserId ?? '미등록'}
                    </span>
                    <span className="min-w-0 truncate text-slate-500">
                        Battle.net <span className="text-slate-400">{participant.name}</span>
                    </span>
                </span>
            </span>
        </span>
    );
}
