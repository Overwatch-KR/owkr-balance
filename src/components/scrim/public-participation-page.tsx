import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, MessageSquareText, Star } from 'lucide-react';
import { findApiError, getErrorMessage } from '../../utils/api';
import {
    formatScrimLabel,
    formatRemainingDuration,
    getSatisfactionParticipationStatus,
    getVoteParticipationStatus,
} from '../../utils/scrim';
import {
    hasSubmittedSurvey,
    hasSubmittedVote,
    markSurveyAsSubmitted,
    markVoteAsSubmitted,
} from '../../utils/survey-submission';
import {
    loadPublicParticipation,
    submitPublicSatisfaction,
    submitPublicVote,
} from '../../utils/scrim-contract-client';
import {
    SATISFACTION_OPTIONS,
    type GetPublicParticipationQueryResult,
} from '../../../domains/scrim/shared/public';
import { useToast } from '../../hooks/use-toast';
import { AppToast } from '../app-toast';
import { Skeleton } from '../common/skeleton';
import { DouMascot } from '../common/dou-mascot';
import { HeroGrid } from './hero-grid';
import { ParticipationLinkError } from './participation-link-error';
import { ParticipationClosed } from './participation-closed';
import { RosterParticipantSelect } from './roster-participant-select';
import { SurveySubmissionComplete } from './survey-submission-complete';

const token = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';
type SatisfactionOption = (typeof SATISFACTION_OPTIONS)[number];

const PublicParticipationSkeleton = () => (
    <main className="mx-auto min-h-screen max-w-3xl p-4 py-8 text-slate-200 md:p-8" role="status" aria-label="내전 참여 정보를 불러오는 중">
        <header className="mb-6">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </header>
        <Skeleton className="h-12 w-full rounded-xl" />
        <section className="card mt-5">
            <div className="mx-auto max-w-xl text-center">
                <Skeleton className="mx-auto h-7 w-52" />
                <Skeleton className="mx-auto mt-3 h-4 w-64 max-w-full" />
                <div className="mt-8 flex justify-center gap-3">
                    {[0, 1, 2, 3, 4].map(index => (
                        <Skeleton key={index} className="h-12 w-12 rounded-full sm:h-14 sm:w-14" />
                    ))}
                </div>
                <Skeleton className="mx-auto mt-8 h-12 w-full" />
            </div>
        </section>
    </main>
);

/**
 * @description 공개 토큰으로 연결된 내전의 투표와 익명 만족도 응답을 제공한다.
 */
