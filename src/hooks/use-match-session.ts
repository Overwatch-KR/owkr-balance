import { useEffect, useRef, useState } from 'react';
import { useBalance } from './use-balance';
import type { MatchResultData, Player } from '../types';
import {
    isMatchResultStale,
    reconcilePlayers,
    syncMatchResultPlayerIdentities,
} from '../utils/player';
import { normalizePlayerRolePreferences } from '../utils/role-preference';
import { cleanupExpired, getWithExpiry, removeItem, setWithExpiry } from '../utils/storage';
import { EMERALD_RELEASE_AT, getAvailableTiers, getTierScore } from '../constants';

interface StoredMatchState {
    result: MatchResultData;
    alternatives: MatchResultData[];
}

const MATCH_SESSION_EXPIRY_MS = 30 * 60 * 1000;
const RANK_KEYS = ['tank', 'dps', 'sup'] as const;

/**
 * @description 저장 명단에서 현재 허용하는 세 역할 티어만 남기고 활성 점수표로 갱신한다.
 */
const normalizeStoredPlayer = (player: Player): Player | null => {
    const availableTiers = getAvailableTiers();
    const hasCompleteRanks = RANK_KEYS.every((rankKey) => {
        const rank = player[rankKey];
        return availableTiers.includes(rank.tier)
            && ['1', '2', '3', '4', '5'].includes(String(rank.div));
    });
    if (!hasCompleteRanks) return null;

    return {
        ...player,
        tank: { ...player.tank, score: getTierScore(player.tank.tier, player.tank.div) },
        dps: { ...player.dps, score: getTierScore(player.dps.tier, player.dps.div) },
        sup: { ...player.sup, score: getTierScore(player.sup.tier, player.sup.div) },
    };
};

const getStorageKeys = (userId: string) => ({
    PLAYERS: `owkr_players:${userId}`,
    RESULT: `owkr_result:${userId}`,
    PARTICIPANT_MENTIONS: `owkr_participant_mentions:${userId}`,
    PARTICIPANT_INCLUDES_ADMIN: `owkr_participant_includes_admin:${userId}`,
});

/**
 * @description 로그인 사용자별 참가 명단·팀 결과의 복원, 저장, 밸런싱 생명주기를 묶어 관리한다.
 */
export const useMatchSession = (userId: string) => {
    const storageKeys = getStorageKeys(userId);
    const [players, setPlayers] = useState<Player[]>(() => {
        const savedPlayers = (
            getWithExpiry<Player[]>(storageKeys.PLAYERS, MATCH_SESSION_EXPIRY_MS) || []
        )
            .map(normalizeStoredPlayer)
            .filter((player): player is Player => player !== null)
            .map(normalizePlayerRolePreferences);
        return reconcilePlayers([], savedPlayers, 'replace').players;
    });
    const [participantMentions, setParticipantMentions] = useState(() => (
        getWithExpiry<string>(
            storageKeys.PARTICIPANT_MENTIONS,
            MATCH_SESSION_EXPIRY_MS,
        ) || ''
    ));
    const [participantIncludesAdmin, setParticipantIncludesAdmin] = useState(() => (
        getWithExpiry<boolean>(
            storageKeys.PARTICIPANT_INCLUDES_ADMIN,
            MATCH_SESSION_EXPIRY_MS,
        ) ?? false
    ));
    const [initialMatchState] = useState<StoredMatchState | null>(() => {
        const savedState = getWithExpiry<MatchResultData | StoredMatchState>(
            storageKeys.RESULT,
            MATCH_SESSION_EXPIRY_MS,
        );
        if (!savedState) return null;
        const savedResult = 'result' in savedState ? savedState.result : savedState;
        if (isMatchResultStale(savedResult, players)) return null;
        const savedAlternatives = 'result' in savedState ? savedState.alternatives : [];
        return {
            result: syncMatchResultPlayerIdentities(savedResult, players),
            alternatives: savedAlternatives.map(alternative => (
                syncMatchResultPlayerIdentities(alternative, players)
            )),
        };
    });
    const initialParticipantsRef = useRef(players.slice(0, 10));
    const isMounted = useRef(false);
    const {
        alternatives,
        balanceTeams,
        isBalancing,
        result,
        setAlternatives,
        setResult,
    } = useBalance(
        initialMatchState?.result ?? null,
        initialMatchState?.alternatives ?? [],
    );

    useEffect(() => {
        const remainingMs = EMERALD_RELEASE_AT - Date.now();
        if (remainingMs <= 0) return;

        const timeoutId = window.setTimeout(() => {
            setPlayers((currentPlayers) => currentPlayers
                .map(normalizeStoredPlayer)
                .filter((player): player is Player => player !== null));
            setResult(null);
            setAlternatives([]);
        }, remainingMs);
        return () => window.clearTimeout(timeoutId);
    }, [setAlternatives, setResult]);

    useEffect(() => {
        cleanupExpired();
        isMounted.current = true;
        if (!initialMatchState) return;
        const initialParticipants = initialParticipantsRef.current;
        const shouldGenerateAlternatives = initialMatchState.alternatives.length === 0
            && initialParticipants.length === 10
            && !isMatchResultStale(initialMatchState.result, initialParticipants);
        if (shouldGenerateAlternatives) {
            void balanceTeams(
                initialParticipants,
                { preserveResult: initialMatchState.result },
            ).catch(() => undefined);
        }
    }, [balanceTeams, initialMatchState]);

    useEffect(() => {
        if (players.length > 0) {
            setWithExpiry(storageKeys.PLAYERS, players, MATCH_SESSION_EXPIRY_MS);
        } else {
            removeItem(storageKeys.PLAYERS);
        }
    }, [players, storageKeys.PLAYERS]);

    useEffect(() => {
        if (participantMentions.trim()) {
            setWithExpiry(
                storageKeys.PARTICIPANT_MENTIONS,
                participantMentions,
                MATCH_SESSION_EXPIRY_MS,
            );
        } else {
            removeItem(storageKeys.PARTICIPANT_MENTIONS);
        }
    }, [participantMentions, storageKeys.PARTICIPANT_MENTIONS]);

    useEffect(() => {
        if (participantIncludesAdmin) {
            setWithExpiry(
                storageKeys.PARTICIPANT_INCLUDES_ADMIN,
                true,
                MATCH_SESSION_EXPIRY_MS,
            );
        } else {
            removeItem(storageKeys.PARTICIPANT_INCLUDES_ADMIN);
        }
    }, [participantIncludesAdmin, storageKeys.PARTICIPANT_INCLUDES_ADMIN]);

    useEffect(() => {
        if (!isMounted.current) return;
        if (result) {
            setWithExpiry<StoredMatchState>(
                storageKeys.RESULT,
                { result, alternatives },
                MATCH_SESSION_EXPIRY_MS,
            );
        } else {
            removeItem(storageKeys.RESULT);
        }
    }, [alternatives, result, storageKeys.RESULT]);

    return {
        alternatives,
        balanceTeams,
        isBalancing,
        participantIncludesAdmin,
        participantMentions,
        players,
        result,
        setAlternatives,
        setParticipantIncludesAdmin,
        setParticipantMentions,
        setPlayers,
        setResult,
    };
};
