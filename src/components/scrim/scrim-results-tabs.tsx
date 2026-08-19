import { lazy, Suspense, useMemo } from 'react';
import { Dices, Pencil } from 'lucide-react';
import { HEROES, type Hero } from '../../constants/hero';
import type { ScrimRecord } from '../../../domains/scrim/shared/public';
import { Skeleton } from '../common/skeleton';
import type { HeroDemandChartDatum } from './scrim-result-charts';

const HeroDemandChart = lazy(() => import('./scrim-result-charts').then(module => ({
    default: module.HeroDemandChart,
})));
const SatisfactionCharts = lazy(() => import('./scrim-result-charts').then(module => ({
    default: module.SatisfactionCharts,
})));

export interface VoteCount {
    count: number;
    hero: Hero;
}

const heroById = new Map(HEROES.map(hero => [hero.id, hero]));

const ChartSkeleton = () => (
    <div className="space-y-3" role="status" aria-label="결과 그래프를 불러오는 중">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
);

interface ScrimBanTabProps {
    onOpenFinalPicker: () => void;
    onOpenRandom: () => void;
    onOpenUsedPicker: () => void;
    scrim: ScrimRecord;
    voteCounts: VoteCount[];
}

/**
 * @description 내전의 영웅 밴 투표 현황과 최종·사용 밴 관리 화면을 표시한다.
 */
