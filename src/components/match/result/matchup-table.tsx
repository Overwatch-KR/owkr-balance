import { useState, type ReactNode } from 'react';
import { Ban, Star, ShieldQuestion } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatRank } from '../../../constants';
import type { MatchResultData, Player, Role, SwapSource, Tier } from '../../../types';
import { DamageIcon, SupportIcon, TankIcon } from '../../roles/icon';
import { getTierImage } from '../../../utils/tier';
import {
    getPlayerUserSheetLookupKey,
    type UserSheetEntry,
} from '../../../utils/user-sheet';
import PlayerTooltip from './player-tooltip';
import { PlayerSheetNote } from './player-sheet-note';
import { PlayerIdentity } from '../../player/player-identity';
import { BattleTagCopyButton } from '../../player/battle-tag-copy-button';

interface MatchupTableProps {
    matchResult: MatchResultData;
    onSlotClick: (teamIdx: number, role: Role, idx: number) => void;
    swapSource: SwapSource | null;
    showAllRanks?: boolean;
    userSheetByBattleTag?: Map<string, UserSheetEntry>;
}

interface RowDef {
    role: Role;
    arrayIndex: number;
    playerA: Player;
    playerB: Player;
}

interface PlayerStatusIndicatorsProps {
    isPreferred: boolean;
    isAvoided: boolean;
    className?: string;
}

const PlayerStatusIndicators = ({
    isPreferred,
    isAvoided,
    className = '',
}: PlayerStatusIndicatorsProps) => (
    <div className={`flex shrink-0 items-center gap-1 ${className}`}>
        {isPreferred && (
            <span className="inline-flex text-yellow-400" aria-label="선호 역할" title="선호 역할">
                <Star size={12} className="fill-current" aria-hidden="true" />
            </span>
        )}
        {isAvoided && (
            <span className="inline-flex text-rose-400" aria-label="비선호 역할" title="비선호 역할">
                <Ban size={12} aria-hidden="true" />
            </span>
        )}
    </div>
);

interface PlayerIdentityWithStatusProps {
    player: Player;
    rank: ReturnType<typeof getRankInfo>;
    align: 'left' | 'right';
    className?: string;
}

/**
 * @description 상태 아이콘을 1팀은 이름 왼쪽, 2팀은 이름 오른쪽에 붙여 이름 기준선을 유지한다.
 */
const PlayerIdentityWithStatus = ({
    player,
    rank,
    align,
    className = '',
}: PlayerIdentityWithStatusProps) => {
    const statusIndicators = (
        <PlayerStatusIndicators
            isPreferred={rank.isPreferred}
            isAvoided={rank.isAvoided}
        />
    );

    return (
        <div className={`flex min-w-0 items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : 'justify-start'
        } ${className}`}>
            {align === 'right' ? statusIndicators : null}
            <PlayerIdentity player={player} align={align} grow={false} />
            {align === 'left' ? statusIndicators : null}
            <BattleTagCopyButton battleTag={player.name} className="pointer-events-auto" />
        </div>
    );
};

const getRoleIcon = (role: Role) => {
    switch (role) {
        case 'TANK': return <TankIcon className="text-slate-400" size={18} />;
        case 'DPS': return <DamageIcon className="text-slate-400" size={18} />;
        case 'SUPPORT': return <SupportIcon className="text-slate-400" size={18} />;
    }
};

const getRankInfo = (player: Player, role: Role) =>
    role === 'TANK' ? player.tank : role === 'DPS' ? player.dps : player.sup;

/**
 * @description 정식 티어는 기존 이미지를, 미배치는 같은 자리에 중립 방패 아이콘을 표시한다.
 */
const renderTierIcon = (tier: Tier, size: 20 | 24): ReactNode => {
    if (tier === 'UNRANKED') {
        return (
            <span
                className={`inline-flex shrink-0 items-center justify-center rounded-md border border-slate-600/70 bg-slate-800/80 text-slate-300 ${
                    size === 24 ? 'h-6 w-6' : 'h-5 w-5'
                }`}
                data-tier-icon="unranked"
                aria-hidden="true"
            >
                <ShieldQuestion size={size === 24 ? 16 : 14} strokeWidth={1.75} />
            </span>
        );
    }

    const tierImage = getTierImage(tier);
    if (!tierImage) return null;

    return (
        <img
            src={tierImage}
            alt=""
            width={size}
            height={size}
            aria-hidden="true"
            className={`${size === 24 ? 'h-6 w-6' : 'h-5 w-5'} object-contain`}
            onError={(event) => event.currentTarget.style.display = 'none'}
        />
    );
};

