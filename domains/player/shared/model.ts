/**
 * @description 팀 배치 흐름에서 사용하는 역할 타입.
 */
export type Role = 'TANK' | 'DPS' | 'SUPPORT';

/**
 * @description 랭크 파싱과 표시 흐름에서 사용하는 티어 타입.
 */
export type Tier =
    | 'BRONZE'
    | 'SILVER'
    | 'GOLD'
    | 'PLATINUM'
    | 'EMERALD'
    | 'DIAMOND'
    | 'MASTER'
    | 'GRANDMASTER'
    | 'CHAMPION'
    | 'UNRANKED';

/**
 * @description 역할별 점수 계산과 표시를 위한 랭크 정보.
 * @property tier - 티어 (BRONZE ~ CHAMPION, UNRANKED)
 * @property div - 등급 (1~5, 미배치는 0)
 * @property score - 비선형 티어 기준표와 디비전으로 계산한 점수 (미배치는 0)
 * @property isPreferred - 선호 역할 여부 (! 표시)
 * @property isAvoided - 비선호 역할 여부 (? 표시)
 */
export interface Rank {
    tier: Tier;
    div: number | string;
    score: number;
    isPreferred: boolean;
    isAvoided: boolean;
}

/**
 * @description 파싱/입력 → 팀 배치 흐름에서 사용하는 플레이어 모델.
 * @property id - 고유 식별자 (타임스탬프 + 랜덤)
 * @property name - 배틀태그 (닉네임#숫자)
 * @property discordName - 디스코드에서 사용하는 표시 이름
 * @property discordUserId - 변경되지 않는 디스코드 고유 ID
 * @property userSheetEntryId - 연결된 유저 시트 내부 UUID
 * @property tank - 탱커 역할 랭크
 * @property dps - 딜러 역할 랭크
 * @property sup - 힐러 역할 랭크
 */
export interface Player {
    id: number;
    name: string;
    discordName?: string;
    discordUserId?: string;
    userSheetEntryId?: string;
    tank: Rank;
    dps: Rank;
    sup: Rank;
}