export function ScrimBanTab({
    onOpenFinalPicker,
    onOpenRandom,
    onOpenUsedPicker,
    scrim,
    voteCounts,
}: ScrimBanTabProps) {
    const decision = scrim.finalBanDecision;
    const finalHeroes = decision?.heroIds
        .map(heroId => heroById.get(heroId))
        .filter((hero): hero is Hero => Boolean(hero)) ?? [];
    const usedHeroes = scrim.usedBanHeroIds
        .map(heroId => heroById.get(heroId))
        .filter((hero): hero is Hero => Boolean(hero));
    const hasUnresolvedTie = Boolean(decision?.hasTie && finalHeroes.length < 2);
    const canResolveRandomly = new Set(voteCounts.map(result => result.hero.role)).size >= 2;
    const heroDemandData = useMemo<HeroDemandChartDatum[]>(
        () => voteCounts.map(result => ({
            count: result.count,
            name: result.hero.name,
            role: result.hero.role,
        })),
        [voteCounts],
    );
    const participationRate = scrim.rosterSnapshot.length > 0
        ? Math.min(100, (scrim.votes.length / scrim.rosterSnapshot.length) * 100)
        : 0;

    return (
        <section className="space-y-5" role="tabpanel" id="scrim-panel-ban" aria-labelledby="scrim-tab-ban">
            <div className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-white">영웅 밴 결과</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            제출 {scrim.votes.length}/{scrim.rosterSnapshot.length}명
                        </p>
                    </div>
                    <div className="min-w-36">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className="h-full rounded-full bg-cyan-400 transition-[width]"
                                style={{ width: `${participationRate}%` }}
                            />
                        </div>
                        <p className="mt-1 text-right text-xs text-slate-500">
                            {Math.round(participationRate)}% 참여
                        </p>
                    </div>
                </div>

                {heroDemandData.length > 0 ? (
                    <div className="mt-5">
                        <h3 className="mb-1 text-sm font-semibold text-white">영웅별 밴 수요</h3>
                        <p className="mb-4 text-xs text-slate-500">막대에 마우스를 올리면 정확한 득표 수를 확인할 수 있습니다.</p>
                        <Suspense fallback={<ChartSkeleton />}>
                            <HeroDemandChart data={heroDemandData} />
                        </Suspense>
                    </div>
                ) : (
                    <div className="mt-5 rounded-xl border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
                        아직 제출된 투표가 없습니다.
                    </div>
                )}
            </div>

            <div className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-white">최종 밴</h2>
                        <p className="mt-1 text-sm text-slate-400">
                            {decision?.resolvedBy === 'random'
                                ? '관리자 랜덤 추첨으로 확정됨'
                                : decision?.resolvedBy === 'manual'
                                    ? '관리자가 직접 확정함'
                                    : decision?.resolvedBy === 'automatic'
                                        ? '득표 규칙에 따라 자동 선정됨'
                                        : '아직 최종 밴이 확정되지 않았습니다.'}
                        </p>
                    </div>
                    {finalHeroes.length === 2 ? (
                        <button type="button" className="btn-ghost" onClick={onOpenFinalPicker}>
                            <Pencil size={15} className="mr-1 inline" />수정
                        </button>
                    ) : null}
                </div>

                {finalHeroes.length > 0 ? (
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        {finalHeroes.map(hero => (
                            <div key={hero.id} className="flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/8 p-3">
                                <img
                                    src={`/hero/${hero.role}/${hero.id}.png`}
                                    alt=""
                                    width={64}
                                    height={64}
                                    className="h-16 w-16 rounded-xl object-cover"
                                />
                                <strong className="text-white">{hero.name}</strong>
                            </div>
                        ))}
                    </div>
                ) : null}

                {hasUnresolvedTie ? (
                    <div className="mt-5 rounded-2xl border border-violet-400/25 bg-violet-400/8 p-4">
                        <h3 className="font-semibold text-violet-100">동점 후보가 있습니다</h3>
                        <p className="mt-1 text-sm text-slate-400">
                            {canResolveRandomly
                                ? '랜덤 추첨을 진행하거나 관리자가 직접 최종 밴을 선택해 주세요.'
                                : '서로 다른 역할군 후보가 부족해 관리자가 직접 최종 밴을 선택해야 합니다.'}
                        </p>
                        <div className={`mt-4 grid gap-2 ${canResolveRandomly ? 'sm:grid-cols-2' : ''}`}>
                            {canResolveRandomly ? (
                                <button type="button" className="btn-primary" onClick={onOpenRandom}>
                                    <Dices size={16} className="mr-1 inline" />랜덤으로 결정
                                </button>
                            ) : null}
                            <button type="button" className="btn-ghost" onClick={onOpenFinalPicker}>
                                <Pencil size={16} className="mr-1 inline" />직접 선택
                            </button>
                        </div>
                    </div>
                ) : finalHeroes.length < 2 ? (
                    <button type="button" className="btn-primary mt-5" onClick={onOpenFinalPicker}>
                        최종 밴 직접 선택
                    </button>
                ) : null}

                {decision?.excludedHeroIds.length ? (
                    <p className="mt-4 text-xs text-slate-500">
                        역할군 중복 제외: {decision.excludedHeroIds.map(heroId => heroById.get(heroId)?.name ?? heroId).join(', ')}
                    </p>
                ) : null}
            </div>

            <div className="card">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-white">사용된 밴 영웅</h2>
                        <p className="mt-1 text-sm text-slate-400">다음 투표에서 다시 선택할 수 없는 영웅입니다.</p>
                    </div>
                    <button type="button" className="btn-ghost" onClick={onOpenUsedPicker}>
                        <Pencil size={15} className="mr-1 inline" />편집
                    </button>
                </div>
                {usedHeroes.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {usedHeroes.map(hero => (
                            <span key={hero.id} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-sm text-slate-200">
                                <img
                                    src={`/hero/${hero.role}/${hero.id}.png`}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-8 w-8 rounded-lg object-cover"
                                />
                                {hero.name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-slate-500">아직 기록된 사용 밴이 없습니다.</p>
                )}
            </div>
        </section>
    );
}

interface ScrimSatisfactionTabProps {
    disappointmentCounts: Record<string, number>;
    satisfactionAverage: number;
    satisfactionScores: number[];
    scrim: ScrimRecord;
}

/**
 * @description 익명 만족도 집계와 개별 응답을 내전 상세 탭에 표시한다.
 */
export function ScrimSatisfactionTab({
    disappointmentCounts,
    satisfactionAverage,
    satisfactionScores,
    scrim,
}: ScrimSatisfactionTabProps) {
    return (
        <section className="space-y-5" role="tabpanel" id="scrim-panel-satisfaction" aria-labelledby="scrim-tab-satisfaction">
            <div className="card">
                <h2 className="text-lg font-semibold text-white">만족도 결과</h2>
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                        <p className="text-xs text-slate-500">총 응답</p>
                        <strong className="mt-1 block text-2xl text-white">
                            {scrim.satisfactionResponses.length}
                            <span className="ml-1 text-sm font-medium text-slate-400">건</span>
                        </strong>
                    </div>
                    <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4">
                        <p className="text-xs text-amber-100/60">평균 만족도</p>
                        <strong className="mt-1 block text-2xl text-amber-200">
                            {scrim.satisfactionResponses.length > 0
                                ? satisfactionAverage.toFixed(1)
                                : '-'}
                            <span className="ml-1 text-sm font-medium text-amber-100/60">/ 5</span>
                        </strong>
                    </div>
                </div>
                {scrim.satisfactionResponses.length > 0 ? (
                    <div className="mt-5">
                        <Suspense fallback={<ChartSkeleton />}>
                            <SatisfactionCharts
                                scoreCounts={satisfactionScores}
                                disappointmentCounts={disappointmentCounts}
                            />
                        </Suspense>
                    </div>
                ) : (
                    <p className="mt-6 rounded-xl border border-dashed border-slate-700 py-8 text-center text-sm text-slate-500">
                        아직 제출된 만족도 응답이 없습니다.
                    </p>
                )}
            </div>
            {scrim.satisfactionResponses.length > 0 ? (
                <div className="card">
                    <h2 className="text-lg font-semibold text-white">개별 응답</h2>
                    <p className="mt-1 text-sm text-slate-400">응답자를 특정할 수 있는 정보는 저장되지 않습니다.</p>
                    <div className="mt-4 space-y-2">
                        {scrim.satisfactionResponses.map((response, index) => (
                            <div key={`${response.submittedAt}-${index}`} className="rounded-xl bg-slate-900 p-3 text-sm">
                                <span className="font-semibold text-amber-200">{response.score}점</span>
                                <span className="ml-3 text-slate-400">{response.disappointments.join(', ') || '아쉬운 점 없음'}</span>
                                {response.otherOpinion ? <p className="mt-1 break-words text-slate-300">의견: {response.otherOpinion}</p> : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
