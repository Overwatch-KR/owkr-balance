import type {
    SatisfactionParticipationStatus,
    ScrimRecord,
    VoteParticipationStatus,
} from './model';

/**
 * @description 한국 시간 기준 내전 시작 시각과 만족도 종료 시각을 계산한다.
 */
export const getScrimTimes = (date: string, startTime: string) => {
    const startsAt = Date.parse(`${date}T${startTime}:00+09:00`);
    const [year, month, day] = date.split('-').map(Number);
    const satisfactionExpiresAt = Date.UTC(year, month - 1, day + 1, 14, 59, 59, 999);
    return { customGameStartsAt: startsAt, satisfactionExpiresAt };
};

/**
 * @description 현재 시각을 기준으로 영웅 밴 투표 참여 가능 상태를 반환한다.
 */
export const getVoteParticipationStatus = (
    scrim: Pick<ScrimRecord, 'customGameStartsAt' | 'voteOpenedAt' | 'voteClosedAt'>,
    now = Date.now(),
): VoteParticipationStatus => {
    if (scrim.voteOpenedAt && !scrim.voteClosedAt && now >= scrim.voteOpenedAt && now < scrim.customGameStartsAt) {
        return 'VOTING_OPEN';
    }
    return 'VOTING_CLOSED';
};

/**
 * @description 현재 시각을 기준으로 만족도 조사 참여 가능 상태를 반환한다.
 */
export const getSatisfactionParticipationStatus = (
    scrim: Pick<ScrimRecord, 'customGameStartsAt' | 'satisfactionExpiresAt'>,
    now = Date.now(),
): SatisfactionParticipationStatus => {
    if (now < scrim.customGameStartsAt) return 'SATISFACTION_PENDING';
    if (now <= scrim.satisfactionExpiresAt) return 'SATISFACTION_OPEN';
    return 'SATISFACTION_EXPIRED';
};
