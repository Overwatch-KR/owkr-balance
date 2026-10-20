import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT_MAP_CATALOG, DEFAULT_DRAFT_HERO_CATALOG, createMapCandidates, getEligibleDraftMaps, resolvePotgMap, validateHeroCatalog, validateMapCatalog } from '../shared/public.js';

const rolls = Array.from({ length: 512 }, () => 0.42);
describe('bundled live catalog and POTG maps', () => {
  it('connects every shipped map and hero to an image, including Grimsvotn', () => {
    validateMapCatalog(DEFAULT_DRAFT_MAP_CATALOG); validateHeroCatalog(DEFAULT_DRAFT_HERO_CATALOG);
    const manifest = JSON.parse(readFileSync('public/draft-assets/manifest.json', 'utf8')) as { assets: { kind: string; id: string; localPath: string }[] };
    for (const [kind, entries] of [['maps', DEFAULT_DRAFT_MAP_CATALOG.entries.map(map => map.mapId)], ['heroes', DEFAULT_DRAFT_HERO_CATALOG.entries.map(hero => hero.heroId)]] as const) {
      expect(entries).toHaveLength(kind === 'maps' ? 31 : 54);
      for (const id of entries) {
        const asset = manifest.assets.find(item => item.kind === kind && item.id === id);
        expect(asset, id).toBeDefined(); expect(readFileSync(`public${asset!.localPath}`).toString('ascii', 8, 12)).toBe('WEBP');
      }
    }
    expect(DEFAULT_DRAFT_MAP_CATALOG.entries.find(map => map.mapId === 'grimsvotn')).toMatchObject({ nameKo: expect.stringContaining('그림스뵈튼'), mode: 'ESCORT', active: true });
    expect(DEFAULT_DRAFT_HERO_CATALOG.entries.find(hero => hero.heroId === 'sombra')?.role).toBe('SUPPORT');
  });
  it('uses all 31 maps in the voting pool and excludes played maps identically for POTG', () => {
    const result = createMapCandidates({ resolutionId: 'vote', catalog: DEFAULT_DRAFT_MAP_CATALOG, usedCanonicalMapIds: [], excludedCanonicalMapIds: [], mapHistoryRevision: 0, entropy: rolls });
    expect(result.eligiblePool.some(map => map.mapId === 'grimsvotn')).toBe(true);
    expect(new Set([...result.candidates.map(option => option.map.mapId), ...result.randomPool.map(map => map.mapId)]).size).toBe(31);
    expect(getEligibleDraftMaps(DEFAULT_DRAFT_MAP_CATALOG, ['grimsvotn'])).toHaveLength(30);
    expect(() => resolvePotgMap({ resolutionId: 'potg', catalog: DEFAULT_DRAFT_MAP_CATALOG, usedCanonicalMapIds: ['grimsvotn'], mapId: 'grimsvotn', pickerDiscordId: 'picker', entropy: rolls })).toThrow('선택할 수 없는');
  });
  it('records the selected player and side draw without accepting an unknown map', () => {
    const result = resolvePotgMap({ resolutionId: 'potg', catalog: DEFAULT_DRAFT_MAP_CATALOG, usedCanonicalMapIds: [], mapId: 'grimsvotn', pickerDiscordId: 'picker', entropy: rolls });
    expect(result).toMatchObject({ method: 'POTG', selectedOption: 'grimsvotn', selectedByDiscordId: 'picker', firstAttackTeam: expect.stringMatching(/^[AB]$/) });
    expect(result.draws).toHaveLength(1);
    expect(() => resolvePotgMap({ resolutionId: 'potg', catalog: DEFAULT_DRAFT_MAP_CATALOG, usedCanonicalMapIds: [], mapId: 'not-a-map', pickerDiscordId: 'picker', entropy: rolls })).toThrow('선택할 수 없는');
    const disabled = structuredClone(DEFAULT_DRAFT_MAP_CATALOG); disabled.entries = disabled.entries.map(map => ({ ...map, active: false }));
    expect(() => resolvePotgMap({ resolutionId: 'potg', catalog: disabled, usedCanonicalMapIds: [], mapId: 'grimsvotn', pickerDiscordId: 'picker', entropy: rolls })).toThrow('선택할 수 없는');
  });
});
