import { validateMapCatalog } from './catalog.js';
import { DRAFT_LIMITS, requireDraft, type DraftCatalog, type DraftMap, type DraftTeam } from './model.js';
import { DraftRandom } from './random.js';

export interface MapOption {
  map: DraftMap;
  firstAttackTeam: DraftTeam | null;
}

export interface MapCandidateSnapshot {
  resolutionId: string;
  catalogVersion: string;
  mapHistoryRevision: number;
  eligiblePool: readonly DraftMap[];
  candidates: readonly MapOption[];
  randomPool: readonly DraftMap[];
  remainingMapsConfirmed: boolean;
  diversityExceptionReason: string | null;
  draws: readonly number[];
}

export interface CreateMapCandidatesInput {
  resolutionId: string;
  catalog: DraftCatalog<DraftMap>;
  usedCanonicalMapIds: readonly string[];
  excludedCanonicalMapIds: readonly string[];
  mapHistoryRevision: number;
  remainingMapsConfirmed?: boolean;
  diversityExceptionReason?: string;
  entropy: readonly number[];
}

function diversityGroup(map: DraftMap): string {
  return map.mode === 'HYBRID' || map.mode === 'ESCORT' ? 'PAYLOAD' : map.mode;
}

function hasDiversity(maps: readonly DraftMap[]): boolean {
  return new Set(maps.map(diversityGroup)).size >= 2;
}

function firstAttackTeam(map: DraftMap, random: DraftRandom): DraftTeam | null {
  return map.mode === 'ESCORT' || map.mode === 'HYBRID' ? random.pick(['A', 'B'] as const) : null;
}

export function getEligibleDraftMaps(catalog: DraftCatalog<DraftMap>, usedCanonicalMapIds: readonly string[], excludedCanonicalMapIds: readonly string[] = []): DraftMap[] {
  validateMapCatalog(catalog);
  const unavailable = new Set([...usedCanonicalMapIds, ...excludedCanonicalMapIds]);
  const seen = new Set<string>();
  const pool = catalog.entries.filter(map => {
    if (!map.active || unavailable.has(map.canonicalMapId) || seen.has(map.canonicalMapId)) return false;
    seen.add(map.canonicalMapId);
    return true;
  }).sort((left, right) => left.mapId.localeCompare(right.mapId));
  return pool.map(map => ({ ...map }));
}

export function createMapCandidates(input: CreateMapCandidatesInput): MapCandidateSnapshot {
  validateMapCatalog(input.catalog);
  requireDraft(input.resolutionId.trim(), 'RESOLUTION_ID_REQUIRED', '추첨 식별자가 필요합니다.');
  const pool = getEligibleDraftMaps(input.catalog, input.usedCanonicalMapIds, input.excludedCanonicalMapIds);
  requireDraft(pool.length > 0, 'MAP_POOL_EXHAUSTED', '미사용 맵이 없습니다. 풀 확장·재경기·내전 종료를 선택해 주세요.');
  const reason = input.diversityExceptionReason?.trim() || null;
  const random = new DraftRandom(input.entropy);
  let chosen: readonly DraftMap[];
  if (pool.length < 4) {
    requireDraft(input.remainingMapsConfirmed, 'REMAINING_MAPS_CONFIRMATION_REQUIRED', '남은 맵으로 진행할지 확인해 주세요.');
    requireDraft(hasDiversity(pool) || reason, 'MAP_DIVERSITY_REQUIRED', '이번 경기의 다양성 예외 사유가 필요합니다.');
    chosen = pool;
  } else {
    const combinations: DraftMap[][] = [];
    for (let i = 0; i < pool.length - 2; i++) {
      for (let j = i + 1; j < pool.length - 1; j++) {
        for (let k = j + 1; k < pool.length; k++) {
          const candidate = [pool[i], pool[j], pool[k]];
          if (hasDiversity(candidate) || reason) combinations.push(candidate);
        }
      }
    }
    requireDraft(combinations.length > 0, 'MAP_DIVERSITY_REQUIRED', '이번 경기의 다양성 예외 사유가 필요합니다.');
    chosen = random.pick(combinations);
  }
  const candidateIds = new Set(chosen.map(map => map.mapId));
  const candidates = chosen.map(map => ({ map: { ...map }, firstAttackTeam: firstAttackTeam(map, random) }));
  return {
    resolutionId: input.resolutionId,
    catalogVersion: input.catalog.approval.version,
    mapHistoryRevision: input.mapHistoryRevision,
    eligiblePool: pool.map(map => ({ ...map })),
    candidates,
    randomPool: pool.filter(map => !candidateIds.has(map.mapId)).map(map => ({ ...map })),
    remainingMapsConfirmed: pool.length < 4,
    diversityExceptionReason: reason,
    draws: random.draws,
  };
}