export function PublicParticipationPage() {
    const [data, setData] = useState<GetPublicParticipationQueryResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [participantId, setParticipantId] = useState('');
    const [heroIds, setHeroIds] = useState<string[]>([]);
    const [score, setScore] = useState(0);
    const [disappointments, setDisappointments] = useState<SatisfactionOption[]>([]);
    const [otherOpinion, setOtherOpinion] = useState('');
    const [error, setError] = useState('');
    const [isUnavailableLink, setIsUnavailableLink] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedSurveyId, setSubmittedSurveyId] = useState('');
    const [hasCompletedVote, setHasCompletedVote] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const serverClockOffsetRef = useRef(0);
    const submitLockRef = useRef(false);
    const { dismissToast, showToast, toast } = useToast();
    const load = useCallback(async () => {
        try {
            const next = await loadPublicParticipation({ token });
            serverClockOffsetRef.current = next.serverNow - Date.now();
            setNow(next.serverNow);
            setData(next);
            setError('');
            setIsUnavailableLink(false);
        } catch (loadError) {
            setData(null);
            setError(getErrorMessage(loadError, '참여 링크를 불러오지 못했습니다.'));
            setIsUnavailableLink(findApiError(loadError)?.status === 404);
        } finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => {
        void load();
        const dataRefreshTimer = window.setInterval(() => void load(), 30_000);
        return () => window.clearInterval(dataRefreshTimer);
    }, [load]);
    useEffect(() => {
        const tick = () => setNow(Date.now() + serverClockOffsetRef.current);
        const clockTimer = window.setInterval(tick, 1_000);
        return () => window.clearInterval(clockTimer);
    }, []);
    const scrim = data?.scrims[0] ?? null;
    useEffect(() => {
        if (data?.kind !== 'satisfaction' || !scrim || !hasSubmittedSurvey(scrim.id)) return;
        setSubmittedSurveyId(scrim.id);
    }, [data?.kind, scrim]);
    useEffect(() => {
        if (data?.kind !== 'vote' || !scrim || !hasSubmittedVote(scrim.id)) return;
        setHasCompletedVote(true);
    }, [data?.kind, scrim]);
    const availableRoster = useMemo(() => {
        if (!scrim) return [];
        const submittedIds = new Set(scrim.submittedRosterParticipantIds ?? []);
        return scrim.rosterSnapshot.filter(person => !submittedIds.has(person.id));
    }, [scrim]);
    const hasAvailableParticipantSelection = availableRoster.some(person => person.id === participantId);
    const voteStatus = scrim ? getVoteParticipationStatus(scrim, now) : null;
    const satisfactionStatus = scrim
        ? getSatisfactionParticipationStatus(scrim, now)
        : null;
    const remaining = scrim ? Math.max(0, scrim.customGameStartsAt - now) : 0;
    const remainingLabel = formatRemainingDuration(remaining);
    const submit = async (action: 'vote' | 'satisfaction') => {
        if (!scrim || submitLockRef.current) return;
        submitLockRef.current = true;
        setIsSubmitting(true);
        setError('');
        try {
            if (action === 'vote') {
                await submitPublicVote({ token, scrimId: scrim.id, participantId, heroIds });
            } else {
                await submitPublicSatisfaction({
                    token,
                    scrimId: scrim.id,
                    response: { score, disappointments, otherOpinion },
                });
            }
            if (action === 'satisfaction') {
                markSurveyAsSubmitted(scrim.id);
                setSubmittedSurveyId(scrim.id);
                return;
            }
            markVoteAsSubmitted(scrim.id);
            setHasCompletedVote(true);
        } catch (submitError) {
            showToast('error', getErrorMessage(submitError, '제출하지 못했습니다.'));
            void load();
        } finally {
            submitLockRef.current = false;
            setIsSubmitting(false);
        }
    };
    const toggleDisappointment = (item: SatisfactionOption) => setDisappointments(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item]);
    const selectScore = (value: number) => {
        setScore(value);
        if (value >= 3) setDisappointments([]);
    };
    if (isLoading) return <PublicParticipationSkeleton />;
    const isVoteLink = data?.kind === 'vote';
    const surveyId = scrim?.id ?? submittedSurveyId;
    const hasSubmitted = Boolean(
        isVoteLink
            ? hasCompletedVote
            : surveyId && (submittedSurveyId === surveyId || hasSubmittedSurvey(surveyId)),
    );
    if (hasSubmitted) return <SurveySubmissionComplete kind={isVoteLink ? 'vote' : 'satisfaction'} />;
    if (error && !data) return <ParticipationLinkError error={error} isUnavailable={isUnavailableLink} />;
    if (scrim && isVoteLink && voteStatus === 'VOTING_CLOSED') return <ParticipationClosed kind="vote" />;
    if (scrim && !isVoteLink && satisfactionStatus === 'SATISFACTION_EXPIRED') return <ParticipationClosed kind="satisfaction" />;
    return (
        <main className="mx-auto min-h-screen max-w-3xl p-4 py-8 text-slate-200 md:p-8">
            <header className="mb-6"><h1 className="text-2xl font-bold text-white">OWKR {isVoteLink ? '영웅 밴 투표' : '내전 만족도 조사'}</h1><p className="mt-1 text-sm text-slate-400">{isVoteLink ? '내전 시작 전, 최대 3명의 영웅을 선택해 주세요.' : '응답은 완전 익명으로 저장됩니다.'}</p></header>
            {!scrim ? (
                <section className="card flex min-h-64 flex-col items-center justify-center px-6 text-center">
                    <DouMascot variant="empty" size={128} className="opacity-90" decorative />
                    <p className="mt-4 text-slate-400">참여 가능한 내전이 없습니다.</p>
                </section>
            ) : <div className="space-y-5">
                <div className="flex min-h-12 items-center rounded-xl border border-slate-800 bg-slate-900/70 px-4 text-sm text-slate-300">
                    <span className="font-medium text-white">{formatScrimLabel(scrim)}</span>
                    <span className="mx-2 text-slate-600" aria-hidden="true">·</span>
                    <span>{scrim.startTime}</span>
                </div>
                {isVoteLink && voteStatus === 'VOTING_OPEN' && <section className="card"><h2 className="text-lg font-semibold text-white">영웅 밴 투표</h2><p className="mt-1 text-sm text-cyan-200">내전 시작까지 {remainingLabel} 남았습니다. 최대 3명을 선택해 주세요.</p>
                    <div className="mt-4">
                        <span className="block text-sm font-medium text-slate-200">내 이름</span>
                        <RosterParticipantSelect
                            value={hasAvailableParticipantSelection ? participantId : ''}
                            options={availableRoster}
                            onChange={setParticipantId}
                        />
                    </div>
                    <div className="mt-5"><HeroGrid disabledHeroIds={scrim.usedBanHeroIds} selectedHeroIds={heroIds} onChange={setHeroIds} /></div>
                    {scrim.usedBanHeroIds.length > 0 && <p className="mt-3 text-sm text-slate-400">비활성화된 영웅은 이미 이번 내전에서 밴된 영웅입니다.</p>}
                        <button
                        type="button"
                        className="btn-primary mt-5 inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!hasAvailableParticipantSelection || heroIds.length === 0 || isSubmitting}
                        aria-busy={isSubmitting}
                        onClick={() => void submit('vote')}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                                제출 중…
                            </>
                        ) : `투표 제출 (${heroIds.length}/3)`}
                        </button>
                </section>}
                {isVoteLink && voteStatus !== 'VOTING_OPEN' && <section className="card"><h2 className="text-lg font-semibold text-white">영웅 밴 투표</h2><p className="mt-2 text-slate-400">영웅 밴 투표가 마감되었습니다.<br />투표 결과는 관리자 확인 후 최종 확정됩니다.</p></section>}
                {!isVoteLink && satisfactionStatus === 'SATISFACTION_OPEN' ? (
                    <section className="card overflow-hidden">
                        <div className="mx-auto max-w-xl text-center">
                            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-200">
                                <Star size={22} fill="currentColor" aria-hidden="true" />
                            </div>
                            <h2 className="mt-3 text-pretty text-xl font-bold text-white">오늘 내전, 어떠셨나요?</h2>
                            <p className="mt-1 text-sm text-slate-400">응답은 완전 익명으로 저장됩니다.</p>
                            <p id="satisfaction-score-label" className="mt-7 text-sm font-medium text-slate-200">
                                전반적인 만족도를 선택해 주세요
                            </p>
                            <div
                                className="mt-3 flex justify-center gap-1.5 sm:gap-3"
                                role="group"
                                aria-labelledby="satisfaction-score-label"
                            >
                                {[1, 2, 3, 4, 5].map(value => (
                                    <motion.button
                                        key={value}
                                        type="button"
                                        whileHover={{ y: -3, scale: 1.08 }}
                                        whileTap={{ scale: 0.92 }}
                                        onClick={() => selectScore(value)}
                                        aria-label={`${value}점`}
                                        aria-pressed={score === value}
                                        className={`flex h-12 w-12 touch-manipulation items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated sm:h-14 sm:w-14 ${
                                            value <= score
                                                ? 'bg-amber-300 text-slate-950 shadow-lg shadow-amber-300/20'
                                                : 'bg-slate-900 text-slate-600 hover:bg-slate-800 hover:text-amber-100'
                                        }`}
                                    >
                                        <Star size={25} fill="currentColor" aria-hidden="true" />
                                    </motion.button>
                                ))}
                            </div>
                            <AnimatePresence mode="wait">
                                {score > 0 && (
                                    <motion.p
                                        key={score}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -6 }}
                                        className={`mt-3 text-sm font-medium ${score >= 3 ? 'text-emerald-300' : 'text-amber-200'}`}
                                        aria-live="polite"
                                    >
                                        {score >= 4
                                            ? '좋은 의견 감사합니다!'
                                            : score === 3
                                                ? '솔직한 의견 감사합니다.'
                                                : '아쉬웠던 점을 알려주세요.'}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>
                        <AnimatePresence>
                            {score > 0 && score < 3 && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, y: 16 }}
                                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: 8 }}
                                    transition={{ duration: 0.24 }}
                                    className="mx-auto mt-8 max-w-2xl overflow-hidden"
                                >
                                    <div className="border-t border-slate-800 pt-6">
                                        <p id="disappointment-label" className="text-center text-sm font-semibold text-white">어떤 점이 아쉬웠나요?</p>
                                        <p className="mt-1 text-center text-xs text-slate-500">하나 이상 선택해 주세요. 복수 선택할 수 있습니다.</p>
                                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-labelledby="disappointment-label">
                                            {SATISFACTION_OPTIONS.map(item => {
                                                const checked = disappointments.includes(item);
                                                return (
                                                    <motion.button
                                                        key={item}
                                                        type="button"
                                                        whileTap={{ scale: 0.97 }}
                                                        onClick={() => toggleDisappointment(item)}
                                                        aria-pressed={checked}
                                                        className={`flex min-h-12 touch-manipulation items-center justify-between rounded-xl border px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                                                            checked
                                                                ? 'border-cyan-300/70 bg-cyan-400/10 text-cyan-100'
                                                                : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-600'
                                                        }`}
                                                    >
                                                        <span>{item}</span>
                                                        {checked && <Check size={16} className="text-cyan-300" aria-hidden="true" />}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <AnimatePresence>
                            {score > 0 && (
                                <motion.label
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 8 }}
                                    className="mx-auto mt-6 block max-w-2xl"
                                >
                                    <span className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                                        <MessageSquareText size={16} className="text-cyan-300" aria-hidden="true" />
                                        추가 의견 <span className="font-normal text-slate-500">(선택)</span>
                                    </span>
                                    <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-1.5 transition focus-within:border-cyan-400/70 focus-within:ring-2 focus-within:ring-cyan-400/15">
                                        <textarea
                                            name="satisfaction-opinion"
                                            autoComplete="off"
                                            className="min-h-32 w-full resize-y rounded-lg bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600"
                                            value={otherOpinion}
                                            onChange={event => setOtherOpinion(event.target.value)}
                                            maxLength={1000}
                                            placeholder="별점과 관계없이 자유롭게 의견을 남겨 주세요. 개인을 특정할 수 있는 정보는 적지 말아 주세요…"
                                        />
                                        <div className="flex justify-end px-2 pb-1 text-xs tabular-nums text-slate-600">
                                            {otherOpinion.length}/1000
                                        </div>
                                    </div>
                                </motion.label>
                            )}
                        </AnimatePresence>
                        <button
                            type="button"
                            className="btn-primary mx-auto mt-8 flex w-full max-w-xl items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!score || (score < 3 && disappointments.length === 0) || isSubmitting}
                            aria-busy={isSubmitting}
                            onClick={() => void submit('satisfaction')}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                                    제출 중…
                                </>
                            ) : '익명 응답 제출'}
                        </button>
                    </section>
                ) : !isVoteLink && <section className="card"><h2 className="text-lg font-semibold text-white">내전 만족도 조사</h2><p className="mt-2 text-slate-400">만족도 조사는 내전이 시작된 후 참여할 수 있습니다.</p></section>}
                {toast && <AppToast toast={toast} onDismiss={dismissToast} />}
            </div>}
        </main>
    );
}
