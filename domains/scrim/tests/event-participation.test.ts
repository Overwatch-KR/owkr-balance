import { describe, expect, it } from 'vitest';
import type { ScrimRecord } from '../shared/public';
import { getEventParticipantCandidates } from '../shared/rules';

const createScrim = (
    id: string,
    date: string,
    rosterSnapshot: ScrimRecord['rosterSnapshot'],
): ScrimRecord => ({
    id,
    date,
    startTime: '21:00',
    customGameStartsAt: Date.parse(`${date}T21:00:00+09:00`),
    satisfactionExpiresAt: Date.parse(`${date}T21:00:00+09:00`) + 86_400_000,
    createdAt: 0,
    createdBy: '관리자',
    createdById: 'admin-id',
    rosterSnapshot,
    publicLinks: {},
    usedBanHeroIds: [],
    votes: [],
    satisfactionResponses: [],
});

describe('getEventParticipantCandidates', () => {
    it('includes both event boundary dates and excludes outside dates', () => {
        const scrims = [
            createScrim('before', '2026-08-17', [{ id: 'outside-before', name: '이전' }]),
            createScrim('start', '2026-08-18', [{ id: 'start', name: '시작' }]),
            createScrim('end', '2026-09-18', [{ id: 'end', name: '종료' }]),
            createScrim('after', '2026-09-19', [{ id: 'outside-after', name: '이후' }]),
        ];

        expect(getEventParticipantCandidates(scrims).map(participant => participant.id).sort()).toEqual([
            'end',
            'start',
        ]);
    });

    it('counts the same roster id once and keeps its latest snapshot', () => {
        const scrims = [
            createScrim('first', '2026-08-20', [{ id: 'same-id', name: '이전이름' }]),
            createScrim('second', '2026-09-01', [
                { id: 'same-id', name: '현재이름', discordName: 'current' },
                { id: 'another-id', name: '다른사람' },
            ]),
        ];

        expect(getEventParticipantCandidates(scrims)).toEqual([
            { id: 'another-id', name: '다른사람' },
            { id: 'same-id', name: '현재이름', discordName: 'current' },
        ]);
    });
});
