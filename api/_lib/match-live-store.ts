import { randomInt } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import {
    normalizeMatchLiveParticipants,
    type MatchLiveParticipant,
} from '#domain/balance';

const MATCH_LIVE_KEY_PREFIX = 'match-live:v1:';
const MATCH_LIVE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_LIVE_CODE_LENGTH = 10;
const MATCH_LIVE_CREATE_ATTEMPTS = 5;
export const MATCH_LIVE_TTL_SECONDS = 24 * 60 * 60;

export interface StoredMatchLiveSession {
    revision: number;
    participants: MatchLiveParticipant[];
    updatedAt: number;
}

export type MatchLiveMutationResult =
    | { status: 'OK'; session: StoredMatchLiveSession }
    | { status: 'CONFLICT'; session: StoredMatchLiveSession }
    | { status: 'INVALID' }
    | { status: 'NOT_FOUND' };

const UPDATE_MATCH_LIVE_SCRIPT = `
local currentJson = redis.call('GET', KEYS[1])
if not currentJson then
    return cjson.encode({ status = 'NOT_FOUND' })
end

local current = cjson.decode(currentJson)
if tonumber(current.revision) ~= tonumber(ARGV[1]) then
    return cjson.encode({ status = 'CONFLICT', session = current })
end

local nextSession = {
    revision = tonumber(current.revision) + 1,
    participants = cjson.decode(ARGV[2]),
    updatedAt = tonumber(ARGV[3])
}
local nextJson = cjson.encode(nextSession)
redis.call('SET', KEYS[1], nextJson, 'EX', tonumber(ARGV[4]))
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
        revision: source.revision,
        participants,
        updatedAt: source.updatedAt,
    };
};

/**
 * @description Discord ID와 선택적 팀 위치만 담은 24시간 실시간 공동 작업 세션을 생성한다.
 */
export const createMatchLiveSession = async (
    redis: Redis,
    input: unknown,
): Promise<{ code: string; session: StoredMatchLiveSession } | null> => {
    const participants = normalizeMatchLiveParticipants(input);
    if (!participants) return null;

    for (let attempt = 0; attempt < MATCH_LIVE_CREATE_ATTEMPTS; attempt++) {
        const code = buildMatchLiveCode();
        const key = getMatchLiveKey(code);
        if (await redis.get(key) !== null) continue;

        const session: StoredMatchLiveSession = {
            revision: 1,
            participants,
            updatedAt: Date.now(),
        };
        await redis.set(key, session, { ex: MATCH_LIVE_TTL_SECONDS });
        return { code, session };
    }

    throw new Error('고유한 공동 작업 코드를 만들지 못했습니다.');
};

/**
 * @description 공동 작업 코드로 현재 revision과 최소 명단을 조회한다.
 */
export const getMatchLiveSession = async (
    redis: Redis,
    code: string,
): Promise<StoredMatchLiveSession | null> => {
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
): Promise<MatchLiveMutationResult> => {
    const participants = normalizeMatchLiveParticipants(input);
    if (
        !participants
        || typeof expectedRevision !== 'number'
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 1
    ) {
        return { status: 'INVALID' };
    }

    const result = await redis.eval<string[], {
        status: 'CONFLICT' | 'NOT_FOUND' | 'OK';
        session?: unknown;
    }>(
        UPDATE_MATCH_LIVE_SCRIPT,
        [getMatchLiveKey(code)],
        [
            String(expectedRevision),
            JSON.stringify(participants),
            String(Date.now()),
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
