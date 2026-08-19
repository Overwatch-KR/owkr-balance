import { CalendarCheck2, Check, Users } from 'lucide-react';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';
import {
    EVENT_PARTICIPATION_END_DATE,
    EVENT_PARTICIPATION_START_DATE,
} from '../../utils/event-participants';
import { Skeleton } from '../common/skeleton';

interface EventParticipantSummaryProps {
    candidates: ScrimRosterParticipant[];
    isLoading: boolean;
    onToggle: (participantId: string) => void;
    participantIds: Set<string>;
}

const formatDate = (date: string): string => {
    const [, month, day] = date.split('-').map(Number);
    return `${month}월 ${day}일`;
};

/**
 * @description 이벤트 로스터 후보 중 실제 참여자를 관리자가 직접 선택하도록 표시한다.
 */
export function EventParticipantSummary({
    candidates,
    isLoading,
    onToggle,
    participantIds,
}: EventParticipantSummaryProps) {
    return (
        <section className="card mt-6" aria-labelledby="event-participant-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <CalendarCheck2 size={18} className="text-cyan-300" aria-hidden="true" />
                        <h2 id="event-participant-title" className="font-semibold text-white">실제 참여자 확인</h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        {formatDate(EVENT_PARTICIPATION_START_DATE)}~{formatDate(EVENT_PARTICIPATION_END_DATE)} 로스터 후보 중 실제 참여자만 선택해 주세요.
                    </p>
                </div>
                {isLoading ? (
                    <Skeleton className="h-8 w-20 rounded-full" />
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                        <Users size={15} aria-hidden="true" />
                        참여 {participantIds.size}명
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="mt-5 grid gap-2 sm:grid-cols-2" role="status" aria-label="이벤트 참여 후보를 불러오는 중">
                    {[0, 1, 2, 3].map(index => (
                        <Skeleton key={index} className="h-12 rounded-xl" />
                    ))}
                </div>
            ) : candidates.length > 0 ? (
                <ul className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="이벤트 참여 후보 명단">
                    {candidates.map(candidate => {
                        const isSelected = participantIds.has(candidate.id);
                        return (
                            <li key={candidate.id}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isSelected}
                                    onClick={() => onToggle(candidate.id)}
                                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                                        isSelected
                                            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                                    }`}
                                >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                        isSelected
                                            ? 'border-cyan-300 bg-cyan-300 text-slate-950'
                                            : 'border-slate-600 bg-slate-950'
                                    }`}>
                                        {isSelected ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{candidate.name}</span>
                                        {candidate.discordName ? (
                                            <span className="block truncate text-xs text-slate-500">{candidate.discordName}</span>
                                        ) : null}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="mt-5 rounded-xl bg-slate-900 px-4 py-5 text-center text-sm text-slate-500">
                    기간 내 등록된 내전 로스터가 없습니다.
                </p>
            )}
        </section>
    );
}
