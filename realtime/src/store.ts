import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { DraftRuleError, requireDraft, type DraftHistory } from '../../domains/draft/shared/public.js';
import type { DraftRoomRecord, RealtimeStore, RoomBundle, StoreGuard } from './model.js';
import { parseDraftSource, type SourceIdentity } from './source.js';
import { stampAtomicTimes } from './atomic-time.js';

const PREFIX = 'draft:v1:';
const ROOM = `${PREFIX}room:`;
const HISTORY = `${PREFIX}session:`;
const LEASE = `${PREFIX}writer`;
const ACTIVE = `${PREFIX}active`;

const READ_SOURCE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({now=now, value=cjson.null, identities={}}) end
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
for _, rowJson in ipairs(redis.call('HVALS', KEYS[2])) do
  local row = cjson.decode(rowJson)
  if row.discordUserId and assignedIds[row.discordUserId] then
    table.insert(identities, {id=row.id, discordUserId=row.discordUserId, battleTag=row.battleTag})
  end
end
local minimal = {revision=source.revision, expiresAt=source.expiresAt, participants=assigned,
  sheetVersion=tonumber(redis.call('GET',KEYS[3]) or '0')}
return cjson.encode({now=now, value=cjson.encode(minimal), identities=identities})
`;

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
if nextRoom.expiresAt ~= current.expiresAt or nextHistory.expiresAt ~= history.expiresAt then return 'EXPIRY_CHANGED' end
local function stamp(value)
  for _, field in ipairs({'acceptedAt','sealedAt','startedAt','finishedAt','appliedAt'}) do
    value = string.gsub(value, '"' .. field .. '":%-1', '"' .. field .. '":' .. string.format('%.0f',now))
  end
  return value
end
redis.call('SET', KEYS[1], stamp(ARGV[2]), 'PXAT', current.expiresAt)
redis.call('SET', KEYS[2], stamp(ARGV[3]), 'PXAT', history.expiresAt)
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
    ], [])) as { now: number; value: string | null; identities: SourceIdentity[] };
    if (!reply.value) return { source: null, raw: null, now: reply.now };
    return { source: parseDraftSource(sourceId, reply.value, Array.isArray(reply.identities) ? reply.identities : []), raw: reply.value, now: reply.now };
  }

  async load(roomCode: string): Promise<RoomBundle | null> {
    const raw = await this.redis.get<string>(`${ROOM}${roomCode}`);
    if (!raw) return null;
    const room = JSON.parse(raw) as DraftRoomRecord;
    const historyRaw = await this.redis.get<string>(`${HISTORY}${room.draftSessionId}`);
    if (!historyRaw) return null;
    const history = JSON.parse(historyRaw) as DraftHistory;
    let sourceRead;
    try { sourceRead = await this.readSource(room.source.sourceId); }
    catch (error) {
      if (!(error instanceof DraftRuleError)) throw error;
      sourceRead = { source: null, raw: null, now: Date.now() };
    }
    return { room, history, source: sourceRead.source, sourceRaw: sourceRead.raw, now: sourceRead.now };
  }

  async create(room: DraftRoomRecord, history: DraftHistory, expectedSourceRaw: string, requestId: string): Promise<string> {
    const result = await this.redis.eval<string[], string>(CREATE_SCRIPT, [
      `${ROOM}${room.roomCode}`, `${HISTORY}${history.draftSessionId}`, `match-live:v1:${room.source.sourceId}`,
      LEASE, ACTIVE, `${PREFIX}create:${history.operators.ownerId}:${requestId}`,
      'user-sheet:v2:version',
    ], [this.writerId, JSON.stringify(room), JSON.stringify(history), expectedSourceRaw]);
    if (result.startsWith('RETRY:')) return result.slice(6);
    requireDraft(result === 'OK', result, '방을 만들 수 없습니다. 최신 원본과 서버 상태를 확인해 주세요.');
    return room.roomCode;
  }

  async commit(bundle: RoomBundle, guard: StoreGuard): Promise<void> {
    const result = await this.redis.eval<string[], string>(COMMIT_DRAFT_SCRIPT, [
      `${ROOM}${bundle.room.roomCode}`, `${HISTORY}${bundle.history.draftSessionId}`,
      `match-live:v1:${bundle.room.source.sourceId}`, LEASE,
      'user-sheet:v2:version',
    ], [this.writerId, JSON.stringify(bundle.room), JSON.stringify(bundle.history), JSON.stringify(guard)]);
    requireDraft(result.startsWith('OK:'), result, '변경을 저장하지 못했습니다. 최신 상태를 확인해 주세요.');
    stampAtomicTimes(bundle, Number(result.slice(3)));
  }
}

export function createRedisRealtimeStore(url: string, token: string): RedisRealtimeStore {
  return new RedisRealtimeStore(new Redis({ url, token, automaticDeserialization: false, retry: { retries: 0 } }));
}
