import { ArrowLeftRight, Ban, Check, ShieldCheck, ShieldQuestion, Star } from 'lucide-react';
import { formatRank, TIER_LABEL_MAP } from '../../../constants';
import type { MatchResultData, Player, Role, Tier } from '../../../types';
import { getTierImage } from '../../../utils/tier';
import { DamageIcon, SupportIcon, TankIcon } from '../../roles/icon';

interface AlternativeResultCardProps {
    candidate: MatchResultData;
    currentResult: MatchResultData;
    isCurrent?: boolean;
    onApply?: () => void;
    showComposition?: boolean;
}

interface AssignmentSlot {
    player: Player;
    role: Role;
    teamIndex: 0 | 1;
}

const NUMBER_FORMATTER = new Intl.NumberFormat('ko-KR');

const ROLE_DEFS = [
    { role: 'TANK', label: '탱커' },
    { role: 'DPS', label: '딜러' },
    { role: 'SUPPORT', label: '힐러' },
] as const;

const COMPOSITION_ROW_DEFS = [
    { role: 'TANK', arrayIndex: 0 },
    { role: 'DPS', arrayIndex: 0 },
    { role: 'DPS', arrayIndex: 1 },
    { role: 'SUPPORT', arrayIndex: 0 },
    { role: 'SUPPORT', arrayIndex: 1 },
] as const;

const ROLE_LABELS: Record<Role, string> = {
    TANK: '탱커',
    DPS: '딜러',
    SUPPORT: '힐러',
};

const getPlayerName = (player: Player): string => (
    player.discordName ?? player.name.split('#')[0]
);

const getAssignedRank = (player: Player, role: Role): Player['tank'] => (
    role === 'TANK' ? player.tank : role === 'DPS' ? player.dps : player.sup
);

const getRoleIcon = (role: Role) => {
    switch (role) {
        case 'TANK': return <TankIcon size={14} className="text-slate-500" aria-hidden="true" />;
        case 'DPS': return <DamageIcon size={14} className="text-slate-500" aria-hidden="true" />;
        case 'SUPPORT': return <SupportIcon size={14} className="text-slate-500" aria-hidden="true" />;
    }
};

/**
 * @description 기존 매치업 표와 같은 티어 이미지 또는 미배치 방패를 후보 카드에 표시한다.
 */
const renderTierIcon = (tier: Tier) => {
    if (tier === 'UNRANKED') {
        return (
            <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-400"
                data-tier-icon="unranked"
                aria-hidden="true"
            >
                <ShieldQuestion size={13} strokeWidth={1.75} />
            </span>
        );
    }

    const tierImage = getTierImage(tier);
    if (!tierImage) return null;

    return (
        <img
            src={tierImage}
            alt=""
            width={16}
            height={16}
            aria-hidden="true"
            className="h-4 w-4 shrink-0 object-contain"
            onError={event => event.currentTarget.style.display = 'none'}
        />
    );
};

interface CompositionPlayerProps {
    align: 'left' | 'right';
    player: Player;
    role: Role;
}

/**
 * @description 후보 조합에서 플레이어 이름과 실제 배정 역할 티어를 한 줄로 대조한다.
 */
const CompositionPlayer = ({ align, player, role }: CompositionPlayerProps) => {
    const rank = getAssignedRank(player, role);
    const rankLabel = formatRank(rank);
    const visibleRankLabel = rankLabel.replace('★', '').replace('?', '');
    const name = player.discordName?.trim() || player.name;
    const statusIndicators = (
        <span className="inline-flex shrink-0 items-center gap-0.5">
            {rank.isPreferred && (
                <Star size={10} className="fill-current text-yellow-400" aria-label="선호 역할" />
            )}
            {rank.isAvoided && (
                <Ban size={10} className="text-rose-400" aria-label="비선호 역할" />
            )}
        </span>
    );
    const rankDisplay = (
        <span
            className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-slate-300"
            title={`${ROLE_LABELS[role]} ${TIER_LABEL_MAP[rank.tier]}${
                rank.tier === 'UNRANKED' ? '' : ` ${rank.div} 디비전`
            }`}
            data-assigned-rank={rankLabel}
        >
            {align === 'left' && <span>{visibleRankLabel}</span>}
            {renderTierIcon(rank.tier)}
            {align === 'right' && <span>{visibleRankLabel}</span>}
        </span>
    );

    return (
        <div
            className={`flex min-w-0 items-center gap-1.5 px-2 py-2 ${
                align === 'right' ? 'justify-end' : 'justify-start'
            }`}
            title={player.name}
        >
            {align === 'right' && statusIndicators}
            {align === 'left' && rankDisplay}
            <span className={`min-w-0 break-all text-[11px] font-semibold leading-tight text-slate-200 ${
                align === 'right' ? 'text-right' : 'text-left'
            }`}>
                {name}
            </span>
            {align === 'right' && rankDisplay}
            {align === 'left' && statusIndicators}
        </div>
    );
};

