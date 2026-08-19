import { motion } from 'framer-motion';
import { DouMascot } from '../common/dou-mascot';

interface ParticipationLinkErrorProps {
    error: string;
    isUnavailable: boolean;
}

/**
 * @description 비활성 참여 링크와 일시적인 조회 실패를 중복 없는 안내 화면으로 구분해 표시한다.
 */
export function ParticipationLinkError({
    error,
    isUnavailable,
}: ParticipationLinkErrorProps) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-surface p-5 text-slate-200">
            <motion.section
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28 }}
                className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-800 bg-surface-elevated px-6 py-8 text-center shadow-2xl shadow-black/30 sm:px-10"
            >
                <DouMascot
                    variant={isUnavailable ? 'link-expired' : 'error'}
                    size="clamp(148px, 38vw, 196px)"
                    className="mx-auto"
                    decorative
                />
                <h1 className="mt-5 break-keep text-xl font-bold text-white">
                    {isUnavailable
                        ? '참여할 수 없는 링크입니다'
                        : '참여 링크를 불러오지 못했습니다'}
                </h1>
                {isUnavailable ? (
                    <p className="mx-auto mt-3 max-w-md break-keep text-sm leading-7 text-slate-400 sm:text-base">
                        <span className="block">이 링크는 만료되었거나 비활성화되었습니다.</span>
                        <span className="block">내전 관리자에게 새로운 참여 링크를 요청해 주세요.</span>
                    </p>
                ) : (
                    <div
                        role="alert"
                        className="mt-5 break-keep rounded-xl border border-rose-400/15 bg-rose-400/5 px-4 py-3 text-sm leading-6 text-rose-200"
                    >
                        {error}
                    </div>
                )}
            </motion.section>
        </main>
    );
}
