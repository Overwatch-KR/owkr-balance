import { randomInt } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import {
    normalizeMatchLiveParticipants,
    type MatchLiveChangeKind,
    type MatchLiveParticipant,
} from '../../domains/balance/shared/public.js';

const MATCH_LIVE_KEY_PREFIX = 'match-live:v1:';
const MATCH_LIVE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_LIVE_CODE_LENGTH = 10;
const MATCH_LIVE_CREATE_ATTEMPTS = 5;
const MATCH_LIVE_MAX_COLLABORATORS = 12;
const MATCH_LIVE_PRESENCE_WINDOW_MS = 15_000;
const MATCH_LIVE_PRESENCE_WRITE_INTERVAL_MS = 5_000;
const MATCH_LIVE_CHANGE_KINDS = new Set<MatchLiveChangeKind>([
    'ROSTER',
    'TEAMS',
    'ROSTER_AND_TEAMS',
]);
export const MATCH_LIVE_TTL_SECONDS = 24 * 60 * 60;

export interface MatchLiveActor {
    avatarUrl?: string;
    displayName: string;
    userId: string;
}

interface StoredMatchLiveCollaborator extends MatchLiveActor {
    lastSeenAt: number;
}

interface StoredMatchLiveRecentChange {
    actor: MatchLiveActor;
    kind: MatchLiveChangeKind;
    updatedAt: number;
}

export interface StoredMatchLiveSession {
    collaborators: StoredMatchLiveCollaborator[];
    revision: number;
    participants: MatchLiveParticipant[];
    recentChange: StoredMatchLiveRecentChange | null;
    updatedAt: number;
}

export type MatchLiveMutationResult =
    | { status: 'OK'; session: StoredMatchLiveSession }
    | { status: 'CONFLICT'; session: StoredMatchLiveSession }
    | { status: 'INVALID' }
    | { status: 'NOT_FOUND' };

const TOUCH_MATCH_LIVE_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
if not currentJson then
    return cjson.encode({ status = 'NOT_FOUND' })
end

local current = cjson.decode(currentJson)
local actor = cjson.decode(ARGV[1])
local now = tonumber(ARGV[2])
local cutoff = now - tonumber(ARGV[3])
local writeCutoff = now - tonumber(ARGV[4])
local collaborators = {}
local shouldWrite = false

if current.collaborators then
    for _, collaborator in ipairs(current.collaborators) do
        if collaborator.userId == actor.userId then
            if tonumber(collaborator.lastSeenAt) >= writeCutoff then
                actor.lastSeenAt = tonumber(collaborator.lastSeenAt)
            else
                shouldWrite = true
            end
        elseif tonumber(collaborator.lastSeenAt) >= cutoff then
            table.insert(collaborators, collaborator)
        else
            shouldWrite = true
        end
    end
end

if not actor.lastSeenAt then
    actor.lastSeenAt = now
    shouldWrite = true
end
table.insert(collaborators, 1, actor)
while #collaborators > tonumber(ARGV[5]) do
    table.remove(collaborators)
    shouldWrite = true
end
current.collaborators = collaborators

if shouldWrite then
    redis.call('SET', KEYS[1], cjson.encode(current), 'KEEPTTL')
end
return cjson.encode({ status = 'OK', session = current })
`;

const UPDATE_MATCH_LIVE_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
if not currentJson then
    return cjson.encode({ status = 'NOT_FOUND' })
end

local current = cjson.decode(currentJson)
if tonumber(current.revision) ~= tonumber(ARGV[1]) then
    return cjson.encode({ status = 'CONFLICT', session = current })
end

local actor = cjson.decode(ARGV[3])
actor.lastSeenAt = tonumber(ARGV[4])
local collaborators = { actor }
if current.collaborators then
    for _, collaborator in ipairs(current.collaborators) do
        if collaborator.userId ~= actor.userId and #collaborators < tonumber(ARGV[6]) then
            if tonumber(collaborator.lastSeenAt) >= tonumber(ARGV[4]) - tonumber(ARGV[7]) then
                table.insert(collaborators, collaborator)
            end
        end
    end
end

local recentActor = cjson.decode(ARGV[3])
local nextSession = {
    revision = tonumber(current.revision) + 1,
    participants = cjson.decode(ARGV[2]),
    updatedAt = tonumber(ARGV[4]),
    collaborators = collaborators,
    recentChange = {
        actor = recentActor,
        kind = ARGV[5],
        updatedAt = tonumber(ARGV[4])
    }
}
local nextJson = cjson.encode(nextSession)
redis.call('SET', KEYS[1], nextJson, 'EX', tonumber(ARGV[8]))
return cjson.encode({ status = 'OK', session = nextSession })
`;

