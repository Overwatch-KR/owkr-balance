export type DraftTeam = 'A' | 'B';
export type DraftRole = 'TANK' | 'DPS' | 'SUPPORT';
export type MapMode = 'CONTROL' | 'HYBRID' | 'ESCORT' | 'PUSH' | 'FLASHPOINT';
export type DraftPhase = 'LOBBY' | 'MAP_VOTING' | 'MAP_RESOLVED' | 'HERO_PREFERENCE'
  | 'HERO_VOTING' | 'HERO_RESOLVED' | 'COMPLETED';
export type PlayStatus = 'NOT_STARTED' | 'PLAYING' | 'FINISHED' | 'ABORTED_PLAYED' | 'NOT_PLAYED';

export interface DraftParticipant {
  userSheetId: string;
  discordId: string;
  displayName: string;
  team: DraftTeam;
  role: DraftRole;
  slot: number;
}

export interface DraftSource {
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

export const DRAFT_RULES_VERSION = 'owkr-competitive-v1';
export const DRAFT_LIMITS = {
  roomLifetimeMs: 3 * 60 * 60 * 1000,
  sessionLifetimeMs: 24 * 60 * 60 * 1000,
  minSourceRemainingMs: 10 * 60 * 1000,
  presenceTimeoutMs: 45_000,
  maxBans: 4,
  maxTeamBans: 2,
  maxRoleBans: 2,
  preferenceDeduction: 3,
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
