/**
 * @description 기존 애플리케이션 import 경로를 유지하는 도메인 타입 호환 진입점.
 */
export type {
    Player,
    Rank,
    Role,
    Tier,
} from '#domain/player';

export type {
    BalanceMetrics,
    MatchEvaluation,
    MatchResultData,
    RoleAssignment,
    SwapSource,
    TeamResult,
} from '#domain/balance';
