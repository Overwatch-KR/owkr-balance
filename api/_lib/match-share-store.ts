import { randomInt } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import {
    normalizeMatchShareCode,
    normalizeMatchShareParticipants,
    type MatchShareParticipant,
} from '#domain/balance';

const MATCH_SHARE_KEY_PREFIX = 'match-shares:v1:';
const MATCH_SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MATCH_SHARE_CODE_LENGTH = 10;
const MATCH_SHARE_CREATE_ATTEMPTS = 5;
export const MATCH_SHARE_TTL_SECONDS = 24 * 60 * 60;

/**
 * @description 사람이 Discord에서 전달하기 쉬운 10자리 공유 코드를 만든다.
 */
const buildMatchShareCode = (): string => Array.from(
    { length: MATCH_SHARE_CODE_LENGTH },
    () => MATCH_SHARE_CODE_ALPHABET[randomInt(MATCH_SHARE_CODE_ALPHABET.length)],
).join('');

/**
 * @description 공유 코드를 버전이 포함된 Redis 키로 변환한다.
 */
const getMatchShareKey = (code: string): string => `${MATCH_SHARE_KEY_PREFIX}${code}`;

/**
 * @description 정확히 10명의 Discord ID와 배치 위치만 Redis에 24시간 저장하고 공유 코드를 반환한다.
 */
export const createMatchShare = async (
    redis: Redis,
    input: unknown,
): Promise<{ code: string; participants: MatchShareParticipant[] } | null> => {
    const participants = normalizeMatchShareParticipants(input);
    if (!participants) return null;

    for (let attempt = 0; attempt < MATCH_SHARE_CREATE_ATTEMPTS; attempt++) {
        const code = buildMatchShareCode();
        const key = getMatchShareKey(code);
        if (await redis.get(key) !== null) continue;

        await redis.set(key, participants, { ex: MATCH_SHARE_TTL_SECONDS });
        return { code, participants };
    }

    throw new Error('고유한 내전 공유 코드를 만들지 못했습니다.');
};

/**
 * @description 공유 코드로 Redis의 최소 명단을 조회하고 저장 당시와 같은 계약으로 다시 검증한다.
 */
export const getMatchShare = async (
    redis: Redis,
    input: string,
): Promise<{ code: string; participants: MatchShareParticipant[] } | null> => {
    const code = normalizeMatchShareCode(input);
    if (
        code.length !== MATCH_SHARE_CODE_LENGTH
        || [...code].some(character => !MATCH_SHARE_CODE_ALPHABET.includes(character))
    ) {
        return null;
    }

    const stored = await redis.get<unknown>(getMatchShareKey(code));
    const participants = normalizeMatchShareParticipants(stored);
    return participants ? { code, participants } : null;
};
