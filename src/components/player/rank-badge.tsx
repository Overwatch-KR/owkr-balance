import { Check, ShieldQuestion } from 'lucide-react';
import { formatRank, TIER_LABEL_MAP } from '../../constants';
import type { Rank, Role } from '../../types';
import { DamageIcon, SupportIcon, TankIcon } from '../roles/icon';

interface RankBadgeProps {
    role: Role;
    rank: Rank;
    isAssigned?: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
    TANK: '탱커',
    DPS: '딜러',
    SUPPORT: '지원',
};

const ASSIGNED_STYLES: Record<Role, { badge: string; marker: string }> = {
    TANK: {
        badge: 'bg-blue-400/10 ring-2 ring-blue-400/80 shadow-[inset_0_0_10px_rgba(96,165,250,0.12)]',
        marker: 'bg-blue-400 text-blue-950',
    },
    DPS: {
        badge: 'bg-orange-400/10 ring-2 ring-orange-400/80 shadow-[inset_0_0_10px_rgba(251,146,60,0.12)]',
        marker: 'bg-orange-400 text-orange-950',
    },
    SUPPORT: {
        badge: 'bg-emerald-400/10 ring-2 ring-emerald-400/80 shadow-[inset_0_0_10px_rgba(52,211,153,0.12)]',
        marker: 'bg-emerald-400 text-emerald-950',
    },
};

const UNRANKED_ASSIGNED_STYLE = {
    badge: 'bg-slate-700/80 ring-2 ring-slate-300/70 shadow-[inset_0_0_10px_rgba(203,213,225,0.08)]',
    marker: 'bg-slate-300 text-slate-900',
};

const getRoleIcon = (role: Role) => {
    switch (role) {
        case 'TANK':
            return <TankIcon size={12} aria-hidden="true" />;
        case 'DPS':
            return <DamageIcon size={12} aria-hidden="true" />;
        case 'SUPPORT':
            return <SupportIcon size={12} aria-hidden="true" />;
    }
};

const getAccessibleLabel = (role: Role, rank: Rank, isAssigned: boolean): string => {
    const roleLabel = ROLE_LABELS[role];
    const rankLabel = rank.tier === 'UNRANKED'
        ? '미배치'
        : `${TIER_LABEL_MAP[rank.tier] ?? rank.tier} ${rank.div} 디비전`;
    const preferenceLabel = rank.isPreferred
        ? ', 선호 역할'
        : rank.isAvoided
            ? ', 비선호 역할'
            : '';
    const assignedLabel = isAssigned ? ', 현재 배정 역할' : '';

    return `${roleLabel} ${rankLabel}${preferenceLabel}${assignedLabel}`;
};

/**
 * @description 참가자 목록과 팀 결과에서 같은 역할·티어·선호 상태 포맷을 제공한다.
 */
const RankBadge = ({ role, rank, isAssigned = false }: RankBadgeProps) => {
    const accessibleLabel = getAccessibleLabel(role, rank, isAssigned);
    const isUnranked = rank.tier === 'UNRANKED';
    const statusClass = isUnranked
        ? 'border-slate-600/70 bg-slate-800/80 text-slate-300'
        : rank.isPreferred
        ? 'font-semibold text-amber-400'
        : rank.isAvoided
            ? 'text-rose-400'
            : 'text-slate-500';
    const assignedStyle = isAssigned
        ? isUnranked ? UNRANKED_ASSIGNED_STYLE : ASSIGNED_STYLES[role]
        : null;
    const containerClass = isUnranked
        ? 'rounded-md border px-1.5 py-1'
        : assignedStyle ? 'rounded-md px-1.5 py-1' : '';

    return (
        <span
            className={`relative inline-flex shrink-0 items-center gap-1 text-xs ${containerClass} ${statusClass} ${
                assignedStyle?.badge ?? ''
            }`}
            aria-label={accessibleLabel}
            title={accessibleLabel}
            data-rank-role={role}
            data-tier={rank.tier}
            data-assigned={isAssigned ? 'true' : undefined}
        >
            <span className="inline-flex" aria-hidden="true">
                {getRoleIcon(role)}
            </span>
            {isUnranked && <ShieldQuestion size={12} aria-hidden="true" />}
            <span aria-hidden="true">{formatRank(rank)}</span>
            {assignedStyle && (
                <span
                    className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${assignedStyle.marker}`}
                    aria-hidden="true"
                >
                    <Check size={9} strokeWidth={3} />
                </span>
            )}
        </span>
    );
};

export default RankBadge;