const getAssignmentSlots = (result: MatchResultData): Map<number, AssignmentSlot> => {
    const slots = new Map<number, AssignmentSlot>();
    const addTeam = (teamIndex: 0 | 1, assignment: MatchResultData['teamA']['assignment']): void => {
        for (const role of ROLE_DEFS.map(definition => definition.role)) {
            for (const player of assignment[role]) {
                slots.set(player.id, { player, role, teamIndex });
            }
        }
    };

    addTeam(0, result.teamA.assignment);
    addTeam(1, result.teamB.assignment);
    return slots;
};

const getCandidateChanges = (
    currentResult: MatchResultData,
    candidate: MatchResultData,
) => {
    const currentSlots = getAssignmentSlots(currentResult);
    const candidateSlots = getAssignmentSlots(candidate);
    const movedToTeam1: string[] = [];
    const movedToTeam2: string[] = [];
    const roleChanged: string[] = [];

    for (const [playerId, candidateSlot] of candidateSlots) {
        const currentSlot = currentSlots.get(playerId);
        if (!currentSlot) continue;
        if (candidateSlot.teamIndex !== currentSlot.teamIndex) {
            const target = candidateSlot.teamIndex === 0 ? movedToTeam1 : movedToTeam2;
            target.push(getPlayerName(candidateSlot.player));
        } else if (candidateSlot.role !== currentSlot.role) {
            roleChanged.push(getPlayerName(candidateSlot.player));
        }
    }

    return {
        movedToTeam1,
        movedToTeam2,
        roleChanged,
        teamChangeCount: movedToTeam1.length + movedToTeam2.length,
    };
};

const formatScore = (score: number): string => NUMBER_FORMATTER.format(Math.round(score));