/**
 * @description 사람이 Discord에서 전달하기 쉬운 실시간 공동 작업 코드를 만든다.
 */
const buildMatchLiveCode = (): string => Array.from(
    { length: MATCH_LIVE_CODE_LENGTH },
    () => MATCH_LIVE_CODE_ALPHABET[randomInt(MATCH_LIVE_CODE_ALPHABET.length)],
).join('');

/**
 * @description 실시간 공동 작업 코드를 버전이 포함된 Redis 키로 변환한다.
 */
const getMatchLiveKey = (code: string): string => `${MATCH_LIVE_KEY_PREFIX}${code}`;

const normalizeActor = (value: unknown): MatchLiveActor | null => {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<MatchLiveActor>;
    const userId = typeof source.userId === 'string' ? source.userId.trim() : '';
    const displayName = typeof source.displayName === 'string' ? source.displayName.trim() : '';
    const avatarUrl = typeof source.avatarUrl === 'string' ? source.avatarUrl.trim() : '';
    if (!userId || !displayName || userId.length > 100 || displayName.length > 80) return null;
    return {
        userId,
        displayName,
        ...(avatarUrl && avatarUrl.length <= 500 ? { avatarUrl } : {}),
    };
};

const normalizeCollaborators = (value: unknown): StoredMatchLiveCollaborator[] => {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MATCH_LIVE_MAX_COLLABORATORS).flatMap(raw => {
        const actor = normalizeActor(raw);
        const lastSeenAt = raw && typeof raw === 'object'
            ? (raw as Partial<StoredMatchLiveCollaborator>).lastSeenAt
            : undefined;
        return actor
            && typeof lastSeenAt === 'number'
            && Number.isSafeInteger(lastSeenAt)
            && lastSeenAt >= 0
            ? [{ ...actor, lastSeenAt }]
            : [];
    });
};

const normalizeRecentChange = (value: unknown): StoredMatchLiveRecentChange | null => {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<StoredMatchLiveRecentChange>;
    const actor = normalizeActor(source.actor);
    if (
        !actor
        || typeof source.kind !== 'string'
        || !MATCH_LIVE_CHANGE_KINDS.has(source.kind as MatchLiveChangeKind)
        || typeof source.updatedAt !== 'number'
        || !Number.isSafeInteger(source.updatedAt)
        || source.updatedAt < 0
    ) {
        return null;
    }
    return { actor, kind: source.kind as MatchLiveChangeKind, updatedAt: source.updatedAt };
};

const getChangeKind = (
    current: MatchLiveParticipant[],
    next: MatchLiveParticipant[],
): MatchLiveChangeKind => {
    const rosterChanged = current.length !== next.length || current.some(
        (participant, index) => participant.discordUserId !== next[index]?.discordUserId,
    );
    const currentPositions = new Map(
        current.map(participant => [participant.discordUserId, participant.position] as const),
    );
    const nextPositions = new Map(
        next.map(participant => [participant.discordUserId, participant.position] as const),
    );
    const participantIds = new Set([...currentPositions.keys(), ...nextPositions.keys()]);
    const teamsChanged = Array.from(participantIds).some(
        userId => (currentPositions.get(userId) ?? null) !== (nextPositions.get(userId) ?? null),
    );
    if (rosterChanged && teamsChanged) return 'ROSTER_AND_TEAMS';
    return teamsChanged ? 'TEAMS' : 'ROSTER';
};

/**
 * @description 저장된 실시간 세션 값을 읽기 전에 계약과 revision을 다시 검증한다.
 */
const normalizeStoredMatchLiveSession = (value: unknown): StoredMatchLiveSession | null => {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<StoredMatchLiveSession>;
    const participants = normalizeMatchLiveParticipants(source.participants);
    if (
        !participants
        || typeof source.revision !== 'number'
        || !Number.isSafeInteger(source.revision)
        || source.revision < 1
        || typeof source.updatedAt !== 'number'
        || !Number.isSafeInteger(source.updatedAt)
        || source.updatedAt < 0
    ) {
        return null;
    }
    return {
        collaborators: normalizeCollaborators(source.collaborators),
        revision: source.revision,
        participants,
        recentChange: normalizeRecentChange(source.recentChange),
        updatedAt: source.updatedAt,
    };
};

