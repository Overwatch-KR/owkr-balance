import type { ComponentProps } from 'react';
import {
    AlertCircle,
    ArrowRight,
    Database,
    ListChecks,
    MessageSquareText,
    User,
    Users,
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
    onClose: () => void;
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
    onClose,
}: ParticipantWorkspaceProps) => {
    const activeMode = formProps.mode;
    const activeCopy = MODE_COPY[activeMode];
    const remainingCount = Math.max(10 - participantCount, 0);
    const isReady = remainingCount === 0;

    return (
        <div className="space-y-4">
            <div id="participant-workspace-header">
                <PageHeader
                    breadcrumbs={[
                        { label: '대진표', onClick: onClose },
                        { label: '참가자' },
                    ]}
                    title="참가자"
                    description="이번 내전의 참가 명단을 추가하고 확인합니다."
                    meta={(
                        <>
                            <span className="inline-flex items-center gap-1.5 rounded-sm border-l-2 border-cyan-400 bg-cyan-500/[0.06] px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                <Users size={13} aria-hidden="true" />
                                참가 {participantCount}/10
                            </span>
                            <span className="rounded-sm border-l-2 border-slate-600 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">
                                대기 {waitlistCount}명
                            </span>
                            {reviewCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-sm border-l-2 border-amber-400 bg-amber-500/[0.06] px-2.5 py-1 text-xs font-medium text-amber-300">
                                    <AlertCircle size={13} aria-hidden="true" />
                                    보완 {reviewCount}명
                                </span>
                            )}
                        </>
                    )}
                />
            </div>

            <div
                id="participant-next-step"
                className={`flex min-h-10 flex-wrap items-center justify-between gap-3 border-l-2 px-3 py-1 ${
                    isReady ? 'border-emerald-400 bg-emerald-500/[0.035]' : 'border-slate-700'
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

            <div className="grid min-w-0 gap-5 xl:grid-cols-[190px_minmax(420px,1fr)_minmax(320px,390px)] xl:items-start">
                <nav
                    className="grid grid-cols-4 gap-1 rounded-lg border border-slate-800/80 bg-surface-elevated/45 p-1 xl:sticky xl:top-24 xl:grid-cols-1 xl:p-1.5"
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
                                className={`group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-2 text-center transition-colors after:absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 xl:min-h-14 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-left ${
                                    isActive
                                        ? 'bg-slate-900 text-cyan-100 after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-cyan-400 xl:after:inset-y-2 xl:after:left-0 xl:after:right-auto xl:after:h-auto xl:after:w-0.5'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <Icon size={18} className="shrink-0" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block truncate text-[11px] font-semibold sm:text-sm">{label}</span>
                                    <span className={`mt-0.5 hidden text-[11px] xl:block ${
                                        isActive ? 'text-blue-100/80' : 'text-slate-400 group-hover:text-slate-400'
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
