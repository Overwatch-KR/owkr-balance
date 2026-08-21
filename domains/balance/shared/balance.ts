import type { Player, Rank, Role } from '../../player/shared/public.js';
import type {
    BalanceMetrics,
    MatchResultData,
    RoleAssignment,
    SwapSource,
    TeamResult,
} from './model.js';

const TEAM_SIZE = 5;
const PLAYER_COUNT = 10;
const RESULT_COUNT = 12;
const QUALITY_POOL_SIZE = 80;
const MIN_TEAM_CHANGES = 2;
const MAX_TANK_MATCHUP_DIFF = 600;
const ROLES: Role[] = ['TANK', 'DPS', 'SUPPORT'];

const SCORE_WEIGHTS = {
    roleMatchup: 3,
    teamVariance: 0.5,
} as const;

interface RoleScores {
    tank: number;
    dps: number;
    support: number;
}

interface AssignmentResult {
    assignment: RoleAssignment;
    realScore: number;
    preferenceViolations: number;
    avoidedAssignments: number;
    unrankedAssignments: number;
    teamStdDev: number;
    roleScores: RoleScores;
}

interface Candidate {
    teamA: AssignmentResult;
    teamB: AssignmentResult;
    preferenceViolations: number;
    avoidedAssignments: number;
    unrankedAssignments: number;
    compositeScore: number;
    realDiff: number;
    tankDiff: number;
}

/**
 * @description 팀 후보 평가에서 선택적으로 제외할 운영 조건.
 */
export interface BalanceOptions {
    ignorePreferences?: boolean;
}

/**
 * @description 순수 밸런싱 계산이 반환하는 최종 결과와 대안 목록.
 */
export interface BalanceResult {
    result: MatchResultData;
    alternatives: MatchResultData[];
}

/**
 * @description 밸런싱 워커가 반환하는 성공 또는 실패 메시지.
 */
export type BalanceWorkerResponse =
    | { ok: true; data: BalanceResult }
    | { ok: false; error: string };

/**
 * @description 플레이어의 지정 역할 랭크를 반환한다.
 */
const getRank = (player: Player, role: Role): Rank => {
    if (role === 'TANK') return player.tank;
    if (role === 'DPS') return player.dps;
    return player.sup;
};

/**
 * @description 역할 배치 목록을 플레이어와 담당 역할 쌍으로 평탄화한다.
 */
const getAssignedPlayers = (assignment: RoleAssignment): Array<[Player, Role]> => [
    [assignment.TANK[0], 'TANK'],
    ...assignment.DPS.map((player): [Player, Role] => [player, 'DPS']),
    ...assignment.SUPPORT.map((player): [Player, Role] => [player, 'SUPPORT']),
];

/**
 * @description 숫자 목록의 표준편차를 계산한다.
 */
const calculateStdDev = (scores: number[]): number => {
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
    return Math.sqrt(variance);
};

/**
 * @description 역할 배치에서 반복 사용되는 품질 지표를 한 번만 계산한다.
 */
const buildAssignmentResult = (assignment: RoleAssignment): AssignmentResult => {
    const assignedPlayers = getAssignedPlayers(assignment);
    const scores = assignedPlayers.map(([player, role]) => getRank(player, role).score);

    let preferenceViolations = 0;
    let avoidedAssignments = 0;
    let unrankedAssignments = 0;

    for (const [player, role] of assignedPlayers) {
        const assignedRank = getRank(player, role);
        const hasPreferredRole = ROLES.some((candidateRole) => getRank(player, candidateRole).isPreferred);

        if (hasPreferredRole && !assignedRank.isPreferred) preferenceViolations++;
        if (assignedRank.isAvoided) avoidedAssignments++;
        if (assignedRank.tier === 'UNRANKED') unrankedAssignments++;
    }

    const tankScore = scores[0];
    const dpsScore = (scores[1] + scores[2]) / 2;
    const supportScore = (scores[3] + scores[4]) / 2;

    return {
        assignment,
        realScore: scores.reduce((sum, score) => sum + score, 0),
        preferenceViolations,
        avoidedAssignments,
        unrankedAssignments,
        teamStdDev: calculateStdDev(scores),
        roleScores: {
            tank: tankScore,
            dps: dpsScore,
            support: supportScore,
        },
    };
};

/**
 * @description 5인 팀에서 가능한 1탱커·2딜러·2힐러 역할 배치를 생성한다.
 */
