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

/**
 * @description 팀 결과에서 역할별로 묶인 배치 구조.
 * @property TANK - 탱커 배치 (1명)
 * @property DPS - 딜러 배치 (2명)
 * @property SUPPORT - 힐러 배치 (2명)
 */
export interface RoleAssignment {
    TANK: Player[];
    DPS: Player[];
    SUPPORT: Player[];
}

/**
 * @description 한 팀의 배치와 점수를 담는 결과 모델.
 * @property name - 팀 이름 (TEAM 1, TEAM 2)
 * @property assignment - 역할별 플레이어 배치
 * @property realScore - 실제 점수 (순수 티어 기반)
 */
export interface TeamResult {
    name: string;
    assignment: RoleAssignment;
    realScore: number;
}

/**
 * @description 결과 화면에서 선택된 교체 슬롯을 식별한다.
 */
export interface SwapSource {
    teamIdx: number;
    role: Role;
    index: number;
}

/**
 * @description 밸런스 품질 지표 모델.
 * @property totalDiff - 팀 총점 차이
 * @property roleDiffs - 역할별 매치업 점수 차이 (탱크, 딜러, 힐러)
 * @property teamStdDevs - 각 팀의 내부 점수 표준편차
 * @property preferenceViolations - 선호 역할이 있지만 다른 역할에 배정된 인원
 * @property avoidedAssignments - 비선호 역할에 배정된 인원
 * @property unrankedAssignments - 미배치 역할에 배정된 인원
 */
export interface BalanceMetrics {
    totalDiff: number;
    roleDiffs: { tank: number; dps: number; support: number };
    teamStdDevs: [number, number];
    preferenceViolations?: number;
    avoidedAssignments?: number;
    unrankedAssignments?: number;
}

/**
 * @description 자동 배정 후보의 고정 추천 순위와 알고리즘 내부 균형 비용.
 * @property rank - 생성 당시의 추천 순위
 * @property balanceCost - 탱커 안전 기준과 배정 예외 이후 비교하는 총점·역할별 차이·팀 내부 편차의 합산 비용
 */
export interface MatchEvaluation {
    rank: number;
    balanceCost: number;
}

/**
 * @description 두 팀 결과와 점수 차이를 묶은 매칭 결과 모델.
 * @property teamA - 1팀 결과
 * @property teamB - 2팀 결과
 * @property diff - 실제 점수 차이
 * @property metrics - 밸런스 품질 지표
 * @property evaluation - 자동 배정 후보의 추천 순위와 균형 비용
 */
export interface MatchResultData {
    teamA: TeamResult;
    teamB: TeamResult;
    diff: number;
    metrics?: BalanceMetrics;
    evaluation?: MatchEvaluation;
}
