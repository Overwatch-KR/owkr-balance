const TIER_SCORE_STEP = 600;
const DIVISION_SCORE_STEP = 100;

/**
 * @description 점수 차이를 운영자가 바로 비교할 수 있는 대략적인 티어·등급 차이로 변환한다.
 */
export const formatTierDifference = (scoreDifference: number): string => {
    const divisions = Math.round(Math.abs(scoreDifference) / DIVISION_SCORE_STEP);
    if (divisions === 0) return '거의 동일';

    const tierCount = Math.floor((divisions * DIVISION_SCORE_STEP) / TIER_SCORE_STEP);
    const remainingDivisions = divisions - (tierCount * (TIER_SCORE_STEP / DIVISION_SCORE_STEP));
    if (tierCount === 0) return `약 ${remainingDivisions}단계`;
    if (remainingDivisions === 0) return `약 ${tierCount}티어`;
    return `약 ${tierCount}티어 ${remainingDivisions}단계`;
};

/**
 * @description 역할 또는 팀의 합계 점수 차이를 해당 인원 기준 평균 티어 차이로 변환한다.
 */
export const formatAverageTierDifference = (
    scoreDifference: number,
    playerCount: number,
): string => formatTierDifference(scoreDifference / Math.max(playerCount, 1));
