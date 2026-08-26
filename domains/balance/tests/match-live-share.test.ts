import { describe, expect, it } from 'vitest';
import type { Player } from '../../player/shared/public';
import {
    MATCH_SHARE_POSITIONS,
    createMatchLiveParticipants,
    normalizeMatchLiveParticipants,
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

const players = Array.from({ length: 12 }, (_, index) => makePlayer(index + 1));
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

describe('match live share contract', () => {
    it('참가자 순서와 완성된 10개 팀 위치를 함께 보존한다', () => {
        const participants = createMatchLiveParticipants(players, result);

        expect(participants).toHaveLength(12);
        expect(participants?.slice(0, 10).map(participant => participant.position)).toEqual(
            MATCH_SHARE_POSITIONS,
        );
        expect(participants?.slice(10)).toEqual([
            { discordUserId: players[10].discordUserId, position: null },
            { discordUserId: players[11].discordUserId, position: null },
        ]);
    });

    it('팀 결과가 없으면 참가자와 대기열 순서만 공유한다', () => {
        const participants = createMatchLiveParticipants(players, null);

        expect(participants?.map(participant => participant.discordUserId)).toEqual(
            players.map(player => player.discordUserId),
        );
        expect(participants?.every(participant => participant.position === null)).toBe(true);
    });

    it('일부 팀 위치만 있거나 Discord ID가 중복되면 거부한다', () => {
        expect(normalizeMatchLiveParticipants([
            { discordUserId: players[0].discordUserId, position: 'A:TANK:0' },
            { discordUserId: players[1].discordUserId, position: null },
        ])).toBeNull();
        expect(normalizeMatchLiveParticipants([
            { discordUserId: players[0].discordUserId, position: null },
            { discordUserId: players[0].discordUserId, position: null },
        ])).toBeNull();
    });

    it('Discord ID가 없는 참가자가 있으면 공동 작업 명단을 만들지 않는다', () => {
        expect(createMatchLiveParticipants([
            players[0],
            { ...players[1], discordUserId: undefined },
        ], null)).toBeNull();
    });
});