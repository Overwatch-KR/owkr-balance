import type { Player, Role } from '../../player/shared/public.js';

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
 */
export interface MatchEvaluation {
    rank: number;
    balanceCost: number;
}

/**
 * @description 두 팀 결과와 점수 차이를 묶은 매칭 결과 모델.
 */
export interface MatchResultData {
    teamA: TeamResult;
    teamB: TeamResult;
    diff: number;
    metrics?: BalanceMetrics;
    evaluation?: MatchEvaluation;
}
