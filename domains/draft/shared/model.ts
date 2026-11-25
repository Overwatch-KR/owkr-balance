export type DraftTeam = 'A' | 'B';
export const DRAFT_FEARLESS_MODES = ['OFF', 'SOFT', 'HARD', 'CUMULATIVE_TWO'] as const;
export type DraftFearlessMode = typeof DRAFT_FEARLESS_MODES[number];

export function isDraftFearlessMode(value: unknown): value is DraftFearlessMode {
  return DRAFT_FEARLESS_MODES.some(mode => mode === value);
}
export type DraftRole = 'TANK' | 'DPS' | 'SUPPORT';
export type MapMode = 'CONTROL' | 'HYBRID' | 'ESCORT' | 'PUSH' | 'FLASHPOINT';
export type DraftPhase = 'LOBBY' | 'MAP_VOTING' | 'MAP_PICKING' | 'MAP_RESOLVED'
  | 'HERO_VOTING' | 'HERO_RESOLVED' | 'COMPLETED';
export type PlayStatus = 'NOT_STARTED' | 'PLAYING' | 'FINISHED' | 'ABORTED_PLAYED' | 'NOT_PLAYED';

export interface DraftMapSelection {
  mode: 'VOTE' | 'POTG';
  pickerDiscordId: string | null;
}

export interface DraftParticipant {
  userSheetId: string;
  discordId: string;
  displayName: string;
  team: DraftTeam;
  role: DraftRole;
  slot: number;
}

export interface DraftSource {
  pendingRosterDiscordIds?: readonly string[];
  sourceId: string;
  revision: number;
  rosterHash: string;
  expiresAt: number;
  participants: readonly DraftParticipant[];
}

export interface CatalogApproval {
  version: string;
  approvedBy: string;
  approvedAt: number;
  verifiedAt: string;
  sources: readonly string[];
  gameBuild: string;
}

export interface DraftMap {
  mapId: string;
  canonicalMapId: string;
  nameKo: string;
  nameEn: string;
  mode: MapMode;
  active: boolean;
}

export interface DraftHero {
  heroId: string;
  nameKo: string;
  role: DraftRole;
  active: boolean;
}

export interface DraftCatalog<T> {
  approval: CatalogApproval;
  entries: readonly T[];
}

export interface DraftActor {
  discordId: string;
  displayName: string;
}

export const DRAFT_RULES_VERSION = 'owkr-map-ban-v2';
export const DRAFT_LIMITS = {
  mapRevealMs: 4000,
  mapRollMinMs: 2500,
  mapRollMaxMs: 4000,
  roomLifetimeMs: 3 * 60 * 60 * 1000,
  roomIdleMs: 2 * 60 * 60 * 1000,
  sessionLifetimeMs: 24 * 60 * 60 * 1000,
  minSourceRemainingMs: 10 * 60 * 1000,
  presenceTimeoutMs: 45_000,
  maxBans: 4,
  maxTeamBans: 2,
  maxRoleBans: 2,
  rankPoints: [7, 5, 3],
} as const;

export class DraftRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DraftRuleError';
  }
}

export function requireDraft(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DraftRuleError(code, message);
}
