import type { BallotStage, DraftCatalog, DraftHero, DraftMap, DraftParticipant, DraftHistory } from '../shared/public.js';
import { createDraftHistory } from '../shared/public.js';

export const NOW = 1_800_000_000_000;
export const players: DraftParticipant[] = Array.from({ length: 10 }, (_, index) => ({
  userSheetId: `sheet-${index}`, discordId: `10000000000000000${String(index).padStart(2, '0')}`,
  displayName: `선수${index}`, team: index < 5 ? 'A' : 'B', slot: index % 5,
  role: index % 5 === 0 ? 'TANK' : index % 5 < 3 ? 'DPS' : 'SUPPORT',
}));
export const approval = { version: 'test-v1', approvedBy: 'test-only', approvedAt: NOW,
  verifiedAt: '2026-10-20', sources: ['https://example.invalid/test'], gameBuild: 'test' };
export const maps: DraftCatalog<DraftMap> = { approval, entries: [
  { mapId: 'control', canonicalMapId: 'control', nameKo: '쟁탈 시험', nameEn: 'Control', mode: 'CONTROL', active: true },
  { mapId: 'escort', canonicalMapId: 'escort', nameKo: '호위 시험', nameEn: 'Escort', mode: 'ESCORT', active: true },
  { mapId: 'hybrid', canonicalMapId: 'hybrid', nameKo: '혼합 시험', nameEn: 'Hybrid', mode: 'HYBRID', active: true },
  { mapId: 'push', canonicalMapId: 'push', nameKo: '밀기 시험', nameEn: 'Push', mode: 'PUSH', active: true },
  { mapId: 'flashpoint', canonicalMapId: 'flashpoint', nameKo: '플래시포인트 시험', nameEn: 'Flashpoint', mode: 'FLASHPOINT', active: true },
] };
export const heroes: DraftCatalog<DraftHero> = { approval, entries: Array.from({ length: 9 }, (_, index) => ({
  heroId: `h${index}`, nameKo: `영웅${index}`, role: index < 3 ? 'TANK' : index < 6 ? 'DPS' : 'SUPPORT', active: true,
})) };
export const rolls = Array.from({ length: 512 }, () => 0.31);
export function stage(kind: BallotStage['kind'] = 'BAN'): BallotStage {
  return { roomId: 'ROOM234567', gameId: 'game-1', epoch: 1, kind, status: 'OPEN', deadlineAt: NOW + 20_000,
    expiresAt: NOW + 100_000, allowedIds: ['h0', 'h1', 'h2'],
    ballots: players.map(player => ({ discordId: player.discordId, ballotRevision: 0, selection: [], locked: false })),
    receipts: [], inputConnections: Object.fromEntries(players.map(player => [player.discordId, `c-${player.discordId}`])), sealed: null,
  };
}
export function history(): DraftHistory {
  return { ...createDraftHistory('session-1', players[0].discordId, NOW), activeRoomId: 'ROOM234567', games: [{
    gameId: 'old-game', roomId: 'ROOM234567', roomExpiresAt: NOW + 100_000, appliedAt: NOW,
    map: maps.entries[1], firstAttackTeam: 'A', heroCatalogVersion: 'test-v1', mapCatalogVersion: 'test-v1',
    rulesVersion: 'test', bans: [heroes.entries[0], heroes.entries[3]], playStatus: 'FINISHED', startedAt: NOW, finishedAt: NOW + 1000,
  }] };
}
