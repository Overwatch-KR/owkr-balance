import type {
    ScrimRecord,
    ScrimRosterParticipant,
} from './model.js';

export const EVENT_PARTICIPATION_START_DATE = '2026-08-18';
export const EVENT_PARTICIPATION_END_DATE = '2026-09-18';

export interface EventParticipationSnapshot {
    candidates: ScrimRosterParticipant[];
    participantIds: string[];
    updatedAt?: number;
}

/**
 * @description 이벤트 기간 내 내전 로스터에서 실제 참여 여부를 확인할 후보를 중복 없이 반환한다.
 */
export const getEventParticipantCandidates = (
    scrims: ScrimRecord[],
    startDate = EVENT_PARTICIPATION_START_DATE,
    endDate = EVENT_PARTICIPATION_END_DATE,
): ScrimRosterParticipant[] => {
    const participantsById = new Map<string, ScrimRosterParticipant>();

    scrims
        .filter(scrim => scrim.date >= startDate && scrim.date <= endDate)
        .sort((a, b) => a.customGameStartsAt - b.customGameStartsAt)
        .forEach(scrim => {
            scrim.rosterSnapshot.forEach(participant => {
                participantsById.set(participant.id, participant);
            });
        });

    return [...participantsById.values()].sort((a, b) => (
        a.name.localeCompare(b.name, 'ko-KR')
    ));
};
