import { useState } from 'react';
import { Check, ClipboardCopy, Link2, Loader2, LogOut, Radio, Users } from 'lucide-react';
import {
    normalizeMatchShareCode,
    type MatchLiveSessionSnapshot,
} from '#domain/balance';

interface MatchLiveControlsProps {
    canStart: boolean;
    isConnected: boolean;
    isConnecting: boolean;
    isPublishing: boolean;
    isRemote: boolean;
    session: MatchLiveSessionSnapshot | null;
    syncError: string;
    onStart: () => Promise<string>;
    onJoin: (code: string) => Promise<void>;
    onLeave: () => void;
}

/**
 * @description 같은 코드를 연 관리자끼리 로스터와 팀 배치를 자동 동기화하는 제어를 제공한다.
 */
export function MatchLiveControls({
    canStart,
    isConnected,
    isConnecting,
    isPublishing,
    isRemote,
    session,
    syncError,
    onStart,
    onJoin,
    onLeave,
}: MatchLiveControlsProps) {
    const [code, setCode] = useState('');
    const [copyCompleted, setCopyCompleted] = useState(false);
    const isBusy = isConnecting || isPublishing;

    const handleStart = async () => {
        if (!isRemote || !canStart || isBusy) return;
        try {
            const createdCode = await onStart();
            setCode(createdCode);
        } catch {
            return;
        }
    };

    const handleJoin = async () => {
        if (!isRemote || code.length !== 10 || isBusy) return;
        try {
            await onJoin(code);
        } catch {
            return;
        }
    };

    const handleCopy = async () => {
        if (!session?.code || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(session.code);
            setCopyCompleted(true);
            window.setTimeout(() => setCopyCompleted(false), 1_500);
        } catch {
            setCopyCompleted(false);
        }
    };

    return (
        <section
            className="p-4"
            aria-label="함께 편집"
        >
            <p className="text-sm text-slate-300">
                같은 코드로 명단과 팀 변경을 실시간으로 맞춥니다.
            </p>

            {isConnected && session ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className={`h-1.5 w-1.5 ${syncError ? 'bg-amber-400' : 'bg-cyan-300'}`} aria-hidden="true" />
                            <span>{isPublishing ? '변경 저장 중…' : syncError ? '연결 확인 필요' : '연결됨'}</span>
                            <strong className="font-mono tracking-[0.14em] text-cyan-200">{session.code}</strong>
                        </div>
                        <span className="mt-1 block text-[11px] text-slate-500">
                            새로고침 후에도 자동으로 다시 연결됩니다.
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => void handleCopy()}
                            className="btn-ghost min-h-9 px-2 text-xs"
                        >
                            {copyCompleted
                                ? <Check size={13} aria-hidden="true" />
                                : <ClipboardCopy size={13} aria-hidden="true" />}
                            {copyCompleted ? '복사됨' : '코드 복사'}
                        </button>
                        <button
                            type="button"
                            onClick={onLeave}
                            disabled={isBusy}
                            className="btn-ghost min-h-9 px-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <LogOut size={13} aria-hidden="true" />
                            연결 종료
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 grid items-end gap-3 lg:grid-cols-[minmax(180px,0.8fr)_auto_minmax(320px,1.2fr)]">
                    <button
                        type="button"
                        onClick={() => void handleStart()}
                        disabled={!isRemote || !canStart || isBusy}
                        title={canStart
                            ? '현재 명단으로 실시간 대진표 공유를 시작합니다.'
                            : 'Discord ID가 없는 참가자를 유저 시트와 먼저 연결해 주세요.'}
                        className="btn-primary w-full text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isConnecting
                            ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            : <Users size={14} aria-hidden="true" />}
                        {isConnecting ? '연결 중…' : '새 공동 작업 시작'}
                    </button>
                    <span className="hidden self-center text-xs text-slate-600 lg:inline">또는</span>
                    <div>
                        <label htmlFor="match-live-code" className="mb-1.5 block text-xs font-medium text-slate-400">
                            받은 코드로 참여
                        </label>
                        <div className="flex gap-2">
                            <div className="relative min-w-0 flex-1">
                                <Link2
                                    size={15}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                                    aria-hidden="true"
                                />
                                <input
                                    id="match-live-code"
                                    name="match-live-code"
                                    value={code}
                                    onChange={event => setCode(normalizeMatchShareCode(event.target.value))}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter') void handleJoin();
                                    }}
                                    disabled={!isRemote || isBusy}
                                    maxLength={10}
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="예: ABCD123456…"
                                    className="min-w-0 w-full rounded-sm border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-[0.16em] text-white outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-500 focus-visible:ring-2 focus-visible:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => void handleJoin()}
                                disabled={!isRemote || code.length !== 10 || isBusy}
                                className="btn-ghost shrink-0 border border-slate-700 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isConnecting
                                    ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                                    : <Radio size={14} aria-hidden="true" />}
                                {isConnecting ? '연결 중…' : '참여'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {syncError && (
                <p className="mt-3 text-xs leading-relaxed text-amber-300" role="status">
                    {syncError}
                </p>
            )}

            {!isRemote && (
                <p className="mt-3 text-xs text-amber-300/80">
                    원격 데이터 환경에서만 공동 작업을 사용할 수 있습니다.
                </p>
            )}
        </section>
    );
}
