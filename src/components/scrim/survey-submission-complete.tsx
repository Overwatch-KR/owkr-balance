import { Check } from 'lucide-react';
import { DouMascot } from '../common/dou-mascot';

interface SurveySubmissionCompleteProps {
    kind?: 'vote' | 'satisfaction';
}

/**
 * @description 완료된 공개 참여 폼을 대체하는 감사 화면을 표시한다.
 */
export function SurveySubmissionComplete({ kind = 'satisfaction' }: SurveySubmissionCompleteProps) {
    const isVote = kind === 'vote';
    const title = isVote ? '영웅 밴 투표가 완료되었습니다.' : '설문 제출이 완료되었습니다.';
    const description = isVote
        ? '선택한 영웅이 밴 투표에 반영되었습니다.'
        : '소중한 의견 감사합니다.';
    const alreadySubmitted = isVote ? '이미 참여한 투표입니다.' : '이미 참여한 설문입니다.';

    return (
        <main className="flex min-h-screen items-center justify-center bg-surface p-5 text-slate-200">
            <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-surface-elevated px-6 py-8 text-center shadow-2xl shadow-black/30 sm:px-10">
                <DouMascot
                    variant="success"
                    size="clamp(148px, 38vw, 196px)"
                    className="mx-auto"
                    decorative
                />
                <div
                    className="mx-auto mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    aria-hidden="true"
                >
                    <Check size={24} strokeWidth={3} />
                </div>
                <h1 className="mt-4 break-keep text-xl font-bold text-white">
                    {title}
                </h1>
                <p className="mt-3 break-keep text-sm leading-7 text-slate-300 sm:text-base">
                    {description}
                </p>
                <p className="mt-1 break-keep text-sm text-slate-500">
                    {alreadySubmitted}
                </p>
                <a
                    href="/"
                    className="btn-primary mt-7 inline-flex min-h-11 w-full items-center justify-center"
                >
                    홈으로 이동
                </a>
            </section>
        </main>
    );
}
