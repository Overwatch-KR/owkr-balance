import type { ComponentProps } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    ListChecks,
    MessageSquareText,
    User,
    Users,
} from 'lucide-react';
import type { PlayerInputMode } from '../../hooks/use-player-input';
import PlayerForm from './form';
import PlayerList from './list';

interface ParticipantWorkspaceProps {
    formProps: ComponentProps<typeof PlayerForm>;
    listProps: ComponentProps<typeof PlayerList>;
    participantCount: number;
    waitlistCount: number;
    reviewCount: number;
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
    onContinueToMatching,
    onClose,
}: ParticipantWorkspaceProps) => {
    const activeMode = formProps.mode;
    const activeCopy = MODE_COPY[activeMode];
    const remainingCount = Math.max(10 - participantCount, 0);
    const isReady = remainingCount === 0;

    return (
        <div className="space-y-5">
            <header
                id="participant-workspace-header"
                className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-surface-elevated/75 px-5 py-5 shadow-xl shadow-black/10 sm:flex-row sm:items-center sm:justify-between"
            >
                <div className="flex min-w-0 items-start gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/80 text-slate-400 transition-colors hover:border-slate-600 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label="매칭 대시보드로 돌아가기"
                    >
                        <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-white sm:text-2xl">참가자 작업실</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            명단 입력부터 참여 대조, 정보 보완까지 한곳에서 처리합니다.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200">
                        <Users size={13} aria-hidden="true" />
                        참가 {participantCount}/10
                    </span>
                    <span className="rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300">
                        대기 {waitlistCount}명
                    </span>
                    {reviewCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300">
                            <AlertCircle size={13} aria-hidden="true" />
                            보완 {reviewCount}명
                        </span>
                    )}
                </div>
            </header>

            <section
                id="participant-next-step"
                className={`flex flex-col gap-4 rounded-2xl border px-5 py-4 shadow-lg shadow-black/10 sm:flex-row sm:items-center sm:justify-between ${
                    isReady
                        ? 'border-cyan-400/25 bg-gradient-to-r from-cyan-500/10 via-blue-500/[0.07] to-transparent'
                        : 'border-slate-800/80 bg-slate-950/35'
                }`}
                aria-labelledby="participant-next-step-title"
            >
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-300">입력 내용 자동 저장 · 30분</p>
                    <h2 id="participant-next-step-title" className="mt-1 text-base font-semibold text-white">
                        {isReady ? '참가자 10명이 준비됐어요' : `팀 편성까지 ${remainingCount}명 더 필요해요`}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        {isReady
                            ? '팀 편성 화면으로 이동해 자동 배정을 실행해 보세요.'
                            : '참가자를 추가하거나 수정하면 이 브라우저에 30분 동안 바로 저장됩니다.'}
                    </p>
                    {reviewCount > 0 && (
                        <p className="mt-2 text-xs font-medium text-amber-300">
                            가져오지 못한 항목 {reviewCount}건은 입력 탭에서 따로 확인할 수 있어요.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onContinueToMatching}
                    disabled={!isReady}
                    className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    팀 편성 화면으로 이동
                    <ArrowRight size={16} aria-hidden="true" />
                </button>
            </section>

            <div className="grid min-w-0 gap-5 xl:grid-cols-[190px_minmax(420px,1fr)_minmax(320px,390px)] xl:items-start">
                <nav
                    className="card grid grid-cols-3 gap-2 p-2 xl:sticky xl:top-24 xl:grid-cols-1 xl:p-3"
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
                                className={`group flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 xl:min-h-[4.5rem] xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-left ${
                                    isActive
                                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <Icon size={18} className="shrink-0" aria-hidden="true" />
                                <span className="min-w-0">
                                    <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
                                    <span className={`mt-0.5 hidden text-[11px] xl:block ${
                                        isActive ? 'text-blue-100/75' : 'text-slate-600 group-hover:text-slate-500'
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
                        <h2 className="text-lg font-semibold text-white">{activeCopy.title}</h2>
                        <p className="mt-1 text-sm text-slate-500">{activeCopy.description}</p>
                    </div>
                    <PlayerForm {...formProps} variant="workspace" />
                </section>

                <aside className="min-w-0 xl:sticky xl:top-24 xl:h-[calc(100dvh-8rem)]">
                    <PlayerList {...listProps} />
                </aside>
            </div>
        </div>
    );
};
