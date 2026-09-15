import {
    type KeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    BookOpen,
    Link2,
    NotebookPen,
    ShieldBan,
    Star,
    Trash2,
} from 'lucide-react';
import { HEROES } from '#domain/scrim/rules';
import type { Player } from '#domain/player';
import type {
    PublicParticipationKind,
    ScrimRecord,
} from '#domain/scrim';
import { formatScrimLabel } from '../../utils/scrim';
import { getErrorMessage, requestJson } from '../../utils/api';
import { useToast } from '../../hooks/use-toast';
import { AppToast } from '../app-toast';
import { DataLoadError } from '../common/data-load-error';
import { DataLoadingState } from '../common/data-loading-state';
import { DouMascot } from '../common/dou-mascot';
import { PageHeader } from '../layout/page-header';
import { HeroPickerModal } from './hero-picker-modal';
import { RandomBanModal } from './random-ban-modal';
import { ScrimDateTimePicker } from './scrim-datetime-picker';
import { ScrimManagerGuide } from './scrim-manager-guide';
import { ScrimOperationsTab } from './scrim-operations-tab';
import { ScrimReviewTab } from './scrim-review-tab';
import {
    ScrimBanTab,
    ScrimSatisfactionTab,
    type VoteCount,
} from './scrim-results-tabs';

interface ScrimManagerProps {
    csrfToken: string;
    players: Player[];
    userId: string;
}

interface ScrimsResponse {
    scrims: ScrimRecord[];
}

type DetailTab = 'operations' | 'ban' | 'satisfaction' | 'review';
type HeroPickerMode = 'final' | 'used' | null;

const DETAIL_TABS: Array<{ id: DetailTab; label: string; icon: typeof Link2 }> = [
    { id: 'operations', label: '운영 및 링크', icon: Link2 },
    { id: 'ban', label: '영웅 밴', icon: ShieldBan },
    { id: 'satisfaction', label: '만족도 결과', icon: Star },
    { id: 'review', label: '내전 후기', icon: NotebookPen },
];

const EMPTY_SCRIMS: ScrimRecord[] = [];

const toRosterSnapshot = (players: Player[]) => players.slice(0, 10).map(player => ({
    id: player.discordUserId ?? player.userSheetEntryId ?? String(player.id),
    name: player.name,
    discordName: player.discordName,
}));

/**
 * @description 전용 페이지에서 내전 기록과 공개 링크, 밴, 만족도 결과 및 운영 후기를 탭으로 관리한다.
 */
