import { DouMascot } from '../common/dou-mascot';

interface ParticipationClosedProps {
    kind: 'vote' | 'satisfaction';
}

/**
 * @description 참여 기한이 끝난 공개 투표 또는 설문의 안내 화면을 표시한다.
 */
export function ParticipationClosed({ kind }: ParticipationClosedProps) {
    const isVote = kind === 'vote';
    const title = isVote ? '영웅 밴 투표가 마감되었습니다.' : '만족도 조사 기간이 종료되었습니다.';
    const description = isVote
        ? '투표 결과는 관리자 확인 후 최종 확정됩니다.'
        : '관리자가 기간을 연장하면 같은 링크로 다시 참여할 수 있습니다.';

    return (
        <main className="flex min-h-screen items-center justify-center bg-surface p-5 text-slate-200">
            <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-surface-elevated px-6 py-8 text-center shadow-2xl shadow-black/30 sm:px-10">
                <DouMascot
                    variant="link-expired"
                    size="clamp(148px, 38vw, 196px)"
                    className="mx-auto"
                    decorative
                />
                <h1 className="mt-5 break-keep text-xl font-bold text-white">{title}</h1>
                <p className="mx-auto mt-3 max-w-md break-keep text-sm leading-7 text-slate-400 sm:text-base">
                    {description}
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
