import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createMatchLiveParticipants,
    normalizeMatchShareCode,
    type MatchLiveSessionSnapshot,
    type MatchResultData,
} from '#domain/balance';
import type { Player } from '../types';
import { findApiError, getErrorMessage } from '../utils/api';
import {
    getMatchLiveActiveUntil,
    getMatchLivePollDelay,
} from '../utils/match-live-polling';
import {
    createMatchLiveSession,
    fetchMatchLiveSession,
    getMatchLiveConflictSnapshot,
    hydrateMatchLiveSession,
    loadMatchLiveSession,
    updateMatchLiveSession,
    type LoadedMatchLiveSession,
} from '../utils/match-live-share';
import { getWithExpiry, removeItem, setWithExpiry } from '../utils/storage';
import { fetchUserSheet } from '../utils/user-sheet';

const LEGACY_MATCH_LIVE_SESSION_KEY = 'owkr_match_live_session';
const MATCH_LIVE_SESSION_KEY_PREFIX = 'owkr_match_live_session:';
const MATCH_LIVE_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MATCH_LIVE_PUSH_DELAY_MS = 180;
const MATCH_LIVE_RETRY_DELAY_MS = 1_500;
const MATCH_LIVE_MAX_RETRY_DELAY_MS = 10_000;

interface UseMatchLiveShareOptions {
    csrfToken: string;
    enabled: boolean;
    players: Player[];
    result: MatchResultData | null;
    userId: string;
    onApplyRemote: (loaded: LoadedMatchLiveSession) => void;
    onConflict: (message: string) => void;
}

const getParticipantSignature = (participants: unknown): string => JSON.stringify(participants);
const getCollaborationSignature = (session: MatchLiveSessionSnapshot): string => JSON.stringify({
    collaborators: session.collaborators.map(({ avatarUrl, displayName, userId }) => ({
        avatarUrl,
        displayName,
        userId,
    })),
    recentChange: session.recentChange,
});
const getSessionStorageKey = (userId: string): string => (
    `${MATCH_LIVE_SESSION_KEY_PREFIX}${userId}`
);

const readRememberedSessionCode = (userId: string): string => {
    const storageKey = getSessionStorageKey(userId);
    const rememberedCode = normalizeMatchShareCode(getWithExpiry<string>(storageKey) ?? '');
    if (rememberedCode.length === 10) return rememberedCode;

    const legacyCode = normalizeMatchShareCode(
        sessionStorage.getItem(LEGACY_MATCH_LIVE_SESSION_KEY) ?? '',
    );
    if (legacyCode.length !== 10) return '';
    setWithExpiry(storageKey, legacyCode, MATCH_LIVE_SESSION_EXPIRY_MS);
    sessionStorage.removeItem(LEGACY_MATCH_LIVE_SESSION_KEY);
    return legacyCode;
};

/**
 * @description Redis revision을 폴링하고 로컬 변경은 짧게 debounce해 관리자 공동 작업 상태를 양방향 동기화한다.
 */
