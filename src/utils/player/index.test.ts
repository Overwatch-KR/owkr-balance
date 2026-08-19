import { describe, expect, it } from 'vitest';
import type { MatchResultData, Player } from '../../types';
import {
    getDefaultRosterImportMode,
    isMatchResultStale,
    reconcilePlayers,
    syncMatchResultPlayerIdentities,
} from './index';

const createPlayer = (id: number, name: string, discordName?: string): Player => ({
    id,
    name,
    discordName,
    tank: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
    dps: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
    sup: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
});

describe('getDefaultRosterImportMode', () => {
    it('기존 9명에 1명만 자동 파싱하면 기존 명단에 추가한다', () => {
        expect(getDefaultRosterImportMode(9, 1)).toBe('append');
    });

    it('기존 명단이 있어도 완성된 10명 명단은 교체한다', () => {
        expect(getDefaultRosterImportMode(9, 10)).toBe('replace');
    });

    it('기존 명단이 없으면 일부 명단도 교체 방식으로 적용한다', () => {
        expect(getDefaultRosterImportMode(0, 1)).toBe('replace');
    });
});

describe('reconcilePlayers', () => {
    it('배틀태그가 같아도 Discord ID가 다르면 두 참가자를 유지한다', () => {
        const first = {
            ...createPlayer(1, 'Same#1234', '첫 번째'),
            discordUserId: '11111111111111111',
        };
        const second = {
            ...createPlayer(2, 'Same#1234', '두 번째'),
            discordUserId: '22222222222222222',
        };

        const reconciled = reconcilePlayers([], [first, second], 'replace');

        expect(reconciled.players).toHaveLength(2);
        expect(reconciled.players.map(player => player.discordUserId)).toEqual([
            '11111111111111111',
            '22222222222222222',
        ]);
    });

    it('새 명단으로 교체하면서 기존 ID를 유지하고 빠진 참가자를 제외한다', () => {
        const existing = [
            createPlayer(1, 'Player#1234'),
            createPlayer(2, 'Old#9999', '기존 참가자'),
        ];
        const incoming: Player[] = [
            {
                ...createPlayer(20, 'player#1234', '디스코드 이름'),
                tank: { ...createPlayer(20, 'player#1234').tank, tier: 'PLATINUM', score: 2800 },
            },
            createPlayer(3, 'New#5678', '새 참가자'),
        ];

        const reconciled = reconcilePlayers(existing, incoming, 'replace');

        expect(reconciled).toMatchObject({
            addedCount: 1,
            updatedCount: 1,
            unchangedCount: 0,
            removedCount: 1,
        });
        expect(reconciled.players).toHaveLength(2);
        expect(reconciled.players[0]).toMatchObject({
            id: 1,
            discordName: '디스코드 이름',
            tank: { tier: 'PLATINUM', score: 2800 },
        });
        expect(reconciled.players[1]).toMatchObject({ id: 3, name: 'New#5678' });
    });

    it('기존 명단에 추가하면 기존 순서를 유지하고 같은 배틀태그 정보만 갱신한다', () => {
        const existing = [
            createPlayer(1, 'Player#1234'),
            createPlayer(2, 'Stay#9999', '유지'),
        ];
        const incoming = [
            createPlayer(20, 'player#1234', '변경된 이름'),
            createPlayer(3, 'New#5678', '새 참가자'),
        ];

        const reconciled = reconcilePlayers(existing, incoming, 'append');

        expect(reconciled).toMatchObject({
            addedCount: 1,
            updatedCount: 1,
            unchangedCount: 0,
            removedCount: 0,
        });
        expect(reconciled.players.map((player) => player.name)).toEqual([
            'player#1234',
            'Stay#9999',
            'New#5678',
        ]);
        expect(reconciled.players[0]).toMatchObject({ id: 1, discordName: '변경된 이름' });
    });

    it('새 명단에 디스코드 이름이 없으면 저장된 표시 이름을 유지한다', () => {
        const existing = [createPlayer(1, 'Player#1234', '저장된 이름')];
        const incoming = [createPlayer(20, 'player#1234')];

        const reconciled = reconcilePlayers(existing, incoming, 'replace');

        expect(reconciled).toMatchObject({
            addedCount: 0,
            updatedCount: 0,
            unchangedCount: 1,
            removedCount: 0,
        });
        expect(reconciled.players[0]).toMatchObject({ id: 1, discordName: '저장된 이름' });
    });
});

describe('syncMatchResultPlayerIdentities', () => {
    it('저장된 매칭 결과에도 최신 디스코드 이름을 반영한다', () => {
        const player = createPlayer(1, 'Player#1234');
        const result: MatchResultData = {
            teamA: {
                name: 'TEAM 1',
                assignment: { TANK: [player], DPS: [], SUPPORT: [] },
                realScore: 2200,
            },
            teamB: {
                name: 'TEAM 2',
                assignment: { TANK: [], DPS: [], SUPPORT: [] },
                realScore: 0,
            },
            diff: 2200,
        };

        const synced = syncMatchResultPlayerIdentities(
            result,
            [createPlayer(1, 'Player#1234', '디스코드 이름')],
        );

        expect(synced.teamA.assignment.TANK[0].discordName).toBe('디스코드 이름');
    });
});

describe('isMatchResultStale', () => {
    const createResult = (players: Player[]): MatchResultData => ({
        teamA: {
            name: 'TEAM 1',
            assignment: { TANK: [players[0]], DPS: [players[1], players[2]], SUPPORT: [players[3], players[4]] },
            realScore: 11000,
        },
        teamB: {
            name: 'TEAM 2',
            assignment: { TANK: [players[5]], DPS: [players[6], players[7]], SUPPORT: [players[8], players[9]] },
            realScore: 11000,
        },
        diff: 0,
    });

    it('순서만 바뀐 같은 참가자는 유효한 결과로 판단한다', () => {
        const players = Array.from({ length: 10 }, (_, index) => createPlayer(index, `Player${index}#1234`));
        const result = createResult(players);

        expect(isMatchResultStale(result, [...players].reverse())).toBe(false);
    });

    it('참가자의 랭크가 바뀌면 다시 매칭이 필요하다고 판단한다', () => {
        const players = Array.from({ length: 10 }, (_, index) => createPlayer(index, `Player${index}#1234`));
        const result = createResult(players);
        const changedPlayers: Player[] = players.map((player, index) => index === 0
            ? { ...player, tank: { ...player.tank, score: 2800, tier: 'PLATINUM' } }
            : player);

        expect(isMatchResultStale(result, changedPlayers)).toBe(true);
    });
});
