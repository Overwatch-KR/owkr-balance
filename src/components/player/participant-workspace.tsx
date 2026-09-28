import type { ComponentProps } from 'react';
import {
    ArrowRight,
    Database,
    ListChecks,
    MessageSquareText,
    User,
} from 'lucide-react';
import type { PlayerInputMode } from '../../hooks/use-player-input';
import type { UserSheetEntry } from '../../utils/user-sheet';
import { PageHeader } from '../layout/page-header';
import PlayerForm from './form';
import PlayerList from './list';
import { ParticipantUserSheetPicker } from './participant-user-sheet-picker';

interface ParticipantWorkspaceProps {
    formProps: ComponentProps<typeof PlayerForm>;
    listProps: ComponentProps<typeof PlayerList>;
    participantCount: number;
    waitlistCount: number;
    reviewCount: number;
    userSheetEntries: UserSheetEntry[];
    userSheetError: string | null;
    userSheetIsLoading: boolean;
    onAddUserSheetEntry: (entry: UserSheetEntry) => void;
    onRetryUserSheet: () => void;
    onContinueToMatching: () => void;
}

const INPUT_MODES: Array<{
    mode: PlayerInputMode;
    id: string;
    label: string;
    description: string;
    icon: typeof MessageSquareText;
}> = [
    {
        mode: 'discord',
        id: 'discord-input-tab',
        label: '채팅 붙여넣기',
        description: '여러 명을 한 번에',
        icon: MessageSquareText,
    },
    {
        mode: 'sheet',
        id: 'user-sheet-input-tab',
        label: '유저 시트',
        description: '저장된 유저 검색',
        icon: Database,
    },
    {
        mode: 'manual',
        id: 'manual-input-tab',
        label: '수동 입력',
        description: '한 명씩 추가·수정',
        icon: User,
    },
    {
        mode: 'mentions',
        id: 'participant-check-tab',
        label: '참여 대조',
        description: '공지 명단과 비교',
        icon: ListChecks,
    },
];

const MODE_COPY: Record<PlayerInputMode, { title: string; description: string }> = {
    discord: {
        title: '채팅 명단 가져오기',
        description: '디스코드 채팅을 붙여넣으면 등급을 확인해 참가 명단에 반영합니다.',
    },
    sheet: {
        title: '유저 시트에서 추가',
        description: '저장된 유저를 검색해 Discord ID와 최신 티어를 그대로 참가 명단에 추가합니다.',
    },
    manual: {
        title: '참가자 직접 입력',
        description: '배틀태그와 역할별 티어를 입력하거나 기존 참가자 정보를 수정합니다.',
    },
    mentions: {
        title: '공지 참여자 대조',
        description: '공지 멘션과 현재 명단을 비교해 누락되거나 잘못 추가된 참가자를 찾습니다.',
    },
};

/**
 * @description 참가자 입력 방식, 오류 보완, 실시간 명단을 한 화면에 나눠 제공한다.
 */
export const ParticipantWorkspace = ({
    formProps,
    listProps,
    participantCount,
    waitlistCount,
    reviewCount,
    userSheetEntries,
    userSheetError,
    userSheetIsLoading,
    onAddUserSheetEntry,
    onRetryUserSheet,
    onContinueToMatching,
}: ParticipantWorkspaceProps) => {
    const activeMode = formProps.mode;
    const activeCopy = MODE_COPY[activeMode];
    const remainingCount = Math.max(10 - participantCount, 0);
    const isReady = remainingCount === 0;

    return (
        <div className="space-y-4">
            <div id="participant-workspace-header">
                <PageHeader
                    title="참가자"
                    description="이번 내전의 참가 명단을 추가하고 확인합니다."
                    meta={(
                        <>
                            <span className="text-xs font-medium text-slate-400">
                                참가 <strong className="ml-1 font-mono text-sm tabular-nums text-slate-100">{participantCount}/10</strong>
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                                대기 <strong className="ml-1 font-mono tabular-nums text-slate-300">{waitlistCount}</strong>
                            </span>
                            {reviewCount > 0 && (
                                <span className="text-xs font-medium text-amber-300">
                                    보완 <strong className="ml-1 font-mono tabular-nums">{reviewCount}</strong>
                                </span>
                            )}
                        </>
                    )}
                />
            </div>

            <div
                id="participant-next-step"
                className={`flex min-h-10 flex-wrap items-center justify-between gap-3 border-y px-1 py-2 ${
                    isReady ? 'border-cyan-400/30' : 'border-slate-800'
                }`}
            >
                <p className={`text-sm ${isReady ? 'text-emerald-300' : 'text-slate-400'}`}>
                    <span className="font-medium">
                        {isReady ? '10명 준비 완료' : `팀 편성까지 ${remainingCount}명`}
                    </span>
                    <span className="mx-2 text-slate-700" aria-hidden="true">·</span>
                    <span className="text-xs text-slate-400">입력 내용은 30분간 자동 저장</span>
                    {reviewCount > 0 && (
                        <span className="ml-2 text-xs text-amber-300">보완 {reviewCount}건</span>
                    )}
                </p>
                {isReady && (
                    <button
                        type="button"
                        onClick={onContinueToMatching}
                        className="btn-primary inline-flex min-h-10 shrink-0 items-center justify-center gap-2 px-3 text-sm"
                    >
                        팀 편성으로
                        <ArrowRight size={15} aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[180px_minmax(420px,1fr)_minmax(320px,380px)] xl:items-start">
                <nav
                    className="grid grid-cols-4 border-y border-slate-800/80 xl:sticky xl:top-24 xl:grid-cols-1"
                    aria-label="참가자 입력 방식"
                >
                    {INPUT_MODES.map(({ mode, id, label, description, icon: Icon }) => {
                        const isActive = activeMode === mode;
                        return (
                            <button
                                key={mode}
                                id={id}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => formProps.onModeChange(mode)}
                                className={`group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 border-b-2 border-transparent px-1.5 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 xl:min-h-14 xl:flex-row xl:justify-start xl:gap-3 xl:border-b xl:border-b-slate-800 xl:border-l-2 xl:px-3 xl:text-left ${
                                    isActive
                                        ? 'border-b-white/80 text-white xl:border-l-white/80'
                                        : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200 xl:border-l-transparent'
                                }`}
                            >
                                <Icon size={18} className="shrink-0" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-semibold sm:text-sm">{label}</span>
                                    <span className={`mt-0.5 hidden text-[11px] xl:block ${
                                        isActive ? 'text-slate-300' : 'text-slate-500 group-hover:text-slate-400'
                                    }`}>
                                        {description}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <section className="min-w-0">
                    <div className="mb-3 px-1">
                        <h2 className="text-base font-semibold text-white sm:text-lg">{activeCopy.title}</h2>
                        <p className="mt-1 text-sm text-slate-400">{activeCopy.description}</p>
                    </div>
                    {activeMode === 'sheet' ? (
                        <ParticipantUserSheetPicker
                            entries={userSheetEntries}
                            error={userSheetError}
                            isLoading={userSheetIsLoading}
                            players={formProps.players}
                            onAdd={onAddUserSheetEntry}
                            onRetry={onRetryUserSheet}
                        />
                    ) : (
                        <PlayerForm {...formProps} variant="workspace" />
                    )}
                </section>

                <aside className="min-w-0 xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
                    <PlayerList {...listProps} />
                </aside>
            </div>
        </div>
    );
};