/**
 * @description Discord ID·팀 위치와 생성자의 Discord 프로필을 담은 공동 작업 세션을 생성한다.
 */
export const createMatchLiveSession = async (
    redis: Redis,
    input: unknown,
    actorInput: unknown,
): Promise<{ code: string; session: StoredMatchLiveSession } | null> => {
    const participants = normalizeMatchLiveParticipants(input);
    const actor = normalizeActor(actorInput);
    if (!participants || !actor) return null;

    for (let attempt = 0; attempt < MATCH_LIVE_CREATE_ATTEMPTS; attempt++) {
        const code = buildMatchLiveCode();
        const key = getMatchLiveKey(code);
        if (await redis.get(key) !== null) continue;

        const now = Date.now();
        const session: StoredMatchLiveSession = {
            collaborators: [{ ...actor, lastSeenAt: now }],
            revision: 1,
            participants,
            recentChange: null,
            updatedAt: now,
        };
        await redis.set(key, session, { ex: MATCH_LIVE_TTL_SECONDS });
        return { code, session };
    }

    throw new Error('고유한 공동 작업 코드를 만들지 못했습니다.');
};

/**
 * @description 공동 작업 세션을 조회하고 요청 관리자의 현재 접속 상태를 함께 갱신한다.
 */
export const getMatchLiveSession = async (
    redis: Redis,
    code: string,
    actorInput?: unknown,
): Promise<StoredMatchLiveSession | null> => {
    const actor = normalizeActor(actorInput);
    if (actor) {
        const result = await redis.eval<string[], {
            status: 'NOT_FOUND' | 'OK';
            session?: unknown;
        }>(
            TOUCH_MATCH_LIVE_SCRIPT,
            [getMatchLiveKey(code)],
            [
                JSON.stringify(actor),
                String(Date.now()),
                String(MATCH_LIVE_PRESENCE_WINDOW_MS),
                String(MATCH_LIVE_PRESENCE_WRITE_INTERVAL_MS),
                String(MATCH_LIVE_MAX_COLLABORATORS),
            ],
        );
        return result.status === 'OK' ? normalizeStoredMatchLiveSession(result.session) : null;
    }
    const stored = await redis.get<unknown>(getMatchLiveKey(code));
    return normalizeStoredMatchLiveSession(stored);
};

/**
 * @description 기대 revision이 일치할 때만 공동 작업 상태를 원자 갱신한다.
 */
export const updateMatchLiveSession = async (
    redis: Redis,
    code: string,
    expectedRevision: unknown,
    input: unknown,
    actorInput: unknown,
): Promise<MatchLiveMutationResult> => {
    const participants = normalizeMatchLiveParticipants(input);
    const actor = normalizeActor(actorInput);
    if (
        !participants
        || !actor
        || typeof expectedRevision !== 'number'
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 1
    ) {
        return { status: 'INVALID' };
    }

    const current = await getMatchLiveSession(redis, code);
    if (!current) return { status: 'NOT_FOUND' };
    const changeKind = getChangeKind(current.participants, participants);
    const now = Date.now();

    const result = await redis.eval<string[], {
        status: 'CONFLICT' | 'NOT_FOUND' | 'OK';
        session?: unknown;
    }>(
        UPDATE_MATCH_LIVE_SCRIPT,
        [getMatchLiveKey(code)],
        [
            String(expectedRevision),
            JSON.stringify(participants),
            JSON.stringify(actor),
            String(now),
            changeKind,
            String(MATCH_LIVE_MAX_COLLABORATORS),
            String(MATCH_LIVE_PRESENCE_WINDOW_MS),
            String(MATCH_LIVE_TTL_SECONDS),
        ],
    );

    if (result.status === 'NOT_FOUND') return { status: 'NOT_FOUND' };
    const session = normalizeStoredMatchLiveSession(result.session);
    if (!session) return { status: 'INVALID' };
    return result.status === 'CONFLICT'
        ? { status: 'CONFLICT', session }
        : { status: 'OK', session };
};