const getAllTeamAssignments = (players: Player[]): AssignmentResult[] => {
    const results: AssignmentResult[] = [];

    for (let tankIndex = 0; tankIndex < TEAM_SIZE; tankIndex++) {
        const remainingIndexes = [0, 1, 2, 3, 4].filter((index) => index !== tankIndex);

        for (let first = 0; first < remainingIndexes.length; first++) {
            for (let second = first + 1; second < remainingIndexes.length; second++) {
                const firstDpsIndex = remainingIndexes[first];
                const secondDpsIndex = remainingIndexes[second];
                const supportIndexes = remainingIndexes.filter(
                    (index) => index !== firstDpsIndex && index !== secondDpsIndex,
                );

                results.push(buildAssignmentResult({
                    TANK: [players[tankIndex]],
                    DPS: [players[firstDpsIndex], players[secondDpsIndex]],
                    SUPPORT: [players[supportIndexes[0]], players[supportIndexes[1]]],
                }));
            }
        }
    }

    return results;
};

/**
 * @description 두 팀 역할별 평균 점수 차이의 합을 계산한다.
 */
const calculateRoleMatchupDiff = (teamA: AssignmentResult, teamB: AssignmentResult): number =>
    Math.abs(teamA.roleScores.tank - teamB.roleScores.tank)
    + Math.abs(teamA.roleScores.dps - teamB.roleScores.dps)
    + Math.abs(teamA.roleScores.support - teamB.roleScores.support);

/**
 * @description 탱커 차이가 허용 범위를 넘으면 안전 범위 진입과 격차 축소를 비선호 배정보다 우선한다.
 */
const compareTankSafeguard = (candidate: Candidate, existing: Candidate): number => {
    const candidateExceedsLimit = candidate.tankDiff > MAX_TANK_MATCHUP_DIFF;
    const existingExceedsLimit = existing.tankDiff > MAX_TANK_MATCHUP_DIFF;

    if (candidateExceedsLimit !== existingExceedsLimit) {
        return candidateExceedsLimit ? 1 : -1;
    }

    return candidateExceedsLimit
        ? candidate.tankDiff - existing.tankDiff
        : 0;
};

/**
 * @description 설정에 따라 선호 위반을 제외하고 탱커 안전장치·비선호·미배치·종합 점수 순으로 후보를 비교한다.
 */
const compareCandidates = (
    candidate: Candidate,
    existing: Candidate,
    options: BalanceOptions,
): number =>
    (options.ignorePreferences
        ? 0
        : candidate.preferenceViolations - existing.preferenceViolations)
    || compareTankSafeguard(candidate, existing)
    || candidate.avoidedAssignments - existing.avoidedAssignments
    || candidate.unrankedAssignments - existing.unrankedAssignments
    || candidate.compositeScore - existing.compositeScore
    || candidate.realDiff - existing.realDiff;

/**
 * @description 정렬된 상위 후보 목록에 새 후보를 삽입한다.
 */
const insertCandidate = (
    candidates: Candidate[],
    candidate: Candidate,
    options: BalanceOptions,
): void => {
    const insertAt = candidates.findIndex(
        (existing) => compareCandidates(candidate, existing, options) < 0,
    );
    candidates.splice(insertAt === -1 ? candidates.length : insertAt, 0, candidate);
    if (candidates.length > QUALITY_POOL_SIZE) candidates.pop();
};

/**
 * @description 후보에서 각 플레이어가 속한 팀과 역할을 비교 가능한 슬롯 맵으로 만든다.
 */
const buildAssignmentSlotMap = (candidate: Candidate): Map<number, string> => {
    const slots = new Map<number, string>();
    const addTeam = (team: 'A' | 'B', assignment: RoleAssignment): void => {
        slots.set(assignment.TANK[0].id, `${team}:TANK`);
        for (const player of assignment.DPS) slots.set(player.id, `${team}:DPS`);
        for (const player of assignment.SUPPORT) slots.set(player.id, `${team}:SUPPORT`);
    };

    addTeam('A', candidate.teamA.assignment);
    addTeam('B', candidate.teamB.assignment);
    return slots;
};

/**
 * @description 후보에서 각 플레이어가 속한 팀을 비교 가능한 맵으로 만든다.
 */
const buildTeamMap = (candidate: Candidate): Map<number, 'A' | 'B'> => {
    const teams = new Map<number, 'A' | 'B'>();
    for (const players of Object.values(candidate.teamA.assignment)) {
        for (const player of players) teams.set(player.id, 'A');
    }
    for (const players of Object.values(candidate.teamB.assignment)) {
        for (const player of players) teams.set(player.id, 'B');
    }
    return teams;
};

