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
import { getTierScore, TIERS } from '../constants';

interface StoredMatchState {
    result: MatchResultData;
    alternatives: MatchResultData[];
}

const MATCH_SESSION_EXPIRY_MS = 30 * 60 * 1000;
const RANK_KEYS = ['tank', 'dps', 'sup'] as const;

/**
 * @description 저장 명단에서 최소 두 역할의 정식 티어와 선택적 미배치를 검증하고 현재 점수표로 갱신한다.
 */
const normalizeStoredPlayer = (player: Player): Player | null => {
    const hasValidRanks = RANK_KEYS.every((rankKey) => {
        const rank = player[rankKey];
        if (!rank) return false;
        if (rank.tier === 'UNRANKED') return String(rank.div) === '0';
        return TIERS.includes(rank.tier)
            && ['1', '2', '3', '4', '5'].includes(String(rank.div));
    });
    const rankedRoleCount = RANK_KEYS.filter(
        rankKey => player[rankKey]?.tier !== 'UNRANKED',
    ).length;
    if (!hasValidRanks || rankedRoleCount < 2) return null;

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
