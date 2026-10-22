import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { DRAFT_LIMITS, DraftRuleError, requireDraft, type DraftHistory } from '../../domains/draft/shared/public.js';
import type { DraftRoomRecord, RealtimeStore, RoomBundle, StoreGuard } from './model.js';
import { parseDraftSource, type SourceIdentity } from './source.js';
import { stampAtomicTimes } from './atomic-time.js';

const PREFIX = 'draft:v1:';
const ROOM = `${PREFIX}room:`;
const HISTORY = `${PREFIX}session:`;
const LEASE = `${PREFIX}writer`;
const ACTIVE = `${PREFIX}active`;

const SOURCE_READ_SCRIPT = `
local function readSource(sourceKey, entriesKey, versionKey)
  local raw = redis.call('GET', sourceKey)
  if not raw then return {value=cjson.null, identities={}} end
  local source = cjson.decode(raw)
  local assigned = {}
  local assignedIds = {}
  for _, player in ipairs(source.participants or {}) do
    if player.position and player.position ~= cjson.null then
      table.insert(assigned, {discordUserId=player.discordUserId, position=player.position})
      assignedIds[player.discordUserId] = true
    end
  end
  local identities = {}
  for _, rowJson in ipairs(redis.call('HVALS', entriesKey)) do
    local row = cjson.decode(rowJson)
    if row.discordUserId and assignedIds[row.discordUserId] then
      table.insert(identities, {id=row.id, discordUserId=row.discordUserId, battleTag=row.battleTag})
    end
  end
  local minimal = {revision=source.revision, expiresAt=source.expiresAt, participants=assigned,
    sheetVersion=tonumber(redis.call('GET',versionKey) or '0')}
  return {value=cjson.encode(minimal), identities=identities}
end
`;

const READ_SOURCE_SCRIPT = SOURCE_READ_SCRIPT + `
local t = redis.call('TIME')
local source = readSource(KEYS[1], KEYS[2], KEYS[3])
source.now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
return cjson.encode(source)
`;

export const LOAD_ROOM_SCRIPT = SOURCE_READ_SCRIPT + `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({room=cjson.null}) end
local room = cjson.decode(raw)
if room.draftSessionId ~= ARGV[1] or room.source.sourceId ~= ARGV[2] then
  return cjson.encode({routeChanged=true})
end
local history = redis.call('GET', KEYS[2])
if not history then return cjson.encode({room=cjson.null}) end
local source = readSource(KEYS[3], KEYS[4], KEYS[5])
return cjson.encode({room=raw, history=history, value=source.value, identities=source.identities, now=now})
`;

interface RedisSourceRead {
  now: number;
  value: string | null;
  identities: SourceIdentity[];
}

interface RedisRoomRead extends RedisSourceRead {
  room: string | null;
  history: string;
  routeChanged?: boolean;
}

interface RoomRoute {
  sessionId: string;
  sourceId: string;
}

const MAX_ROOM_ROUTE_HINTS = 10;

const SOURCE_MATCH_SCRIPT = `
local function matchesSource(actualJson, expectedJson, sheetVersion)
  if not actualJson then return false end
  local actual = cjson.decode(actualJson)
  local expected = cjson.decode(expectedJson)
  if actual.revision ~= expected.revision or actual.expiresAt ~= expected.expiresAt then return false end
  if expected.sheetVersion and expected.sheetVersion ~= tonumber(sheetVersion or '0') then return false end
  local index = 0
  for _, player in ipairs(actual.participants or {}) do
    if player.position and player.position ~= cjson.null then
      index = index + 1
      local previous = expected.participants[index]
      if not previous or previous.discordUserId ~= player.discordUserId or previous.position ~= player.position then return false end
    end
  end
  return index == #expected.participants
end
`;