export interface MapResolution {
  resolutionId: string;
  method: 'LANDSLIDE' | 'WEIGHTED' | 'ALL_ABSTAINED' | 'POTG';
  selectedByDiscordId?: string;
  selectedOption: string | null;
  totals: Readonly<Record<string, number>>;
  map: DraftMap;
  firstAttackTeam: DraftTeam | null;
  draws: readonly number[];
  rollDurationMs?: number;
}

/** @description 저장된 추첨 연출 시간 뒤에 별도의 확정 맵 확인 4초를 보장하며 추첨 시간이 없는 결과도 동일하게 확인한다. */
export function getMapRevealDurationMs(result: MapResolution | null): number {
  return DRAFT_LIMITS.mapRevealMs + (result?.rollDurationMs ?? 0);
}

/** @description 봉인된 개인 표만 전달받아 6표 차이 또는 득표 비례 방식으로 결과를 계산한다. */
export function resolveMapVote(
  snapshot: MapCandidateSnapshot,
  ballots: readonly (string | null)[],
  expectedHistoryRevision: number,
  entropy: readonly number[],
): MapResolution {
  requireDraft(snapshot.mapHistoryRevision === expectedHistoryRevision,
    'MAP_HISTORY_OUTDATED', '맵 사용 이력이 변경되었습니다. 후보를 다시 준비해 주세요.');
  requireDraft(ballots.length === 10, 'BALLOT_COUNT', '봉인된 10명의 표가 필요합니다.');
  const options = snapshot.candidates.map(candidate => candidate.map.mapId);
  if (snapshot.randomPool.length > 0) options.push('RANDOM');
  const totals: Record<string, number> = Object.fromEntries(options.map(id => [id, 0]));
  for (const ballot of ballots) {
    if (ballot === null) continue;
    requireDraft(options.includes(ballot), 'INVALID_MAP_VOTE', '현재 후보가 아닌 맵에 투표할 수 없습니다.');
    totals[ballot]++;
  }
  const random = new DraftRandom(entropy);
  const ranked = [...options].sort((left, right) => totals[right] - totals[left]);
  const validCount = ballots.filter(ballot => ballot !== null).length;
  let selectedOption: string | null = null;
  let method: MapResolution['method'];
  let selectedMap: DraftMap;
  if (validCount === 0) {
    method = 'ALL_ABSTAINED';
    selectedMap = random.pick(snapshot.eligiblePool);
  } else {
    if (totals[ranked[0]] - (totals[ranked[1]] ?? 0) >= 6) {
      method = 'LANDSLIDE';
      selectedOption = ranked[0];
    } else {
      method = 'WEIGHTED';
      const ticket = random.index(validCount);
      let cumulative = 0;
      for (const option of options) {
        cumulative += totals[option];
        if (ticket < cumulative) { selectedOption = option; break; }
      }
    }
    selectedMap = selectedOption === 'RANDOM'
      ? random.pick(snapshot.randomPool)
      : snapshot.candidates.find(candidate => candidate.map.mapId === selectedOption)!.map;
  }
  const visible = snapshot.candidates.find(candidate => candidate.map.mapId === selectedMap.mapId);
  const startingTeam = visible ? visible.firstAttackTeam : firstAttackTeam(selectedMap, random);
  const needsRoll = (method === 'WEIGHTED' && options.filter(id => totals[id] > 0).length > 1)
    || (method === 'ALL_ABSTAINED' && snapshot.eligiblePool.length > 1);
  const rollDurationMs = needsRoll
    ? DRAFT_LIMITS.mapRollMinMs + random.index(DRAFT_LIMITS.mapRollMaxMs - DRAFT_LIMITS.mapRollMinMs + 1) : 0;
  return {
    resolutionId: snapshot.resolutionId,
    method,
    selectedOption,
    totals,
    map: { ...selectedMap },
    firstAttackTeam: startingTeam,
    rollDurationMs,
    draws: random.draws,
  };
}

/** @description 팟지 선택도 동일한 미사용 맵 풀에서 검증하고 호위·혼합의 첫 공격 진영은 기록 가능한 난수로 정한다. */
export function resolvePotgMap(input: {
  resolutionId: string; catalog: DraftCatalog<DraftMap>; usedCanonicalMapIds: readonly string[];
  mapId: string; pickerDiscordId: string; entropy: readonly number[];
}): MapResolution {
  const map = getEligibleDraftMaps(input.catalog, input.usedCanonicalMapIds).find(entry => entry.mapId === input.mapId);
  requireDraft(map, 'MAP_UNAVAILABLE', '사용했거나 선택할 수 없는 맵입니다.');
  const random = new DraftRandom(input.entropy);
  return { resolutionId: input.resolutionId, method: 'POTG', selectedOption: map.mapId, totals: {}, map,
    selectedByDiscordId: input.pickerDiscordId, firstAttackTeam: firstAttackTeam(map, random), draws: random.draws };
}
