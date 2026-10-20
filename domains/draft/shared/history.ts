import {
  DRAFT_LIMITS, requireDraft, type DraftActor, type DraftHero, type DraftMap, type DraftTeam,
  type PlayStatus, type DraftCatalog,
} from './model.js';
import { isDraftOperator, type DraftOperators } from './presence.js';
import { validateRetainedBans } from './heroes.js';
import { validateMapCatalog } from './catalog.js';

export interface MinimalDraftGame {
  gameId: string;
  roomId: string;
  roomExpiresAt: number;
  appliedAt: number;
  map: DraftMap;
  firstAttackTeam: DraftTeam | null;
  heroCatalogVersion: string;
  mapCatalogVersion: string;
  rulesVersion: string;
  bans: readonly DraftHero[];
  playStatus: PlayStatus;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface MapUsageValue {
  mapId: string;
  canonicalMapId: string;
  played: boolean;
}

export interface MapHistoryCorrection {
  correctionId: string;
  gameId: string;
  previousCorrectionId: string | null;
  actor: DraftActor;
  recordedAt: number;
  reason: string;
  before: MapUsageValue;
  after: MapUsageValue;
  revision: number;
}

export interface DraftHistory {
  draftSessionId: string;
  createdAt: number;
  expiresAt: number;
  activeRoomId: string | null;
  operators: DraftOperators;
  mapHistoryRevision: number;
  games: readonly MinimalDraftGame[];
  corrections: readonly MapHistoryCorrection[];
}

function usageValue(history: DraftHistory, game: MinimalDraftGame): MapUsageValue {
  const corrections = history.corrections.filter(correction => correction.gameId === game.gameId);
  const latest = corrections[corrections.length - 1];
  return latest ? { ...latest.after } : {
    mapId: game.map.mapId, canonicalMapId: game.map.canonicalMapId,
    played: game.startedAt !== null,
  };
}

export function getUsedDraftMapIds(history: DraftHistory): string[] {
  return [...new Set(history.games.map(game => usageValue(history, game))
    .filter(value => value.played).map(value => value.canonicalMapId))].sort();
}

export function validateHistoryMutation(history: DraftHistory, actor: DraftActor, expectedRevision: number, now: number): void {
  requireDraft(now < history.expiresAt, 'SESSION_EXPIRED', '내전 이력 보관 기간이 만료되었습니다.');
  requireDraft(isDraftOperator(history.operators, actor.discordId), 'OPERATOR_REQUIRED', '현재 내전 운영자만 이력을 변경할 수 있습니다.');
  requireDraft(expectedRevision === history.mapHistoryRevision, 'MAP_HISTORY_OUTDATED', '최신 맵 이력을 확인해 주세요.');
}

export function correctDraftMapHistory(input: {
  history: DraftHistory;
  actor: DraftActor;
  roomId: string;
  expectedRevision: number;
  correctionId: string;
  gameId: string;
  reason: string;
  after: MapUsageValue;
  catalog: DraftCatalog<DraftMap>;
  now: number;
}): DraftHistory {
  const { history, actor } = input;
  validateMapCatalog(input.catalog);
  validateHistoryMutation(history, actor, input.expectedRevision, input.now);
  requireDraft(history.activeRoomId === input.roomId, 'INACTIVE_ROOM', '현재 활성 방에서 이력을 정정해 주세요.');
  requireDraft(input.reason.trim() && input.correctionId.trim(), 'REASON_REQUIRED', '정정 식별자와 상세 사유가 필요합니다.');
  requireDraft(!history.corrections.some(correction => correction.correctionId === input.correctionId),
    'DUPLICATE_CORRECTION', '이미 기록된 정정입니다.');
  const game = history.games.find(entry => entry.gameId === input.gameId);
  requireDraft(game, 'GAME_NOT_FOUND', '기록된 경기만 정정할 수 있습니다.');
  requireDraft(input.catalog.entries.some(map => map.mapId === input.after.mapId
    && map.canonicalMapId === input.after.canonicalMapId), 'INVALID_MAP', '정정 맵의 식별자를 확인해 주세요.');
  const previous = history.corrections.filter(correction => correction.gameId === input.gameId).at(-1);
  return {
    ...history,
    mapHistoryRevision: history.mapHistoryRevision + 1,
    corrections: [...history.corrections, {
      correctionId: input.correctionId, gameId: input.gameId, previousCorrectionId: previous?.correctionId ?? null,
      actor: { ...actor }, recordedAt: input.now, reason: input.reason.trim(),
      before: usageValue(history, game), after: { ...input.after }, revision: history.mapHistoryRevision + 1,
    }],
  };
}

export interface DraftReplayPlan {
  draftSessionId: string;
  gameId: string;
  epoch: number;
  originalGameId: string;
  mapId: string;
  canonicalMapId: string;
  reason: string;
  approvedBy: DraftActor;
  firstAttackTeam: DraftTeam | null;
  banPolicy: 'REVOTE' | 'RETAIN';
  retainedHeroIds: readonly string[];
}

export function createDraftReplayPlan(input: {
  history: DraftHistory;
  actor: DraftActor;
  expectedRevision: number;
  roomId: string;
  gameId: string;
  epoch: number;
  originalGameId: string;
  targetMap: DraftMap;
  excludedCanonicalMapIds: readonly string[];
  reason: string;
  banPolicy: 'REVOTE' | 'RETAIN';
  heroCatalog: DraftCatalog<DraftHero>;
  swapSides: boolean;
  explicitFirstAttackTeam?: DraftTeam;
  now: number;
}): DraftReplayPlan {
  validateHistoryMutation(input.history, input.actor, input.expectedRevision, input.now);
  requireDraft(input.history.activeRoomId === input.roomId, 'INACTIVE_ROOM', '현재 활성 방에서 재경기를 만들어 주세요.');
  requireDraft(!input.history.games.some(game => game.playStatus === 'PLAYING'),
    'GAME_STILL_PLAYING', '진행 중인 실제 경기를 먼저 마무리해 주세요.');
  const original = input.history.games.find(game => game.gameId === input.originalGameId);
  requireDraft(original, 'GAME_NOT_FOUND', '원 경기 기록이 없습니다.');
  requireDraft(input.gameId.trim() && !input.history.games.some(game => game.gameId === input.gameId)
    && Number.isSafeInteger(input.epoch) && input.epoch > 0,
  'INVALID_REPLAY_TARGET', '재경기는 새 경기와 세대에만 생성할 수 있습니다.');
  const currentUsage = usageValue(input.history, original);
  requireDraft(currentUsage.played, 'GAME_NOT_PLAYED', '실제 플레이 기록이 있는 경기를 선택해 주세요.');
  requireDraft(input.targetMap.active && input.targetMap.canonicalMapId === currentUsage.canonicalMapId
    && !input.excludedCanonicalMapIds.includes(input.targetMap.canonicalMapId),
  'INVALID_REPLAY_MAP', '원 경기와 같은 승인된 활성 맵을 선택해 주세요.');
  requireDraft(input.reason.trim(), 'REASON_REQUIRED', '재경기 상세 사유가 필요합니다.');
  const hasSides = input.targetMap.mode === 'ESCORT' || input.targetMap.mode === 'HYBRID';
  let firstAttackTeam = hasSides ? original.firstAttackTeam ?? input.explicitFirstAttackTeam : null;
  requireDraft(!hasSides || firstAttackTeam, 'REPLAY_SIDE_REQUIRED', '원 경기 진영이 없으므로 진영과 사유를 명시해 주세요.');
  if (hasSides && input.swapSides) firstAttackTeam = firstAttackTeam === 'A' ? 'B' : 'A';
  const retainedHeroIds = input.banPolicy === 'RETAIN' ? original.bans.map(hero => hero.heroId) : [];
  if (input.banPolicy === 'RETAIN') validateRetainedBans(input.heroCatalog, retainedHeroIds);
  return {
    draftSessionId: input.history.draftSessionId, gameId: input.gameId, epoch: input.epoch,
    originalGameId: original.gameId, mapId: input.targetMap.mapId, canonicalMapId: input.targetMap.canonicalMapId,
    reason: input.reason.trim(), approvedBy: { ...input.actor }, firstAttackTeam: firstAttackTeam ?? null,
    banPolicy: input.banPolicy, retainedHeroIds,
  };
}

export function canUseDraftMap(input: {
  history: DraftHistory;
  map: DraftMap;
  excludedCanonicalMapIds: readonly string[];
  gameId: string;
  epoch: number;
  replay: DraftReplayPlan | null;
}): boolean {
  if (!input.map.active || input.excludedCanonicalMapIds.includes(input.map.canonicalMapId)) return false;
  if (!getUsedDraftMapIds(input.history).includes(input.map.canonicalMapId)) return true;
  const replay = input.replay;
  return replay !== null && replay.draftSessionId === input.history.draftSessionId
    && replay.gameId === input.gameId && replay.epoch === input.epoch
    && replay.mapId === input.map.mapId && replay.canonicalMapId === input.map.canonicalMapId
    && input.history.games.some(game => game.gameId === replay.originalGameId);
}

export function createDraftHistory(id: string, ownerId: string, now: number): DraftHistory {
  requireDraft(id.trim() && ownerId.trim() && Number.isSafeInteger(now), 'INVALID_SESSION', '내전 식별자와 소유자·시각을 확인해 주세요.');
  return {
    draftSessionId: id, createdAt: now, expiresAt: now + DRAFT_LIMITS.sessionLifetimeMs,
    activeRoomId: null, operators: { ownerId, coOperatorId: null, operatorRevision: 0 },
    mapHistoryRevision: 0, games: [], corrections: [],
  };
}