export const useMatchLiveShare = ({
    csrfToken,
    enabled,
    players,
    result,
    userId,
    onApplyRemote,
    onConflict,
}: UseMatchLiveShareOptions) => {
    const [session, setSession] = useState<MatchLiveSessionSnapshot | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [syncError, setSyncError] = useState('');
    const revisionRef = useRef(0);
    const lastSyncedSignatureRef = useRef('');
    const localSignatureRef = useRef('');
    const isPublishingRef = useRef(false);
    const isPollingRef = useRef(false);
    const activeUntilRef = useRef(0);
    const [publishRetryCount, setPublishRetryCount] = useState(0);

    const participants = useMemo(
        () => createMatchLiveParticipants(players, result),
        [players, result],
    );
    const localSignature = participants ? getParticipantSignature(participants) : '';
    localSignatureRef.current = localSignature;

    const rememberSessionCode = useCallback((code: string) => {
        setWithExpiry(
            getSessionStorageKey(userId),
            code,
            MATCH_LIVE_SESSION_EXPIRY_MS,
        );
        sessionStorage.removeItem(LEGACY_MATCH_LIVE_SESSION_KEY);
    }, [userId]);

    const forgetSessionCode = useCallback(() => {
        removeItem(getSessionStorageKey(userId));
        sessionStorage.removeItem(LEGACY_MATCH_LIVE_SESSION_KEY);
    }, [userId]);

    const markSyncActive = useCallback(() => {
        activeUntilRef.current = getMatchLiveActiveUntil(Date.now());
    }, []);

    const resetSessionState = useCallback(() => {
        revisionRef.current = 0;
        lastSyncedSignatureRef.current = '';
        localSignatureRef.current = '';
        isPublishingRef.current = false;
        isPollingRef.current = false;
        activeUntilRef.current = 0;
        setPublishRetryCount(0);
        setSession(null);
        setIsPublishing(false);
    }, []);

    const applyLoadedSession = useCallback((loaded: LoadedMatchLiveSession) => {
        const remoteSession = loaded.session;
        revisionRef.current = remoteSession.revision;
        lastSyncedSignatureRef.current = getParticipantSignature(remoteSession.participants);
        localSignatureRef.current = lastSyncedSignatureRef.current;
        rememberSessionCode(remoteSession.code);
        markSyncActive();
        setPublishRetryCount(0);
        setSession(remoteSession);
        setSyncError('');
        onApplyRemote(loaded);
    }, [markSyncActive, onApplyRemote, rememberSessionCode]);

    const applyRemoteSession = useCallback(async (
        remoteSession: MatchLiveSessionSnapshot,
    ): Promise<LoadedMatchLiveSession> => {
        const userSheet = await fetchUserSheet();
        const hydrated = hydrateMatchLiveSession(remoteSession, userSheet.entries);
        const loaded: LoadedMatchLiveSession = { ...hydrated, userSheet };
        applyLoadedSession(loaded);
        return loaded;
    }, [applyLoadedSession]);

    const startSession = useCallback(async (): Promise<MatchLiveSessionSnapshot> => {
        if (!enabled) throw new Error('원격 Redis를 사용하는 환경에서만 공동 작업을 시작할 수 있습니다.');
        if (!participants) {
            throw new Error('Discord ID가 없는 참가자가 있어 공동 작업을 시작할 수 없습니다.');
        }
        setIsConnecting(true);
        setSyncError('');
        try {
            const created = await createMatchLiveSession(players, result, csrfToken);
            revisionRef.current = created.revision;
            lastSyncedSignatureRef.current = getParticipantSignature(created.participants);
            localSignatureRef.current = lastSyncedSignatureRef.current;
            rememberSessionCode(created.code);
            markSyncActive();
            setPublishRetryCount(0);
            setSession(created);
            return created;
        } finally {
            setIsConnecting(false);
        }
    }, [csrfToken, enabled, markSyncActive, participants, players, rememberSessionCode, result]);

    const joinSession = useCallback(async (code: string): Promise<LoadedMatchLiveSession> => {
        if (!enabled) throw new Error('원격 Redis를 사용하는 환경에서만 공동 작업에 참여할 수 있습니다.');
        setIsConnecting(true);
        setSyncError('');
        try {
            const loaded = await loadMatchLiveSession(code);
            applyLoadedSession(loaded);
            return loaded;
        } finally {
            setIsConnecting(false);
        }
    }, [applyLoadedSession, enabled]);

    const leaveSession = useCallback(() => {
        forgetSessionCode();
        resetSessionState();
        setSyncError('');
    }, [forgetSessionCode, resetSessionState]);

    useEffect(() => {
        if (!enabled) return;
        const storedCode = readRememberedSessionCode(userId);
        if (!storedCode) return;

        let disposed = false;
        let retryTimeoutId: number | undefined;
        const restore = async () => {
            setIsConnecting(true);
            try {
                const loaded = await loadMatchLiveSession(storedCode);
                if (!disposed) applyLoadedSession(loaded);
            } catch (error) {
                if (disposed) return;
                const apiError = findApiError(error);
                if (apiError?.status === 404) {
                    forgetSessionCode();
                    setSyncError('저장된 실시간 공유가 만료되었습니다. 새 공유를 시작하거나 다른 코드로 참여해 주세요.');
                    return;
                }
                setSyncError(getErrorMessage(error, '실시간 공유에 다시 연결하지 못했습니다.'));
                if (apiError?.retryable) {
                    retryTimeoutId = window.setTimeout(
                        () => void restore(),
                        MATCH_LIVE_RETRY_DELAY_MS,
                    );
                }
            } finally {
                if (!disposed) setIsConnecting(false);
            }
        };
        void restore();
        return () => {
            disposed = true;
            if (retryTimeoutId !== undefined) window.clearTimeout(retryTimeoutId);
        };
    }, [applyLoadedSession, enabled, forgetSessionCode, userId]);

    useEffect(() => {
        if (!enabled || !session) return;
        let disposed = false;
        let pollTimeoutId: number | undefined;

        const scheduleNextPoll = () => {
            if (disposed) return;
            if (pollTimeoutId !== undefined) window.clearTimeout(pollTimeoutId);
            pollTimeoutId = window.setTimeout(
                () => void poll(),
                getMatchLivePollDelay(Date.now(), activeUntilRef.current),
            );
        };

        const poll = async () => {
            if (
                disposed
                || isPollingRef.current
                || isPublishingRef.current
                || document.visibilityState !== 'visible'
                || localSignatureRef.current !== lastSyncedSignatureRef.current
            ) {
                scheduleNextPoll();
                return;
            }
            isPollingRef.current = true;
            try {
                const remote = await fetchMatchLiveSession(session.code);
                if (disposed) return;
                setSyncError('');
                if (getCollaborationSignature(remote) !== getCollaborationSignature(session)) {
                    setSession(current => current?.code === remote.code
                        ? {
                            ...current,
                            collaborators: remote.collaborators,
                            recentChange: remote.recentChange,
                        }
                        : current);
                }
                if (
                    remote.revision <= revisionRef.current
                    || localSignatureRef.current !== lastSyncedSignatureRef.current
                ) {
                    return;
                }
                await applyRemoteSession(remote);
            } catch (error) {
                if (!disposed) {
                    if (findApiError(error)?.status === 404) {
                        forgetSessionCode();
                        resetSessionState();
                        setSyncError('실시간 공유가 만료되었습니다. 새 공유를 시작하거나 다른 코드로 참여해 주세요.');
                        return;
                    }
                    setSyncError(getErrorMessage(error, '공동 작업 연결을 확인하지 못했습니다.'));
                }
            } finally {
                isPollingRef.current = false;
                scheduleNextPoll();
            }
        };

        const pollNow = () => {
            if (document.visibilityState !== 'visible') return;
            if (pollTimeoutId !== undefined) window.clearTimeout(pollTimeoutId);
            void poll();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') pollNow();
        };

        pollNow();
        window.addEventListener('focus', pollNow);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            disposed = true;
            if (pollTimeoutId !== undefined) window.clearTimeout(pollTimeoutId);
            window.removeEventListener('focus', pollNow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [applyRemoteSession, enabled, forgetSessionCode, resetSessionState, session]);

    useEffect(() => {
        setPublishRetryCount(0);
        if (session && localSignature !== lastSyncedSignatureRef.current) {
            markSyncActive();
        }
    }, [localSignature, markSyncActive, session]);

    useEffect(() => {
        if (!enabled || !session) return;
        if (!participants) {
            setSyncError('Discord ID가 없는 참가자가 있어 현재 변경을 공유하지 못하고 있습니다.');
            return;
        }
        if (localSignature === lastSyncedSignatureRef.current) return;

        const timeoutId = window.setTimeout(() => {
            const publish = async () => {
                isPublishingRef.current = true;
                setIsPublishing(true);
                setSyncError('');
                try {
                    const updated = await updateMatchLiveSession(
                        session.code,
                        revisionRef.current,
                        players,
                        result,
                        csrfToken,
                    );
                    revisionRef.current = updated.revision;
                    lastSyncedSignatureRef.current = getParticipantSignature(updated.participants);
                    rememberSessionCode(updated.code);
                    setPublishRetryCount(0);
                    setSession(updated);
                } catch (error) {
                    const conflict = getMatchLiveConflictSnapshot(error);
                    if (conflict) {
                        try {
                            await applyRemoteSession(conflict);
                            onConflict('다른 관리자가 먼저 수정해 최신 변경을 반영했습니다. 필요한 변경은 다시 적용해 주세요.');
                        } catch (hydrateError) {
                            setSyncError(getErrorMessage(
                                hydrateError,
                                '충돌한 공동 작업 상태를 다시 불러오지 못했습니다.',
                            ));
                        }
                    } else {
                        setSyncError(getErrorMessage(error, '공동 작업 변경을 저장하지 못했습니다.'));
                        const apiError = findApiError(error);
                        if (apiError?.status === 404) {
                            forgetSessionCode();
                            resetSessionState();
                            setSyncError('실시간 공유가 만료되었습니다. 새 공유를 시작하거나 다른 코드로 참여해 주세요.');
                        } else if (apiError?.retryable) {
                            setPublishRetryCount(count => count + 1);
                        }
                    }
                } finally {
                    isPublishingRef.current = false;
                    setIsPublishing(false);
                }
            };
            void publish();
        }, publishRetryCount === 0
            ? MATCH_LIVE_PUSH_DELAY_MS
            : Math.min(
                MATCH_LIVE_RETRY_DELAY_MS * (2 ** Math.min(publishRetryCount - 1, 3)),
                MATCH_LIVE_MAX_RETRY_DELAY_MS,
            ));

        return () => window.clearTimeout(timeoutId);
    }, [
        applyRemoteSession,
        csrfToken,
        enabled,
        forgetSessionCode,
        localSignature,
        onConflict,
        participants,
        players,
        publishRetryCount,
        rememberSessionCode,
        resetSessionState,
        result,
        session,
    ]);

    return {
        isConnected: Boolean(session),
        isConnecting,
        isPublishing,
        joinSession,
        leaveSession,
        session,
        startSession,
        syncError,
    };
};
