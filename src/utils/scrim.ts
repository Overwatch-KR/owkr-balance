import type {
    SatisfactionParticipationStatus,
    ScrimRecord,
    VoteParticipationStatus,
} from '../../domains/scrim/shared/public';

/**
 * @description 한국 시간 기준 내전 시작·만족도 종료 시각과 공개 참여 상태를 계산한다.
 */
export const getScrimTimes = (date: string, startTime: string) => {
    const startsAt = Date.parse(`${date}T${startTime}:00+09:00`);
    const [year, month, day] = date.split('-').map(Number);
    const satisfactionExpiresAt = Date.UTC(year, month - 1, day + 1, 14, 59, 59, 999);
    return { customGameStartsAt: startsAt, satisfactionExpiresAt };
};

export const getVoteParticipationStatus = (
    scrim: Pick<ScrimRecord, 'customGameStartsAt' | 'voteOpenedAt' | 'voteClosedAt'>,
    now = Date.now(),
): VoteParticipationStatus => {
    if (scrim.voteOpenedAt && !scrim.voteClosedAt && now >= scrim.voteOpenedAt && now < scrim.customGameStartsAt) {
        return 'VOTING_OPEN';
    }
    return 'VOTING_CLOSED';
};

export const getSatisfactionParticipationStatus = (
    scrim: Pick<ScrimRecord, 'customGameStartsAt' | 'satisfactionExpiresAt'>,
    now = Date.now(),
): SatisfactionParticipationStatus => {
    if (now < scrim.customGameStartsAt) return 'SATISFACTION_PENDING';
    if (now <= scrim.satisfactionExpiresAt) return 'SATISFACTION_OPEN';
    return 'SATISFACTION_EXPIRED';
};

export const formatRemainingDuration = (remainingMs: number): string => {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const timeParts = [
        hours > 0 ? `${hours}시간` : '',
        `${String(minutes).padStart(2, '0')}분`,
        `${String(seconds).padStart(2, '0')}초`,
    ].filter(Boolean);
    return days > 0 ? `${days}일 ${timeParts.join(' ')}` : timeParts.join(' ');
};

export const formatScrimLabel = (scrim: Pick<ScrimRecord, 'date' | 'createdBy'>): string => {
    const [, month, day] = scrim.date.split('-').map(Number);
    return `${month}월 ${day}일 ${scrim.createdBy} 관리자 내전`;
};
