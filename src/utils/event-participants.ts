import type {
    ScrimRecord,
    ScrimRosterParticipant,
} from '../../domains/scrim/shared/public';

export const EVENT_PARTICIPATION_START_DATE = '2026-08-18';
export const EVENT_PARTICIPATION_END_DATE = '2026-09-18';

/**
 * @description 이벤트 기간 내 내전 로스터에서 한 번이라도 참여한 사람을 중복 없이 반환한다.
 */
export const getEventParticipants = (
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
