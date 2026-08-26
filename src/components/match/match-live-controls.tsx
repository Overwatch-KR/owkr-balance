import { useState } from 'react';
import { Check, ClipboardCopy, Link2, Loader2, LogOut, Radio, Users } from 'lucide-react';
import {
    normalizeMatchShareCode,
    type MatchLiveSessionSnapshot,
} from '../../../domains/balance/shared/public';

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
            className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4"
            aria-labelledby="match-live-title"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Radio size={16} className="text-emerald-300" aria-hidden="true" />
                        <h2 id="match-live-title" className="text-sm font-semibold text-white">
                            실시간 공동 작업
                        </h2>
                    </div>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                        같은 코드를 연 관리자끼리 참가 명단·대기열·팀 배치를 약 1.5초 간격으로 동기화합니다.
                    </p>
                </div>
                {isConnected ? (
                    <button
                        type="button"
                        onClick={onLeave}
                        disabled={isBusy}
                        className="btn-ghost flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <LogOut size={14} aria-hidden="true" />
                        연결 종료
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => void handleStart()}
                        disabled={!isRemote || !canStart || isBusy}
                        title={canStart
                            ? '현재 명단으로 공동 작업 세션을 시작합니다.'
                            : 'Discord ID가 없는 참가자를 유저 시트와 먼저 연결해 주세요.'}
                        className="btn-ghost flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isConnecting
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <Users size={14} aria-hidden="true" />}
                        {isConnecting ? '연결 중…' : '공동 작업 시작'}
                    </button>
                )}
            </div>

            {isConnected && session ? (
                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span className={`h-2 w-2 rounded-full ${syncError ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                <span>{isPublishing ? '변경 저장 중…' : syncError ? '연결 확인 필요' : '동기화 연결됨'}</span>
                                <span className="text-slate-700">·</span>
                                <span>revision {session.revision}</span>
                            </div>
                            <strong className="mt-1 block font-mono text-sm tracking-[0.14em] text-emerald-200">
                                {session.code}
                            </strong>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleCopy()}
                            className="btn-ghost flex items-center gap-1.5 text-xs"
                        >
                            {copyCompleted
                                ? <Check size={13} aria-hidden="true" />
                                : <ClipboardCopy size={13} aria-hidden="true" />}
                            {copyCompleted ? '복사됨' : '코드 복사'}
                        </button>
                    </div>
                    {syncError && (
                        <p className="mt-2 text-xs leading-relaxed text-amber-300" role="status">
                            {syncError}
                        </p>
                    )}
                </div>
            ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor="match-live-code" className="sr-only">공동 작업 코드</label>
                    <div className="relative min-w-0 flex-1">
                        <Link2
                            size={15}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                            aria-hidden="true"
                        />
                        <input
                            id="match-live-code"
                            value={code}
                            onChange={event => setCode(normalizeMatchShareCode(event.target.value))}
                            onKeyDown={event => {
                                if (event.key === 'Enter') void handleJoin();
                            }}
                            disabled={!isRemote || isBusy}
                            maxLength={10}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="공동 작업 코드 10자리"
                            className="min-w-0 w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 font-mono text-sm uppercase tracking-[0.16em] text-white outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-600 focus:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleJoin()}
                        disabled={!isRemote || code.length !== 10 || isBusy}
                        className="btn-primary flex shrink-0 items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isConnecting
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <Radio size={14} aria-hidden="true" />}
                        {isConnecting ? '연결 중…' : '코드로 참여'}
                    </button>
                </div>
            )}

            {!isRemote && (
                <p className="mt-3 text-xs text-amber-300/80">
                    원격 Redis와 유저 시트를 사용하는 실행 환경에서만 공동 작업을 사용할 수 있습니다.
                </p>
            )}
        </section>
    );
}