const roleRankDefs = [
    { role: 'TANK', label: '탱커' },
    { role: 'DPS', label: '딜러' },
    { role: 'SUPPORT', label: '힐러' },
] as const;

interface PlayerRankSummaryProps {
    player: Player;
    assignedRole: Role;
    align: 'left' | 'right';
}

const getCompactRoleIcon = (role: Role) => {
    switch (role) {
        case 'TANK': return <TankIcon size={12} aria-hidden="true" />;
        case 'DPS': return <DamageIcon size={12} aria-hidden="true" />;
        case 'SUPPORT': return <SupportIcon size={12} aria-hidden="true" />;
    }
};

/**
 * @description 탱커, 딜러, 힐러 티어를 고정 순서로 보여주고 현재 배정 역할을 강조한다.
 */
const PlayerRankSummary = ({ player, assignedRole, align }: PlayerRankSummaryProps) => (
    <div className={`flex w-full flex-wrap items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {roleRankDefs.map(({ role, label }) => {
            const rank = getRankInfo(player, role);
            const isAssigned = role === assignedRole;
            const isUnranked = rank.tier === 'UNRANKED';
            const rankLabel = formatRank(rank);

            return (
                <span
                    key={role}
                    title={`${label} ${rankLabel}${isAssigned ? ' · 현재 배정' : ''}`}
                    data-tier={rank.tier}
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 font-mono text-[11px] leading-none ${
                        isUnranked
                            ? isAssigned
                                ? 'border-slate-400/70 bg-slate-700/70 font-semibold text-slate-100 ring-1 ring-slate-300/40'
                                : 'border-slate-600/50 bg-slate-800/60 text-slate-400'
                            : isAssigned
                            ? 'border-cyan-400/40 bg-cyan-400/10 font-semibold text-cyan-200'
                            : rank.isPreferred
                                ? 'border-transparent text-amber-400'
                                : rank.isAvoided
                                    ? 'border-transparent text-rose-400'
                                    : 'border-transparent text-slate-500'
                    }`}
                >
                    {getCompactRoleIcon(role)}
                    {rankLabel}
                </span>
            );
        })}
    </div>
);

/**
 * @description 두 팀의 역할별 맞대결을 한 줄씩 보여주는 테이블 컴포넌트.
 */
