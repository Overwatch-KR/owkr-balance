import { useState } from 'react';
import { ChevronDown, Radio, Share2 } from 'lucide-react';
import type { MatchLiveSessionSnapshot } from '#domain/balance';
import { MatchLiveControls } from './match-live-controls';
import { MatchShareControls } from './match-share-controls';

interface MatchSharingPanelProps {
    canCreateSnapshot: boolean;
    canStartLive: boolean;
    isLiveConnected: boolean;
    isLiveConnecting: boolean;
    isLivePublishing: boolean;
    isRemote: boolean;
    liveSession: MatchLiveSessionSnapshot | null;
    liveSyncError: string;
    userId: string;
    onCreateSnapshot: () => Promise<string>;
    onImportSnapshot: (code: string) => Promise<void>;
    onJoinLive: (code: string) => Promise<void>;
    onLeaveLive: () => void;
    onStartLive: () => Promise<string>;
}

type ShareMode = 'live' | 'snapshot';

/**
 * @description 실시간 공동 작업과 읽기 전용 결과 전달을 하나의 보조 영역으로 묶는다.
 */
export function MatchSharingPanel({
    canCreateSnapshot,
    canStartLive,
    isLiveConnected,
    isLiveConnecting,
    isLivePublishing,
    isRemote,
    liveSession,
    liveSyncError,
    userId,
    onCreateSnapshot,
    onImportSnapshot,
    onJoinLive,
    onLeaveLive,
    onStartLive,
}: MatchSharingPanelProps) {
    const [mode, setMode] = useState<ShareMode>('live');
    const activeMode = isLiveConnected ? 'live' : mode;

    return (
        <details className="group border-y border-slate-700/70">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-1 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2.5">
                    {isLiveConnected
                        ? <Radio size={15} className="shrink-0 text-cyan-300" aria-hidden="true" />
                        : <Share2 size={15} className="shrink-0 text-slate-500" aria-hidden="true" />}
                    <span className="min-w-0">
                        <span className="text-sm font-medium text-slate-200">공유</span>
                        <span className="ml-3 text-xs text-slate-500">
                            {liveSyncError
                                ? '실시간 연결을 확인해 주세요'
                                : isLiveConnected && liveSession
                                    ? `${liveSession.code} · ${liveSession.collaborators.length}명 연결 · ${isLivePublishing ? '저장 중…' : '동기화됨'}`
                                    : '공동 편집 또는 읽기 전용 전달'}
                        </span>
                    </span>
                </span>
                <ChevronDown
                    size={17}
                    className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                />
            </summary>

            <div className="border-t border-slate-700/70 py-3">
                <div className="grid grid-cols-2 border border-slate-700" role="group" aria-label="공유 방식">
                    <button
                        type="button"
                        aria-pressed={activeMode === 'live'}
                        onClick={() => setMode('live')}
                        className={`min-h-11 border-r border-slate-700 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
                            activeMode === 'live'
                                ? 'border-b-2 border-b-cyan-400 bg-cyan-500/[0.04] text-cyan-200'
                                : 'border-b-2 border-b-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                        }`}
                    >
                        함께 편집
                    </button>
                    <button
                        type="button"
                        aria-pressed={activeMode === 'snapshot'}
                        onClick={() => setMode('snapshot')}
                        disabled={isLiveConnected}
                        className={`min-h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 ${
                            activeMode === 'snapshot'
                                ? 'border-b-2 border-b-cyan-400 bg-cyan-500/[0.04] text-cyan-200'
                                : 'border-b-2 border-b-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
                        }`}
                    >
                        결과만 보내기
                    </button>
                </div>

                <div className="border-x border-b border-slate-700">
                    {activeMode === 'live' ? (
                        <MatchLiveControls
                            canStart={canStartLive}
                            isConnected={isLiveConnected}
                            isConnecting={isLiveConnecting}
                            isPublishing={isLivePublishing}
                            isRemote={isRemote}
                            session={liveSession}
                            syncError={liveSyncError}
                            onStart={onStartLive}
                            onJoin={onJoinLive}
                            onLeave={onLeaveLive}
                        />
                    ) : (
                        <MatchShareControls
                            canCreate={canCreateSnapshot}
                            isRemote={isRemote}
                            userId={userId}
                            onCreate={onCreateSnapshot}
                            onImport={onImportSnapshot}
                        />
                    )}
                </div>
            </div>
        </details>
    );
}
