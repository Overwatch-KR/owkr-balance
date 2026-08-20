import type {
    ScrimRecord,
} from '../../domains/scrim/shared/public';

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
