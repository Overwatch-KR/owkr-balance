import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ListChecks,
    MessageSquareText,
    Pencil,
    Sparkles,
    User,
    X,
} from 'lucide-react';
import type { Player } from '../../../types';
import type { PlayerInputMode, PlayerInputs } from '../../../hooks/use-player-input';
import type { RosterValidationIssue } from '../../../utils/parser';
import TierSelect from './tier-select';
import ParticipantChecker from './participant-checker';
import RosterPasteTextarea from './roster-paste-textarea';

export type { PlayerInputMode } from '../../../hooks/use-player-input';

export interface PlayerFormProps {
    players: Player[];
    participantMentions: string;
    setParticipantMentions: (value: string) => void;
    participantIncludesAdmin: boolean;
    setParticipantIncludesAdmin: (value: boolean) => void;
    currentAdminName: string;
    inputs: PlayerInputs;
    setInputs: React.Dispatch<React.SetStateAction<PlayerFormProps['inputs']>>;
    addPlayer: () => void;
    pasteText: string;
    pasteValidationIssues: RosterValidationIssue[];
    isPasteValidationPending: boolean;
    onPasteTextChange: (value: string) => void;
    handlePaste: () => void;
    failedParses: string[];
    setFailedParses: React.Dispatch<React.SetStateAction<string[]>>;
    isCollapsed: boolean;
    summary: string;
    onExpand: () => void;
    onCollapse: () => void;
    mode: PlayerInputMode;
    onModeChange: (mode: PlayerInputMode) => void;
    isEditing: boolean;
    manualInputError: string;
    onCancelEdit: () => void;
    onClearManualInputError: () => void;
    onRemovePlayer: (playerId: number) => void;
    variant?: 'card' | 'workspace';
}

interface RosterImportActionProps {
    hasIssues: boolean;
    hasPasteText: boolean;
    isChecking: boolean;
    onImport: () => void;
}

/**
 * @description 입력 검사가 끝나면 오류 항목이 섞여 있어도 정상 명단을 다음 확인 단계로 보낸다.
 */
export const RosterImportAction = ({
    hasIssues,
    hasPasteText,
    isChecking,
    onImport,
}: RosterImportActionProps) => {
    const isDisabled = !hasPasteText || isChecking;

    return (
        <button
            type="button"
            onClick={onImport}
            disabled={isDisabled}
            aria-describedby={hasIssues ? 'roster-paste-error-navigation' : undefined}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
            {isChecking
                ? '입력 확인 중…'
                : hasIssues
                    ? '정상 항목 계속 가져오기'
                    : '명단 가져오기'}
        </button>
    );
};

/**
 * @description 참가자 입력을 제공하고 성공 후에는 한 줄 요약으로 접힌다.
 */
