import type { Redis } from '@upstash/redis';
import {
    getEventParticipantCandidates,
    type EventParticipationSnapshot,
} from '../../domains/scrim/shared/rules.js';
import type {
    ScrimRecord,
    ScrimRosterParticipant,
} from '../../domains/scrim/shared/public.js';
import { ADMIN_USERS } from './admin.constants.js';
import type { PublicUserSheetEntry } from './user-sheet-store.js';

const EVENT_PARTICIPANTS_KEY = 'events:2026-08-18-2026-09-18:participants:v1';
const ADMIN_USER_IDS = new Set<string>(Object.keys(ADMIN_USERS));

interface StoredEventParticipation {
    participants: ScrimRosterParticipant[];
    updatedAt: number;
}

const isAdminParticipant = (participant: ScrimRosterParticipant): boolean => (
    ADMIN_USER_IDS.has(participant.id)
);

const getEligibleCandidates = (scrims: ScrimRecord[]): ScrimRosterParticipant[] => (
    getEventParticipantCandidates(scrims).filter(participant => !isAdminParticipant(participant))
);

/**
 * @description 유저 시트 항목을 이벤트 참여 후보로 변환하고 관리자 계정을 제외한다.
 */
export const getEventUserSheetCandidates = (
    entries: PublicUserSheetEntry[],
): ScrimRosterParticipant[] => entries
    .map(entry => ({
        id: entry.discordUserId ?? entry.id,
        name: entry.battleTag,
        discordName: entry.discordName || undefined,
    }))
    .filter(participant => !isAdminParticipant(participant))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));

const parseParticipants = (rawParticipants: unknown): ScrimRosterParticipant[] | null => {
    if (!Array.isArray(rawParticipants) || rawParticipants.length < 1 || rawParticipants.length > 10) {
        return null;
    }
    const participants: ScrimRosterParticipant[] = [];
    const ids = new Set<string>();
    for (const raw of rawParticipants) {
        if (!raw || typeof raw !== 'object') return null;
        const input = raw as Partial<ScrimRosterParticipant>;
        const id = typeof input.id === 'string' ? input.id.trim().slice(0, 200) : '';
        const name = typeof input.name === 'string' ? input.name.trim().slice(0, 100) : '';
        const discordName = typeof input.discordName === 'string'
            ? input.discordName.trim().slice(0, 100)
            : '';
        if (!id || !name || ids.has(id)) return null;
        ids.add(id);
        participants.push({ id, name, discordName: discordName || undefined });
    }
    return participants;
};

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
            && !isAdminParticipant(participant)
        )),
        updatedAt: Number.isFinite(stored.updatedAt) ? stored.updatedAt : 0,
    };
};

const buildSnapshot = (
    candidates: ScrimRosterParticipant[],
    stored: StoredEventParticipation,
): EventParticipationSnapshot => {
    const candidatesById = new Map(candidates
        .filter(participant => !isAdminParticipant(participant))
        .map(participant => [participant.id, participant]));
    stored.participants.forEach(participant => {
        if (!isAdminParticipant(participant)) candidatesById.set(participant.id, participant);
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
    buildSnapshot(getEligibleCandidates(scrims), await readStoredParticipation(redis))
);

/**
 * @description 이벤트 후보 중 관리자가 선택한 사람만 실제 참여자로 영구 저장한다.
 */
export const saveEventParticipation = async (
    redis: Redis,
    scrims: ScrimRecord[],
    rawParticipantIds: unknown,
    additionalCandidates: ScrimRosterParticipant[] = [],
): Promise<EventParticipationSnapshot | null> => {
    if (
        !Array.isArray(rawParticipantIds)
        || rawParticipantIds.some(id => typeof id !== 'string')
        || new Set(rawParticipantIds).size !== rawParticipantIds.length
    ) return null;

    const stored = await readStoredParticipation(redis);
    const available = new Map<string, ScrimRosterParticipant>();
    getEligibleCandidates(scrims).forEach(participant => available.set(participant.id, participant));
    additionalCandidates
        .filter(participant => !isAdminParticipant(participant))
        .forEach(participant => available.set(participant.id, participant));
    stored.participants.forEach(participant => {
        if (!available.has(participant.id)) available.set(participant.id, participant);
    });
    if (rawParticipantIds.some(id => !available.has(id))) return null;

    const next: StoredEventParticipation = {
        participants: rawParticipantIds.map(id => available.get(id)!),
        updatedAt: Date.now(),
    };
    await redis.set(EVENT_PARTICIPANTS_KEY, next);
    return buildSnapshot(getEligibleCandidates(scrims), next);
};

/**
 * @description 팀 결과에서 확정한 이번 내전 참여자를 기존 이벤트 참여자와 중복 없이 합쳐 저장한다.
 */
export const addEventParticipation = async (
    redis: Redis,
    scrims: ScrimRecord[],
    rawParticipants: unknown,
): Promise<EventParticipationSnapshot | null> => {
    const parsedParticipants = parseParticipants(rawParticipants);
    if (!parsedParticipants) return null;

    const stored = await readStoredParticipation(redis);
    const participants = parsedParticipants.filter(participant => !isAdminParticipant(participant));
    if (participants.length === 0) return buildSnapshot(getEligibleCandidates(scrims), stored);
    const participantsById = new Map(stored.participants.map(participant => [
        participant.id,
        participant,
    ]));
    participants.forEach(participant => participantsById.set(participant.id, participant));
    const next: StoredEventParticipation = {
        participants: [...participantsById.values()],
        updatedAt: Date.now(),
    };
    await redis.set(EVENT_PARTICIPANTS_KEY, next);
    return buildSnapshot(getEligibleCandidates(scrims), next);
};
