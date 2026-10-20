import { MemoryRealtimeStore } from './memory-store.js';
import { DEFAULT_DRAFT_MAP_CATALOG, DEFAULT_DRAFT_HERO_CATALOG } from '../../domains/draft/shared/public.js';
import { SOURCE_POSITIONS } from './source.js';
import type { DraftCatalog, DraftHero, DraftMap } from '../../domains/draft/shared/public.js';

export function createLocalDraftFixtures(now = Date.now(), options: { syntheticCatalogs?: boolean } = {}) {
  const store = new MemoryRealtimeStore();
  const identities = SOURCE_POSITIONS.map((_, index) => ({
    id: `local-sheet-${index}`, discordUserId: `10000000000000000${String(index).padStart(2, '0')}`,
    battleTag: `시험참가자${index + 1}#0000`,
  }));
  store.identities = identities;
  store.setSource('LOCAL23456', { revision: 1, expiresAt: now + 3 * 60 * 60 * 1000,
    participants: identities.map((identity, index) => ({ discordUserId: identity.discordUserId, position: SOURCE_POSITIONS[index] })),
  });
  const approval = { version: 'local-fixture-v1', approvedBy: 'LOCAL_TEST_ONLY', approvedAt: now,
    verifiedAt: 'LOCAL_TEST_ONLY', sources: ['https://example.invalid/local-fixtures'], gameBuild: 'LOCAL_TEST_ONLY' };
  const maps: DraftCatalog<DraftMap> = { approval, entries: [
    { mapId: 'local-control', canonicalMapId: 'local-control', nameKo: '시험 쟁탈', nameEn: 'Local Control', mode: 'CONTROL', active: true },
    { mapId: 'local-hybrid', canonicalMapId: 'local-hybrid', nameKo: '시험 혼합', nameEn: 'Local Hybrid', mode: 'HYBRID', active: true },
    { mapId: 'local-escort', canonicalMapId: 'local-escort', nameKo: '시험 호위', nameEn: 'Local Escort', mode: 'ESCORT', active: true },
    { mapId: 'local-push', canonicalMapId: 'local-push', nameKo: '시험 밀기', nameEn: 'Local Push', mode: 'PUSH', active: true },
    { mapId: 'local-flashpoint', canonicalMapId: 'local-flashpoint', nameKo: '시험 플래시포인트', nameEn: 'Local Flashpoint', mode: 'FLASHPOINT', active: true },
  ] };
  const heroes: DraftCatalog<DraftHero> = { approval, entries: Array.from({ length: 9 }, (_, index) => ({
    heroId: `local-hero-${index}`, nameKo: `시험 영웅 ${index + 1}`,
    role: index < 3 ? 'TANK' : index < 6 ? 'DPS' : 'SUPPORT', active: true,
  })) };
  return { store, identities, catalogs: options.syntheticCatalogs ? { maps, heroes } : { maps: structuredClone(DEFAULT_DRAFT_MAP_CATALOG), heroes: structuredClone(DEFAULT_DRAFT_HERO_CATALOG) } };
}
