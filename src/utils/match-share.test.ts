import { describe, expect, it } from 'vitest';
import {
    MATCH_SHARE_POSITIONS,
    type MatchShareParticipant,
} from '../../domains/balance/shared/public';
import type { UserSheetEntry } from './user-sheet';
import { hydrateMatchShare } from './match-share';

const participants: MatchShareParticipant[] = MATCH_SHARE_POSITIONS.map((position, index) => ({
    discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
    position,
}));

const entries: UserSheetEntry[] = participants.map((participant, index) => ({
    id: `sheet-${index}`,
    discordUserId: participant.discordUserId,
    discordName: `디스코드 ${index}`,
    battleTag: `Player${index}#1234`,
    tank: index === 0 ? '마스터1' : '골드3',
    dps: '플래티넘4',
    support: '다이아몬드5',
    note: '',
    createdAt: 0,
    updatedAt: index,
    updatedByName: '관리자',
}));

describe('match share hydration', () => {
    it('공유 위치를 유지하면서 현재 유저 시트 티어로 팀 결과를 다시 계산한다', () => {
        const hydrated = hydrateMatchShare(participants, entries);

        expect(hydrated.players).toHaveLength(10);
        expect(hydrated.result.teamA.assignment.TANK[0].discordUserId).toBe(participants[0].discordUserId);
        expect(hydrated.result.teamA.assignment.TANK[0].tank.tier).toBe('MASTER');
        expect(hydrated.result.teamA.assignment.DPS.map(player => player.discordUserId)).toEqual([
            participants[1].discordUserId,
            participants[2].discordUserId,
        ]);
        expect(hydrated.result.teamB.assignment.SUPPORT.map(player => player.discordUserId)).toEqual([
            participants[8].discordUserId,
            participants[9].discordUserId,
        ]);
        expect(hydrated.result.metrics?.totalDiff).toBe(hydrated.result.diff);
    });

    it('공유 Discord ID가 현재 유저 시트에 없으면 일부 적용 없이 실패한다', () => {
        expect(() => hydrateMatchShare(participants, entries.slice(1))).toThrow(
            participants[0].discordUserId,
        );
    });

    it('현재 유저 시트의 역할 티어가 유효하지 않으면 복원을 거부한다', () => {
        const invalidEntries = entries.map(entry => ({ ...entry }));
        invalidEntries[3].tank = '';
        invalidEntries[3].dps = '';

        expect(() => hydrateMatchShare(participants, invalidEntries)).toThrow('디스코드 3');
    });
});