export function AlternativeResultCard({
    candidate,
    currentResult,
    isCurrent = false,
    onApply,
    showComposition = false,
}: AlternativeResultCardProps) {
    const metrics = candidate.metrics;
    const changes = getCandidateChanges(currentResult, candidate);
    const exceptionCount = (metrics?.preferenceViolations ?? 0)
        + (metrics?.avoidedAssignments ?? 0)
        + (metrics?.unrankedAssignments ?? 0);
    const rankLabel = candidate.evaluation
        ? `추천 ${candidate.evaluation.rank}위`
        : '수동 조정';

    return (
        <article className={`rounded-xl border p-3.5 ${
            isCurrent
                ? 'border-cyan-400/45 bg-cyan-500/[0.07] ring-1 ring-cyan-400/10'
                : 'border-slate-700/80 bg-slate-900/55'
        }`}>
            <div className="flex min-h-6 flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{rankLabel}</span>
                    {isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                            <Check size={10} aria-hidden="true" />
                            현재 조합
                        </span>
                    )}
                </div>
                {candidate.evaluation && (
                    <span
                        className="rounded-full bg-slate-950/70 px-2 py-1 font-mono text-[10px] tabular-nums text-violet-200"
                        title="팀 총점 차이, 역할별 맞대결 차이와 팀 내부 편차를 합산한 값입니다. 탱커 안전 기준과 배정 예외는 별도로 우선 평가됩니다."
                    >
                        균형 비용 {formatScore(candidate.evaluation.balanceCost)}
                    </span>
                )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-950/45 px-2.5 py-2">
                    <p className="text-[10px] text-slate-500">총점 차이</p>
                    <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-cyan-200">
                        {formatScore(metrics?.totalDiff ?? candidate.diff)}
                    </p>
                </div>
                {ROLE_DEFS.map(({ role, label }) => {
                    const roleKey = role === 'TANK' ? 'tank' : role === 'DPS' ? 'dps' : 'support';
                    return (
                        <div key={role} className="rounded-lg bg-slate-950/45 px-2.5 py-2">
                            <p className="text-[10px] text-slate-500">{label} 차이</p>
                            <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-300">
                                {formatScore(metrics?.roleDiffs[roleKey] ?? 0)}
                            </p>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2.5 flex h-[18px] flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] leading-[18px]">
                <span className="inline-flex items-center gap-1 text-slate-400">
                    <ArrowLeftRight size={12} className="text-cyan-400" aria-hidden="true" />
                    팀 이동 {changes.teamChangeCount}명
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400">역할 변경 {changes.roleChanged.length}명</span>
                <span className="text-slate-600">·</span>
                <span className={`inline-flex items-center gap-1 ${
                    exceptionCount === 0 ? 'text-emerald-300' : 'text-amber-300'
                }`}>
                    <ShieldCheck size={12} aria-hidden="true" />
                    배정 예외 {exceptionCount}건
                </span>
            </div>

            {(changes.teamChangeCount > 0 || showComposition) && (
                <div
                    className="mt-2 grid h-[18px] grid-cols-2 gap-1 overflow-hidden text-[11px] leading-[18px]"
                    data-candidate-change-slot
                    data-has-team-changes={changes.teamChangeCount > 0 ? 'true' : 'false'}
                    aria-hidden={changes.teamChangeCount === 0 ? true : undefined}
                >
                    {changes.teamChangeCount > 0 ? (
                        <>
                            <p className="h-[18px] min-w-0 truncate leading-[18px] text-blue-300" title={changes.movedToTeam1.join(' · ')}>
                                <span className="text-slate-500">1팀 합류</span> · {changes.movedToTeam1.join(' · ')}
                            </p>
                            <p className="h-[18px] min-w-0 truncate leading-[18px] text-red-300" title={changes.movedToTeam2.join(' · ')}>
                                <span className="text-slate-500">2팀 합류</span> · {changes.movedToTeam2.join(' · ')}
                            </p>
                        </>
                    ) : (
                        <>
                            <span />
                            <span />
                        </>
                    )}
                </div>
            )}

            {showComposition && (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/35">
                    <div className="grid grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)] items-center border-b border-slate-800 bg-slate-950/35 px-2.5 py-2">
                        <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="text-xs font-semibold text-blue-300">1팀</span>
                            <span className="font-mono text-[9px] tabular-nums text-slate-600">
                                {formatScore(candidate.teamA.realScore)}
                            </span>
                        </div>
                        <span className="text-center text-[9px] font-medium uppercase tracking-[0.14em] text-slate-700">
                            VS
                        </span>
                        <div className="flex min-w-0 items-baseline justify-end gap-1.5">
                            <span className="font-mono text-[9px] tabular-nums text-slate-600">
                                {formatScore(candidate.teamB.realScore)}
                            </span>
                            <span className="text-xs font-semibold text-red-300">2팀</span>
                        </div>
                    </div>
                    <div className="space-y-1.5 p-2">
                        {COMPOSITION_ROW_DEFS.map(({ role, arrayIndex }) => {
                            const teamAPlayer = candidate.teamA.assignment[role][arrayIndex];
                            const teamBPlayer = candidate.teamB.assignment[role][arrayIndex];
                            return (
                                <div
                                    key={`${role}-${arrayIndex}`}
                                    className="grid grid-cols-[minmax(0,1fr)_38px_minmax(0,1fr)] items-stretch rounded-lg border border-slate-700/70 bg-slate-950/20"
                                    data-candidate-matchup-row
                                >
                                    <CompositionPlayer align="right" player={teamAPlayer} role={role} />
                                    <span
                                        className="inline-flex items-center justify-center border-x border-slate-800/70"
                                        title={ROLE_LABELS[role]}
                                    >
                                        {getRoleIcon(role)}
                                        <span className="sr-only">{ROLE_LABELS[role]}</span>
                                    </span>
                                    <CompositionPlayer align="left" player={teamBPlayer} role={role} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {onApply && (
                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={onApply} className="btn-primary min-h-9 px-3 text-xs">
                        이 조합 적용
                    </button>
                </div>
            )}
        </article>
    );
}