export const COMMIT_DRAFT_SCRIPT = SOURCE_MATCH_SCRIPT + `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
if redis.call('GET', KEYS[4]) ~= ARGV[1] then return 'WRITER_LOST' end
local raw = redis.call('GET', KEYS[1])
local historyRaw = redis.call('GET', KEYS[2])
if not raw or not historyRaw then return 'ROOM_EXPIRED' end
local current = cjson.decode(raw)
local history = cjson.decode(historyRaw)
local guard = cjson.decode(ARGV[4])
if current.timer.status == 'CANCELLED' then return 'ROOM_CLOSED' end
local function getLastActivity()
  local lastActivity = tonumber(current.lastActivityAt)
  if not lastActivity then
    lastActivity = current.createdAt
    for _, entry in ipairs(current.audit or {}) do lastActivity = math.max(lastActivity, entry.at) end
    if current.stage and current.stage ~= cjson.null then
      for _, receipt in ipairs(current.stage.receipts or {}) do lastActivity = math.max(lastActivity, receipt.acceptedAt) end
    end
  end
  return lastActivity
end
if guard.idleForMs then
  if now < getLastActivity() + guard.idleForMs then return 'ROOM_NOT_IDLE' end
end
if tonumber(current.revision) ~= guard.expectedRoomRevision or tonumber(history.mapHistoryRevision) ~= guard.expectedHistoryRevision then return 'CONFLICT' end
if now >= current.expiresAt or now >= history.expiresAt then return 'ROOM_EXPIRED' end
if guard.authExpiresAt and now >= guard.authExpiresAt then return 'AUTH_EXPIRED' end
if guard.acceptBefore and now >= guard.acceptBefore then return 'BALLOT_CLOSED' end
if guard.acceptAtOrAfter and now < guard.acceptAtOrAfter then return 'NOT_READY_TO_SEAL' end
if guard.expectedSourceRaw and not matchesSource(redis.call('GET', KEYS[3]), guard.expectedSourceRaw, redis.call('GET',KEYS[5])) then return 'SOURCE_OUTDATED' end
if guard.expectedSourceRaw then
  local source = cjson.decode(guard.expectedSourceRaw)
  if now >= source.expiresAt then return 'SOURCE_EXPIRED' end
end
local nextRoom = cjson.decode(ARGV[2])
local nextHistory = cjson.decode(ARGV[3])
if nextRoom.lastActivityAt == -1 and nextRoom.timer.status ~= 'CANCELLED' and now >= getLastActivity() + ${DRAFT_LIMITS.roomIdleMs} then return 'ROOM_CLOSED' end
if nextRoom.expiresAt ~= current.expiresAt or nextHistory.expiresAt ~= history.expiresAt then return 'EXPIRY_CHANGED' end
local function stamp(value)
  for _, field in ipairs({'acceptedAt','sealedAt','startedAt','finishedAt','appliedAt','lastActivityAt'}) do
    value = string.gsub(value, '"' .. field .. '":%-1', '"' .. field .. '":' .. string.format('%.0f',now))
  end
  return value
end
local roomJson = ARGV[2]
if nextRoom.phase == 'MAP_RESOLVED' and nextRoom.timer.deadlineAt == -1 then
  local rollMs = nextRoom.mapResult and nextRoom.mapResult.rollDurationMs or 0
  roomJson = string.gsub(roomJson, '"deadlineAt":%-1', '"deadlineAt":' .. string.format('%.0f',now + ${DRAFT_LIMITS.mapRevealMs} + rollMs))
end
redis.call('SET', KEYS[1], stamp(roomJson), 'PXAT', current.expiresAt)
redis.call('SET', KEYS[2], stamp(ARGV[3]), 'PXAT', history.expiresAt)
if nextRoom.timer.status == 'CANCELLED' then redis.call('ZREM', KEYS[6], nextRoom.roomCode) end
return 'OK:' .. string.format('%.0f',now)
`;

