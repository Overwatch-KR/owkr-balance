import { randomBytes, randomUUID, randomInt } from 'node:crypto';
import {
  applyBallotCommand, createDraftHistory, createMapCandidates, DEFAULT_DRAFT_TIMINGS, DRAFT_RULES_VERSION, DRAFT_LIMITS,
  getDraftRoomExpiry, getOperatorParticipantStatuses, getDraftStartBlockers, hasConnectedOperator,
  isConnectionAlive, isDraftOperator, pauseDraftTimer, projectDraftBallots, requireDraft,
  getUsedDraftMapIds, getEligibleDraftMaps, resolvePotgMap, resolveHeroBans, resolveMapVote, resumeDraftTimer, sealBallotStage, validateDraftSource,
  type BallotKind, type DraftCatalog, type DraftConnection, type DraftHero,
  type DraftMap, type DraftParticipant, type ParticipantProgress,
  type DraftRoomSnapshot,
} from '../../domains/draft/shared/public.js';
import type { DraftRoomRecord, RealtimeStore, RoomBundle, StoreGuard } from './model.js';
import type { DraftTicket } from './tickets.js';
import { getLastDraftActivityAt } from './room-lifecycle.js';

export interface ConnectedDraftClient extends DraftConnection {
  roomCode: string;
  displayName: string;
  input: boolean;
}

export interface DraftCommand {
  commandId: string;
  type: 'ready.set' | 'draft.start' | 'draft.pause' | 'draft.resume' | 'draft.restart'
    | 'map.configure' | 'map.pick' | 'ballot.save' | 'ballot.lock' | 'game.confirmApplied' | 'game.markStarted'
    | 'game.markFinished' | 'game.markAborted' | 'game.markNotPlayed' | 'game.next' | 'room.close';
  epoch: number;
  expectedRevision: number;
  expectedBallotRevision: number;
  selection: string[];
  ready: boolean;
  mapMode: 'VOTE' | 'POTG';
  pickerDiscordId: string | null;
  mapId: string;
  reason: string;
  remainingMapsConfirmed: boolean;
  diversityExceptionReason: string;
}

