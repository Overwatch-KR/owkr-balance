import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, FastForward, Sparkles } from 'lucide-react';
import { HEROES } from '../../../domains/scrim/shared/rules';
import { useDialogFocus } from '../../hooks/use-dialog-focus';

interface RandomBanModalProps {
    candidateHeroIds: string[];
    onClose: (succeeded: boolean) => void;
    onResolve: () => Promise<string[]>;
}

const heroById = new Map(HEROES.map(hero => [hero.id, hero]));

/**
 * @description 동점 영웅을 서버에서 무작위 확정하는 동안 추첨 연출과 스킵 동작을 제공한다.
 */
export function RandomBanModal({
    candidateHeroIds,
    onClose,
    onResolve,
}: RandomBanModalProps) {
    const candidates = useMemo(
        () => candidateHeroIds.length > 0
            ? candidateHeroIds
            : HEROES.map(hero => hero.id),
        [candidateHeroIds],
    );
    const [displayHeroId, setDisplayHeroId] = useState(candidates[0]);
    const [resolvedHeroIds, setResolvedHeroIds] = useState<string[] | null>(null);
    const [isRevealed, setIsRevealed] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useDialogFocus({
        closeOnEscape: Boolean(error || isRevealed),
        onClose: () => onClose(Boolean(isRevealed && resolvedHeroIds)),
    });
    const skipRequestedRef = useRef(false);
    const spinTimerRef = useRef<number | undefined>(undefined);
    const revealTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        let active = true;
        let currentIndex = 0;
        const startedAt = Date.now();
        spinTimerRef.current = window.setInterval(() => {
            currentIndex = (currentIndex + 1) % candidates.length;
            setDisplayHeroId(candidates[currentIndex]);
        }, 85);

        void onResolve()
            .then(heroIds => {
                if (!active) return;
                setResolvedHeroIds(heroIds);
                const reveal = () => {
                    if (spinTimerRef.current) window.clearInterval(spinTimerRef.current);
                    setDisplayHeroId(heroIds[0]);
                    setIsRevealed(true);
                };
                if (skipRequestedRef.current) {
                    reveal();
                    return;
                }
                revealTimerRef.current = window.setTimeout(
                    reveal,
                    Math.max(0, 1800 - (Date.now() - startedAt)),
                );
            })
            .catch(resolveError => {
                if (!active) return;
                if (spinTimerRef.current) window.clearInterval(spinTimerRef.current);
                setError(resolveError instanceof Error ? resolveError.message : '랜덤 추첨을 완료하지 못했습니다.');
            });

        return () => {
            active = false;
            if (spinTimerRef.current) window.clearInterval(spinTimerRef.current);
            if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        };
    }, [candidates, onResolve]);

    const skip = () => {
        skipRequestedRef.current = true;
        if (!resolvedHeroIds) return;
        if (spinTimerRef.current) window.clearInterval(spinTimerRef.current);
        if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
        setDisplayHeroId(resolvedHeroIds[0]);
        setIsRevealed(true);
    };

    const displayHero = heroById.get(displayHeroId);

    return (
        <motion.div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
        >
            <motion.section
                ref={dialogRef}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="random-ban-title"
                aria-describedby="random-ban-description"
                tabIndex={-1}
                className="w-full max-w-lg overscroll-contain overflow-hidden rounded-3xl border border-violet-400/25 bg-[#111520] p-6 text-center shadow-2xl shadow-violet-950/50 focus:outline-none"
            >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300">
                    {isRevealed
                        ? <Sparkles size={24} aria-hidden="true" />
                        : <Dices size={24} className="animate-pulse" aria-hidden="true" />}
                </div>
                <h2 id="random-ban-title" className="mt-4 text-pretty text-xl font-bold text-white" aria-live="polite">
                    {isRevealed ? '랜덤 추첨 결과' : '동점 영웅을 추첨하고 있습니다'}
                </h2>
                <p id="random-ban-description" className="mt-1 text-sm text-slate-400">
                    {isRevealed ? '서로 다른 역할군의 최종 밴이 확정되었습니다.' : '서버에서 공정하게 최종 밴을 결정합니다.'}
                </p>

                {error ? (
                    <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div>
                ) : isRevealed && resolvedHeroIds ? (
                    <div className="mt-7 grid grid-cols-2 gap-3">
                        {resolvedHeroIds.map((heroId, index) => {
                            const hero = heroById.get(heroId);
                            if (!hero) return null;
                            return (
                                <motion.div
                                    key={heroId}
                                    initial={{ opacity: 0, y: 14, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ delay: index * 0.18, type: 'spring', stiffness: 220 }}
                                    className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-3"
                                >
                                    <img
                                        className="mx-auto h-24 w-24 rounded-xl object-cover"
                                        src={`/hero/${hero.role}/${hero.id}.png`}
                                        alt=""
                                        width={96}
                                        height={96}
                                    />
                                    <strong className="mt-3 block text-white">{hero.name}</strong>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="relative mx-auto mt-7 flex h-44 w-44 items-center justify-center overflow-hidden rounded-3xl border border-violet-300/30 bg-violet-400/10">
                        <AnimatePresence mode="popLayout">
                            {displayHero && (
                                <motion.div
                                    key={displayHero.id}
                                    initial={{ opacity: 0, y: 24, scale: 0.8 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -24, scale: 0.8 }}
                                    transition={{ duration: 0.08 }}
                                    className="absolute inset-3"
                                >
                                    <img
                                        className="h-full w-full rounded-2xl object-cover"
                                        src={`/hero/${displayHero.role}/${displayHero.id}.png`}
                                        alt=""
                                        width={152}
                                        height={152}
                                    />
                                    <span className="absolute inset-x-2 bottom-2 rounded-lg bg-slate-950/80 py-1.5 text-sm font-semibold text-white backdrop-blur">{displayHero.name}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <div className="mt-7">
                    {error || isRevealed ? (
                        <button
                            type="button"
                            className="btn-primary w-full"
                            onClick={() => onClose(Boolean(isRevealed && resolvedHeroIds))}
                        >
                            확인
                        </button>
                    ) : (
                        <button type="button" className="btn-ghost w-full" onClick={skip}>
                            <FastForward size={16} className="mr-1 inline" aria-hidden="true" />애니메이션 스킵
                        </button>
                    )}
                </div>
            </motion.section>
        </motion.div>
    );
}
