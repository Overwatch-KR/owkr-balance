import { requireDraft, type DraftHistory } from '../../domains/draft/shared/public.js';
import type { DraftRoomRecord, RealtimeStore, RoomBundle, StoreGuard } from './model.js';
import { parseDraftSource, type SourceIdentity } from './source.js';
import { stampAtomicTimes } from './atomic-time.js';

/** @description 명시적 로컬 시험 전용 저장소이며 원격 Redis에 접근하지 않는다. */
export class MemoryRealtimeStore implements RealtimeStore {
  private leased = false;
  private rooms = new Map<string, DraftRoomRecord>();
  private histories = new Map<string, DraftHistory>();
  private sources = new Map<string, string>();
  private creates = new Map<string, { roomCode: string; sourceId: string }>();
  private nonces = new Map<string, number>();
  private transient = new Map<string, { value: string; expiresAt: number }>();
  identities: SourceIdentity[] = [];

  constructor(public now: () => number = Date.now) {}

  setSource(sourceId: string, value: unknown): void { this.sources.set(sourceId, JSON.stringify(value)); }
  async acquireLease(): Promise<void> { requireDraft(!this.leased, 'WRITER_BUSY', '다른 서버가 실행 중입니다.'); this.leased = true; }
  async renewLease(): Promise<boolean> { return this.leased; }
  async releaseLease(): Promise<void> { this.leased = false; }
  async consumeNonce(nonce: string, expiresAt: number): Promise<boolean> {
    for (const [key, expiry] of this.nonces) if (expiry <= this.now()) this.nonces.delete(key);
    if (this.nonces.has(nonce) || expiresAt <= this.now()) return false;
    this.nonces.set(nonce, expiresAt); return true;
  }
  async putTransient(key: string, value: string, expiresAt: number): Promise<void> {
    this.transient.set(key, { value, expiresAt });
  }
  async getTransient(key: string, consume = false): Promise<string | null> {
    const item = this.transient.get(key);
    if (consume || (item && item.expiresAt <= this.now())) this.transient.delete(key);
    return item && item.expiresAt > this.now() ? item.value : null;
  }
  async findCreate(ownerId: string, requestId: string, sourceId: string): Promise<string | null> {
    const receipt = this.creates.get(`${ownerId}:${requestId}`);
    if (!receipt || (this.rooms.get(receipt.roomCode)?.expiresAt ?? 0) <= this.now()) return null;
    requireDraft(receipt.sourceId === sourceId, 'COMMAND_REUSED', '같은 요청 식별자를 다른 원본에 사용할 수 없습니다.');
    return receipt.roomCode;
  }
  async listActiveRooms(): Promise<string[]> {
    return [...this.rooms.values()].filter(room => room.expiresAt > this.now()).map(room => room.roomCode);
  }
  async readSource(sourceId: string): Promise<{ source: ReturnType<typeof parseDraftSource>; raw: string | null; now: number }> {
    const raw = this.sources.get(sourceId) ?? null;
    return { source: parseDraftSource(sourceId, raw, this.identities), raw, now: this.now() };
  }
  async load(roomCode: string): Promise<RoomBundle | null> {
    const room = this.rooms.get(roomCode);
    if (!room || room.expiresAt <= this.now()) return null;
    const history = this.histories.get(room.draftSessionId)!;
    let sourceRead;
    try { sourceRead = await this.readSource(room.source.sourceId); }
    catch { sourceRead = { source: null, raw: null, now: this.now() }; }
    return structuredClone({ room, history, source: sourceRead.source, sourceRaw: sourceRead.raw, now: this.now() });
  }
  async create(room: DraftRoomRecord, history: DraftHistory, expectedSourceRaw: string, requestId: string): Promise<string> {
    requireDraft(this.leased, 'WRITER_LOST', '쓰기 권한이 없습니다.');
    const key = `${history.operators.ownerId}:${requestId}`;
    const previous = await this.findCreate(history.operators.ownerId, requestId, room.source.sourceId);
    if (previous) return previous;
    requireDraft(this.sources.get(room.source.sourceId) === expectedSourceRaw, 'SOURCE_OUTDATED', '원본이 변경되었습니다.');
    requireDraft(room.expiresAt > this.now() && history.expiresAt > this.now(), 'ROOM_EXPIRED', '방이 만료되었습니다.');
    requireDraft((await this.listActiveRooms()).length < 10, 'ROOM_LIMIT', '동시 방 상한에 도달했습니다.');
    this.rooms.set(room.roomCode, structuredClone(room));
    this.histories.set(history.draftSessionId, structuredClone(history));
    this.creates.set(key, { roomCode: room.roomCode, sourceId: room.source.sourceId }); return room.roomCode;
  }
  async commit(bundle: RoomBundle, guard: StoreGuard): Promise<void> {
    requireDraft(this.leased, 'WRITER_LOST', '쓰기 권한이 없습니다.');
    const current = this.rooms.get(bundle.room.roomCode);
    const history = this.histories.get(bundle.history.draftSessionId);
    const now = this.now();
    requireDraft(current && history && now < current.expiresAt && now < history.expiresAt, 'ROOM_EXPIRED', '방이 만료되었습니다.');
    requireDraft(current.revision === guard.expectedRoomRevision && history.mapHistoryRevision === guard.expectedHistoryRevision,
      'CONFLICT', '상태가 변경되었습니다.');
    requireDraft(!guard.authExpiresAt || now < guard.authExpiresAt, 'AUTH_EXPIRED', '입장권이 만료되었습니다.');
    requireDraft(!guard.acceptBefore || now < guard.acceptBefore, 'BALLOT_CLOSED', '마감 이후 입력은 저장하지 않습니다.');
    requireDraft(!guard.acceptAtOrAfter || now >= guard.acceptAtOrAfter, 'NOT_READY_TO_SEAL', '마감 전입니다.');
    if (guard.expectedSourceRaw) {
      requireDraft(this.sources.get(current.source.sourceId) === guard.expectedSourceRaw, 'SOURCE_OUTDATED', '원본이 변경되었습니다.');
      requireDraft(JSON.parse(guard.expectedSourceRaw).expiresAt > now, 'SOURCE_EXPIRED', '원본이 만료되었습니다.');
    }
    requireDraft(bundle.room.expiresAt === current.expiresAt && bundle.history.expiresAt === history.expiresAt,
      'EXPIRY_CHANGED', '만료 시각을 변경할 수 없습니다.');
    stampAtomicTimes(bundle, now);
    this.rooms.set(current.roomCode, structuredClone(bundle.room));
    this.histories.set(history.draftSessionId, structuredClone(bundle.history));
  }
}
