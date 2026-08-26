import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    createMatchLiveParticipants,
    type MatchLiveSessionSnapshot,
    type MatchResultData,
} from '../../domains/balance/shared/public';
import type { Player } from '../types';
import { getErrorMessage } from '../utils/api';
import {
    createMatchLiveSession,
    fetchMatchLiveSession,
    getMatchLiveConflictSnapshot,
    hydrateMatchLiveSession,
    loadMatchLiveSession,
    updateMatchLiveSession,
    type LoadedMatchLiveSession,
} from '../utils/match-live-share';
import { fetchUserSheet } from '../utils/user-sheet';

const MATCH_LIVE_SESSION_KEY = 'owkr_match_live_session';
const MATCH_LIVE_POLL_INTERVAL_MS = 1_500;
const MATCH_LIVE_PUSH_DELAY_MS = 350;

interface UseMatchLiveShareOptions {
    csrfToken: string;
    enabled: boolean;
    players: Player[];
    result: MatchResultData | null;
    onApplyRemote: (loaded: LoadedMatchLiveSession) => void;
    onConflict: (message: string) => void;
}

const getParticipantSignature = (participants: unknown): string => JSON.stringify(participants);

/**
 * @description Redis revision을 폴링하고 로컬 변경은 짧게 debounce해 관리자 공동 작업 상태를 양방향 동기화한다.
 */
export const useMatchLiveShare = ({
    csrfToken,
    enabled,
    players,
    result,
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
    const restoredSessionRef = useRef(false);

    const participants = useMemo(
        () => createMatchLiveParticipants(players, result),
        [players, result],
    );
    const localSignature = participants ? getParticipantSignature(participants) : '';
    localSignatureRef.current = localSignature;

    const applyRemoteSession = useCallback(async (
        remoteSession: MatchLiveSessionSnapshot,
    ): Promise<LoadedMatchLiveSession> => {
        const userSheet = await fetchUserSheet();
        const hydrated = hydrateMatchLiveSession(remoteSession, userSheet.entries);
        const loaded: LoadedMatchLiveSession = { ...hydrated, userSheet };
        revisionRef.current = remoteSession.revision;
        lastSyncedSignatureRef.current = getParticipantSignature(remoteSession.participants);
        localSignatureRef.current = lastSyncedSignatureRef.current;
        setSession(remoteSession);
        setSyncError('');
        onApplyRemote(loaded);
        return loaded;
    }, [onApplyRemote]);

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
            sessionStorage.setItem(MATCH_LIVE_SESSION_KEY, created.code);
            setSession(created);
            return created;
        } finally {
            setIsConnecting(false);
        }
    }, [csrfToken, enabled, participants, players, result]);

    const joinSession = useCallback(async (code: string): Promise<LoadedMatchLiveSession> => {
        if (!enabled) throw new Error('원격 Redis를 사용하는 환경에서만 공동 작업에 참여할 수 있습니다.');
        setIsConnecting(true);
        setSyncError('');
        try {
            const loaded = await loadMatchLiveSession(code);
            revisionRef.current = loaded.session.revision;
            lastSyncedSignatureRef.current = getParticipantSignature(loaded.session.participants);
            localSignatureRef.current = lastSyncedSignatureRef.current;
            sessionStorage.setItem(MATCH_LIVE_SESSION_KEY, loaded.session.code);
            setSession(loaded.session);
            onApplyRemote(loaded);
            return loaded;
        } finally {
            setIsConnecting(false);
        }
    }, [enabled, onApplyRemote]);

    const leaveSession = useCallback(() => {
        sessionStorage.removeItem(MATCH_LIVE_SESSION_KEY);
        revisionRef.current = 0;
        lastSyncedSignatureRef.current = '';
        localSignatureRef.current = '';
        setSession(null);
        setSyncError('');
    }, []);

    useEffect(() => {
        if (!enabled || restoredSessionRef.current) return;
        restoredSessionRef.current = true;
        const storedCode = sessionStorage.getItem(MATCH_LIVE_SESSION_KEY);
        if (!storedCode) return;

        let disposed = false;
        setIsConnecting(true);
        void loadMatchLiveSession(storedCode)
            .then(loaded => {
                if (disposed) return;
                revisionRef.current = loaded.session.revision;
                lastSyncedSignatureRef.current = getParticipantSignature(loaded.session.participants);
                localSignatureRef.current = lastSyncedSignatureRef.current;
                setSession(loaded.session);
                setSyncError('');
                onApplyRemote(loaded);
            })
            .catch(() => {
                if (!disposed) sessionStorage.removeItem(MATCH_LIVE_SESSION_KEY);
            })
            .finally(() => {
                if (!disposed) setIsConnecting(false);
            });
        return () => {
            disposed = true;
        };
    }, [enabled, onApplyRemote]);

    useEffect(() => {
        if (!enabled || !session) return;
        let disposed = false;

        const poll = async () => {
            if (
                disposed
                || isPollingRef.current
                || isPublishingRef.current
                || document.visibilityState !== 'visible'
                || localSignatureRef.current !== lastSyncedSignatureRef.current
            ) {
                return;
            }
            isPollingRef.current = true;
            try {
                const remote = await fetchMatchLiveSession(session.code);
                if (disposed || remote.revision <= revisionRef.current) return;
                await applyRemoteSession(remote);
            } catch (error) {
                if (!disposed) {
                    setSyncError(getErrorMessage(error, '공동 작업 연결을 확인하지 못했습니다.'));
                }
            } finally {
                isPollingRef.current = false;
            }
        };

        const intervalId = window.setInterval(() => void poll(), MATCH_LIVE_POLL_INTERVAL_MS);
        void poll();
        return () => {
            disposed = true;
            window.clearInterval(intervalId);
        };
    }, [applyRemoteSession, enabled, session]);

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
                    }
                } finally {
                    isPublishingRef.current = false;
                    setIsPublishing(false);
                }
            };
            void publish();
        }, MATCH_LIVE_PUSH_DELAY_MS);

        return () => window.clearTimeout(timeoutId);
    }, [
        applyRemoteSession,
        csrfToken,
        enabled,
        localSignature,
        onConflict,
        participants,
        players,
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