const MatchupTable = ({
    matchResult,
    onSlotClick,
    swapSource,
    showAllRanks = false,
    userSheetByBattleTag,
}: MatchupTableProps) => {
    const { teamA, teamB } = matchResult;
    const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

    const rows: RowDef[] = [
        { role: 'TANK',    arrayIndex: 0, playerA: teamA.assignment.TANK[0],    playerB: teamB.assignment.TANK[0] },
        { role: 'DPS',     arrayIndex: 0, playerA: teamA.assignment.DPS[0],     playerB: teamB.assignment.DPS[0] },
        { role: 'DPS',     arrayIndex: 1, playerA: teamA.assignment.DPS[1],     playerB: teamB.assignment.DPS[1] },
        { role: 'SUPPORT', arrayIndex: 0, playerA: teamA.assignment.SUPPORT[0], playerB: teamB.assignment.SUPPORT[0] },
        { role: 'SUPPORT', arrayIndex: 1, playerA: teamA.assignment.SUPPORT[1], playerB: teamB.assignment.SUPPORT[1] },
    ];

    const isSelected = (teamIdx: number, role: Role, idx: number) =>
        swapSource?.teamIdx === teamIdx && swapSource?.role === role && swapSource?.index === idx;

    return (
        <div id="matchup-table" className="space-y-1.5">
            {/* 팀 헤더 */}
            <div className="mb-4 flex items-center px-3.5">
                <div className="flex-1 flex items-center gap-2">
                    <span className="font-bold text-lg text-blue-400">1팀</span>
                    <span className="text-xs px-2 py-1 rounded font-semibold bg-orange-500/20 text-orange-300">선공격</span>
                </div>
                <div className="w-7 sm:w-10" />
                <div className="flex-1 flex items-center gap-2 flex-row-reverse">
                    <span className="font-bold text-lg text-red-400">2팀</span>
                    <span className="text-xs px-2 py-1 rounded font-semibold bg-emerald-500/20 text-emerald-300">선수비</span>
                </div>
            </div>

            {/* 맞대결 행 */}
            {rows.map((row) => {
                const rankA = getRankInfo(row.playerA, row.role);
                const rankB = getRankInfo(row.playerB, row.role);
                const selA = isSelected(0, row.role, row.arrayIndex);
                const selB = isSelected(1, row.role, row.arrayIndex);
                const slotKeyA = `A-${row.role}-${row.arrayIndex}`;
                const slotKeyB = `B-${row.role}-${row.arrayIndex}`;
                const sheetNoteA = userSheetByBattleTag?.get(
                    getPlayerUserSheetLookupKey(row.playerA),
                )?.note;
                const sheetNoteB = userSheetByBattleTag?.get(
                    getPlayerUserSheetLookupKey(row.playerB),
                )?.note;
                const rowHasSheetNote = Boolean(sheetNoteA?.trim() || sheetNoteB?.trim());

                return (
                    <div
                        key={`${row.role}-${row.arrayIndex}`}
                        id={row.role === 'TANK' ? 'matchup-tank-row' : undefined}
                        data-matchup-row
                        className="flex items-stretch gap-1.5 rounded-lg border border-slate-700/70 bg-slate-950/20"
                    >
                        {/* TEAM 1 슬롯 */}
                        <div
                            data-match-slot
                            className="relative flex min-w-0 flex-1"
                            onMouseEnter={() => setHoveredSlot(slotKeyA)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            onFocus={() => setHoveredSlot(slotKeyA)}
                            onBlur={() => setHoveredSlot(null)}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                <motion.div
                                    key={row.playerA.id}
                                    data-match-player-id={row.playerA.id}
                                    data-match-team="1"
                                    initial={{ opacity: 0, x: '38%' }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: '38%' }}
                                    transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                                    className={`relative flex w-full min-w-0 items-center justify-end rounded-l-lg transition-colors ${
                                        selA ? 'bg-blue-900/40 ring-1 ring-inset ring-blue-500' : 'hover:bg-slate-800/70'
                                    }`}
                                >
                                <button
                                    type="button"
                                    data-exclude-export
                                    data-html2canvas-ignore="true"
                                    onClick={() => onSlotClick(0, row.role, row.arrayIndex)}
                                    aria-label={`${row.playerA.discordName ?? row.playerA.name} 교체 슬롯 선택`}
                                    aria-pressed={selA}
                                    className="absolute inset-0 z-0 rounded-l-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                />
                                <div className="pointer-events-none relative z-10 flex w-full min-w-0 flex-col px-2.5 py-2.5 text-right sm:px-4 sm:py-3">
                                    {showAllRanks ? (
                                        <>
                                            <PlayerIdentityWithStatus
                                                player={row.playerA}
                                                rank={rankA}
                                                align="right"
                                                className="w-full"
                                            />
                                            <div className="mt-1.5 w-full">
                                                <PlayerRankSummary player={row.playerA} assignedRole={row.role} align="right" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="hidden w-full min-w-0 items-center justify-end gap-2 sm:flex">
                                                <PlayerIdentityWithStatus
                                                    player={row.playerA}
                                                    rank={rankA}
                                                    align="right"
                                                    className="flex-1"
                                                />
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {renderTierIcon(rankA.tier, 24)}
                                                    <span className="w-10 text-left font-mono text-sm text-slate-200">
                                                        {formatRank(rankA).replace('★', '').replace('?', '')}
                                                    </span>
                                                </div>
                                            </div>
                                            <PlayerIdentityWithStatus
                                                player={row.playerA}
                                                rank={rankA}
                                                align="right"
                                                className="w-full sm:hidden"
                                            />
                                            <div className="mt-1 flex w-full items-center justify-end gap-1.5 sm:hidden">
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {renderTierIcon(rankA.tier, 20)}
                                                    <span className="font-mono text-xs text-slate-200">
                                                        {formatRank(rankA).replace('★', '').replace('?', '')}
                                                    </span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <PlayerSheetNote
                                        note={sheetNoteA}
                                        align="right"
                                        reserveSpace={rowHasSheetNote}
                                    />
                                </div>
                                </motion.div>
                            </AnimatePresence>
                            <PlayerTooltip player={row.playerA} visible={hoveredSlot === slotKeyA} />
                        </div>

                        {/* 역할 아이콘 (중앙) */}
                        <div className="flex w-7 shrink-0 items-center justify-center sm:w-10">
                            {getRoleIcon(row.role)}
                        </div>

                        {/* TEAM 2 슬롯 */}
                        <div
                            data-match-slot
                            className="relative flex min-w-0 flex-1"
                            onMouseEnter={() => setHoveredSlot(slotKeyB)}
                            onMouseLeave={() => setHoveredSlot(null)}
                            onFocus={() => setHoveredSlot(slotKeyB)}
                            onBlur={() => setHoveredSlot(null)}
                        >
                            <AnimatePresence initial={false} mode="popLayout">
                                <motion.div
                                    key={row.playerB.id}
                                    data-match-player-id={row.playerB.id}
                                    data-match-team="2"
                                    initial={{ opacity: 0, x: '-38%' }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: '-38%' }}
                                    transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                                    className={`relative flex w-full min-w-0 items-center rounded-r-lg transition-colors ${
                                        selB ? 'bg-red-900/30 ring-1 ring-inset ring-red-500' : 'hover:bg-slate-800/70'
                                    }`}
                                >
                                <button
                                    type="button"
                                    data-exclude-export
                                    data-html2canvas-ignore="true"
                                    onClick={() => onSlotClick(1, row.role, row.arrayIndex)}
                                    aria-label={`${row.playerB.discordName ?? row.playerB.name} 교체 슬롯 선택`}
                                    aria-pressed={selB}
                                    className="absolute inset-0 z-0 rounded-r-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                />
                                <div className="pointer-events-none relative z-10 flex w-full min-w-0 flex-col px-2.5 py-2.5 text-left sm:px-4 sm:py-3">
                                    {showAllRanks ? (
                                        <>
                                            <PlayerIdentityWithStatus
                                                player={row.playerB}
                                                rank={rankB}
                                                align="left"
                                                className="w-full"
                                            />
                                            <div className="mt-1.5 w-full">
                                                <PlayerRankSummary player={row.playerB} assignedRole={row.role} align="left" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="hidden w-full min-w-0 items-center gap-2 sm:flex">
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <span className="w-10 text-right font-mono text-sm text-slate-200">
                                                        {formatRank(rankB).replace('★', '').replace('?', '')}
                                                    </span>
                                                    {renderTierIcon(rankB.tier, 24)}
                                                </div>
                                                <PlayerIdentityWithStatus
                                                    player={row.playerB}
                                                    rank={rankB}
                                                    align="left"
                                                    className="flex-1"
                                                />
                                            </div>
                                            <PlayerIdentityWithStatus
                                                player={row.playerB}
                                                rank={rankB}
                                                align="left"
                                                className="w-full sm:hidden"
                                            />
                                            <div className="mt-1 flex w-full items-center gap-1.5 sm:hidden">
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <span className="font-mono text-xs text-slate-200">
                                                        {formatRank(rankB).replace('★', '').replace('?', '')}
                                                    </span>
                                                    {renderTierIcon(rankB.tier, 20)}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <PlayerSheetNote
                                        note={sheetNoteB}
                                        align="left"
                                        reserveSpace={rowHasSheetNote}
                                    />
                                </div>
                                </motion.div>
                            </AnimatePresence>
                            <PlayerTooltip player={row.playerB} visible={hoveredSlot === slotKeyB} alignRight />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MatchupTable;
