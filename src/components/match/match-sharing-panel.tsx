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
    return (
        <details className="group border-y border-slate-800/80 bg-surface-elevated/25">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/70 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        isLiveConnected
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-slate-800/80 text-slate-400'
                    }`}>
                        {isLiveConnected
                            ? <Radio size={16} aria-hidden="true" />
                            : <Share2 size={16} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-200">공유</span>
                        <span className="block truncate text-xs text-slate-400">
                            {liveSyncError
                                ? '실시간 연결을 확인해 주세요'
                                : isLiveConnected && liveSession
                                    ? `${liveSession.code} · ${liveSession.collaborators.length}명 연결 · ${isLivePublishing ? '저장 중…' : '동기화됨'}`
                                    : '함께 편집하거나 결과만 전달할 수 있습니다'}
                        </span>
                    </span>
                </span>
                <ChevronDown
                    size={17}
                    className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                />
            </summary>

            <div className="grid gap-3 border-t border-slate-800/70 p-3 lg:grid-cols-2">
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
                <MatchShareControls
                    canCreate={canCreateSnapshot}
                    isRemote={isRemote}
                    userId={userId}
                    onCreate={onCreateSnapshot}
                    onImport={onImportSnapshot}
                />
            </div>
        </details>
    );
}
