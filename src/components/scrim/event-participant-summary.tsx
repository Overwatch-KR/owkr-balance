import { CalendarCheck2, Users } from 'lucide-react';
import type { ScrimRecord } from '../../../domains/scrim/shared/public';
import {
    EVENT_PARTICIPATION_END_DATE,
    EVENT_PARTICIPATION_START_DATE,
    getEventParticipants,
} from '../../utils/event-participants';
import { Skeleton } from '../common/skeleton';

interface EventParticipantSummaryProps {
    isLoading: boolean;
    scrims: ScrimRecord[];
}

const formatDate = (date: string): string => {
    const [, month, day] = date.split('-').map(Number);
    return `${month}월 ${day}일`;
};

/**
 * @description 이벤트 기간에 한 번이라도 내전에 참여한 고유 참가자 명단을 표시한다.
 */
export function EventParticipantSummary({ isLoading, scrims }: EventParticipantSummaryProps) {
    const participants = getEventParticipants(scrims);

    return (
        <section className="card mt-6" aria-labelledby="event-participant-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <CalendarCheck2 size={18} className="text-cyan-300" aria-hidden="true" />
                        <h2 id="event-participant-title" className="font-semibold text-white">이벤트 참여 집계</h2>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        {formatDate(EVENT_PARTICIPATION_START_DATE)}~{formatDate(EVENT_PARTICIPATION_END_DATE)} 내전 참여자
                    </p>
                </div>
                {isLoading ? (
                    <Skeleton className="h-8 w-20 rounded-full" />
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                        <Users size={15} aria-hidden="true" />
                        총 {participants.length}명
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="mt-5 flex flex-wrap gap-2" role="status" aria-label="이벤트 참여자를 집계하는 중">
                    {['w-20', 'w-24', 'w-16', 'w-28', 'w-20'].map((widthClass, index) => (
                        <Skeleton key={`${widthClass}-${index}`} className={`h-8 rounded-lg ${widthClass}`} />
                    ))}
                </div>
            ) : participants.length > 0 ? (
                <ul className="mt-5 flex flex-wrap gap-2" aria-label="이벤트 참여자 명단">
                    {participants.map(participant => (
                        <li
                            key={participant.id}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200"
                        >
                            {participant.name}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-5 rounded-xl bg-slate-900 px-4 py-5 text-center text-sm text-slate-500">
                    기간 내 등록된 참여자가 없습니다.
                </p>
            )}
        </section>
    );
}
