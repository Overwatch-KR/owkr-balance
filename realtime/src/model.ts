import type {
  BallotStage, DraftCatalog, DraftHero, DraftHistory, DraftMap, DraftParticipant, DraftPhase,
  DraftSource, DraftTimer, HeroResolution, MapCandidateSnapshot, MapResolution, ParticipantProgress, PresenceHistory, DraftMapSelection,
} from '../../domains/draft/shared/public.js';

export interface RoomReceipt {
  actorId: string;
  commandId: string;
  body: string;
  revision: number;
}

export interface DraftRoomRecord {
  roomCode: string;
  draftSessionId: string;
  createdAt: number;
  lastActivityAt?: number;
  expiresAt: number;
  revision: number;
  source: DraftSource;
  fixedRoster: readonly DraftParticipant[] | null;
  gameId: string;
  gameIndex: number;
  epoch: number;
  phase: DraftPhase;
  timer: DraftTimer;
  progress: readonly ParticipantProgress[];
  presenceHistory: readonly PresenceHistory[];
  mapCatalog: DraftCatalog<DraftMap>;
  heroCatalog: DraftCatalog<DraftHero>;
  mapSelection: DraftMapSelection;
  candidates: MapCandidateSnapshot | null;
  mapResult: MapResolution | null;
  heroResult: HeroResolution | null;
  stage: BallotStage | null;
  receipts: readonly RoomReceipt[];
  audit: readonly { actorId: string; action: string; at: number; reason: string; revision: number }[];
}

export interface RoomBundle {
  room: DraftRoomRecord;
  history: DraftHistory;
  source: DraftSource | null;
  sourceRaw: string | null;
  now: number;
}

export interface StoreGuard {
  expectedRoomRevision: number;
  expectedHistoryRevision: number;
  expectedSourceRaw?: string;
  acceptBefore?: number;
  acceptAtOrAfter?: number;
  authExpiresAt?: number;
  idleForMs?: number;
}

export interface RealtimeStore {
  acquireLease(): Promise<void>;
  renewLease(): Promise<boolean>;
  releaseLease(): Promise<void>;
  consumeNonce(nonce: string, expiresAt: number): Promise<boolean>;
  putTransient(key: string, value: string, expiresAt: number): Promise<void>;
  getTransient(key: string, consume?: boolean): Promise<string | null>;
  findCreate(ownerId: string, requestId: string, sourceId: string): Promise<string | null>;
  listActiveRooms(): Promise<string[]>;
  readSource(sourceId: string): Promise<{ source: DraftSource | null; raw: string | null; now: number }>;
  load(roomCode: string): Promise<RoomBundle | null>;
  create(room: DraftRoomRecord, history: DraftHistory, expectedSourceRaw: string, requestId: string): Promise<string>;
  commit(bundle: RoomBundle, guard: StoreGuard): Promise<void>;
}