/**
 * @description 두 후보 사이에서 다른 팀으로 이동한 플레이어 수를 계산한다.
 */
const countTeamChanges = (first: Candidate, second: Candidate): number => {
    const firstTeams = buildTeamMap(first);
    const secondTeams = buildTeamMap(second);
    let changes = 0;

    for (const [playerId, team] of firstTeams) {
        if (secondTeams.get(playerId) !== team) changes++;
    }

    return changes;
};

/**
 * @description 두 후보의 팀과 역할 배치가 완전히 같은지 확인한다.
 */
const hasSameAssignment = (first: Candidate, second: Candidate): boolean => {
    const firstSlots = buildAssignmentSlotMap(first);
    const secondSlots = buildAssignmentSlotMap(second);
    return [...firstSlots].every(([playerId, slot]) => secondSlots.get(playerId) === slot);
};

/**
 * @description 상위 품질 후보군에서 팀과 역할 구성이 서로 충분히 다른 결과를 고른다.
 */
const selectDiverseCandidates = (candidates: Candidate[]): Candidate[] => {
    const bestCandidate = candidates[0];
    if (!bestCandidate) return [];

    const selected = [bestCandidate];
    for (const candidate of candidates.slice(1)) {
        const isDiverse = selected.every(
            (existing) => countTeamChanges(candidate, existing) >= MIN_TEAM_CHANGES,
        );
        if (!isDiverse) continue;

        selected.push(candidate);
        if (selected.length === RESULT_COUNT) return selected;
    }

    for (const candidate of candidates.slice(1)) {
        const isAlreadySelected = selected.includes(candidate);
        const isDuplicate = selected.some((existing) => hasSameAssignment(candidate, existing));
        if (isAlreadySelected || isDuplicate) continue;

        selected.push(candidate);
        if (selected.length === RESULT_COUNT) break;
    }

    return selected;
};

/**
 * @description 역할별 점수 차이와 팀 내부 편차를 UI 지표로 변환한다.
 */
const buildMetrics = (teamA: AssignmentResult, teamB: AssignmentResult): BalanceMetrics => ({
    totalDiff: Math.abs(teamA.realScore - teamB.realScore),
    roleDiffs: {
        tank: Math.round(Math.abs(teamA.roleScores.tank - teamB.roleScores.tank)),
        dps: Math.round(Math.abs(teamA.roleScores.dps - teamB.roleScores.dps)),
        support: Math.round(Math.abs(teamA.roleScores.support - teamB.roleScores.support)),
    },
    teamStdDevs: [Math.round(teamA.teamStdDev), Math.round(teamB.teamStdDev)],
    preferenceViolations: teamA.preferenceViolations + teamB.preferenceViolations,
    avoidedAssignments: teamA.avoidedAssignments + teamB.avoidedAssignments,
    unrankedAssignments: teamA.unrankedAssignments + teamB.unrankedAssignments,
});

/**
 * @description 내부 후보를 화면과 저장소에서 사용하는 매칭 결과로 변환한다.
 */
const toMatchResult = (candidate: Candidate, rank?: number): MatchResultData => {
    const teamA: TeamResult = {
        name: 'TEAM 1',
        assignment: candidate.teamA.assignment,
        realScore: candidate.teamA.realScore,
    };
    const teamB: TeamResult = {
        name: 'TEAM 2',
        assignment: candidate.teamB.assignment,
        realScore: candidate.teamB.realScore,
    };

    return {
        teamA,
        teamB,
        diff: candidate.realDiff,
        metrics: buildMetrics(candidate.teamA, candidate.teamB),
        evaluation: rank === undefined ? undefined : {
            rank,
            balanceCost: Math.round(candidate.compositeScore),
        },
    };
};

/**
 * @description 수동 교체 이후 팀 점수와 품질 지표를 현재 역할 배치에 맞게 다시 계산한다.
 */
export const recalculateMatchResult = (matchResult: MatchResultData): MatchResultData => {
    const teamAResult = buildAssignmentResult(matchResult.teamA.assignment);
    const teamBResult = buildAssignmentResult(matchResult.teamB.assignment);

    return {
        teamA: {
            ...matchResult.teamA,
            realScore: teamAResult.realScore,
        },
        teamB: {
            ...matchResult.teamB,
            realScore: teamBResult.realScore,
        },
        diff: Math.abs(teamAResult.realScore - teamBResult.realScore),
        metrics: buildMetrics(teamAResult, teamBResult),
    };
};

/**
 * @description 두 결과 슬롯의 플레이어를 교체하고 팀 점수와 밸런스 지표를 즉시 다시 계산한다.
 */
