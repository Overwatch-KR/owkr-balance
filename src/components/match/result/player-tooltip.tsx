import type { ReactNode } from 'react';
import { Ban, Star } from 'lucide-react';
import { formatRank } from '../../../constants';
import type { Player } from '../../../types';
import { DamageIcon, SupportIcon, TankIcon } from '../../roles/icon';
import { PlayerIdentity } from '../../player/player-identity';

interface TooltipRowProps {
    icon: ReactNode;
    label: string;
    rank: Player['tank'];
}

const TooltipRow = ({ icon, label, rank }: TooltipRowProps) => (
    <div className={`flex items-center justify-between text-xs ${
        rank.tier === 'UNRANKED'
            ? 'text-slate-300'
            : rank.isPreferred ? 'text-amber-400' : rank.isAvoided ? 'text-rose-400' : 'text-slate-400'
    }`}>
        <div className="flex items-center gap-1.5">
            {icon}
            <span>{label}</span>
            {rank.isPreferred && <Star size={10} className="fill-amber-400" aria-hidden="true" />}
            {rank.isAvoided && <Ban size={10} aria-hidden="true" />}
        </div>
        <span
            className={`font-mono ${rank.tier === 'UNRANKED' ? 'rounded border border-slate-600/60 bg-slate-800/70 px-1.5 py-0.5' : rank.isPreferred ? 'font-semibold' : ''}`}
            data-tier={rank.tier}
        >
            {formatRank(rank).replace('★', '').replace('?', '')}
        </span>
    </div>
);

interface PlayerTooltipProps {
    player: Player;
    visible: boolean;
    showAbove?: boolean;
    alignRight?: boolean;
}

const PlayerTooltip = ({ player, visible, showAbove = false, alignRight = false }: PlayerTooltipProps) => {
    if (!visible) return null;

    const positionClass = showAbove
        ? 'bottom-full mb-2'
        : 'top-full mt-2';

    const alignClass = alignRight ? 'right-0' : 'left-0';

    return (
        <div className={`absolute ${alignClass} ${positionClass} z-50 hidden min-w-[180px] animate-fade-in rounded-lg border border-slate-700 bg-surface-elevated p-3 shadow-xl sm:block`}>
            <div className="mb-2 border-b border-slate-700 pb-2">
                <PlayerIdentity player={player} />
            </div>
            <div className="space-y-1.5">
                <TooltipRow
                    icon={<TankIcon size={14} aria-hidden="true" />}
                    label="탱커"
                    rank={player.tank}
                />
                <TooltipRow
                    icon={<DamageIcon size={14} aria-hidden="true" />}
                    label="딜러"
                    rank={player.dps}
                />
                <TooltipRow
                    icon={<SupportIcon size={14} aria-hidden="true" />}
                    label="힐러"
                    rank={player.sup}
                />
            </div>
        </div>
    );
};

export default PlayerTooltip;
