import { describe, expect, it } from 'vitest';
import {
    getSatisfactionParticipationStatus,
    getScrimTimes,
    getVoteParticipationStatus,
} from '../shared/rules';

describe('scrim time rules', () => {
    it('calculates the next Seoul calendar day end for satisfaction', () => {
        const times = getScrimTimes('2026-07-29', '21:00');
        expect(new Date(times.customGameStartsAt).toISOString()).toBe('2026-07-29T12:00:00.000Z');
        expect(new Date(times.satisfactionExpiresAt).toISOString()).toBe('2026-07-30T14:59:59.999Z');
    });

    it('keeps voting open only before the custom-game start', () => {
        const record = { voteOpenedAt: 100, voteClosedAt: undefined, customGameStartsAt: 200, satisfactionExpiresAt: 300 };
        expect(getVoteParticipationStatus(record, 150)).toBe('VOTING_OPEN');
        expect(getVoteParticipationStatus(record, 200)).toBe('VOTING_CLOSED');
        expect(getSatisfactionParticipationStatus(record, 150)).toBe('SATISFACTION_PENDING');
        expect(getSatisfactionParticipationStatus(record, 200)).toBe('SATISFACTION_OPEN');
        expect(getSatisfactionParticipationStatus(record, 301)).toBe('SATISFACTION_EXPIRED');
    });
});
