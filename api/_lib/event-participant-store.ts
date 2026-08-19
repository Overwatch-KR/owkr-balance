import type { Redis } from '@upstash/redis';
import type { ScrimRecord, ScrimRosterParticipant } from '../../domains/scrim/shared/public.js';
import {
    getEventParticipantCandidates,
    type EventParticipationSnapshot,
} from '../../src/utils/event-participants.js';

const EVENT_PARTICIPANTS_KEY = 'events:2026-08-18-2026-09-18:participants:v1';

interface StoredEventParticipation {
    participants: ScrimRosterParticipant[];
    updatedAt: number;
}

const readStoredParticipation = async (redis: Redis): Promise<StoredEventParticipation> => {
    const stored = await redis.get<StoredEventParticipation>(EVENT_PARTICIPANTS_KEY);
    if (!stored || !Array.isArray(stored.participants)) {
        return { participants: [], updatedAt: 0 };
    }
    return {
        participants: stored.participants.filter(participant => (
            participant
            && typeof participant.id === 'string'
            && typeof participant.name === 'string'
        )),
        updatedAt: Number.isFinite(stored.updatedAt) ? stored.updatedAt : 0,
    };
};

const buildSnapshot = (
    candidates: ScrimRosterParticipant[],
    stored: StoredEventParticipation,
): EventParticipationSnapshot => {
    const candidatesById = new Map(candidates.map(participant => [participant.id, participant]));
    stored.participants.forEach(participant => {
        if (!candidatesById.has(participant.id)) candidatesById.set(participant.id, participant);
    });
    return {
        candidates: [...candidatesById.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
        participantIds: stored.participants.map(participant => participant.id),
        updatedAt: stored.updatedAt || undefined,
    };
};

/**
 * @description 이벤트 로스터 후보와 관리자가 확정해 저장한 실제 참여자를 함께 조회한다.
 */
export const getEventParticipation = async (
    redis: Redis,
    scrims: ScrimRecord[],
): Promise<EventParticipationSnapshot> => (
    buildSnapshot(getEventParticipantCandidates(scrims), await readStoredParticipation(redis))
);

/**
 * @description 이벤트 후보 중 관리자가 선택한 사람만 실제 참여자로 영구 저장한다.
 */
export const saveEventParticipation = async (
    redis: Redis,
    scrims: ScrimRecord[],
    rawParticipantIds: unknown,
): Promise<EventParticipationSnapshot | null> => {
    if (
        !Array.isArray(rawParticipantIds)
        || rawParticipantIds.some(id => typeof id !== 'string')
        || new Set(rawParticipantIds).size !== rawParticipantIds.length
    ) return null;

    const stored = await readStoredParticipation(redis);
    const available = new Map<string, ScrimRosterParticipant>();
    getEventParticipantCandidates(scrims).forEach(participant => available.set(participant.id, participant));
    stored.participants.forEach(participant => {
        if (!available.has(participant.id)) available.set(participant.id, participant);
    });
    if (rawParticipantIds.some(id => !available.has(id))) return null;

    const next: StoredEventParticipation = {
        participants: rawParticipantIds.map(id => available.get(id)!),
        updatedAt: Date.now(),
    };
    await redis.set(EVENT_PARTICIPANTS_KEY, next);
    return buildSnapshot(getEventParticipantCandidates(scrims), next);
};