const CREATE_SCRIPT = SOURCE_MATCH_SCRIPT + `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
if redis.call('GET', KEYS[4]) ~= ARGV[1] then return 'WRITER_LOST' end
local previous = redis.call('GET', KEYS[6])
if previous then
  local receipt = cjson.decode(previous)
  if receipt.sourceId ~= cjson.decode(ARGV[2]).source.sourceId then return 'COMMAND_REUSED' end
  return 'RETRY:' .. receipt.roomCode
end
if not matchesSource(redis.call('GET', KEYS[3]), ARGV[4], redis.call('GET',KEYS[7])) then return 'SOURCE_OUTDATED' end
local room = cjson.decode(ARGV[2])
local history = cjson.decode(ARGV[3])
if now >= room.expiresAt or now >= history.expiresAt then return 'ROOM_EXPIRED' end
redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now)
if redis.call('ZCARD', KEYS[5]) >= 10 then return 'ROOM_LIMIT' end
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 'CONFLICT' end
redis.call('SET', KEYS[1], ARGV[2], 'PXAT', room.expiresAt)
redis.call('SET', KEYS[2], ARGV[3], 'PXAT', history.expiresAt)
redis.call('ZADD', KEYS[5], room.expiresAt, room.roomCode)
redis.call('SET', KEYS[6], cjson.encode({roomCode=room.roomCode, sourceId=room.source.sourceId}), 'PXAT', room.expiresAt)
return 'OK'
`;

export class RedisRealtimeStore implements RealtimeStore {
  private readonly writerId = randomUUID();
  private readonly roomRoutes = new Map<string, RoomRoute>();
  constructor(private readonly redis: Redis) {}

  async acquireLease(): Promise<void> {
    requireDraft(await this.redis.set(LEASE, this.writerId, { nx: true, px: 15_000 }), 'WRITER_BUSY', '다른 실시간 서버가 실행 중입니다.');
  }

  async renewLease(): Promise<boolean> {
    return await this.redis.eval<string[], number>(
      "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],15000) end return 0",
      [LEASE], [this.writerId],
    ) === 1;
  }

  async releaseLease(): Promise<void> {
    await this.redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", [LEASE], [this.writerId]);
  }

  async consumeNonce(nonce: string, expiresAt: number): Promise<boolean> {
    if (expiresAt <= Date.now()) return false;
    return await this.redis.set(`${PREFIX}nonce:${nonce}`, '1', { nx: true, pxat: expiresAt }) === 'OK';
  }

  async putTransient(key: string, value: string, expiresAt: number): Promise<void> {
    await this.redis.set(`${PREFIX}auth:${key}`, value, { pxat: expiresAt });
  }

  async getTransient(key: string, consume = false): Promise<string | null> {
    return consume ? this.redis.getdel<string>(`${PREFIX}auth:${key}`) : this.redis.get<string>(`${PREFIX}auth:${key}`);
  }

  async findCreate(ownerId: string, requestId: string, sourceId: string): Promise<string | null> {
    const raw = await this.redis.get<string>(`${PREFIX}create:${ownerId}:${requestId}`);
    if (!raw) return null;
    const receipt = JSON.parse(raw) as { roomCode: string; sourceId: string };
    requireDraft(receipt.sourceId === sourceId, 'COMMAND_REUSED', '같은 요청 식별자를 다른 원본에 사용할 수 없습니다.');
    return receipt.roomCode;
  }

  async listActiveRooms(): Promise<string[]> {
    return this.redis.zrange<string[]>(ACTIVE, Date.now(), '+inf', { byScore: true });
  }

  async readSource(sourceId: string): Promise<{ source: ReturnType<typeof parseDraftSource>; raw: string | null; now: number }> {
    const reply = JSON.parse(await this.redis.eval<[], string>(READ_SOURCE_SCRIPT, [
      `match-live:v1:${sourceId}`, 'user-sheet:v2:entries', 'user-sheet:v2:version',
    ], [])) as RedisSourceRead;
    if (!reply.value) return { source: null, raw: null, now: reply.now };
    return { source: parseDraftSource(sourceId, reply.value, Array.isArray(reply.identities) ? reply.identities : []), raw: reply.value, now: reply.now };
  }

