import { describe, expect, it } from 'vitest';
import type { Player } from '../../player/shared/public';
import {
    MATCH_SHARE_POSITIONS,
    createMatchShareParticipants,
    normalizeMatchShareCode,
    normalizeMatchShareParticipants,
} from '../shared/public';

const rank = {
    tier: 'GOLD' as const,
    div: 3,
    score: 1_000,
    isPreferred: false,
    isAvoided: false,
};

const makePlayer = (index: number): Player => ({
    id: index,
    name: `Player${index}#1234`,
    discordUserId: String(11_111_111_111_111_110n + BigInt(index)),
    tank: { ...rank },
    dps: { ...rank },
    sup: { ...rank },
});

const players = Array.from({ length: 10 }, (_, index) => makePlayer(index + 1));
const result = {
    teamA: {
        name: 'TEAM 1',
        realScore: 5_000,
        assignment: {
            TANK: [players[0]],
            DPS: [players[1], players[2]],
            SUPPORT: [players[3], players[4]],
        },
    },
    teamB: {
        name: 'TEAM 2',
        realScore: 5_000,
        assignment: {
            TANK: [players[5]],
            DPS: [players[6], players[7]],
            SUPPORT: [players[8], players[9]],
        },
    },
    diff: 0,
};

describe('match share contract', () => {
    it('팀 결과에서 Discord ID와 정확한 10개 위치만 추출한다', () => {
        const participants = createMatchShareParticipants(result);

        expect(participants).toHaveLength(10);
        expect(participants?.map(participant => participant.position)).toEqual(MATCH_SHARE_POSITIONS);
        expect(participants?.[0]).toEqual({
            discordUserId: players[0].discordUserId,
            position: 'A:TANK:0',
        });
        expect(participants?.[9]).toEqual({
            discordUserId: players[9].discordUserId,
            position: 'B:SUPPORT:1',
        });
    });

    it('중복 Discord ID나 빠진 위치가 있는 공유 명단은 거부한다', () => {
        const participants = createMatchShareParticipants(result)!;

        expect(normalizeMatchShareParticipants([
            ...participants.slice(0, 9),
            { ...participants[9], discordUserId: participants[0].discordUserId },
        ])).toBeNull();
        expect(normalizeMatchShareParticipants(participants.slice(0, 9))).toBeNull();
    });

    it('공유 코드는 대문자 10자리 입력으로 정규화한다', () => {
        expect(normalizeMatchShareCode(' abcd-efgh-23 ')).toBe('ABCDEFGH23');
    });
});
