import type { BallotKind } from './ballots.js';
import type { HeroResolution } from './heroes.js';
import type { DraftTimer } from './lifecycle.js';
import type { MapCandidateSnapshot, MapResolution } from './maps.js';
import type { DraftHero, DraftParticipant, DraftPhase, PlayStatus } from './model.js';
import type { OperatorParticipantStatus } from './presence.js';
import type { ParticipantBallotView } from './views.js';

export interface DraftRoomSnapshot {
  roomCode: string;
  gameId: string;
  gameIndex: number;
  epoch: number;
  roomRevision: number;
  expiresAt: number;
  phase: DraftPhase;
  timer: DraftTimer;
  participants: readonly DraftParticipant[];
  progress?: readonly OperatorParticipantStatus[];
  selfDiscordId: string;
  isOperator: boolean;
  selfReady: boolean;
  readyCount: number;
  availableMapCount: number;
  inputConnected: boolean;
  heroes: readonly DraftHero[];
  stageKind: BallotKind | null;
  candidates: MapCandidateSnapshot | null;
  mapResult: MapResolution | null;
  heroResult: HeroResolution | null;
  ballots: ParticipantBallotView | null;
  playStatus: PlayStatus;
  serverNow: number;
}
