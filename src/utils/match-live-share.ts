import {
    MATCH_SHARE_POSITIONS,
    createMatchLiveParticipants,
    normalizeMatchLiveParticipants,
    normalizeMatchShareCode,
    recalculateMatchResult,
    type MatchLiveParticipant,
    type MatchLiveSessionSnapshot,
    type MatchResultData,
    type MatchSharePosition,
} from '#domain/balance';
import type { Player } from '../types';
import { findApiError, requestJson } from './api';
import { parseLineToPlayer } from './parser/index';
import {
    cleanUserSheetRank,
    fetchUserSheet,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from './user-sheet';

interface MatchLiveCreateResponse extends MatchLiveSessionSnapshot {
    expiresInSeconds: number;
}

export interface LoadedMatchLiveSession {
    players: Player[];
    result: MatchResultData | null;
    session: MatchLiveSessionSnapshot;
    userSheet: UserSheetSnapshot;
}

const MATCH_LIVE_API = '/api/match-shares?mode=live';

/**
 * @description 유저 시트의 현재 BattleTag·역할 티어를 공동 작업 Player 모델로 변환한다.
 */
const createPlayerFromUserSheetEntry = (
    entry: UserSheetEntry,
    discordUserId: string,
    id: number,
): Player | null => {
    const ranks = [entry.tank, entry.dps, entry.support]
        .map(value => cleanUserSheetRank(value) || '-');
    const parsed = parseLineToPlayer(
        `${entry.battleTag} ${ranks.join('/')}`,
        entry.discordName,
    );
    if (!parsed) return null;

    const rankedRoleCount = [parsed.tank, parsed.dps, parsed.sup]
        .filter(rank => rank.tier !== 'UNRANKED').length;
    if (rankedRoleCount < 2) return null;

    return {
        ...parsed,
        id,
        discordName: entry.discordName.trim() || undefined,
        discordUserId,
        userSheetEntryId: entry.id,
    };
};

/**
 * @description API 응답을 실시간 공동 작업 세션 계약으로 검증한다.
 */
export const normalizeMatchLiveSessionSnapshot = (
    value: unknown,
): MatchLiveSessionSnapshot | null => {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<MatchLiveSessionSnapshot>;
    const code = typeof source.code === 'string' ? normalizeMatchShareCode(source.code) : '';
    const participants = normalizeMatchLiveParticipants(source.participants);
    if (
        code.length !== 10
        || !participants
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
        code,
        revision: source.revision,
        participants,
        updatedAt: source.updatedAt,
    };
};

/**
 * @description 공동 작업의 Discord ID·배치를 최신 유저 시트와 결합해 로스터와 팀 결과를 복원한다.
 */
export const hydrateMatchLiveSession = (
    sessionInput: unknown,
    entries: UserSheetEntry[],
): Pick<LoadedMatchLiveSession, 'players' | 'result' | 'session'> => {
    const session = normalizeMatchLiveSessionSnapshot(sessionInput);
    if (!session) throw new Error('공동 작업 데이터 형식이 올바르지 않습니다.');

    const entriesByDiscordId = new Map(
        entries.flatMap(entry => {
            const discordUserId = entry.discordUserId?.replace(/\D/g, '').trim();
            return discordUserId ? [[discordUserId, entry] as const] : [];
        }),
    );
    const missingIds = session.participants
        .map(participant => participant.discordUserId)
        .filter(discordUserId => !entriesByDiscordId.has(discordUserId));
    if (missingIds.length > 0) {
        const preview = missingIds.slice(0, 3).join(', ');
        const suffix = missingIds.length > 3 ? ` 외 ${missingIds.length - 3}명` : '';
        throw new Error(`유저 시트에서 공동 작업 참가자를 찾지 못했습니다: ${preview}${suffix}`);
    }

    const idBase = Date.now();
    const playersByDiscordId = new Map<string, Player>();
    const invalidEntries: string[] = [];
    session.participants.forEach((participant, index) => {
        const entry = entriesByDiscordId.get(participant.discordUserId)!;
        const player = createPlayerFromUserSheetEntry(
            entry,
            participant.discordUserId,
            idBase + index,
        );
        if (!player) {
            invalidEntries.push(entry.discordName.trim() || entry.battleTag);
            return;
        }
        playersByDiscordId.set(participant.discordUserId, player);
    });

    if (invalidEntries.length > 0) {
        throw new Error(
            `유저 시트의 최신 티어를 확인해 주세요: ${invalidEntries.slice(0, 3).join(', ')}`,
        );
    }

    const players = session.participants.map(participant => (
        playersByDiscordId.get(participant.discordUserId)!
    ));
    const positioned = session.participants.filter((participant): participant is MatchLiveParticipant & {
        position: MatchSharePosition;
    } => participant.position !== null);
    if (positioned.length === 0) return { players, result: null, session };
    if (positioned.length !== MATCH_SHARE_POSITIONS.length) {
        throw new Error('공동 작업의 팀 배치가 완성되지 않았습니다.');
    }

    const playersByPosition = new Map<MatchSharePosition, Player>();
    positioned.forEach(participant => {
        const player = playersByDiscordId.get(participant.discordUserId);
        if (player) playersByPosition.set(participant.position, player);
    });

    const getPositionPlayer = (position: MatchSharePosition): Player => {
        const player = playersByPosition.get(position);
        if (!player) throw new Error('공동 작업의 팀 배치에 비어 있는 위치가 있습니다.');
        return player;
    };
    const getPosition = (
        team: 'A' | 'B',
        role: 'TANK' | 'DPS' | 'SUPPORT',
        index: number,
    ): MatchSharePosition => `${team}:${role}:${index}` as MatchSharePosition;
    const teamAssignment = (team: 'A' | 'B') => ({
        TANK: [getPositionPlayer(getPosition(team, 'TANK', 0))],
        DPS: [
            getPositionPlayer(getPosition(team, 'DPS', 0)),
            getPositionPlayer(getPosition(team, 'DPS', 1)),
        ],
        SUPPORT: [
            getPositionPlayer(getPosition(team, 'SUPPORT', 0)),
            getPositionPlayer(getPosition(team, 'SUPPORT', 1)),
        ],
    });
    const result = recalculateMatchResult({
        teamA: { name: 'TEAM 1', assignment: teamAssignment('A'), realScore: 0 },
        teamB: { name: 'TEAM 2', assignment: teamAssignment('B'), realScore: 0 },
        diff: 0,
    });

    return { players, result, session };
};

/**
 * @description 현재 로스터와 유효한 팀 결과로 실시간 공동 작업 세션을 만든다.
 */
export const createMatchLiveSession = async (
    players: Player[],
    result: MatchResultData | null,
    csrfToken: string,
): Promise<MatchLiveSessionSnapshot> => {
    const participants = createMatchLiveParticipants(players, result);
    if (!participants) {
        throw new Error('공동 작업하려면 참가자 모두 유저 시트의 Discord ID와 연결되어 있어야 합니다.');
    }
    const response = await requestJson<MatchLiveCreateResponse>(MATCH_LIVE_API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ participants }),
    });
    const session = normalizeMatchLiveSessionSnapshot(response);
    if (!session) throw new Error('공동 작업 세션 응답을 확인하지 못했습니다.');
    return session;
};

