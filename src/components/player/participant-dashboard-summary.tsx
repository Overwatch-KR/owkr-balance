import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Users } from 'lucide-react';

interface ParticipantDashboardSummaryProps {
    participantCount: number;
    waitlistCount: number;
    reviewCount: number;
    onOpen: () => void;
}

/**
 * @description 대시보드에서 참가 명단의 준비 상태를 요약하고 전용 작업 화면으로 연결한다.
 */
export const ParticipantDashboardSummary = ({
    participantCount,
    waitlistCount,
    reviewCount,
    onOpen,
}: ParticipantDashboardSummaryProps) => {
    const isReady = participantCount === 10;
    const progress = Math.min(participantCount / 10, 1) * 100;

    return (
        <section className="card p-5" aria-labelledby="participant-summary-title">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Users size={18} className="text-cyan-300" aria-hidden="true" />
                        <h2 id="participant-summary-title" className="font-semibold text-white">참가 명단</h2>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-500">
                        입력과 대조는 넓은 참가자 작업실에서 관리합니다.
                    </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                    isReady
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                }`}>
                    {participantCount}/10
                </span>
            </div>

            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800/80" aria-hidden="true">
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
                        isReady
                            ? 'bg-gradient-to-r from-emerald-500 to-cyan-400'
                            : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800/70 bg-surface/55 px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Clock3 size={13} aria-hidden="true" />
                        대기열
                    </div>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-200">{waitlistCount}명</p>
                </div>
                <div className={`rounded-xl border px-3 py-2.5 ${
                    reviewCount > 0
                        ? 'border-amber-500/20 bg-amber-500/[0.07]'
                        : 'border-slate-800/70 bg-surface/55'
                }`}>
                    <div className={`flex items-center gap-1.5 text-xs ${
                        reviewCount > 0 ? 'text-amber-300' : 'text-slate-500'
                    }`}>
                        {reviewCount > 0
                            ? <AlertCircle size={13} aria-hidden="true" />
                            : <CheckCircle2 size={13} aria-hidden="true" />}
                        정보 보완
                    </div>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${
                        reviewCount > 0 ? 'text-amber-200' : 'text-slate-200'
                    }`}>
                        {reviewCount}명
                    </p>
                </div>
            </div>

            <button
                id="participant-workspace-button"
                type="button"
                onClick={onOpen}
                className="btn-primary mt-4 flex w-full items-center justify-center gap-2"
            >
                참가자 추가·관리
                <ArrowRight size={16} aria-hidden="true" />
            </button>
        </section>
    );
};