const PlayerForm = ({
    players,
    participantMentions,
    setParticipantMentions,
    participantIncludesAdmin,
    setParticipantIncludesAdmin,
    currentAdminName,
    inputs,
    setInputs,
    addPlayer,
    pasteText,
    pasteValidationIssues,
    isPasteValidationPending,
    onPasteTextChange,
    handlePaste,
    failedParses,
    setFailedParses,
    isCollapsed,
    summary,
    onExpand,
    onCollapse,
    mode,
    onModeChange,
    isEditing,
    manualInputError,
    onCancelEdit,
    onClearManualInputError,
    onRemovePlayer,
    variant = 'card',
}: PlayerFormProps) => {
    const isWorkspace = variant === 'workspace';
    const reduceMotion = useReducedMotion();
    const battleTagInputRef = React.useRef<HTMLInputElement>(null);
    const inputScrollRef = React.useRef<HTMLDivElement>(null);
    const animation = reduceMotion
        ? { duration: 0 }
        : { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
    const collapsedMessage = isEditing
        ? `참가자 수정 중 · ${inputs.discordName || inputs.name}`
        : failedParses.length > 0
            ? `보완할 참가자 ${failedParses.length}명`
            : summary || '참가자 입력이 접혀 있습니다';
    const normalizedInputName = inputs.name.trim().toLowerCase();
    const isResolvingImportIssue = !isEditing && Boolean(normalizedInputName) && (
        failedParses.some(entry => (
            entry.match(/[^\s·]+#\d{4,}/)?.[0]?.toLowerCase() === normalizedInputName
        ))
    );
    React.useEffect(() => {
        inputScrollRef.current?.scrollTo({ top: 0 });
    }, [mode]);

    React.useEffect(() => {
        if (mode === 'manual' && manualInputError) battleTagInputRef.current?.focus();
    }, [manualInputError, mode]);

    const handleRemoveFailed = (name: string) => {
        setFailedParses(prev => prev.filter(n => n !== name));
    };

    const handleUseForManualInput = (failedEntry: string, battleTag = failedEntry) => {
        setInputs(prev => ({ ...prev, name: battleTag }));
        onClearManualInputError();
        onModeChange('manual');
    };

    return (
        <section
            id="player-input"
            className={`card scroll-mt-24 overflow-hidden p-0 ${
                isWorkspace ? 'min-h-[34rem]' : 'shrink-0'
            }`}
            aria-label="참가자 입력"
        >
            {!isWorkspace && (
            <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    {isCollapsed ? (
                        failedParses.length > 0 ? (
                            <AlertCircle size={17} className="shrink-0 text-amber-400" aria-hidden="true" />
                        ) : isEditing ? (
                            <Pencil size={17} className="shrink-0 text-cyan-300" aria-hidden="true" />
                        ) : summary ? (
                            <CheckCircle2 size={17} className="shrink-0 text-emerald-400" aria-hidden="true" />
                        ) : (
                            <User size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                        )
                    ) : (
                        <User size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                    )}
                    {isCollapsed ? (
                        <p className="min-w-0 flex-1 truncate text-sm text-slate-300" role="status">
                            {collapsedMessage}
                        </p>
                    ) : (
                        <h2 className="truncate text-sm font-semibold text-white">참가자 입력</h2>
                    )}
                </div>
                <button
                    type="button"
                    onClick={isCollapsed ? onExpand : onCollapse}
                    className={`inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                        isCollapsed
                            ? 'text-cyan-300 hover:bg-cyan-400/10 hover:text-cyan-200'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    }`}
                    aria-label={isCollapsed ? '참가자 입력 폼 다시 열기' : '참가자 입력 폼 접기'}
                    aria-expanded={!isCollapsed}
                    aria-controls="player-input-content"
                >
                    {isCollapsed ? (
                        <>
                            다시 열기
                            <ChevronDown size={14} aria-hidden="true" />
                        </>
                    ) : (
                        <>
                            접기
                            <ChevronUp size={14} aria-hidden="true" />
                        </>
                    )}
                </button>
            </div>
            )}

            <AnimatePresence initial={false}>
                {(isWorkspace || !isCollapsed) ? (
                    <motion.div
                        id="player-input-content"
                        key="input-content"
                        initial={isWorkspace || reduceMotion ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={animation}
                        className={`overflow-hidden ${isWorkspace ? '' : 'border-t border-slate-800/50'}`}
                    >
                        <div
                            ref={inputScrollRef}
                            role="region"
                            aria-label="참가자 입력 내용"
                            tabIndex={0}
                            className={`custom-scrollbar scroll-region px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/60 ${
                                isWorkspace
                                    ? 'lg:max-h-[calc(100dvh-16rem)] lg:overflow-y-auto lg:overscroll-contain'
                                    : 'xl:max-h-[calc(44dvh-3.5rem)] xl:overflow-y-auto xl:overscroll-contain'
                            }`}
                        >

                            {/* Tab Navigation */}
                            {!isWorkspace && (
                            <div id="player-input-tabs" className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 xl:sticky xl:top-0 xl:z-10 xl:-mx-1 xl:bg-surface-elevated/95 xl:pb-2 xl:backdrop-blur" role="group" aria-label="입력 방식">
                            <button
                                id="discord-input-tab"
                                type="button"
                                aria-pressed={mode === 'discord'}
                                onClick={() => onModeChange('discord')}
                                className={`flex min-h-10 flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                                    mode === 'discord'
                                        ? 'bg-accent text-white shadow-lg shadow-accent/25'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <MessageSquareText size={16} aria-hidden="true" />
                                채팅 붙여넣기
                            </button>
                            <button
                                id="manual-input-tab"
                                type="button"
                                aria-pressed={mode === 'manual'}
                                onClick={() => onModeChange('manual')}
                                className={`flex min-h-10 flex-1 touch-manipulation items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                                    mode === 'manual'
                                        ? 'bg-accent text-white shadow-lg shadow-accent/25'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <User size={16} aria-hidden="true" />
                                수동 입력
                            </button>
                            <button
                                id="participant-check-tab"
                                type="button"
                                aria-pressed={mode === 'mentions'}
                                onClick={() => onModeChange('mentions')}
                                className={`flex min-h-10 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                                    mode === 'mentions'
                                        ? 'bg-accent text-white shadow-lg shadow-accent/25'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                }`}
                            >
                                <ListChecks size={16} aria-hidden="true" />
                                참여 대조
                            </button>
                        </div>
                            )}

                        {/* Discord Parsing Mode */}
                        {mode === 'discord' && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <label htmlFor="discord-chat" className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                                        <Sparkles size={14} className="text-accent" aria-hidden="true" />
                                        디스코드 채팅 내용을 그대로 붙여넣으세요
                                    </label>
                                    <RosterPasteTextarea
                                        isValidationPending={isPasteValidationPending}
                                        issues={pasteValidationIssues}
                                        value={pasteText}
                                        onChange={onPasteTextChange}
                                    />
                                </div>
                                <RosterImportAction
                                    hasIssues={pasteValidationIssues.length > 0}
                                    hasPasteText={Boolean(pasteText.trim())}
                                    isChecking={isPasteValidationPending}
                                    onImport={handlePaste}
                                />
                                <p className="text-center text-xs text-slate-500">
                                    <span className="font-semibold text-amber-400">!</span>는 선호,
                                    {' '}<span className="font-semibold text-rose-400">?</span>는 비선호 포지션입니다
                                </p>
                            </div>
                        )}

                        {/* Manual Input Mode */}
                        {mode === 'manual' && (
                            <div className="space-y-4 animate-fade-in">
                                {(isEditing || isResolvingImportIssue) && (
                                    <div className="flex items-center gap-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-2" role="status">
                                        <Pencil size={14} className="shrink-0 text-cyan-300" aria-hidden="true" />
                                        <p className="min-w-0 flex-1 truncate text-xs font-medium text-cyan-100">
                                            {isEditing
                                                ? '참가자 정보 수정 중'
                                                : `${inputs.discordName || inputs.name} 정보 보완 중`}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={onCancelEdit}
                                            className="inline-flex min-h-8 shrink-0 touch-manipulation items-center rounded-md px-2 text-xs text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                                        >
                                            {isEditing ? '수정 취소' : '보완 취소'}
                                        </button>
                                    </div>
                                )}
                                <div>
                                    <label htmlFor="battle-tag" className="mb-2 block text-xs font-medium text-slate-400">배틀태그</label>
                                    <input
                                        ref={battleTagInputRef}
                                        id="battle-tag"
                                        name="battle-tag"
                                        type="text"
                                        autoComplete="off"
                                        spellCheck={false}
                                        placeholder="예: 닉네임#1234…"
                                        className={`input-base ${
                                            manualInputError
                                                ? 'border-rose-500/60 focus:border-rose-400/80 focus:ring-rose-500/20'
                                                : ''
                                        }`}
                                        value={inputs.name}
                                        onChange={(event) => {
                                            setInputs(prev => ({ ...prev, name: event.target.value }));
                                            onClearManualInputError();
                                        }}
                                        onKeyDown={(event) => event.key === 'Enter' && addPlayer()}
                                        aria-invalid={Boolean(manualInputError)}
                                        aria-describedby={manualInputError ? 'battle-tag-error' : undefined}
                                    />
                                    {manualInputError && (
                                        <p
                                            id="battle-tag-error"
                                            className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300"
                                            role="alert"
                                        >
                                            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                                            <span>{manualInputError}</span>
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="discord-name" className="mb-2 block text-xs font-medium text-slate-400">디스코드 닉네임 (선택)</label>
                                    <input
                                        id="discord-name"
                                        name="discord-name"
                                        type="text"
                                        autoComplete="off"
                                        spellCheck={false}
                                        placeholder="예: 서버에서 사용하는 닉네임…"
                                        className="input-base"
                                        value={inputs.discordName}
                                        onChange={(event) => setInputs(prev => ({ ...prev, discordName: event.target.value }))}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <TierSelect prefix="t" label="탱커" prefKey="tPref" avoidKey="tAvoid" inputs={inputs} setInputs={setInputs} />
                                    <TierSelect prefix="d" label="딜러" prefKey="dPref" avoidKey="dAvoid" inputs={inputs} setInputs={setInputs} />
                                    <TierSelect prefix="s" label="힐러" prefKey="sPref" avoidKey="sAvoid" inputs={inputs} setInputs={setInputs} />
                                </div>

                                <button
                                    type="button"
                                    onClick={addPlayer}
                                    className="btn-primary w-full"
                                >
                                    {isEditing ? '변경사항 저장' : '플레이어 추가'}
                                </button>
                            </div>
                        )}

                        {mode === 'mentions' && (
                            <ParticipantChecker
                                players={players}
                                mentionText={participantMentions}
                                setMentionText={setParticipantMentions}
                                onRemovePlayer={onRemovePlayer}
                                currentAdminName={currentAdminName}
                                includesAdmin={participantIncludesAdmin}
                                onIncludesAdminChange={setParticipantIncludesAdmin}
                            />
                        )}

                        {/* Failed Parses Section */}
                        {failedParses.length > 0 && (
                            <div
                                className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4 animate-fade-in"
                                role="status"
                                aria-live="polite"
                            >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <AlertCircle size={14} className="shrink-0 text-amber-300" aria-hidden="true" />
                                        <span className="text-sm font-medium text-amber-200">
                                            등급 정보 보완 ({failedParses.length}명)
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFailedParses([])}
                                        className="min-h-8 shrink-0 rounded-md px-2 text-xs text-amber-100/60 transition-colors hover:bg-amber-400/10 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                    >
                                        모두 닫기
                                    </button>
                                </div>
                                <p className="mb-3 text-xs text-slate-400">
                                    가져오기는 계속 진행할 수 있습니다. 배틀태그가 있는 참가자는 수동 입력으로 옮겨 보완해 주세요.
                                </p>
                                <div className="space-y-2">
                                    {failedParses.map((name) => {
                                        const battleTag = name.match(/[^\s·]+#\d{4,}/)?.[0];
                                        return (
                                            <div
                                                key={name}
                                                className="group flex items-center justify-between gap-2 rounded-lg border border-amber-400/15 bg-surface/50 px-3 py-2"
                                            >
                                                {battleTag ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUseForManualInput(name, battleTag)}
                                                        className="min-h-8 min-w-0 flex-1 break-words text-left text-sm leading-relaxed text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                                    >
                                                        <span className="block">{name}</span>
                                                        <span className="mt-1 block text-xs text-amber-200/80">
                                                            수동 입력으로 보완 →
                                                        </span>
                                                    </button>
                                                ) : (
                                                    <span className="min-w-0 flex-1 break-words text-sm leading-relaxed text-slate-300">
                                                        <span className="block">{name}</span>
                                                        <span className="mt-1 block text-xs text-slate-500">
                                                            원문에서 배틀태그와 등급 형식을 확인해 주세요.
                                                        </span>
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFailed(name)}
                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                                    aria-label={`${name} 실패 항목 삭제`}
                                                >
                                                    <X size={14} aria-hidden="true" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </section>
    );
};

export default PlayerForm;
