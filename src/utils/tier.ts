import type { Tier } from '../types';

/**
 * @description 정식 티어 이미지 경로를 반환한다.
 * @param tier - 정식 티어
 * @returns 티어 이미지 경로
 */
export const getTierImage = (tier: Tier): string => (
    `${import.meta.env.BASE_URL}tier/${tier.toLowerCase()}.png`
);
