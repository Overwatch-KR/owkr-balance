import type { Tier } from '../types';

/**
 * @description 정식 티어 이미지 경로를 반환하며 미배치는 중립 UI variant에 맡긴다.
 * @param tier - 티어 또는 미배치 상태
 * @returns 정식 티어 이미지 경로 또는 undefined
 */
export const getTierImage = (tier: Tier): string | undefined => {
    if (tier === 'UNRANKED') return undefined;
    return `${import.meta.env.BASE_URL}tier/${tier.toLowerCase()}.png`;
};
