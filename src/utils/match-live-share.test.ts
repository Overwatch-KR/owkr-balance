import { describe, expect, it } from 'vitest';
import {
    MATCH_SHARE_POSITIONS,
    type MatchLiveSessionSnapshot,
} from '../../domains/balance/shared/public';
import { hydrateMatchLiveSession } from './match-live-share';
import type { UserSheetEntry } from './user-sheet';

const session: MatchLiveSessionSnapshot = {
    code: 'ABCDEFGH23',
    revision: 4,
    updatedAt: 123,
    participants: [
        ...MATCH_SHARE_POSITIONS.map((position, index) => ({
            discordUserId: `111111111111111${String(index).padStart(2, '0')}`,
            position,
        })),
        {
            discordUserId: '11111111111111110',
            position: null,
        },
    ],
};

const entries: UserSheetEntry[] = session.participants.map((participant, index) => ({
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

describe('match live hydration', () => {
    it('참가자·대기열 순서와 팀 위치를 최신 유저 시트 티어로 복원한다', () => {
        const hydrated = hydrateMatchLiveSession(session, entries);

        expect(hydrated.players).toHaveLength(11);
        expect(hydrated.players[10].discordUserId).toBe('11111111111111110');
        expect(hydrated.result?.teamA.assignment.TANK[0].discordUserId).toBe(
            session.participants[0].discordUserId,
        );
        expect(hydrated.result?.teamA.assignment.TANK[0].tank.tier).toBe('MASTER');
        expect(hydrated.result?.metrics?.totalDiff).toBe(hydrated.result?.diff);
        expect(hydrated.session.revision).toBe(4);
    });

    it('팀 위치가 없는 공동 작업 명단은 로스터만 복원한다', () => {
        const rosterOnlySession = {
            ...session,
            participants: session.participants.map(participant => ({
                ...participant,
                position: null,
            })),
        };
        const hydrated = hydrateMatchLiveSession(rosterOnlySession, entries);

        expect(hydrated.players).toHaveLength(11);
        expect(hydrated.result).toBeNull();
    });

    it('공유 Discord ID가 유저 시트에 없으면 전체 적용을 거부한다', () => {
        expect(() => hydrateMatchLiveSession(session, entries.slice(1))).toThrow(
            session.participants[0].discordUserId,
        );
    });
});