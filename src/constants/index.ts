import { Rank, Tier } from "../types";

/**
 * @description 티어 순서를 점수 계산 기준으로 고정한 목록.
 */
export const TIERS: readonly Tier[] = [
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
 * @description 에메랄드 티어가 서비스에 활성화되는 한국 시각.
 */
export const EMERALD_RELEASE_AT = new Date('2026-08-12T03:00:00+09:00').getTime();

const LEGACY_TIERS = TIERS.filter((tier) => tier !== 'EMERALD');

/**
 * @description 기준 시각에 에메랄드 티어를 사용할 수 있는지 확인한다.
 */
export const isEmeraldAvailable = (at = Date.now()): boolean => at >= EMERALD_RELEASE_AT;

/**
 * @description 기준 시각에 선택·파싱·점수 계산에서 사용할 티어 순서를 반환한다.
 */
export const getAvailableTiers = (at = Date.now()): readonly Tier[] => (
    isEmeraldAvailable(at) ? TIERS : LEGACY_TIERS
);

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
    CHAMPION: "챔피언"
};

/**
 * @description 사용 가이드에서 실제 참가자 명단을 구성하는 10명 예시 데이터.
 */
const LEGACY_SAMPLE_ROSTER = `Alpha#1001 다3!/플2?/플3
Bravo#1002 플1/다4!/플2
Charlie#1003 플3/다2?/골1
Delta#1004 다5!/플1?/플2
Echo#1005 플2/다3?/다4
Foxtrot#1006 골1/플2?/다3
Golf#1007 플4/플3/다1
Hotel#1008 다4!/플2?/플1
India#1009 플1/다5?/플2!
Juliet#1010 다2/플4/플2`;

const EMERALD_SAMPLE_ROSTER = LEGACY_SAMPLE_ROSTER
    .replace('Echo#1005 플2/다3?/다4', 'Echo#1005 플2/에3?/다4')
    .replace('India#1009 플1/다5?/플2!', 'India#1009 플1/다5?/에2!');

/**
 * @description 활성 티어 구성에 맞는 10명 사용 가이드 예시를 반환한다.
 */
export const getSampleRoster = (at = Date.now()): string => (
    isEmeraldAvailable(at) ? EMERALD_SAMPLE_ROSTER : LEGACY_SAMPLE_ROSTER
);

/**
 * @description 비선형 티어 기본 점수 테이블. 고티어일수록 간격이 커져 실력 격차를 반영한다.
 */
const LEGACY_TIER_BASE_SCORES = [0, 500, 1100, 1800, 2600, 3600, 4800, 6200];
const EMERALD_TIER_BASE_SCORES = [0, 500, 1100, 1800, 2600, 3600, 4800, 6200, 7800];

/**
 * @description 티어/등급을 비선형 점수로 변환해 로직 전반에서 비교에 사용한다.
 * @param tierIdx - 기준 시각의 티어 목록 인덱스
 * @param div - 등급 (1~5)
 * @param at - 에메랄드 활성화 여부를 판정할 시각
 * @returns 계산된 점수
 */
export const getScore = (
    tierIdx: number,
    div: string | number,
    at = Date.now(),
): number => {
    const baseScores = isEmeraldAvailable(at)
        ? EMERALD_TIER_BASE_SCORES
        : LEGACY_TIER_BASE_SCORES;
    const base = baseScores[tierIdx];
    if (base === undefined) throw new RangeError('지원하지 않는 티어입니다.');
    const nextBase = baseScores[tierIdx + 1] ?? base + 500;
    const tierGap = nextBase - base;
    return base + Math.round((tierGap / 5) * (5 - Number(div)));
};

/**
 * @description 티어와 디비전을 밸런싱 점수로 변환한다.
 * @param tier - 정식 티어
 * @param div - 등급 (1~5)
 * @param at - 에메랄드 활성화 여부를 판정할 시각
 * @returns 계산된 점수
 */
export const getTierScore = (tier: Tier, div: string | number, at = Date.now()): number => {
    return getScore(getAvailableTiers(at).indexOf(tier), div, at);
};

/**
 * @description Rank 정보를 UI용 짧은 문자열로 변환한다.
 * @param rankObj - 랭크 객체
 * @returns 포맷된 문자열 (예: "다3", "플1★")
 *
 * @example
 * formatRank({ tier: 'DIAMOND', div: 3, score: 2700, isPreferred: true })
 * // => "다3★"
 */
export const formatRank = (rankObj: Rank): string => {
    if (!rankObj) return "?";
    const shortName = TIER_LABEL_MAP[rankObj.tier]?.[0] || "?";
    const intentMark = rankObj.isPreferred ? '★' : rankObj.isAvoided ? '?' : '';
    return `${shortName}${rankObj.div}${intentMark}`;
};

/**
 * @description 점수를 대략적인 티어 라벨로 변환해 표시용으로 사용한다.
 * @param score - 점수
 * @returns 티어 라벨 (예: "다이아", "플레")
 */
export const scoreToTierLabel = (score: number, at = Date.now()): string => {
    const tiers = getAvailableTiers(at);
    const baseScores = isEmeraldAvailable(at)
        ? EMERALD_TIER_BASE_SCORES
        : LEGACY_TIER_BASE_SCORES;
    let tierIdx = 0;
    for (let i = baseScores.length - 1; i >= 0; i--) {
        if (score >= baseScores[i]) {
            tierIdx = i;
            break;
        }
    }
    return TIER_LABEL_MAP[tiers[tierIdx]];
};
