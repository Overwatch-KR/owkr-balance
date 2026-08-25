import { CalendarCheck2, Check, Users } from 'lucide-react';
import {
    EVENT_PARTICIPATION_END_DATE,
    EVENT_PARTICIPATION_START_DATE,
} from '../../../domains/scrim/shared/rules';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';
import { Skeleton } from '../common/skeleton';
import { EventParticipantIdentity } from './event-participant-identity';

interface EventParticipantSummaryProps {
    candidates: ScrimRosterParticipant[];
    isEditing: boolean;
    isLoading: boolean;
    onToggle: (participantId: string) => void;
    participantIds: Set<string>;
}

const formatDate = (date: string): string => {
    const [, month, day] = date.split('-').map(Number);
    return `${month}월 ${day}일`;
};

/**
 * @description 저장 상태에서는 확정 참여자를 읽기 전용으로, 수정 상태에서는 후보 선택 목록으로 표시한다.
 */
export function EventParticipantSummary({
    candidates,
    isEditing,
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
                        <h2 id="event-participant-title" className="font-semibold text-white">
                            {isEditing ? '실제 참여자 선택' : '확정 참여자'}
                        </h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        {isEditing
                            ? `${formatDate(EVENT_PARTICIPATION_START_DATE)}~${formatDate(EVENT_PARTICIPATION_END_DATE)} 등록 후보 중 실제 참여자만 선택해 주세요.`
                            : '현재 저장된 이벤트 참여 명단입니다.'}
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
                <div className="mt-5 grid gap-2" role="status" aria-label="이벤트 참여 후보를 불러오는 중">
                    {[0, 1, 2, 3].map(index => (
                        <Skeleton key={index} className="h-12 rounded-xl" />
                    ))}
                </div>
            ) : candidates.length > 0 ? (
                <ul
                    className="mt-5 grid gap-2"
                    aria-label={isEditing ? '이벤트 참여 후보 명단' : '확정 이벤트 참여자 명단'}
                >
                    {candidates.map(candidate => {
                        const isSelected = participantIds.has(candidate.id);
                        return (
                            <li key={candidate.id}>
                                {isEditing ? (
                                    <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        onClick={() => onToggle(candidate.id)}
                                        className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
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
                                        <EventParticipantIdentity participant={candidate} />
                                    </button>
                                ) : (
                                    <div className="flex min-h-16 items-center rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm text-slate-200">
                                        <EventParticipantIdentity participant={candidate} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="mt-5 rounded-xl bg-slate-900 px-4 py-5 text-center text-sm text-slate-500">
                    {isEditing
                        ? '등록 후보가 없습니다. 유저 시트에서 참여자를 추가해 주세요.'
                        : '저장된 이벤트 참여자가 없습니다.'}
                </p>
            )}
        </section>
    );
}
