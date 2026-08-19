import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertCircle, Clock, FileSpreadsheet, NotebookPen, Pencil, Trash2, Users } from 'lucide-react';
import type { Player } from '../../../types';
import {
    getPlayerUserSheetLookupKey,
    type UserSheetEntry,
} from '../../../utils/user-sheet';
import { BattleTagCopyButton } from '../battle-tag-copy-button';
import { DouMascot } from '../../common/dou-mascot';
import { PlayerIdentity } from '../player-identity';
import RankBadge from '../rank-badge';
import PlayerNoteEditor from './player-note-editor';

interface PlayerListProps {
    participants: Player[];
    waitlist: Player[];
    onEditPlayer: (player: Player) => void;
    onRemovePlayer: (playerId: number) => void;
    onClearAll: () => void;
    csrfToken: string;
    noteCacheScope: string;
    userSheetByBattleTag: Map<string, UserSheetEntry>;
    onOpenUserSheet: (battleTag: string, entryId?: string) => void;
}

type PlayerListTab = 'participants' | 'waitlist';

/**
 * @description 참가자와 대기열을 탭으로 전환하며 제한된 스크롤 영역에서 관리한다.
 */
const PlayerList = ({
    participants,
    waitlist,
    onEditPlayer,
    onRemovePlayer,
    onClearAll,
    csrfToken,
    noteCacheScope,
    userSheetByBattleTag,
    onOpenUserSheet,
}: PlayerListProps) => {
    const [activeTab, setActiveTab] = useState<PlayerListTab>('participants');
    const [notePlayerId, setNotePlayerId] = useState<number | null>(null);
    const participantsTabRef = useRef<HTMLButtonElement>(null);
    const waitlistTabRef = useRef<HTMLButtonElement>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const participantCount = participants.length;
    const waitlistCount = waitlist.length;
    const totalCount = participantCount + waitlistCount;
    const isReady = participantCount === 10;

    useEffect(() => {
        listScrollRef.current?.scrollTo({ top: 0 });
    }, [activeTab]);

    const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const nextTab = activeTab === 'participants' ? 'waitlist' : 'participants';
        setActiveTab(nextTab);
        if (nextTab === 'participants') participantsTabRef.current?.focus();
        else waitlistTabRef.current?.focus();
    };

    const renderPlayerItem = (player: Player, isWaitlist = false) => {
        const sheetEntry = userSheetByBattleTag.get(getPlayerUserSheetLookupKey(player));
        return (
        <li
            key={player.id}
            className={`group animate-fade-in rounded-xl border px-3 py-2.5 transition-colors ${
                isWaitlist
                    ? 'border-amber-500/10 bg-amber-500/[0.035] hover:border-amber-500/20 hover:bg-amber-500/[0.06]'
                    : 'border-slate-800/60 bg-surface hover:border-slate-700/70 hover:bg-surface-overlay'
            }`}
        >
            <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                        <PlayerIdentity player={player} layout="inline" />
                        <BattleTagCopyButton battleTag={player.name} />
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <RankBadge
                            role="TANK"
                            rank={player.tank}
                        />
                        <RankBadge
                            role="DPS"
                            rank={player.dps}
                        />
                        <RankBadge
                            role="SUPPORT"
                            rank={player.sup}
                        />
                    </div>
                </div>

                <div className="-mr-1 flex shrink-0 items-center gap-0.5" data-exclude-export data-html2canvas-ignore="true">
                    {sheetEntry && (
                        <button
                            type="button"
                            onClick={() => onOpenUserSheet(player.name, sheetEntry.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-300 transition-colors hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                            aria-label={`${player.discordName ?? player.name} 유저 시트 정보 조회`}
                            title="유저 시트 정보"
                        >
                            <FileSpreadsheet size={14} aria-hidden="true" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setNotePlayerId(current => current === player.id ? null : player.id)}
                        className={`inline-flex h-8 w-8 touch-manipulation items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                            notePlayerId === player.id
                                ? 'text-cyan-300 hover:bg-cyan-500/10'
                                : 'text-slate-600 hover:bg-cyan-500/10 hover:text-cyan-300'
                        }`}
                        aria-label={`${player.discordName ?? player.name} 개인 운영 메모`}
                        aria-expanded={notePlayerId === player.id}
                        title="개인 운영 메모"
                    >
                        <NotebookPen size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onEditPlayer(player)}
                        className="inline-flex h-8 w-8 touch-manipulation items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-cyan-500/10 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label={`${player.discordName ?? player.name} 수정`}
                        title={`${player.discordName ?? player.name} 수정`}
                    >
                        <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setNotePlayerId(current => current === player.id ? null : current);
                            onRemovePlayer(player.id);
                        }}
                        className="inline-flex h-8 w-8 touch-manipulation items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                        aria-label={`${player.discordName ?? player.name} 삭제`}
                        title={`${player.discordName ?? player.name} 삭제`}
                    >
                        <Trash2 size={14} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {notePlayerId === player.id && (
                <PlayerNoteEditor
                    battleTag={player.name}
                    cacheScope={noteCacheScope}
                    csrfToken={csrfToken}
                    entryId={sheetEntry?.id}
                />
            )}
        </li>
        );
    };

    return (
        <section id="player-management" className="card flex min-h-[420px] scroll-mt-24 flex-1 flex-col overflow-hidden p-4 xl:min-h-0" aria-labelledby="player-management-title">
            {/* Header */}
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <Users size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    <h2 id="player-management-title" className="truncate text-sm font-semibold text-white">
                        참가자 관리
                    </h2>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">총 {totalCount}명</span>
                </div>

                {totalCount > 0 && (
                    <button
                        type="button"
                        onClick={onClearAll}
                        className="inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1 rounded-md px-2 text-xs text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                    >
                        <Trash2 size={12} aria-hidden="true" />
                        전체 삭제
                    </button>
                )}
            </div>

            {!isReady && participantCount > 0 && (
                <div className="mb-3 flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                    <AlertCircle size={13} className="shrink-0 text-amber-400" aria-hidden="true" />
                    <span className="text-xs text-amber-300">
                        팀을 짜려면 {10 - participantCount}명 더 필요합니다
                    </span>
                </div>
            )}

            <div
                className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-surface p-1"
                role="tablist"
                aria-label="참가자 명단 구분"
                aria-orientation="horizontal"
                onKeyDown={handleTabKeyDown}
            >
                <button
                    ref={participantsTabRef}
                    id="participants-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'participants'}
                    aria-controls="participants-panel"
                    tabIndex={activeTab === 'participants' ? 0 : -1}
                    onClick={() => setActiveTab('participants')}
                    className={`flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                        activeTab === 'participants'
                            ? 'bg-slate-700/80 text-white shadow-sm'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                >
                    <Users size={14} aria-hidden="true" />
                    참가자
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                        isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                        {participantCount}/10
                    </span>
                </button>
                <button
                    ref={waitlistTabRef}
                    id="waitlist-tab"
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'waitlist'}
                    aria-controls="waitlist-panel"
                    tabIndex={activeTab === 'waitlist' ? 0 : -1}
                    onClick={() => setActiveTab('waitlist')}
                    className={`flex min-h-10 touch-manipulation items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                        activeTab === 'waitlist'
                            ? 'bg-amber-500/15 text-amber-200 shadow-sm'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                >
                    <Clock size={14} aria-hidden="true" />
                    대기열
                    <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-400">
                        {waitlistCount}
                    </span>
                </button>
            </div>

            <div
                ref={listScrollRef}
                role="region"
                aria-label={activeTab === 'participants' ? '참가자 스크롤 목록' : '대기열 스크롤 목록'}
                className="custom-scrollbar scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 max-xl:max-h-[32rem] xl:rounded-lg xl:border xl:border-slate-800/60 xl:bg-surface/20 xl:p-1.5"
            >
                {activeTab === 'participants' ? (
                    <div
                        id="participants-panel"
                        role="tabpanel"
                        aria-labelledby="participants-tab"
                        tabIndex={0}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                    >
                        <ul className="space-y-1.5" aria-label="참가자 목록">
                            {participants.map((player) => renderPlayerItem(player))}

                            {participantCount === 0 && (
                                <li className="flex animate-fade-in flex-col items-center justify-center py-10 text-center">
                                    <DouMascot variant="empty" size={64} className="mb-3 opacity-80" decorative />
                                    <p className="text-sm text-slate-500">아직 추가된 플레이어가 없습니다</p>
                                    <p className="mt-1 text-xs text-slate-600">채팅을 붙여넣거나 직접 입력해 주세요</p>
                                </li>
                            )}
                        </ul>
                    </div>
                ) : (
                    <div
                        id="waitlist-panel"
                        role="tabpanel"
                        aria-labelledby="waitlist-tab"
                        tabIndex={0}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                    >
                        <p className="mb-2 px-1 text-[11px] text-slate-600">참가자 삭제 시 대기열 첫 번째 인원이 자동 승격됩니다</p>
                        <ul className="space-y-1.5" aria-label="대기열 목록">
                            {waitlist.map((player) => renderPlayerItem(player, true))}

                            {waitlistCount === 0 && (
                                <li className="flex animate-fade-in flex-col items-center justify-center py-10 text-center">
                                    <DouMascot variant="empty" size={64} className="mb-3 opacity-80" decorative />
                                    <p className="text-sm text-slate-500">대기 중인 참가자가 없습니다</p>
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
};

export default PlayerList;