export const swapMatchResultPlayers = (
    matchResult: MatchResultData,
    source: SwapSource,
    target: SwapSource,
): MatchResultData => {
    const teamNames = ['teamA', 'teamB'] as const;
    const sourceTeam = teamNames[source.teamIdx];
    const targetTeam = teamNames[target.teamIdx];
    if (!sourceTeam || !targetTeam) {
        throw new Error('교체할 팀을 찾지 못했습니다.');
    }

    const nextResult = structuredClone(matchResult);
    const sourcePlayer = nextResult[sourceTeam].assignment[source.role][source.index];
    const targetPlayer = nextResult[targetTeam].assignment[target.role][target.index];
    if (!sourcePlayer || !targetPlayer) {
        throw new Error('교체할 플레이어를 찾지 못했습니다.');
    }

    nextResult[sourceTeam].assignment[source.role][source.index] = targetPlayer;
    nextResult[targetTeam].assignment[target.role][target.index] = sourcePlayer;

    return recalculateMatchResult(nextResult);
};

/**
 * @description 10명을 가능한 모든 팀과 역할 조합으로 평가하고 운영 옵션을 반영해 최적 결과를 반환한다.
 */
export const balancePlayers = (
    players: Player[],
    options: BalanceOptions = {},
): BalanceResult => {
    if (players.length !== PLAYER_COUNT) {
        throw new Error(`플레이어가 ${PLAYER_COUNT}명이어야 합니다. (현재: ${players.length}명)`);
    }

    const combinations: number[] = [];
    const generateCombinations = (start: number, count: number, mask: number): void => {
        if (count === 0) {
            combinations.push(mask);
            return;
        }

        for (let index = start; index <= PLAYER_COUNT - count; index++) {
            generateCombinations(index + 1, count - 1, mask | (1 << index));
        }
    };

    generateCombinations(1, TEAM_SIZE - 1, 1);

    const topCandidates: Candidate[] = [];
    const allPlayersMask = (1 << PLAYER_COUNT) - 1;

    for (const teamAMask of combinations) {
        const teamBMask = allPlayersMask ^ teamAMask;
        const teamAPlayers: Player[] = [];
        const teamBPlayers: Player[] = [];

        for (let index = 0; index < PLAYER_COUNT; index++) {
            if ((teamAMask >> index) & 1) teamAPlayers.push(players[index]);
            else if ((teamBMask >> index) & 1) teamBPlayers.push(players[index]);
        }

        const teamAAssignments = getAllTeamAssignments(teamAPlayers);
        const teamBAssignments = getAllTeamAssignments(teamBPlayers);
        let bestCandidateForTeamSplit: Candidate | null = null;

        for (const teamA of teamAAssignments) {
            for (const teamB of teamBAssignments) {
                const realDiff = Math.abs(teamA.realScore - teamB.realScore);
                const tankDiff = Math.abs(teamA.roleScores.tank - teamB.roleScores.tank);
                const roleMatchupDiff = calculateRoleMatchupDiff(teamA, teamB);
                const teamVariance = teamA.teamStdDev + teamB.teamStdDev;

                const candidate: Candidate = {
                    teamA,
                    teamB,
                    preferenceViolations: teamA.preferenceViolations + teamB.preferenceViolations,
                    avoidedAssignments: teamA.avoidedAssignments + teamB.avoidedAssignments,
                    unrankedAssignments: teamA.unrankedAssignments + teamB.unrankedAssignments,
                    compositeScore: realDiff
                        + roleMatchupDiff * SCORE_WEIGHTS.roleMatchup
                        + teamVariance * SCORE_WEIGHTS.teamVariance,
                    realDiff,
                    tankDiff,
                };
                if (
                    !bestCandidateForTeamSplit
                    || compareCandidates(candidate, bestCandidateForTeamSplit, options) < 0
                ) {
                    bestCandidateForTeamSplit = candidate;
                }
            }
        }

        if (bestCandidateForTeamSplit) {
            insertCandidate(topCandidates, bestCandidateForTeamSplit, options);
        }
    }

    const selectedCandidates = selectDiverseCandidates(topCandidates);
    const [bestCandidate, ...alternativeCandidates] = selectedCandidates;
    if (!bestCandidate) throw new Error('유효한 팀 조합을 찾지 못했습니다.');

    return {
        result: toMatchResult(bestCandidate, 1),
        alternatives: alternativeCandidates.map((candidate, index) => (
            toMatchResult(candidate, index + 2)
        )),
    };
};
