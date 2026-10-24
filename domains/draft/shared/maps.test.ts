import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT_MAP_CATALOG } from './default-catalog.js';
import { getEligibleDraftMaps, resolvePotgTimeout } from './maps.js';

describe('POTG timeout map selection', () => {
  it('excludes used canonical maps and records reproducible random draws', () => {
    const used = DEFAULT_DRAFT_MAP_CATALOG.entries.slice(0, 5).map(map => map.canonicalMapId);
    const input = { resolutionId: 'timeout', catalog: DEFAULT_DRAFT_MAP_CATALOG, usedCanonicalMapIds: used, entropy: [0.1, 0.7] };
    const result = resolvePotgTimeout(input);
    expect(result).toEqual(resolvePotgTimeout(input));
    expect(used).not.toContain(result.map.canonicalMapId);
    expect(getEligibleDraftMaps(DEFAULT_DRAFT_MAP_CATALOG, used).some(map => map.mapId === result.map.mapId)).toBe(true);
    expect(result.method).toBe('POTG_TIMEOUT');
    expect(result.selectedByDiscordId).toBeUndefined();
    expect(result.draws.length).toBeGreaterThan(0);
    expect(result.rollDurationMs).toBe(0);
  });
  it('refuses to reuse an exhausted map pool', () => {
    expect(() => resolvePotgTimeout({ resolutionId: 'timeout', catalog: DEFAULT_DRAFT_MAP_CATALOG,
      usedCanonicalMapIds: DEFAULT_DRAFT_MAP_CATALOG.entries.map(map => map.canonicalMapId), entropy: [0.1] })).toThrow('미사용 맵이 없습니다.');
  });
});