/**
 * @description 공동 작업 코드의 최신 revision을 조회한다.
 */
export const fetchMatchLiveSession = async (
    codeInput: string,
): Promise<MatchLiveSessionSnapshot> => {
    const code = normalizeMatchShareCode(codeInput);
    if (code.length !== 10) throw new Error('공동 작업 코드 10자리를 확인해 주세요.');
    const response = await requestJson<MatchLiveSessionSnapshot>(
        `${MATCH_LIVE_API}&code=${encodeURIComponent(code)}`,
        { credentials: 'same-origin' },
    );
    const session = normalizeMatchLiveSessionSnapshot(response);
    if (!session) throw new Error('공동 작업 세션 응답을 확인하지 못했습니다.');
    return session;
};

/**
 * @description 공동 작업 코드와 최신 유저 시트를 함께 불러와 즉시 적용 가능한 상태를 만든다.
 */
export const loadMatchLiveSession = async (
    codeInput: string,
): Promise<LoadedMatchLiveSession> => {
    const session = await fetchMatchLiveSession(codeInput);
    const userSheet = await fetchUserSheet();
    const hydrated = hydrateMatchLiveSession(session, userSheet.entries);
    return { ...hydrated, userSheet };
};

/**
 * @description 현재 revision을 기준으로 로스터·팀 배치 최소 정보를 원자 갱신한다.
 */
export const updateMatchLiveSession = async (
    code: string,
    revision: number,
    players: Player[],
    result: MatchResultData | null,
    csrfToken: string,
): Promise<MatchLiveSessionSnapshot> => {
    const participants = createMatchLiveParticipants(players, result);
    if (!participants) {
        throw new Error('Discord ID가 없는 참가자가 있어 공동 작업 상태를 동기화할 수 없습니다.');
    }
    const response = await requestJson<MatchLiveSessionSnapshot>(MATCH_LIVE_API, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ code, revision, participants }),
    });
    const session = normalizeMatchLiveSessionSnapshot(response);
    if (!session) throw new Error('공동 작업 갱신 응답을 확인하지 못했습니다.');
    return session;
};

/**
 * @description 409 공동 수정 충돌 응답에 포함된 최신 서버 스냅샷을 꺼낸다.
 */
export const getMatchLiveConflictSnapshot = (
    error: unknown,
): MatchLiveSessionSnapshot | null => {
    const apiError = findApiError(error);
    if (apiError?.status !== 409 || apiError.code !== 'MATCH_LIVE_CONFLICT') return null;
    const body = apiError.body as { session?: unknown } | null;
    return normalizeMatchLiveSessionSnapshot(body?.session);
};