export function ScrimManager({ csrfToken, players, userId }: ScrimManagerProps) {
    const queryClient = useQueryClient();
    const queryKey = useMemo(() => ['scrims', userId] as const, [userId]);
    const scrimsQuery = useQuery({
        queryKey,
        queryFn: () => requestJson<ScrimsResponse>('/api/scrims', { credentials: 'same-origin' }),
    });
    const scrims = scrimsQuery.data?.scrims ?? EMPTY_SCRIMS;
    const isLoading = scrimsQuery.isPending;
    const isRefreshing = scrimsQuery.isFetching && !scrimsQuery.isPending;
    const loadError = scrimsQuery.error
        ? getErrorMessage(scrimsQuery.error, '내전 기록을 불러오지 못했습니다.')
        : '';
    const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()));
    const [startTime, setStartTime] = useState('21:00');
    const [selectedId, setSelectedId] = useState('');
    const [activeTab, setActiveTab] = useState<DetailTab>('operations');
    const [heroPickerMode, setHeroPickerMode] = useState<HeroPickerMode>(null);
    const [isRandomModalOpen, setIsRandomModalOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [pendingActionKey, setPendingActionKey] = useState('');
    const { dismissToast, showToast, toast } = useToast();

    const updateScrims = useCallback((
        update: (current: ScrimRecord[]) => ScrimRecord[],
    ) => {
        queryClient.setQueryData<ScrimsResponse>(queryKey, current => ({
            scrims: update(current?.scrims ?? EMPTY_SCRIMS),
        }));
    }, [queryClient, queryKey]);

    useEffect(() => {
        setSelectedId(current => (
            scrims.some(scrim => scrim.id === current)
                ? current
                : scrims[0]?.id ?? ''
        ));
    }, [scrims]);

    const selected = useMemo(
        () => scrims.find(scrim => scrim.id === selectedId) ?? null,
        [scrims, selectedId],
    );
    const selectedScrimId = selected?.id;

    const voteCounts = useMemo<VoteCount[]>(() => {
        if (!selected) return [];
        return HEROES
            .map(hero => ({
                hero,
                count: selected.votes.filter(vote => vote.heroIds.includes(hero.id)).length,
            }))
            .filter(result => result.count > 0)
            .sort((a, b) => b.count - a.count);
    }, [selected]);
    const randomCandidateHeroIds = useMemo(
        () => voteCounts.slice(0, 8).map(result => result.hero.id),
        [voteCounts],
    );

    const satisfactionAverage = selected?.satisfactionResponses.length
        ? selected.satisfactionResponses.reduce((sum, response) => sum + response.score, 0)
            / selected.satisfactionResponses.length
        : 0;
    const satisfactionScores = selected
        ? [1, 2, 3, 4, 5].map(score => (
            selected.satisfactionResponses.filter(response => response.score === score).length
        ))
        : [];
    const disappointmentCounts = selected?.satisfactionResponses.reduce<Record<string, number>>(
        (counts, response) => {
            response.disappointments.forEach(item => {
                counts[item] = (counts[item] ?? 0) + 1;
            });
            return counts;
        },
        {},
    ) ?? {};

    const selectScrim = (scrim: ScrimRecord) => {
        setSelectedId(scrim.id);
        setHeroPickerMode(null);
        setIsRandomModalOpen(false);
    };

    const handleDetailTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
        if (currentIndex < 0) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? tabs.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        const nextTab = DETAIL_TABS[nextIndex];
        setActiveTab(nextTab.id);
        tabs[nextIndex]?.focus();
    };

    const call = useCallback(async (
        action: string,
        payload: Record<string, unknown> = {},
    ) => {
        if ((!selected && action !== 'create') || pendingActionKey) return;
        const actionKey = `${action}:${typeof payload.kind === 'string' ? payload.kind : ''}`;
        setPendingActionKey(actionKey);
        try {
            const result = await requestJson<{ scrim: ScrimRecord }>('/api/scrims', {
                method: action === 'create' ? 'POST' : 'PATCH',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify(
                    action === 'create'
                        ? payload
                        : { id: selected!.id, action, ...payload },
                ),
            });
            if (action === 'create') {
                updateScrims(current => [...current, result.scrim]);
                setSelectedId(result.scrim.id);
            } else {
                updateScrims(current => current.map(scrim => (
                    scrim.id === result.scrim.id ? result.scrim : scrim
                )));
            }
            const messages: Record<string, string> = {
                create: '내전을 등록했습니다.',
                openVote: '영웅 밴 투표를 열고 참여 링크를 생성했습니다.',
                closeVote: '영웅 밴 투표를 마감했습니다.',
                activateLink: payload.kind === 'satisfaction'
                    ? '만족도 조사 링크를 활성화했습니다.'
                    : '영웅 밴 투표 링크를 활성화했습니다.',
                deactivateLink: payload.kind === 'satisfaction'
                    ? '만족도 조사 링크를 비활성화했습니다.'
                    : '영웅 밴 투표 링크를 비활성화했습니다.',
                addUsedBans: '사용된 밴 영웅을 저장했습니다.',
                confirmFinalBans: '최종 밴 영웅을 확정했습니다.',
                extendSatisfaction: '만족도 응답 기간을 24시간 연장했습니다.',
                updateReview: '내전 후기를 저장했습니다.',
            };
            showToast('success', messages[action] ?? '변경 사항을 저장했습니다.');
        } catch (error) {
            showToast('error', getErrorMessage(error, '저장하지 못했습니다.'));
        } finally {
            setPendingActionKey('');
        }
    }, [csrfToken, pendingActionKey, selected, showToast, updateScrims]);

    const resolveTieRandom = useCallback(async (): Promise<string[]> => {
        if (!selectedScrimId) throw new Error('내전 정보를 찾을 수 없습니다.');
        const result = await requestJson<{ scrim: ScrimRecord }>('/api/scrims', {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify({ id: selectedScrimId, action: 'resolveTieRandom' }),
        });
        updateScrims(current => current.map(scrim => (
            scrim.id === result.scrim.id ? result.scrim : scrim
        )));
        const heroIds = result.scrim.finalBanDecision?.heroIds ?? [];
        if (heroIds.length !== 2) throw new Error('랜덤 추첨 결과를 확인하지 못했습니다.');
        return heroIds;
    }, [csrfToken, selectedScrimId, updateScrims]);

    const deleteSelected = async () => {
        if (!selected || !window.confirm(`${formatScrimLabel(selected)} 기록을 삭제할까요?`)) return;
        try {
            await requestJson('/api/scrims', {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ id: selected.id, action: 'delete' }),
            });
            const remainingScrims = scrims.filter(scrim => scrim.id !== selected.id);
            updateScrims(() => remainingScrims);
            setSelectedId(remainingScrims[0]?.id ?? '');
            showToast('success', '내전 기록을 삭제했습니다.');
        } catch (error) {
            showToast('error', getErrorMessage(error, '삭제하지 못했습니다.'));
        }
    };

    const copyLink = async (kind: PublicParticipationKind) => {
        const publicToken = selected?.publicLinks?.[kind]?.token;
        if (!publicToken) return;
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/participate/${publicToken}`);
            showToast('success', `${kind === 'vote' ? '영웅 밴 투표' : '만족도 조사'} 링크를 복사했습니다.`);
        } catch {
            showToast('error', '링크를 복사하지 못했습니다.');
        }
    };

    const create = () => void call('create', {
        date,
        startTime,
        roster: toRosterSnapshot(players),
    });

    return (
        <>
            <div>
                <PageHeader
                    title="내전 관리"
                    description="내전 일정과 참여 링크, 결과 기록을 관리합니다."
                    actions={(
                        <button type="button" className="btn-ghost" onClick={() => setIsGuideOpen(true)}>
                            <BookOpen size={16} className="mr-1 inline" aria-hidden="true" />
                            관리 가이드
                        </button>
                    )}
                />

                {loadError ? (
                    <DataLoadError
                        isRetrying={isLoading || isRefreshing}
                        message={loadError}
                        onRetry={() => void scrimsQuery.refetch()}
                        title="내전 기록을 불러오지 못했습니다"
                    />
                ) : null}

                <section className="card">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 className="font-semibold text-white">내전 등록</h2>
                            <p className="mt-1 text-sm text-slate-400">진행 일시는 한국 시간(Asia/Seoul)으로 저장됩니다.</p>
                        </div>
                        <span className="rounded-sm border-l-2 border-cyan-400 bg-cyan-400/[0.06] px-2.5 py-1 text-xs font-medium text-cyan-200">
                            로스터 {Math.min(players.length, 10)}명
                        </span>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <ScrimDateTimePicker
                            date={date}
                            time={startTime}
                            onDateChange={setDate}
                            onTimeChange={setStartTime}
                        />
                        <button
                            type="button"
                            className="btn-primary min-h-12 whitespace-nowrap disabled:opacity-40"
                            disabled={players.length === 0}
                            onClick={create}
                        >
                            내전 등록
                        </button>
                    </div>
                </section>

                <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                    <aside className="card h-fit">
                        <h2 className="font-semibold text-white">내전 기록</h2>
                        <div className="mt-3">
                            {isLoading ? (
                                <DataLoadingState label="내전 기록을 불러오는 중…" />
                            ) : scrims.length > 0 ? (
                                <div className="space-y-2">
                                    {scrims
                                        .slice()
                                        .sort((a, b) => b.customGameStartsAt - a.customGameStartsAt)
                                        .map(scrim => (
                                            <button
                                                key={scrim.id}
                                                type="button"
                                                onClick={() => selectScrim(scrim)}
                                                className={`w-full border-b border-l-2 p-3 text-left text-sm transition-colors last:border-b-0 ${
                                                    selected?.id === scrim.id
                                                        ? 'border-b-slate-800 border-l-cyan-400 bg-cyan-400/[0.055] text-cyan-100'
                                                        : 'border-b-slate-800 border-l-transparent text-slate-300 hover:bg-slate-900'
                                                }`}
                                            >
                                                <span className="font-medium">{formatScrimLabel(scrim)}</span>
                                                <span className="mt-1 block text-xs text-slate-400">
                                                    {scrim.startTime} · 투표 {scrim.votes.length}명 · 만족도 {scrim.satisfactionResponses.length}건
                                                </span>
                                            </button>
                                        ))}
                                </div>
                            ) : loadError ? (
                                <p className="py-6 text-center text-sm text-slate-400">
                                    연결되면 내전 기록이 표시됩니다.
                                </p>
                            ) : (
                                <div className="flex flex-col items-center py-6 text-center text-sm text-slate-400">
                                    <DouMascot variant="empty" size={72} className="mb-3 opacity-80" decorative />
                                    <p>등록된 내전이 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </aside>

                    {isLoading ? (
                        <section className="card min-h-64">
                            <DataLoadingState
                                className="min-h-[13rem]"
                                label="내전 상세 정보를 불러오는 중…"
                            />
                        </section>
                    ) : selected ? (
                        <section className="space-y-5">
                            <section className="card">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">{formatScrimLabel(selected)}</h2>
                                        <p className="mt-1 text-sm text-slate-400">
                                            {selected.date} · {selected.startTime} · 참가 {selected.rosterSnapshot.length}명
                                        </p>
                                    </div>
                                    {selected.createdById === userId ? (
                                        <button type="button" className="btn-danger" onClick={() => void deleteSelected()}>
                                            <Trash2 size={15} className="mr-1 inline" />내전 삭제
                                        </button>
                                    ) : null}
                                </div>
                                <div
                                    className="mt-5 flex overflow-x-auto border-b border-slate-800 bg-slate-950/30"
                                    role="tablist"
                                    aria-label="내전 상세"
                                    aria-orientation="horizontal"
                                    onKeyDown={handleDetailTabKeyDown}
                                >
                                    {DETAIL_TABS.map(tab => {
                                        const Icon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                role="tab"
                                                id={`scrim-tab-${tab.id}`}
                                                aria-selected={isActive}
                                                aria-controls={`scrim-panel-${tab.id}`}
                                                tabIndex={isActive ? 0 : -1}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`min-h-10 flex-1 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
                                                    isActive
                                                        ? 'border-cyan-400 bg-cyan-400/[0.035] text-white'
                                                        : 'border-transparent text-slate-400 hover:bg-white/[0.025] hover:text-slate-300'
                                                }`}
                                            >
                                                <Icon size={15} className="mr-1.5 inline" />{tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>

                            {activeTab === 'operations' ? (
                                <ScrimOperationsTab
                                    pendingActionKey={pendingActionKey}
                                    scrim={selected}
                                    onAction={(action, payload) => void call(action, payload)}
                                    onCopy={kind => void copyLink(kind)}
                                />
                            ) : activeTab === 'ban' ? (
                                <ScrimBanTab
                                    scrim={selected}
                                    voteCounts={voteCounts}
                                    onOpenFinalPicker={() => setHeroPickerMode('final')}
                                    onOpenRandom={() => setIsRandomModalOpen(true)}
                                    onOpenUsedPicker={() => setHeroPickerMode('used')}
                                />
                            ) : activeTab === 'satisfaction' ? (
                                <ScrimSatisfactionTab
                                    scrim={selected}
                                    satisfactionAverage={satisfactionAverage}
                                    satisfactionScores={satisfactionScores}
                                    disappointmentCounts={disappointmentCounts}
                                />
                            ) : (
                                <ScrimReviewTab
                                    scrim={selected}
                                    onSave={adminReview => call('updateReview', { adminReview })}
                                />
                            )}
                        </section>
                    ) : (
                        <section className="card flex min-h-64 items-center justify-center text-sm text-slate-400">
                            내전을 등록하면 상세 정보가 표시됩니다.
                        </section>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isGuideOpen && <ScrimManagerGuide onClose={() => setIsGuideOpen(false)} />}
            </AnimatePresence>

            <AnimatePresence>
                {heroPickerMode && selected ? (
                    <HeroPickerModal
                        key={heroPickerMode}
                        mode={heroPickerMode}
                        initialHeroIds={
                            heroPickerMode === 'final'
                                ? selected.finalBanDecision?.heroIds ?? []
                                : selected.usedBanHeroIds
                        }
                        disabledHeroIds={heroPickerMode === 'final' ? selected.usedBanHeroIds : []}
                        onClose={() => setHeroPickerMode(null)}
                        onConfirm={heroIds => {
                            setHeroPickerMode(null);
                            void call(
                                heroPickerMode === 'final' ? 'confirmFinalBans' : 'addUsedBans',
                                { heroIds },
                            );
                        }}
                    />
                ) : null}
            </AnimatePresence>

            <AnimatePresence>
                {isRandomModalOpen && selected ? (
                    <RandomBanModal
                        candidateHeroIds={randomCandidateHeroIds}
                        onResolve={resolveTieRandom}
                        onClose={succeeded => {
                            setIsRandomModalOpen(false);
                            if (succeeded) {
                                showToast('success', '랜덤 추첨으로 최종 밴을 확정했습니다.');
                            }
                        }}
                    />
                ) : null}
            </AnimatePresence>

            {toast ? <AppToast toast={toast} onDismiss={dismissToast} /> : null}
        </>
    );
}
