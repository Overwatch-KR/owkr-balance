import type { Role } from '../../player/shared/public.js';
import type { MatchResultData } from './model.js';

export const MATCH_SHARE_POSITIONS = [
    'A:TANK:0',
    'A:DPS:0',
    'A:DPS:1',
    'A:SUPPORT:0',
    'A:SUPPORT:1',
    'B:TANK:0',
    'B:DPS:0',
    'B:DPS:1',
    'B:SUPPORT:0',
    'B:SUPPORT:1',
] as const;

export type MatchSharePosition = typeof MATCH_SHARE_POSITIONS[number];

/**
 * @description Redis에 저장하는 공유 명단의 최소 참가자 정보.
 */
export interface MatchShareParticipant {
    discordUserId: string;
    position: MatchSharePosition;
}

/**
 * @description 공유 위치 문자열을 팀·역할·역할 내 순서로 분해한 값.
 */
export interface MatchSharePositionParts {
    team: 'A' | 'B';
    role: Role;
    index: number;
}

const matchSharePositionSet = new Set<string>(MATCH_SHARE_POSITIONS);
const matchSharePositionOrder = new Map(
    MATCH_SHARE_POSITIONS.map((position, index) => [position, index]),
);

/**
 * @description 사용자가 붙여넣은 공유 코드를 서버 조회에 사용할 표준 형식으로 정리한다.
 */
export const normalizeMatchShareCode = (value: string): string => (
    value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 10)
);

/**
 * @description 검증된 공유 위치를 팀·역할·슬롯 인덱스로 변환한다.
 */
export const parseMatchSharePosition = (
    position: MatchSharePosition,
): MatchSharePositionParts => {
    const [team, role, index] = position.split(':');
    return {
        team: team as 'A' | 'B',
        role: role as Role,
        index: Number.parseInt(index, 10),
    };
};

/**
 * @description 알 수 없는 입력을 정확히 10명의 고유 Discord ID·팀 역할 위치 목록으로 검증하고 정렬한다.
 */
export const normalizeMatchShareParticipants = (
    value: unknown,
): MatchShareParticipant[] | null => {
    if (!Array.isArray(value) || value.length !== MATCH_SHARE_POSITIONS.length) return null;

    const participantIds = new Set<string>();
    const positions = new Set<string>();
    const participants: MatchShareParticipant[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw as { discordUserId?: unknown; position?: unknown };
        const discordUserId = typeof item.discordUserId === 'string'
            ? item.discordUserId.replace(/\D/g, '').trim()
            : '';
        const position = typeof item.position === 'string' ? item.position.trim() : '';
        if (!/^\d{17,20}$/.test(discordUserId) || !matchSharePositionSet.has(position)) return null;
        if (participantIds.has(discordUserId) || positions.has(position)) return null;

        participantIds.add(discordUserId);
        positions.add(position);
        participants.push({
            discordUserId,
            position: position as MatchSharePosition,
        });
    }

    if (positions.size !== MATCH_SHARE_POSITIONS.length) return null;
    return participants.sort((first, second) => (
        (matchSharePositionOrder.get(first.position) ?? 0)
        - (matchSharePositionOrder.get(second.position) ?? 0)
    ));
};

/**
 * @description 현재 팀 결과에서 티어 같은 변동 정보는 제외하고 Discord ID와 정확한 배치 위치만 추출한다.
 */
export const createMatchShareParticipants = (
    result: MatchResultData,
): MatchShareParticipant[] | null => {
    const rawParticipants = MATCH_SHARE_POSITIONS.map((position) => {
        const { index, role, team } = parseMatchSharePosition(position);
        const assignment = team === 'A' ? result.teamA.assignment : result.teamB.assignment;
        const player = assignment[role][index];
        return {
            discordUserId: player?.discordUserId ?? '',
            position,
        };
    });

    return normalizeMatchShareParticipants(rawParticipants);
};
