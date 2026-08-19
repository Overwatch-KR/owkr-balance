import { useState } from 'react';
import { Check, ClipboardCheck, Copy, Trash2, UserCheck, UserRoundX } from 'lucide-react';
import type { Player } from '../../../types';
import { compareMentionedParticipants } from '../../../utils/participant-check';
import { PlayerIdentity } from '../player-identity';

interface ParticipantCheckerProps {
    players: Player[];
    mentionText: string;
    setMentionText: (value: string) => void;
    onRemovePlayer: (playerId: number) => void;
    currentAdminName: string;
    includesAdmin: boolean;
    onIncludesAdminChange: (value: boolean) => void;
}

/**
 * @description 디스코드 멘션과 현재 명단을 양방향 대조해 미입력자와 공지 외 참가자를 보여준다.
 */
const ParticipantChecker = ({
    players,
    mentionText,
    setMentionText,
    onRemovePlayer,
    currentAdminName,
    includesAdmin,
    onIncludesAdminChange,
}: ParticipantCheckerProps) => {
    const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');
    const comparison = compareMentionedParticipants(
        mentionText,
        players,
        includesAdmin ? [currentAdminName] : [],
    );
    const totalCount = comparison.mentionedNames.length;
    const completedCount = comparison.completedNames.length;

    const handleCopyMissing = async () => {
        const missingMentions = comparison.missingNames.map(name => `@${name}`).join(' ');

        try {
            await navigator.clipboard.writeText(missingMentions);
            setCopyState('success');
        } catch {
            setCopyState('error');
        }
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <div>
                <label htmlFor="participant-mentions" className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <ClipboardCheck size={14} className="text-cyan-300" aria-hidden="true" />
                    공지의 참가자 멘션을 붙여넣으세요
                </label>
                <textarea
                    id="participant-mentions"
                    name="participant-mentions"
                    autoComplete="off"
                    spellCheck={false}
                    className="input-base h-32 resize-none text-sm leading-relaxed"
                    placeholder="**@상만** **@롤랑** **@민성** **@현욱**"
                    value={mentionText}
                    onChange={(event) => {
                        setMentionText(event.target.value);
                        setCopyState('idle');
                    }}
                />
            </div>

            <label
                htmlFor="participant-includes-admin"
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                    includesAdmin
                        ? 'border-cyan-400/35 bg-cyan-400/10'
                        : 'border-slate-800 bg-surface/50 hover:border-slate-700 hover:bg-white/[0.025]'
                }`}
            >
                <input
                    id="participant-includes-admin"
                    name="participant-includes-admin"
                    type="checkbox"
                    checked={includesAdmin}
                    onChange={(event) => onIncludesAdminChange(event.target.checked)}
                    className="h-4 w-4 shrink-0 accent-cyan-400"
                />
                <UserCheck
                    size={17}
                    className={includesAdmin ? 'text-cyan-300' : 'text-slate-500'}
                    aria-hidden="true"
                />
                <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200">나도 이번 내전에 참여합니다</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                        {currentAdminName} 님을 공지 참가자에 포함해 대조합니다
                    </span>
                </span>
            </label>

            {totalCount === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-surface/50 px-4 py-5 text-center">
                    <p className="text-sm text-slate-400">멘션 명단을 붙여넣으면 바로 대조합니다</p>
                    <p className="mt-1 text-xs text-slate-600">굵은 글씨가 포함된 디스코드 복사본도 인식합니다</p>
                </div>
            ) : (
                <div className="space-y-3" aria-live="polite">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg bg-surface px-2 py-2.5 text-center">
                            <p className="text-[10px] text-slate-500">공지 인원</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{totalCount}명</p>
                        </div>
                        <div className="rounded-lg bg-emerald-500/10 px-2 py-2.5 text-center">
                            <p className="text-[10px] text-emerald-400/80">입력 완료</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-300">{completedCount}명</p>
                        </div>
                        <div className="rounded-lg bg-amber-500/10 px-2 py-2.5 text-center">
                            <p className="text-[10px] text-amber-400/80">미입력</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-300">
                                {comparison.missingNames.length}명
                            </p>
                        </div>
                        <div className="rounded-lg bg-rose-500/10 px-2 py-2.5 text-center">
                            <p className="text-[10px] text-rose-400/80">공지 외 명단</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-rose-300">
                                {comparison.unmatchedPlayers.length}명
                            </p>
                        </div>
                    </div>

                    {comparison.missingNames.length > 0 && (
                        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3">
                            <div className="mb-2.5 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <UserRoundX size={14} className="text-amber-400" aria-hidden="true" />
                                    <h3 className="text-xs font-semibold text-amber-300">아직 입력하지 않은 사람</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyMissing}
                                    className="inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1 rounded-md px-2 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                                >
                                    {copyState === 'success' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                                    {copyState === 'success' ? '복사됨' : copyState === 'error' ? '복사 실패' : '멘션 복사'}
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {comparison.missingNames.map(name => (
                                    <span
                                        key={name}
                                        className="rounded-md border border-amber-500/15 bg-surface/60 px-2 py-1 text-xs text-amber-100"
                                    >
                                        @{name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {comparison.unmatchedPlayers.length > 0 && (
                        <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.07] p-3">
                            <div className="mb-2.5 flex items-start gap-2">
                                <UserRoundX size={14} className="mt-0.5 shrink-0 text-rose-400" aria-hidden="true" />
                                <div>
                                    <h3 className="text-xs font-semibold text-rose-300">공지에 없는 명단 참가자</h3>
                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                        잘못 추가했거나 디스코드 이름이 다른 참가자인지 확인해 주세요.
                                    </p>
                                </div>
                            </div>
                            <ul className="space-y-1.5" aria-label="공지 외 명단 참가자">
                                {comparison.unmatchedPlayers.map(player => (
                                    <li
                                        key={player.id}
                                        className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-rose-500/10 bg-surface/60 px-2.5 py-2"
                                    >
                                        <div className="min-w-0 flex-1 text-xs">
                                            <PlayerIdentity player={player} layout="inline" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onRemovePlayer(player.id)}
                                            className="inline-flex min-h-8 shrink-0 touch-manipulation items-center gap-1 rounded-md px-2 text-[11px] font-medium text-rose-300 transition-colors hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                                            aria-label={`${player.discordName ?? player.name} 명단에서 제외`}
                                        >
                                            <Trash2 size={12} aria-hidden="true" />
                                            제외
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {comparison.missingNames.length === 0
                        && comparison.unmatchedPlayers.length === 0 && (
                        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-3">
                            <Check size={15} className="shrink-0 text-emerald-400" aria-hidden="true" />
                            <p className="text-sm font-medium text-emerald-200">공지와 현재 명단이 정확히 일치합니다</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ParticipantChecker;