  /** @description 키 위치만 기억하고, 상태·명단·시각은 Redis에서 매번 함께 읽는다. */
  private rememberRoute(room: DraftRoomRecord): RoomRoute {
    const route = { sessionId: room.draftSessionId, sourceId: room.source.sourceId };
    this.roomRoutes.delete(room.roomCode);
    this.roomRoutes.set(room.roomCode, route);
    if (this.roomRoutes.size > MAX_ROOM_ROUTE_HINTS) this.roomRoutes.delete(this.roomRoutes.keys().next().value!);
    return route;
  }

  async load(roomCode: string): Promise<RoomBundle | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let route = this.roomRoutes.get(roomCode);
      if (!route) {
        const raw = await this.redis.get<string>(`${ROOM}${roomCode}`);
        if (!raw) return null;
        route = this.rememberRoute(JSON.parse(raw) as DraftRoomRecord);
      }
      const reply = JSON.parse(await this.redis.eval<string[], string>(LOAD_ROOM_SCRIPT, [
        `${ROOM}${roomCode}`, `${HISTORY}${route.sessionId}`, `match-live:v1:${route.sourceId}`,
        'user-sheet:v2:entries', 'user-sheet:v2:version',
      ], [route.sessionId, route.sourceId])) as RedisRoomRead;
      if (reply.routeChanged) { this.roomRoutes.delete(roomCode); continue; }
      if (!reply.room) { this.roomRoutes.delete(roomCode); return null; }
      const room = JSON.parse(reply.room) as DraftRoomRecord;
      const history = JSON.parse(reply.history) as DraftHistory;
      this.rememberRoute(room);
      let source: ReturnType<typeof parseDraftSource>;
      let sourceRaw = reply.value;
      try { source = parseDraftSource(room.source.sourceId, sourceRaw, Array.isArray(reply.identities) ? reply.identities : []); }
      catch (error) {
        if (!(error instanceof DraftRuleError)) throw error;
        source = null; sourceRaw = null;
      }
      return { room, history, source, sourceRaw, now: reply.now };
    }
    requireDraft(false, 'CONFLICT', '방 상태가 변경되었습니다. 다시 연결해 주세요.');
  }

  async create(room: DraftRoomRecord, history: DraftHistory, expectedSourceRaw: string, requestId: string): Promise<string> {
    const result = await this.redis.eval<string[], string>(CREATE_SCRIPT, [
      `${ROOM}${room.roomCode}`, `${HISTORY}${history.draftSessionId}`, `match-live:v1:${room.source.sourceId}`,
      LEASE, ACTIVE, `${PREFIX}create:${history.operators.ownerId}:${requestId}`,
      'user-sheet:v2:version',
    ], [this.writerId, JSON.stringify(room), JSON.stringify(history), expectedSourceRaw]);
    if (result.startsWith('RETRY:')) return result.slice(6);
    requireDraft(result === 'OK', result, '방을 만들 수 없습니다. 최신 원본과 서버 상태를 확인해 주세요.');
    this.rememberRoute(room);
    return room.roomCode;
  }

  async commit(bundle: RoomBundle, guard: StoreGuard): Promise<void> {
    const result = await this.redis.eval<string[], string>(COMMIT_DRAFT_SCRIPT, [
      `${ROOM}${bundle.room.roomCode}`, `${HISTORY}${bundle.history.draftSessionId}`,
      `match-live:v1:${bundle.room.source.sourceId}`, LEASE,
      'user-sheet:v2:version', ACTIVE,
    ], [this.writerId, JSON.stringify(bundle.room), JSON.stringify(bundle.history), JSON.stringify(guard)]);
    requireDraft(result.startsWith('OK:'), result, '변경을 저장하지 못했습니다. 최신 상태를 확인해 주세요.');
    stampAtomicTimes(bundle, Number(result.slice(3)));
  }
}

export function createRedisRealtimeStore(url: string, token: string): RedisRealtimeStore {
  return new RedisRealtimeStore(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 } }));
}
