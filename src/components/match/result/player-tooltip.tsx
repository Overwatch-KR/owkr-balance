import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getTooltipPosition } from './tooltip-position';
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
    note?: string;
    alignRight?: boolean;
}

const PlayerTooltip = ({ player, visible, note, alignRight = false }: PlayerTooltipProps) => {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const anchor = anchorRef.current?.parentElement;
        const panel = panelRef.current;
        if (!visible || !anchor || !panel) return;

        const updatePosition = () => {
            const rect = anchor.getBoundingClientRect();
            const position = getTooltipPosition(rect, panel.getBoundingClientRect(), {
                width: window.innerWidth,
                height: window.innerHeight,
            }, alignRight);
            panel.style.left = `${position.left}px`;
            panel.style.top = `${position.top}px`;
            panel.style.visibility = rect.bottom <= 0 || rect.top >= window.innerHeight ? 'hidden' : 'visible';
        };

        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(anchor);
        observer.observe(panel);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [visible, alignRight, player, note]);

    return <>
        <span ref={anchorRef} hidden />
        {visible && typeof document !== 'undefined' && createPortal(
        <div
            ref={panelRef}
            role="tooltip"
            data-exclude-export
            data-html2canvas-ignore="true"
            style={{ visibility: 'hidden' }}
            className="pointer-events-none fixed z-[100] hidden w-64 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-hidden rounded-lg border border-slate-700 bg-surface-elevated p-3 shadow-xl sm:block"
        >
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
            {note?.trim() && (
                <div className="mt-2 border-t border-slate-700 pt-2">
                    <div className="mb-1 text-xs text-emerald-300">특이사항</div>
                    <p className="line-clamp-6 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-300">{note.trim()}</p>
                </div>
            )}
        </div>, document.body)}
    </>;
};

export default PlayerTooltip;
