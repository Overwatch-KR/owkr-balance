import type { MatchResultData } from './model.js';
import {
    MATCH_SHARE_POSITIONS,
    parseMatchSharePosition,
    type MatchSharePosition,
} from './match-share.js';

export const MATCH_LIVE_MAX_PARTICIPANTS = 50;

/**
 * @description 실시간 공동 작업 Redis에 저장하는 참가자 최소 정보.
 */
export interface MatchLiveParticipant {
    discordUserId: string;
    position: MatchSharePosition | null;
}

/**
 * @description 실시간 공동 작업 세션의 클라이언트 공개 스냅샷.
 */
export interface MatchLiveSessionSnapshot {
    code: string;
    revision: number;
    participants: MatchLiveParticipant[];
    updatedAt: number;
}

const matchLivePositionSet = new Set<string>(MATCH_SHARE_POSITIONS);

/**
 * @description 알 수 없는 입력을 Discord ID와 선택적 팀 위치 목록으로 검증한다.
 */
export const normalizeMatchLiveParticipants = (
    value: unknown,
): MatchLiveParticipant[] | null => {
    if (!Array.isArray(value) || value.length > MATCH_LIVE_MAX_PARTICIPANTS) return null;

    const participantIds = new Set<string>();
    const positions = new Set<string>();
    const participants: MatchLiveParticipant[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw as { discordUserId?: unknown; position?: unknown };
        const discordUserId = typeof item.discordUserId === 'string'
            ? item.discordUserId.replace(/\D/g, '').trim()
            : '';
        const rawPosition = item.position;
        const position = rawPosition === null || rawPosition === undefined || rawPosition === ''
            ? null
            : typeof rawPosition === 'string'
                ? rawPosition.trim()
                : '__invalid__';

        if (!/^\d{17,20}$/.test(discordUserId) || participantIds.has(discordUserId)) return null;
        if (position !== null) {
            if (!matchLivePositionSet.has(position) || positions.has(position)) return null;
            positions.add(position);
        }

        participantIds.add(discordUserId);
        participants.push({
            discordUserId,
            position: position as MatchSharePosition | null,
        });
    }

    if (positions.size > 0 && positions.size !== MATCH_SHARE_POSITIONS.length) return null;
    return participants;
};

/**
 * @description 현재 참가자 순서와 유효한 팀 결과를 실시간 공유용 최소 정보로 변환한다.
 */
export const createMatchLiveParticipants = (
    players: ReadonlyArray<{ discordUserId?: string }>,
    result: MatchResultData | null,
): MatchLiveParticipant[] | null => {
    if (players.length > MATCH_LIVE_MAX_PARTICIPANTS) return null;

    const positionByDiscordId = new Map<string, MatchSharePosition>();
    if (result) {
        for (const position of MATCH_SHARE_POSITIONS) {
            const { index, role, team } = parseMatchSharePosition(position);
            const assignment = team === 'A' ? result.teamA.assignment : result.teamB.assignment;
            const discordUserId = assignment[role][index]?.discordUserId?.replace(/\D/g, '').trim();
            if (!discordUserId || positionByDiscordId.has(discordUserId)) return null;
            positionByDiscordId.set(discordUserId, position);
        }
        if (positionByDiscordId.size !== MATCH_SHARE_POSITIONS.length) return null;
    }

    const participants = players.map(player => {
        const discordUserId = player.discordUserId?.replace(/\D/g, '').trim() ?? '';
        return {
            discordUserId,
            position: result ? positionByDiscordId.get(discordUserId) ?? null : null,
        };
    });

    if (result) {
        const positionedCount = participants.filter(participant => participant.position !== null).length;
        if (positionedCount !== MATCH_SHARE_POSITIONS.length) return null;
    }

    return normalizeMatchLiveParticipants(participants);
};