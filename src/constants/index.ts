import { Rank, Tier } from "../types";

/**
 * @description 티어 순서를 점수 계산 기준으로 고정한 목록.
 */
export const TIERS: readonly Exclude<Tier, 'UNRANKED'>[] = [
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHAMPION"
];

/**
 * @description 선택 UI에서 노출하는 정식 티어와 미배치 상태 목록.
 */
export const TIER_OPTIONS: readonly Tier[] = [...TIERS, 'UNRANKED'];

/**
 * @description 티어·상태 코드와 UI 표기를 연결하는 라벨 맵.
 */
export const TIER_LABEL_MAP: Record<Tier, string> = {
    BRONZE: "브론즈",
    SILVER: "실버",
    GOLD: "골드",
    PLATINUM: "플레",
    EMERALD: "에메랄드",
    DIAMOND: "다이아",
    MASTER: "마스터",
    GRANDMASTER: "그마",
    CHAMPION: "챔피언",
    UNRANKED: "미배치"
};

/**
 * @description 사용 가이드에서 실제 참가자 명단을 구성하는 10명 예시 데이터.
 */
export const SAMPLE_ROSTER = `Alpha#1001 다3!/플2?/플3
Bravo#1002 플1/다4!/플2
Charlie#1003 플3/다2?/골1
Delta#1004 다5!/플1?/플2
Echo#1005 플2/에3?/다4
Foxtrot#1006 골1/플2?/다3
Golf#1007 플4/플3/다1
Hotel#1008 다4!/플2?/플1
India#1009 플1/다5?/에2!
Juliet#1010 다2/플4/플2`;

/**
 * @description 비선형 티어 기본 점수 테이블. 고티어일수록 간격이 커져 실력 격차를 반영한다.
 */
const TIER_BASE_SCORES = [0, 500, 1100, 1800, 2600, 3600, 4800, 6200, 7800];

/**
 * @description 티어/등급을 비선형 점수로 변환해 로직 전반에서 비교에 사용한다.
 * @param tierIdx - 티어 목록 인덱스
 * @param div - 등급 (1~5)
 * @returns 계산된 점수
 */
export const getScore = (tierIdx: number, div: string | number): number => {
    const base = TIER_BASE_SCORES[tierIdx];
    if (base === undefined) throw new RangeError('지원하지 않는 티어입니다.');
    const nextBase = TIER_BASE_SCORES[tierIdx + 1] ?? base + 500;
    const tierGap = nextBase - base;
    return base + Math.round((tierGap / 5) * (5 - Number(div)));
};

/**
 * @description 티어와 디비전을 밸런싱 점수로 변환한다.
 * @param tier - 정식 티어
 * @param div - 등급 (1~5)
 * @returns 계산된 점수
 */
export const getTierScore = (tier: Tier, div: string | number): number => {
    if (tier === 'UNRANKED') return 0;
    return getScore(TIERS.indexOf(tier), div);
};

/**
 * @description Rank 정보를 UI용 짧은 문자열로 변환한다.
 * @param rankObj - 랭크 객체
 * @returns 포맷된 문자열 (예: "다3", "플1★", "미배치")
 *
 * @example
 * formatRank({ tier: 'DIAMOND', div: 3, score: 2700, isPreferred: true })
 * // => "다3★"
 */
export const formatRank = (rankObj: Rank): string => {
    if (!rankObj || rankObj.tier === 'UNRANKED') return "미배치";
    const shortName = TIER_LABEL_MAP[rankObj.tier]?.[0] || "?";
    const intentMark = rankObj.isPreferred ? '★' : rankObj.isAvoided ? '?' : '';
    return `${shortName}${rankObj.div}${intentMark}`;
};

/**
 * @description 점수를 대략적인 티어 라벨로 변환해 표시용으로 사용한다.
 * @param score - 점수
 * @returns 티어 라벨 (예: "다이아", "플레")
 */
export const scoreToTierLabel = (score: number): string => {
    let tierIdx = 0;
    for (let i = TIER_BASE_SCORES.length - 1; i >= 0; i--) {
        if (score >= TIER_BASE_SCORES[i]) {
            tierIdx = i;
            break;
        }
    }
    return TIER_LABEL_MAP[TIERS[tierIdx]];
};
