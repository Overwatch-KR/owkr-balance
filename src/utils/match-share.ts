import {
    createMatchShareParticipants,
    normalizeMatchShareCode,
    normalizeMatchShareParticipants,
    recalculateMatchResult,
    type MatchResultData,
    type MatchShareParticipant,
    type MatchSharePosition,
} from '#domain/balance';
import type { Player } from '../types';
import { requestJson } from './api';
import { parseLineToPlayer } from './parser/index';
import {
    cleanUserSheetRank,
    fetchUserSheet,
    type UserSheetEntry,
    type UserSheetSnapshot,
} from './user-sheet';

interface CreateMatchShareResponse {
    code: string;
    expiresInSeconds: number;
}

interface LoadMatchShareResponse {
    participants: MatchShareParticipant[];
}

export interface LoadedMatchShare {
    players: Player[];
    result: MatchResultData;
    userSheet: UserSheetSnapshot;
}

/**
 * @description 유저 시트의 현재 배틀태그·역할 티어를 밸런싱 Player 모델로 변환한다.
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

    return {
        ...parsed,
        id,
        discordName: entry.discordName.trim() || undefined,
        discordUserId,
        userSheetEntryId: entry.id,
    };
};

/**
 * @description 검증된 위치에 해당하는 플레이어를 찾고 누락된 슬롯은 복원 오류로 처리한다.
 */
const getPositionPlayer = (
    playersByPosition: Map<MatchSharePosition, Player>,
    position: MatchSharePosition,
): Player => {
    const player = playersByPosition.get(position);
    if (!player) throw new Error('공유된 팀 배치에 비어 있는 위치가 있습니다.');
    return player;
};

/**
 * @description 팀과 역할 슬롯을 검증된 공유 위치 타입으로 조합한다.
 */
const getTeamPosition = (
    team: 'A' | 'B',
    role: 'TANK' | 'DPS' | 'SUPPORT',
    index: number,
): MatchSharePosition => `${team}:${role}:${index}` as MatchSharePosition;

/**
 * @description 공유된 Discord ID·배치 위치를 현재 유저 시트 티어와 결합해 명단과 동일한 팀 결과를 복원한다.
 */
export const hydrateMatchShare = (
    input: unknown,
    entries: UserSheetEntry[],
): Pick<LoadedMatchShare, 'players' | 'result'> => {
    const participants = normalizeMatchShareParticipants(input);
    if (!participants) throw new Error('공유된 명단 형식이 올바르지 않습니다.');

    const entriesByDiscordId = new Map(
        entries.flatMap(entry => {
            const discordUserId = entry.discordUserId?.replace(/\D/g, '').trim();
            return discordUserId ? [[discordUserId, entry] as const] : [];
        }),
    );
    const missingIds = participants
        .map(participant => participant.discordUserId)
        .filter(discordUserId => !entriesByDiscordId.has(discordUserId));
    if (missingIds.length > 0) {
        const preview = missingIds.slice(0, 3).join(', ');
        const suffix = missingIds.length > 3 ? ` 외 ${missingIds.length - 3}명` : '';
        throw new Error(`유저 시트에서 공유 참가자를 찾지 못했습니다: ${preview}${suffix}`);
    }

    const idBase = Date.now();
    const playersByPosition = new Map<MatchSharePosition, Player>();
    const invalidEntries: string[] = [];
    participants.forEach((participant, index) => {
        const entry = entriesByDiscordId.get(participant.discordUserId)!;
        const player = createPlayerFromUserSheetEntry(entry, participant.discordUserId, idBase + index);
        if (!player) {
            invalidEntries.push(entry.discordName.trim() || entry.battleTag);
            return;
        }
        playersByPosition.set(participant.position, player);
    });

    if (invalidEntries.length > 0) {
        throw new Error(
            `유저 시트의 최신 티어를 확인해 주세요: ${invalidEntries.slice(0, 3).join(', ')}`,
        );
    }

    const teamAssignment = (team: 'A' | 'B') => ({
        TANK: [getPositionPlayer(playersByPosition, getTeamPosition(team, 'TANK', 0))],
        DPS: [
            getPositionPlayer(playersByPosition, getTeamPosition(team, 'DPS', 0)),
            getPositionPlayer(playersByPosition, getTeamPosition(team, 'DPS', 1)),
        ],
        SUPPORT: [
            getPositionPlayer(playersByPosition, getTeamPosition(team, 'SUPPORT', 0)),
            getPositionPlayer(playersByPosition, getTeamPosition(team, 'SUPPORT', 1)),
        ],
    });

    const result = recalculateMatchResult({
        teamA: { name: 'TEAM 1', assignment: teamAssignment('A'), realScore: 0 },
        teamB: { name: 'TEAM 2', assignment: teamAssignment('B'), realScore: 0 },
        diff: 0,
    });
    const players = participants.map(participant => (
        getPositionPlayer(playersByPosition, participant.position)
    ));

    return { players, result };
};

/**
 * @description 현재 결과에서 최소 공유 정보를 추출해 관리자 전용 Redis API에 저장하고 코드를 반환한다.
 */
export const createMatchShareCode = async (
    result: MatchResultData,
    csrfToken: string,
): Promise<string> => {
    const participants = createMatchShareParticipants(result);
    if (!participants) {
        throw new Error('공유하려면 팀 배정 10명 모두 유저 시트의 Discord ID와 연결되어 있어야 합니다.');
    }

    const response = await requestJson<CreateMatchShareResponse>('/api/match-shares', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ participants }),
    });
    return normalizeMatchShareCode(response.code);
};

/**
 * @description 공유 코드를 조회한 뒤 유저 시트를 새로 받아 최신 티어 기준의 명단과 팀 결과를 만든다.
 */
export const loadMatchShare = async (codeInput: string): Promise<LoadedMatchShare> => {
    const code = normalizeMatchShareCode(codeInput);
    if (code.length !== 10) throw new Error('공유 코드 10자리를 확인해 주세요.');

    const shared = await requestJson<LoadMatchShareResponse>(
        `/api/match-shares?code=${encodeURIComponent(code)}`,
        { credentials: 'same-origin' },
    );
    const userSheet = await fetchUserSheet();
    const hydrated = hydrateMatchShare(shared.participants, userSheet.entries);
    return { ...hydrated, userSheet };
};