export function parseDraftCommand(value: unknown): DraftCommand {
  requireDraft(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_COMMAND', '명령 형식을 확인해 주세요.');
  const raw = value as Record<string, unknown>;
  const types: readonly string[] = ['ready.set', 'draft.start', 'draft.pause', 'draft.resume', 'draft.restart',
    'map.configure', 'map.pick', 'ballot.save', 'ballot.lock', 'game.confirmApplied', 'game.markStarted', 'game.markFinished',
    'game.markAborted', 'game.markNotPlayed', 'game.next', 'room.close'];
  requireDraft(typeof raw.commandId === 'string' && /^[\w-]{1,128}$/.test(raw.commandId)
    && typeof raw.type === 'string' && types.includes(raw.type)
    && Number.isSafeInteger(raw.epoch) && Number(raw.epoch) > 0,
  'INVALID_COMMAND', '명령 식별자·종류·경기 세대를 확인해 주세요.');
  if (raw.selection !== undefined) requireDraft(Array.isArray(raw.selection) && raw.selection.length <= 3
    && raw.selection.every(id => typeof id === 'string' && id.length <= 100), 'INVALID_SELECTION', '선택 형식을 확인해 주세요.');
  if (raw.type === 'ballot.save' || raw.type === 'ballot.lock') {
    requireDraft(Array.isArray(raw.selection) && Number.isSafeInteger(raw.expectedBallotRevision), 'INVALID_COMMAND', '최종 선택 전체와 표 순번이 필요합니다.');
  } else requireDraft(Number.isSafeInteger(raw.expectedRevision), 'INVALID_COMMAND', '기대 방 순번이 필요합니다.');
  requireDraft(raw.reason === undefined || (typeof raw.reason === 'string' && raw.reason.length <= 500), 'INVALID_REASON', '사유는 500자 이내로 입력해 주세요.');
  requireDraft(raw.diversityExceptionReason === undefined || (typeof raw.diversityExceptionReason === 'string'
    && raw.diversityExceptionReason.length <= 500), 'INVALID_REASON', '다양성 예외 사유를 확인해 주세요.');
  if (raw.type === 'map.configure') {
    requireDraft(raw.mapMode === 'VOTE' || raw.mapMode === 'POTG', 'INVALID_MAP_MODE', '맵 선정 방식을 확인해 주세요.');
    requireDraft(raw.mapMode === 'VOTE' || (typeof raw.pickerDiscordId === 'string' && /^\d{17,20}$/.test(raw.pickerDiscordId)),
      'INVALID_PICKER', '팟지 선수를 지정해 주세요.');
  }
  if (raw.type === 'map.pick') requireDraft(typeof raw.mapId === 'string' && raw.mapId.length > 0 && raw.mapId.length <= 100,
    'INVALID_MAP', '선택한 맵을 확인해 주세요.');
  return {
    commandId: raw.commandId, type: raw.type as DraftCommand['type'], epoch: raw.epoch as number,
    expectedRevision: Number(raw.expectedRevision ?? -1), expectedBallotRevision: Number(raw.expectedBallotRevision ?? -1),
    mapMode: raw.mapMode === 'POTG' ? 'POTG' : 'VOTE', pickerDiscordId: typeof raw.pickerDiscordId === 'string' ? raw.pickerDiscordId : null,
    mapId: typeof raw.mapId === 'string' ? raw.mapId : '',
    selection: (raw.selection as string[] | undefined) ?? [], ready: raw.ready === true,
    reason: (raw.reason as string | undefined)?.trim() ?? '', remainingMapsConfirmed: raw.remainingMapsConfirmed === true,
    diversityExceptionReason: (raw.diversityExceptionReason as string | undefined)?.trim() ?? '',
  };
}

function entropy(): number[] {
  return Array.from({ length: 512 }, () => randomInt(0x100000000) / 0x100000000);
}

function roster(room: DraftRoomRecord): readonly DraftParticipant[] {
  return room.fixedRoster ?? room.source.participants;
}

function emptyProgress(participants: readonly DraftParticipant[]): ParticipantProgress[] {
  return participants.map(player => ({ discordId: player.discordId, ready: false, confirmed: false }));
}

export class DraftEngine {
  readonly clients = new Map<string, ConnectedDraftClient>();
  private chain: Promise<unknown> = Promise.resolve();
  private recoveryUntilByRoom = new Map<string, number>();
  private closedRooms = new Set<string>();
  constructor(
    readonly store: RealtimeStore,
    private readonly catalogs: { maps: DraftCatalog<DraftMap>; heroes: DraftCatalog<DraftHero> },
  ) {}

  serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.chain.then(work);
    this.chain = result.catch(() => undefined);
    return result;
  }

  async createRoom(ticket: DraftTicket, sourceId: string, commandId: string): Promise<string> {
    requireDraft(ticket.purpose === 'admin-entry' && ticket.scope === 'create', 'OPERATOR_REQUIRED', '방 생성용 운영자 입장권이 필요합니다.');
    requireDraft(/^[A-Z2-9]{10}$/.test(sourceId) && /^[\w-]{1,128}$/.test(commandId), 'INVALID_COMMAND', '원본 코드와 요청 식별자를 확인해 주세요.');
    const previous = await this.store.findCreate(ticket.sub, commandId, sourceId);
    if (previous) { await this.requireRoom(previous); return previous; }
    const { source, raw, now } = await this.store.readSource(sourceId);
    requireDraft(source && raw, 'SOURCE_EXPIRED', '유효한 원본 공동 작업이 필요합니다.');
    validateDraftSource(source, source, now);
    const history = createDraftHistory(randomUUID(), ticket.sub, now);
    const code = Array.from(randomBytes(10), byte => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte % 32]).join('');
    const expiresAt = getDraftRoomExpiry(now, source.expiresAt, history.expiresAt);
    history.activeRoomId = code;
    const room: DraftRoomRecord = {
      roomCode: code, draftSessionId: history.draftSessionId, createdAt: now, lastActivityAt: now, expiresAt, revision: 0,
      source, fixedRoster: null, gameId: randomUUID(), gameIndex: 1, epoch: 1, phase: 'LOBBY',
      timer: { phase: 'LOBBY', status: 'ACTIVE', deadlineAt: null, remainingMs: null, expiresAt, epoch: 1 },
      progress: emptyProgress(source.participants), presenceHistory: [], mapCatalog: structuredClone(this.catalogs.maps),
      heroCatalog: structuredClone(this.catalogs.heroes), candidates: null, mapResult: null, heroResult: null,
      mapSelection: { mode: 'VOTE', pickerDiscordId: null },
      stage: null, receipts: [], audit: [],
    };
    return this.store.create(room, history, raw, commandId);
  }

  async connect(ticket: DraftTicket, connectionId: string): Promise<string[]> {
    requireDraft(ticket.scope === 'join' && ticket.roomCode, 'ROOM_ACCESS_DENIED', '방 입장용 입장권이 필요합니다.');
    const bundle = await this.requireRoom(ticket.roomCode);
    const { room, history } = bundle;
    requireDraft(isDraftOperator(history.operators, ticket.sub)
      || bundle.source?.participants.some(player => player.discordId === ticket.sub), 'ROOM_ACCESS_DENIED', '현재 방 명단에 없습니다.');
    const roomClients = [...this.clients.values()].filter(client => client.roomCode === room.roomCode && !client.closed);
    const replaced = roomClients.filter(client => client.discordId === ticket.sub && client.connectionId !== connectionId);
    requireDraft(roomClients.length - replaced.length < 24, 'CONNECTION_LIMIT', '방 연결 상한에 도달했습니다.');
    const now = bundle.now;
    this.clients.set(connectionId, {
      discordId: ticket.sub, displayName: ticket.displayName, connectionId, lastResponseAt: now,
      authExpiresAt: ticket.exp * 1000, closed: false, roomCode: room.roomCode, input: true,
    });
    const previous = room.presenceHistory.find(entry => entry.discordId === ticket.sub);
    room.presenceHistory = [...room.presenceHistory.filter(entry => entry.discordId !== ticket.sub), {
      discordId: ticket.sub, lastJoinedAt: now, lastDisconnectedAt: previous?.lastDisconnectedAt ?? null,
    }];
    try { await this.save(bundle); }
    catch (error) { this.clients.delete(connectionId); throw error; }
    for (const client of replaced) this.clients.delete(client.connectionId);
    return replaced.map(client => client.connectionId);
  }

  async renew(ticket: DraftTicket, connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    requireDraft(client && ticket.sub === client.discordId && ticket.roomCode === client.roomCode,
      'INVALID_TICKET', '같은 사용자와 방의 입장권으로 갱신해 주세요.');
    const bundle = await this.requireRoom(client.roomCode);
    requireDraft(isDraftOperator(bundle.history.operators, client.discordId)
      || bundle.source?.participants.some(player => player.discordId === client.discordId), 'ROOM_ACCESS_DENIED', '현재 방 권한이 없습니다.');
    client.authExpiresAt = ticket.exp * 1000;
  }

  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) return;
    this.clients.delete(connectionId);
    const bundle = await this.store.load(client.roomCode);
    if (!bundle || bundle.room.timer.status === 'CANCELLED') return;
    const live = this.roomConnections(client.roomCode).filter(item => item.discordId === client.discordId && isConnectionAlive(item, bundle.now));
    if (live.length === 0) {
      bundle.room.presenceHistory = bundle.room.presenceHistory.map(entry => entry.discordId === client.discordId
        ? { ...entry, lastDisconnectedAt: bundle.now } : entry);
    }
    if (!hasConnectedOperator(bundle.history.operators, this.roomConnections(client.roomCode), bundle.now)
      && bundle.room.phase !== 'LOBBY' && bundle.room.phase !== 'COMPLETED') {
      bundle.room.timer = pauseDraftTimer(bundle.room.timer, bundle.now);
      if (bundle.room.stage?.status === 'OPEN') bundle.room.stage.status = 'PAUSED';
    }
    await this.save(bundle);
  }

  private roomConnections(code: string): ConnectedDraftClient[] {
    return [...this.clients.values()].filter(client => client.roomCode === code);
  }

  private inputConnections(code: string, now: number): Record<string, string> {
    return Object.fromEntries(this.roomConnections(code).filter(client => client.input && isConnectionAlive(client, now))
      .map(client => [client.discordId, client.connectionId]));
  }

  async requireRoom(code: string, allowClosed = false): Promise<RoomBundle> {
    const bundle = await this.store.load(code);
    requireDraft(bundle && bundle.room.expiresAt > bundle.now && bundle.history.expiresAt > bundle.now,
      'ROOM_EXPIRED', '방이 없거나 만료되었습니다.');
    await this.closeIfIdle(bundle);
    requireDraft(allowClosed || bundle.room.timer.status !== 'CANCELLED', 'ROOM_CLOSED', '종료된 내전입니다. 운영자에게 새 공유 링크를 요청해 주세요.');
    requireDraft((allowClosed && bundle.room.timer.status === 'CANCELLED') || bundle.history.activeRoomId === code, 'INACTIVE_ROOM', '현재 활성 방이 아닙니다.');
    bundle.room.mapSelection ??= { mode: 'VOTE', pickerDiscordId: null };
    return bundle;
  }

  drainClosedRooms(): string[] {
    const codes = [...this.closedRooms]; this.closedRooms.clear(); return codes;
  }

  private async closeIfIdle(bundle: RoomBundle): Promise<boolean> {
    const { room, history, now } = bundle;
    if (room.timer.status === 'CANCELLED') return true;
    if (now < getLastDraftActivityAt(room) + DRAFT_LIMITS.roomIdleMs) return false;
    const expectedHistoryRevision = history.mapHistoryRevision;
    room.timer = { ...room.timer, status: 'CANCELLED', deadlineAt: null, remainingMs: null };
    if (room.stage?.status === 'OPEN') room.stage.status = 'PAUSED';
    history.activeRoomId = null; history.mapHistoryRevision++;
    room.audit = [...room.audit, { actorId: 'system', action: 'room.close.idle', at: now,
      reason: '2시간 이상 사용자 조작 없음', revision: room.revision + 1 }];
    await this.save(bundle, { expectedHistoryRevision, idleForMs: DRAFT_LIMITS.roomIdleMs });
    this.closedRooms.add(room.roomCode);
    return true;
  }

  private async save(bundle: RoomBundle, extra: Partial<StoreGuard> = {}): Promise<void> {
    const guard: StoreGuard = { expectedRoomRevision: bundle.room.revision, expectedHistoryRevision: bundle.history.mapHistoryRevision, ...extra };
    bundle.room.revision++;
    await this.store.commit(bundle, guard);
  }

  private newStage(room: DraftRoomRecord, kind: BallotKind, now: number): void {
    const seconds = kind === 'MAP' ? DEFAULT_DRAFT_TIMINGS.mapVotingSeconds
      : DEFAULT_DRAFT_TIMINGS.heroVotingSeconds;
    room.phase = kind === 'MAP' ? 'MAP_VOTING' : 'HERO_VOTING';
    const deadlineAt = now + seconds * 1000;
    room.stage = {
      roomId: room.roomCode, gameId: room.gameId, epoch: room.epoch, kind, status: 'OPEN', deadlineAt,
      expiresAt: room.expiresAt, receipts: [], sealed: null, inputConnections: {},
      allowedIds: kind === 'MAP' ? [
        ...room.candidates!.candidates.map(candidate => candidate.map.mapId),
        ...(room.candidates!.randomPool.length ? ['RANDOM'] : []),
      ] : room.heroCatalog.entries.filter(hero => hero.active).map(hero => hero.heroId),
      ballots: roster(room).map(player => ({ discordId: player.discordId, ballotRevision: 0, selection: [], locked: false })),
    };
    room.timer = { phase: room.phase, status: 'ACTIVE', deadlineAt, remainingMs: null, expiresAt: room.expiresAt, epoch: room.epoch };
  }

  async command(connectionId: string, command: DraftCommand): Promise<{ revision: number; duplicate: boolean; ballotRevision?: number; acceptedAt?: number }> {
    const client = this.clients.get(connectionId);
    requireDraft(client && !client.closed, 'AUTH_REQUIRED', '먼저 방에 연결해 주세요.');
    const bundle = await this.requireRoom(client.roomCode, command.type === 'room.close');
    const { room, history, now } = bundle;
    requireDraft(isConnectionAlive(client, now), 'AUTH_EXPIRED', '입장권 또는 연결을 갱신해 주세요.');
    const participant = bundle.source?.participants.find(player => player.discordId === client.discordId);
    const operator = isDraftOperator(history.operators, client.discordId);
    requireDraft(operator || participant, 'ROOM_ACCESS_DENIED', '현재 명단 또는 운영 권한을 확인해 주세요.');
    const ballotCommand = command.type === 'ballot.save' || command.type === 'ballot.lock';
    if (ballotCommand) {
      requireDraft(command.epoch === room.epoch, 'STALE_STAGE', '경기 세대가 변경되었습니다.');
      validateDraftSource(bundle.source, room.source, now);
      requireDraft(participant && room.stage && room.timer.status === 'ACTIVE', 'BALLOT_CLOSED', '현재 입력할 수 있는 투표가 없습니다.');
      room.stage.inputConnections = this.inputConnections(room.roomCode, now);
      const result = applyBallotCommand(room.stage, {
        commandId: command.commandId, roomId: room.roomCode, gameId: room.gameId, epoch: command.epoch,
        kind: room.stage.kind, expectedBallotRevision: command.expectedBallotRevision,
        selection: command.selection, lock: command.type === 'ballot.lock',
      }, client, now);
      if (result.duplicate) return { revision: room.revision, duplicate: true,
        ballotRevision: result.receipt.ballot.ballotRevision, acceptedAt: result.receipt.acceptedAt };
      room.stage = result.stage;
      room.lastActivityAt = -1;
      room.stage.receipts[room.stage.receipts.length - 1].acceptedAt = -1;
      // 최종 표 저장과 10인 확정 봉인을 같은 commit 안에 넣는다.
      if (room.stage.ballots.every(ballot => ballot.locked)) {
        room.stage = sealBallotStage(room.stage, `${room.gameId}:${room.epoch}:${room.stage.kind}`, now, entropy());
        room.stage.sealed!.sealedAt = -1;
      }
      await this.save(bundle, { acceptBefore: room.stage.deadlineAt, authExpiresAt: client.authExpiresAt,
        expectedSourceRaw: bundle.sourceRaw! });
      const accepted = bundle.room.stage!.receipts.at(-1)!;
      return { revision: bundle.room.revision, duplicate: false,
        ballotRevision: accepted.ballot.ballotRevision, acceptedAt: accepted.acceptedAt };
    }
    requireDraft(command.type === 'ready.set' || command.type === 'map.pick' ? participant && client.input : operator,
      'OPERATOR_REQUIRED', '이 작업을 수행할 권한이 없습니다.');
    const body = JSON.stringify(command);
    const receipt = room.receipts.find(item => item.actorId === client.discordId && item.commandId === command.commandId);
    if (receipt) {
      requireDraft(receipt.body === body, 'COMMAND_REUSED', '같은 식별자를 다른 명령에 사용할 수 없습니다.');
      return { revision: receipt.revision, duplicate: true };
    }
    requireDraft(command.epoch === room.epoch, 'STALE_STAGE', '경기 세대가 변경되었습니다.');
    requireDraft(room.timer.status !== 'CANCELLED', 'ROOM_CLOSED', '종료된 내전입니다.');
    requireDraft(command.expectedRevision === room.revision, 'CONFLICT', '최신 방 상태로 다시 실행해 주세요.');
    requireDraft(room.receipts.length < 2000, 'COMMAND_LIMIT', '방의 명령 한도에 도달했습니다.');
    const guard: Partial<StoreGuard> = { authExpiresAt: client.authExpiresAt };
    if (command.type === 'room.close') {
      requireDraft(command.reason, 'REASON_REQUIRED', '방을 종료할 사유가 필요합니다.');
      requireDraft(!history.games.some(game => game.playStatus === 'PLAYING'), 'GAME_NOT_CLOSED', '진행 중인 경기의 종료 또는 중단을 먼저 기록해 주세요.');
      room.timer = { ...room.timer, status: 'CANCELLED', deadlineAt: null, remainingMs: null };
      if (room.stage?.status === 'OPEN') room.stage.status = 'PAUSED';
      guard.expectedHistoryRevision = history.mapHistoryRevision;
      history.activeRoomId = null; history.mapHistoryRevision++;
    } else if (command.type === 'map.configure') {
      requireDraft(room.phase === 'LOBBY' && room.timer.status === 'ACTIVE', 'INVALID_PHASE', '준비 단계에서만 맵 방식을 바꿀 수 있습니다.');
      validateDraftSource(bundle.source, room.source, now);
      requireDraft(command.mapMode === 'VOTE' || roster(room).some(player => player.discordId === command.pickerDiscordId),
        'INVALID_PICKER', '현재 명단의 참가자만 팟지 선수로 지정할 수 있습니다.');
      room.mapSelection = { mode: command.mapMode, pickerDiscordId: command.mapMode === 'POTG' ? command.pickerDiscordId : null };
      this.reset(room);
      guard.expectedSourceRaw = bundle.sourceRaw!;
    } else if (command.type === 'map.pick') {
      requireDraft(room.phase === 'MAP_PICKING' && room.timer.status === 'ACTIVE' && room.mapSelection.mode === 'POTG',
        'INVALID_PHASE', '팟지 맵 선택 단계에서만 확정할 수 있습니다.');
      requireDraft(client.discordId === room.mapSelection.pickerDiscordId, 'PICKER_REQUIRED', '지정된 팟지 선수만 맵을 확정할 수 있습니다.');
      validateDraftSource(bundle.source, room.source, now);
      room.mapResult = resolvePotgMap({ resolutionId: `${room.gameId}:${room.epoch}:POTG`, catalog: room.mapCatalog,
        usedCanonicalMapIds: this.usedMaps(bundle), mapId: command.mapId, pickerDiscordId: client.discordId, entropy: entropy() });
      room.phase = 'MAP_RESOLVED'; room.timer = { ...room.timer, phase: room.phase, deadlineAt: -1 };
      guard.expectedSourceRaw = bundle.sourceRaw!;
    } else if (command.type === 'ready.set') {
      validateDraftSource(bundle.source, room.source, now);
      requireDraft(room.phase === 'LOBBY' && room.timer.status === 'ACTIVE', 'INVALID_PHASE', '준비 단계에서만 준비를 변경할 수 있습니다.');
      room.progress = room.progress.map(item => item.discordId === client.discordId ? { ...item, ready: command.ready } : item);
    } else if (command.type === 'draft.start') {
      requireDraft(room.phase === 'LOBBY' && room.timer.status === 'ACTIVE', 'INVALID_PHASE', '준비 단계에서만 시작할 수 있습니다.');
      validateDraftSource(bundle.source, room.source, now);
      requireDraft(bundle.sourceRaw, 'SOURCE_OUTDATED', '원본을 다시 확인해 주세요.');
      requireDraft(hasConnectedOperator(history.operators, this.roomConnections(room.roomCode), now), 'OPERATOR_DISCONNECTED', '운영자 연결이 필요합니다.');
      const statuses = this.statuses(bundle, client.discordId);
      const blockers = getDraftStartBlockers(statuses);
      requireDraft(!blockers.disconnected.length && !blockers.inputRequired.length && !blockers.notReady.length,
        'PARTICIPANTS_NOT_READY', `미접속: ${blockers.disconnected.join(', ') || '없음'} / 입력 연결 필요: ${blockers.inputRequired.join(', ') || '없음'} / 미준비: ${blockers.notReady.join(', ') || '없음'}`);
      room.fixedRoster = structuredClone(bundle.source.participants);
      if (room.mapSelection.mode === 'POTG') {
        requireDraft(roster(room).some(player => player.discordId === room.mapSelection.pickerDiscordId), 'INVALID_PICKER', '팟지 선수를 다시 지정해 주세요.');
        requireDraft(getEligibleDraftMaps(room.mapCatalog, this.usedMaps(bundle)).length > 0, 'MAP_POOL_EXHAUSTED', '미사용 맵이 없습니다.');
        room.phase = 'MAP_PICKING'; room.stage = null;
        room.timer = { ...room.timer, phase: room.phase, deadlineAt: null, remainingMs: null };
      } else {
        room.candidates = createMapCandidates({
          resolutionId: `${room.gameId}:${room.epoch}:MAP`, catalog: room.mapCatalog,
          usedCanonicalMapIds: this.usedMaps(bundle), excludedCanonicalMapIds: [], mapHistoryRevision: history.mapHistoryRevision,
          remainingMapsConfirmed: command.remainingMapsConfirmed, diversityExceptionReason: command.diversityExceptionReason, entropy: entropy(),
        });
        this.newStage(room, 'MAP', now);
      }
      guard.expectedSourceRaw = bundle.sourceRaw;
    } else if (command.type === 'draft.pause') {
      requireDraft(command.reason, 'REASON_REQUIRED', '정지 사유를 입력해 주세요.');
      room.timer = pauseDraftTimer(room.timer, now);
      if (room.stage?.status === 'OPEN') room.stage.status = 'PAUSED';
    } else if (command.type === 'draft.resume') {
      room.timer = resumeDraftTimer(room.timer, now);
      if (room.stage?.status === 'PAUSED') {
        room.stage.status = 'OPEN'; room.stage.deadlineAt = room.timer.deadlineAt!;
      }
    } else if (command.type === 'draft.restart') {
      requireDraft(command.reason, 'REASON_REQUIRED', '다시 준비할 사유가 필요합니다.');
      requireDraft(!history.games.some(game => game.gameId === room.gameId), 'GAME_ALREADY_APPLIED', '게임 설정 적용 이후에는 실제 경기 기록을 먼저 마무리해 주세요.');
      validateDraftSource(bundle.source, bundle.source ?? room.source, now);
      room.source = structuredClone(bundle.source);
      this.reset(room);
      guard.expectedSourceRaw = bundle.sourceRaw!;
    } else if (command.type === 'game.confirmApplied') {
      validateDraftSource(bundle.source, room.source, now);
      requireDraft(room.phase === 'HERO_RESOLVED' && room.mapResult && room.heroResult && room.timer.status === 'ACTIVE',
        'INVALID_PHASE', '확정된 맵과 밴이 필요합니다.');
      requireDraft(!history.games.some(game => game.gameId === room.gameId), 'GAME_ALREADY_APPLIED', '이미 설정 적용을 확인했습니다.');
      history.games = [...history.games, {
        gameId: room.gameId, roomId: room.roomCode, roomExpiresAt: room.expiresAt, appliedAt: -1,
        map: structuredClone(room.mapResult.map), firstAttackTeam: room.mapResult.firstAttackTeam,
        heroCatalogVersion: room.heroCatalog.approval.version, mapCatalogVersion: room.mapCatalog.approval.version,
        mapSelection: structuredClone(room.mapSelection),
        rulesVersion: DRAFT_RULES_VERSION, bans: room.heroResult.bannedHeroIds.map(id => ({ ...room.heroCatalog.entries.find(hero => hero.heroId === id)! })),
        playStatus: 'NOT_STARTED', startedAt: null, finishedAt: null,
      }];
      room.phase = 'COMPLETED'; room.timer = { ...room.timer, phase: 'COMPLETED', deadlineAt: null };
    } else if (command.type === 'game.next') {
      const game = history.games.find(game => game.gameId === room.gameId);
      requireDraft(game && ['FINISHED', 'ABORTED_PLAYED', 'NOT_PLAYED'].includes(game.playStatus), 'GAME_NOT_CLOSED', '실제 경기 기록을 먼저 마무리해 주세요.');
      validateDraftSource(bundle.source, bundle.source ?? room.source, now);
      room.source = structuredClone(bundle.source); room.gameId = randomUUID(); room.gameIndex++;
      this.reset(room); guard.expectedSourceRaw = bundle.sourceRaw!;
    } else {
      const game = history.games.find(game => game.gameId === room.gameId);
      requireDraft(game, 'GAME_NOT_APPLIED', '게임 설정 적용 확인이 필요합니다.');
      if (command.type === 'game.markStarted') {
        requireDraft(game.playStatus === 'NOT_STARTED' && room.timer.status === 'ACTIVE', 'INVALID_PLAY_STATUS', '시작할 수 있는 경기인지 확인해 주세요.');
        validateDraftSource(bundle.source, room.source, now);
        requireDraft(!this.usedMaps(bundle).includes(game.map.canonicalMapId), 'MAP_ALREADY_USED', '이미 사용한 맵은 일반 경기에서 시작할 수 없습니다.');
        requireDraft(hasConnectedOperator(history.operators, this.roomConnections(room.roomCode), now), 'OPERATOR_DISCONNECTED', '운영자 연결이 필요합니다.');
        game.playStatus = 'PLAYING'; game.startedAt = -1; guard.expectedSourceRaw = bundle.sourceRaw!;
      } else if (command.type === 'game.markNotPlayed') {
        requireDraft(game.playStatus === 'NOT_STARTED', 'INVALID_PLAY_STATUS', '플레이한 경기는 미진행으로 바꿀 수 없습니다.');
        game.playStatus = 'NOT_PLAYED'; game.finishedAt = -1;
      } else {
        requireDraft(game.playStatus === 'PLAYING', 'INVALID_PLAY_STATUS', '실제 시작을 먼저 기록해 주세요.');
        game.playStatus = command.type === 'game.markFinished' ? 'FINISHED' : 'ABORTED_PLAYED'; game.finishedAt = -1;
      }
      guard.expectedHistoryRevision = history.mapHistoryRevision;
      history.mapHistoryRevision++;
    }
    room.receipts = [...room.receipts, { actorId: client.discordId, commandId: command.commandId, body, revision: room.revision + 1 }];
    room.audit = [...room.audit, { actorId: client.discordId, action: command.type, at: now, reason: command.reason, revision: room.revision + 1 }];
    room.lastActivityAt = -1;
    await this.save(bundle, guard);
    return { revision: room.revision, duplicate: false };
  }

  private usedMaps(bundle: RoomBundle): string[] {
    return getUsedDraftMapIds(bundle.history);
  }

  private reset(room: DraftRoomRecord): void {
    room.epoch++; room.phase = 'LOBBY'; room.fixedRoster = null;
    room.stage = null; room.candidates = null; room.mapResult = null; room.heroResult = null;
    room.progress = emptyProgress(room.source.participants);
    room.timer = { phase: 'LOBBY', status: 'ACTIVE', deadlineAt: null, remainingMs: null, expiresAt: room.expiresAt, epoch: room.epoch };
  }

  private statuses(bundle: RoomBundle, viewerId: string) {
    return getOperatorParticipantStatuses({ viewerId, operators: bundle.history.operators, participants: roster(bundle.room),
      connections: this.roomConnections(bundle.room.roomCode), inputConnections: this.inputConnections(bundle.room.roomCode, bundle.now),
      history: bundle.room.presenceHistory, progress: this.progress(bundle.room), now: bundle.now,
      recoveryUntil: this.recoveryUntilByRoom.get(bundle.room.roomCode) ?? null, viewerConnected: true });
  }

  private progress(room: DraftRoomRecord): ParticipantProgress[] {
    return roster(room).map(player => ({ discordId: player.discordId,
      ready: room.progress.find(entry => entry.discordId === player.discordId)?.ready ?? false,
      confirmed: room.stage?.ballots.find(ballot => ballot.discordId === player.discordId)?.locked ?? false,
    }));
  }

  async snapshot(connectionId: string, currentBundle?: RoomBundle): Promise<DraftRoomSnapshot> {
    const client = this.clients.get(connectionId);
    requireDraft(client, 'AUTH_EXPIRED', '연결이 만료되었습니다.');
    const bundle = currentBundle ?? await this.requireRoom(client.roomCode);
    requireDraft(bundle.room.roomCode === client.roomCode, 'ROOM_ACCESS_DENIED', '현재 방 상태가 아닙니다.');
    requireDraft(isConnectionAlive(client, bundle.now), 'AUTH_EXPIRED', '연결이 만료되었습니다.');
    const { room, history } = bundle;
    const operator = isDraftOperator(history.operators, client.discordId);
    requireDraft(operator || bundle.source?.participants.some(player => player.discordId === client.discordId), 'ROOM_ACCESS_DENIED', '현재 방 명단에 없습니다.');
    return {
      roomCode: room.roomCode, gameId: room.gameId, gameIndex: room.gameIndex, epoch: room.epoch,
      roomRevision: room.revision, expiresAt: room.expiresAt, phase: room.phase, timer: room.timer,
      selfDiscordId: client.discordId, isOperator: operator,
      ...(operator ? { sourceId: room.source.sourceId } : {}),
      selfReady: room.progress.find(item => item.discordId === client.discordId)?.ready ?? false,
      readyCount: room.progress.filter(item => item.ready).length,
      availableMapCount: new Set(room.mapCatalog.entries.filter(map => map.active
        && !this.usedMaps(bundle).includes(map.canonicalMapId)).map(map => map.canonicalMapId)).size,
      availableMaps: getEligibleDraftMaps(room.mapCatalog, this.usedMaps(bundle)), mapSelection: { ...room.mapSelection },
      heroes: room.heroCatalog.entries.filter(hero => hero.active).map(hero => ({ ...hero })),
      stageKind: room.stage?.kind ?? null, stageStatus: room.stage?.status,
      participants: roster(room).map(player => ({ ...player })), progress: operator ? this.statuses(bundle, client.discordId) : undefined,
      inputConnected: client.input, candidates: room.candidates, mapResult: room.mapResult, heroResult: room.heroResult,
      ballots: room.stage && bundle.source?.rosterHash === room.source.rosterHash ? projectDraftBallots({ viewerId: client.discordId, operators: history.operators,
        participants: roster(room), stage: room.stage }) : null,
      playStatus: history.games.find(game => game.gameId === room.gameId)?.playStatus ?? 'NOT_STARTED',
      serverNow: bundle.now,
    };
  }

  async tick(code: string): Promise<void> {
    const bundle = await this.store.load(code);
    if (!bundle || bundle.room.expiresAt <= bundle.now || bundle.history.expiresAt <= bundle.now) return;
    if (await this.closeIfIdle(bundle)) return;
    const { room, history, now } = bundle;
    if (!bundle.source || bundle.source.revision !== room.source.revision || bundle.source.rosterHash !== room.source.rosterHash) {
      if (room.timer.status === 'ROSTER_CHANGED') return;
      const playing = history.games.some(game => game.gameId === room.gameId && game.startedAt !== null);
      if (playing) return;
      if (room.phase === 'LOBBY' && bundle.source) {
        room.source = structuredClone(bundle.source); this.reset(room);
      } else {
        room.timer = { ...pauseDraftTimer(room.timer, now), status: 'ROSTER_CHANGED' };
        if (room.stage?.status === 'OPEN') room.stage.status = 'PAUSED';
      }
      await this.save(bundle); return;
    }
    if (room.timer.status !== 'ACTIVE') return;
    if (room.phase !== 'LOBBY' && room.phase !== 'COMPLETED'
      && !hasConnectedOperator(history.operators, this.roomConnections(code), now)) {
      room.timer = pauseDraftTimer(room.timer, now);
      if (room.stage?.status === 'OPEN') room.stage.status = 'PAUSED';
      await this.save(bundle); return;
    }
    if (room.stage?.status === 'OPEN' && now >= room.stage.deadlineAt) {
      room.stage = sealBallotStage(room.stage, `${room.gameId}:${room.epoch}:${room.stage.kind}`, now, entropy());
      room.stage.sealed!.sealedAt = -1;
      await this.save(bundle, { acceptAtOrAfter: room.stage.deadlineAt }); return;
    }
    if (room.stage?.status === 'SEALED') {
      const stage = room.stage;
      const ballots = stage.sealed!.ballots;
      if (stage.kind === 'MAP') {
        room.mapResult = resolveMapVote(room.candidates!, ballots.map(ballot => ballot.selection[0] ?? null), history.mapHistoryRevision, stage.sealed!.entropy);
        room.phase = 'MAP_RESOLVED'; room.stage = null;
        room.timer = { ...room.timer, phase: room.phase, deadlineAt: -1 };
      } else {
        room.heroResult = resolveHeroBans({ resolutionId: stage.sealed!.resolutionId, catalog: room.heroCatalog,
          participants: roster(room), ballots: ballots.map(ballot => ({ discordId: ballot.discordId, ranking: ballot.selection })), entropy: stage.sealed!.entropy });
        room.phase = 'HERO_RESOLVED'; room.stage = null; room.timer = { ...room.timer, phase: room.phase, deadlineAt: null };
      }
      await this.save(bundle); return;
    }
    if (room.phase === 'MAP_RESOLVED' && room.timer.deadlineAt !== null && now >= room.timer.deadlineAt) {
      this.newStage(room, 'BAN', now); await this.save(bundle);
    }
  }

  async recover(): Promise<void> {
    for (const code of await this.store.listActiveRooms()) {
      const bundle = await this.store.load(code);
      if (!bundle || bundle.room.expiresAt <= bundle.now || bundle.history.expiresAt <= bundle.now) continue;
      if (await this.closeIfIdle(bundle)) continue;
      this.recoveryUntilByRoom.set(code, bundle.now + 45_000);
      if ((bundle.room.phase as string) === 'HERO_PREFERENCE') {
        const status = bundle.room.timer.status;
        bundle.room.epoch++;
        this.newStage(bundle.room, 'BAN', bundle.now);
        if (['CANCELLED', 'EXPIRED', 'ROSTER_CHANGED'].includes(status)) {
          bundle.room.timer = { ...bundle.room.timer, status, deadlineAt: null };
        }
      }
      if (bundle.room.phase !== 'LOBBY' && bundle.room.phase !== 'COMPLETED') {
        bundle.room.timer = pauseDraftTimer(bundle.room.timer, bundle.now, true);
        if (bundle.room.stage?.status === 'OPEN') bundle.room.stage.status = 'PAUSED';
        await this.save(bundle);
      }
    }
  }
}
