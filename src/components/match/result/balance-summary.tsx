import type { MatchResultData, Player, Rank, Role, TeamResult } from '../../../types';
import { formatAverageTierDifference } from '../../../utils/match-balance';

interface BalanceSummaryProps {
    matchResult: MatchResultData;
}

const ROLE_DIFFERENCE_DEFS = [
    { role: 'TANK', label: '탱커' },
    { role: 'DPS', label: '딜러' },
    { role: 'SUPPORT', label: '힐러' },
] as const;

interface AssignedPlayer {
    player: Player;
    rank: Rank;
    role: Role;
    teamLabel: '1팀' | '2팀';
}

const ROLE_LABELS: Record<Role, string> = {
    TANK: '탱커',
    DPS: '딜러',
    SUPPORT: '힐러',
};

const getRank = (player: Player, role: Role): Rank => (
    role === 'TANK' ? player.tank : role === 'DPS' ? player.dps : player.sup
);

const getAssignedPlayers = (
    team: TeamResult,
    teamLabel: AssignedPlayer['teamLabel'],
): AssignedPlayer[] => (Object.keys(team.assignment) as Role[]).flatMap(role => (
    team.assignment[role].map(player => ({
        player,
        rank: getRank(player, role),
        role,
        teamLabel,
    }))
));

const getRoleAverageScore = (team: TeamResult, role: Role): number => {
    const players = team.assignment[role];
    const totalScore = players.reduce((sum, player) => {
        const rank = role === 'TANK' ? player.tank : role === 'DPS' ? player.dps : player.sup;
        return sum + rank.score;
    }, 0);

    return Math.round(totalScore / players.length);
};

/**
 * @description 팀 총점과 역할별 차이, 배정 예외를 한눈에 비교할 수 있게 보여준다.
 */
const BalanceSummary = ({ matchResult }: BalanceSummaryProps) => {
    const { metrics, teamA, teamB } = matchResult;
    const totalDiff = metrics?.totalDiff ?? matchResult.diff;
    const totalLeadingTeam = teamA.realScore > teamB.realScore
        ? '1팀'
        : teamA.realScore < teamB.realScore ? '2팀' : null;
    const assignedPlayers = [
        ...getAssignedPlayers(teamA, '1팀'),
        ...getAssignedPlayers(teamB, '2팀'),
    ];
    const exceptions = [
        {
            label: '선호 역할 이탈',
            players: assignedPlayers.filter(({ player, rank }) => (
                [player.tank, player.dps, player.sup].some(candidate => candidate.isPreferred)
                && !rank.isPreferred
            )),
        },
        {
            label: '비선호 배정',
            players: assignedPlayers.filter(({ rank }) => rank.isAvoided),
        },
        {
            label: '미배치 역할',
            players: assignedPlayers.filter(({ rank }) => rank.tier === 'UNRANKED'),
        },
    ];
    const activeExceptions = exceptions.filter(({ players }) => players.length > 0);
    const roleDifferences = ROLE_DIFFERENCE_DEFS.map(({ role, label }) => {
        const scoreDifference = getRoleAverageScore(teamA, role) - getRoleAverageScore(teamB, role);

        return {
            role,
            label,
            leadingTeam: scoreDifference > 0 ? '1팀' : scoreDifference < 0 ? '2팀' : null,
            difference: Math.abs(scoreDifference),
        };
    });

    return (
        <section
            id="balance-summary"
            data-exclude-export
            className="border-b border-slate-700/70 pb-3"
            aria-labelledby="balance-summary-title"
        >
            <h3 id="balance-summary-title" className="text-sm font-semibold text-slate-100">
                밸런스 요약
            </h3>

            <dl className="mt-2 grid grid-cols-2 border-y border-slate-800/90 sm:grid-cols-4">
                <div className="border-b border-r border-slate-800/80 px-3 py-2.5 sm:border-b-0">
                    <dt className="text-[11px] text-slate-500">팀 평균 차이</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-100">
                        {totalLeadingTeam
                            ? `${totalLeadingTeam} ${formatAverageTierDifference(totalDiff, 5)}`
                            : '거의 동일'}
                    </dd>
                </div>
                {roleDifferences.map(({ role, label, leadingTeam, difference }, index) => (
                    <div
                        key={role}
                        className={`border-slate-800/80 px-3 py-2.5 sm:border-r sm:last:border-r-0 ${
                            index === 0
                                ? 'border-b sm:border-b-0'
                                : index === 1
                                    ? 'border-r'
                                    : ''
                        }`}
                    >
                        <dt className="text-[11px] text-slate-400">{label} 평균 차이</dt>
                        <dd
                            className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                                leadingTeam === '1팀'
                                    ? 'text-blue-300'
                                    : leadingTeam === '2팀'
                                        ? 'text-red-300'
                                        : 'text-slate-400'
                            }`}
                        >
                            {leadingTeam
                                ? `${leadingTeam} ${formatAverageTierDifference(
                                    difference,
                                    role === 'TANK' ? 1 : 2,
                                )}`
                                : '거의 동일'}
                        </dd>
                    </div>
                ))}
            </dl>

            <div id="balance-exceptions" className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span className="text-slate-500">배정 예외</span>
                {exceptions.map(({ label, players }) => (
                    <span
                        key={label}
                        className={`tabular-nums ${
                            players.length === 0
                                ? 'text-slate-500'
                                : 'font-medium text-amber-300'
                        }`}
                    >
                        {label} {players.length}명
                    </span>
                ))}
            </div>

            {activeExceptions.length > 0 && (
                <div className="mt-2 divide-y divide-amber-500/15 border-y border-amber-500/20">
                    {activeExceptions.map(({ label, players }) => (
                        <div
                            key={label}
                            className="min-w-0 px-3 py-2"
                        >
                            <p className="text-[11px] font-semibold text-amber-300">{label}</p>
                            <ul className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2" aria-label={`${label} 대상`}>
                                {players.map(({ player, role, teamLabel }) => {
                                    const playerName = player.discordName ?? player.name;

                                    return (
                                        <li
                                            key={`${player.id}-${role}`}
                                            className="flex min-w-0 items-center justify-between gap-2 text-[11px]"
                                        >
                                            <span className="min-w-0 break-words font-medium text-slate-200">
                                                {playerName}
                                            </span>
                                            <span className="shrink-0 text-slate-400">
                                                {teamLabel} · {ROLE_LABELS[role]}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default BalanceSummary;
