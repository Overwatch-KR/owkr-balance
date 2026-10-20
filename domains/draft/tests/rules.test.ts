import { describe, expect, it } from 'vitest';
import {
  createMapCandidates, resolveMapVote, resolveHeroBans, validateRetainedBans, validateDraftRoster,
  getDraftRoomExpiry, DRAFT_LIMITS, validateDraftSource, validateHeroCatalog,
} from '../shared/public.js';
import { heroes, maps, NOW, players, rolls } from './fixtures.js';

function candidates(overrides: Partial<Parameters<typeof createMapCandidates>[0]> = {}) {
  return createMapCandidates({ resolutionId: 'map-result', catalog: maps, usedCanonicalMapIds: [],
    excludedCanonicalMapIds: [], mapHistoryRevision: 2, entropy: rolls, ...overrides });
}
function bans(overrides: Record<number, { ranking?: string[]; preferredHeroId?: string | null }> = {}) {
  return resolveHeroBans({ resolutionId: 'hero-result', catalog: heroes, participants: players, entropy: rolls,
    ballots: players.map((player, index) => ({ discordId: player.discordId, ranking: [], preferredHeroId: null, ...overrides[index] })),
  });
}

describe('draft roster and catalogue boundaries', () => {
  it('requires exactly ten distinct authenticated identities and 1/2/2 roles', () => {
    expect(() => validateDraftRoster(players)).not.toThrow();
    expect(() => validateDraftRoster(players.slice(1))).toThrow('10명');
    expect(() => validateDraftRoster(players.map((p, i) => i === 1 ? { ...p, discordId: players[0].discordId } : p))).toThrow('중복');
    expect(() => validateDraftRoster(players.map((p, i) => i === 1 ? { ...p, role: 'TANK' } : p))).toThrow('탱커 1명');
    expect(() => validateDraftRoster(players.map((p, i) => i === 1 ? { ...p, userSheetId: players[0].userSheetId } : p))).toThrow('중복');
  });
  it('rejects missing Discord identity even when a name matches', () => {
    expect(() => validateDraftRoster(players.map((p, i) => i === 0 ? { ...p, discordId: '' } : p))).toThrow('Discord');
  });
  it('requires catalogue approval metadata instead of trusting old hero roles', () => {
    expect(() => validateHeroCatalog({ ...heroes, approval: { ...heroes.approval, approvedBy: '' } })).toThrow('카탈로그');
  });
  it('uses the earliest fixed expiry and rejects a nearly expired source', () => {
    expect(getDraftRoomExpiry(NOW, NOW + 60 * 60_000, NOW + 24 * 60 * 60_000)).toBe(NOW + 60 * 60_000);
    expect(getDraftRoomExpiry(NOW, NOW + 4 * 60 * 60_000, NOW + 24 * 60 * 60_000)).toBe(NOW + DRAFT_LIMITS.roomLifetimeMs);
    expect(() => getDraftRoomExpiry(NOW, NOW + 599_999, NOW + 24 * 60 * 60_000)).toThrow('10분');
  });
  it('rejects stale revision or roster hash and an expired source', () => {
    const source = { sourceId: 'source', revision: 1, rosterHash: 'hash', expiresAt: NOW + 1000, participants: players };
    expect(() => validateDraftSource(source, { ...source, revision: 2 }, NOW)).toThrow('최신');
    expect(() => validateDraftSource(source, { ...source, rosterHash: 'other' }, NOW)).toThrow('최신');
    expect(() => validateDraftSource(source, source, source.expiresAt)).toThrow('만료');
  });
});

describe('map candidate and vote rules', () => {
  it('excludes played canonical maps including seasonal variants from every draw pool', () => {
    const snapshot = candidates({ catalog: { ...maps, entries: [...maps.entries,
      { ...maps.entries[0], mapId: 'control-winter' }] }, usedCanonicalMapIds: ['control'] });
    expect(snapshot.eligiblePool).toHaveLength(4);
    expect(snapshot.eligiblePool.some(map => map.canonicalMapId === 'control')).toBe(false);
    const result = resolveMapVote(snapshot, Array(10).fill(null), 2, rolls);
    expect(result.map.canonicalMapId).not.toBe('control');
  });
  it('keeps variants from multiplying candidate weight', () => {
    const snapshot = candidates({ catalog: { ...maps, entries: [...maps.entries, { ...maps.entries[0], mapId: 'winter' }] } });
    expect(snapshot.eligiblePool).toHaveLength(5);
  });
  it('enumerates qualifying triples uniformly before drawing starting sides', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 10; index++) {
      const snapshot = candidates({ entropy: [(index + 0.5) / 10, ...rolls] });
      seen.add(snapshot.candidates.map(option => option.map.mapId).join(','));
    }
    expect(seen.size).toBe(10);
  });
  it.each([1, 2, 3])('requires confirmation for %i remaining maps and removes random', count => {
    const catalog = { ...maps, entries: maps.entries.slice(0, count) };
    expect(() => candidates({ catalog })).toThrow('남은 맵');
    const snapshot = candidates({ catalog, remainingMapsConfirmed: true, diversityExceptionReason: '남은 모드 확인' });
    expect(snapshot.candidates).toHaveLength(count);
    expect(snapshot.randomPool).toHaveLength(0);
  });
  it('requires a reason for a single diversity group, treating hybrid and escort alike', () => {
    const catalog = { ...maps, entries: [maps.entries[1], maps.entries[2]] };
    expect(() => candidates({ catalog, remainingMapsConfirmed: true })).toThrow('다양성');
  });
  it('never repopulates exhausted maps', () => {
    expect(() => candidates({ usedCanonicalMapIds: maps.entries.map(map => map.canonicalMapId) })).toThrow('미사용 맵');
  });
  it.each([
    [[8, 2, 0, 0], 'LANDSLIDE'], [[7, 2, 1, 0], 'WEIGHTED'],
    [[6, 0, 0, 0], 'LANDSLIDE'], [[5, 5, 0, 0], 'WEIGHTED'],
  ] as const)('resolves %j with %s', (counts, method) => {
    const snapshot = candidates();
    const options = [...snapshot.candidates.map(candidate => candidate.map.mapId), 'RANDOM'];
    const ballots: (string | null)[] = counts.flatMap((count, index) => Array(count).fill(options[index]));
    while (ballots.length < 10) ballots.push(null);
    expect(resolveMapVote(snapshot, ballots, 2, rolls).method).toBe(method);
  });
  it('draws all abstentions from the full eligible pool and preserves visible starting sides', () => {
    const snapshot = candidates();
    const result = resolveMapVote(snapshot, Array(10).fill(null), 2, [0, ...rolls]);
    expect(result.map.mapId).toBe(snapshot.eligiblePool[0].mapId);
    const visible = snapshot.candidates.find(candidate => candidate.map.mapId === result.map.mapId);
    if (visible) expect(result.firstAttackTeam).toBe(visible.firstAttackTeam);
  });
  it('keeps random outcomes outside visible candidates', () => {
    const snapshot = candidates();
    const result = resolveMapVote(snapshot, Array(10).fill('RANDOM'), 2, rolls);
    expect(snapshot.candidates.some(candidate => candidate.map.mapId === result.map.mapId)).toBe(false);
  });
  it('rejects old history, noncandidate direct votes and invalid randomness', () => {
    const snapshot = candidates();
    expect(() => resolveMapVote(snapshot, Array(10).fill(null), 3, rolls)).toThrow('이력');
    expect(() => resolveMapVote(snapshot, Array(10).fill('invalid'), 2, rolls)).toThrow('후보');
    expect(() => candidates({ entropy: [1] })).toThrow('난수');
  });
});

describe('competitive hero ban rules', () => {
  it('uses 7/5/3 and subtracts a duplicate preference only once, including abstaining voters', () => {
    const result = bans({ 0: { ranking: ['h0', 'h3', 'h6'] }, 1: { preferredHeroId: 'h0' }, 2: { preferredHeroId: 'h0' } });
    expect(result.scores.A.find(score => score.heroId === 'h0')).toMatchObject({ positiveScore: 7, preferredDeduction: 3, effectiveScore: 4, lobbyVoterCount: 1 });
    expect(result.scores.A.find(score => score.heroId === 'h3')?.positiveScore).toBe(5);
    expect(result.scores.A.find(score => score.heroId === 'h6')?.positiveScore).toBe(3);
  });
  it('does not deduct from the opposing team or create candidates from preferences alone', () => {
    const result = bans({ 0: { preferredHeroId: 'h0' }, 5: { ranking: ['h0'] } });
    expect(result.scores.A).toEqual([]);
    expect(result.scores.B[0].effectiveScore).toBe(7);
  });
  it('excludes zero effective score and allows at most two bans for a voting team', () => {
    const result = bans({ 0: { ranking: ['h0', 'h3', 'h6'], preferredHeroId: 'h6' } });
    expect(result.bannedHeroIds).toHaveLength(2);
    expect(result.bannedHeroIds).not.toContain('h6');
    expect(result.slots.filter(slot => slot.team === 'B').every(slot => slot.heroId === null)).toBe(true);
  });
  it('uses the higher maximum to choose F and processes F/S/S/F', () => {
    const result = bans({ 0: { ranking: ['h0', 'h3'] }, 5: { ranking: ['h6', 'h4'] }, 6: { ranking: ['h6'] } });
    expect(result.firstTeam).toBe('B');
    expect(result.slots.map(slot => slot.team)).toEqual(['B', 'A', 'A', 'B']);
    expect(result.bannedHeroIds).toHaveLength(4);
  });
  it('skips duplicate heroes and a third hero of the same role without filling unused slots', () => {
    const result = bans({ 0: { ranking: ['h0', 'h1', 'h2'] }, 5: { ranking: ['h0', 'h2', 'h1'] } });
    expect(new Set(result.bannedHeroIds).size).toBe(result.bannedHeroIds.length);
    expect(result.roleCounts.TANK).toBe(2);
    expect(result.bannedHeroIds).toHaveLength(2);
    expect(result.slots.flatMap(slot => slot.skipped).some(skip => skip.reason === 'ROLE_LIMIT')).toBe(true);
  });
  it('uses lobby voter count after effective score ties', () => {
    const result = bans({ 0: { ranking: ['h0', 'h3'], preferredHeroId: 'h3' }, 1: { ranking: ['h4', 'h5', 'h6'] },
      2: { ranking: ['h7', 'h8', 'h3'] }, 5: { ranking: ['h3'] } });
    const tied = result.scores.A.filter(score => score.effectiveScore === 5);
    expect(tied[0].heroId).toBe('h3');
    expect(tied[0].lobbyVoterCount).toBe(3);
  });
  it('keeps deterministic tie decisions with the same saved entropy', () => {
    const votes = { 0: { ranking: ['h0'] }, 1: { ranking: ['h3'] }, 5: { ranking: ['h6'] } };
    expect(bans(votes)).toEqual(bans(votes));
  });
  it('returns zero bans for all abstentions and never adds a fifth slot', () => {
    expect(bans().bannedHeroIds).toEqual([]);
    expect(bans().slots).toEqual([]);
    const result = bans(Object.fromEntries(players.map((_, index) => [index, { ranking: ['h0', 'h3', 'h6'] }])));
    expect(result.slots).toHaveLength(4);
    expect(result.bannedHeroIds.length).toBeLessThanOrEqual(4);
  });
  it('rejects duplicate rankings, nonparticipants and inactive retained bans', () => {
    expect(() => bans({ 0: { ranking: ['h0', 'h0'] } })).toThrow('서로 다른');
    expect(() => bans({ 0: { ranking: ['missing'] } })).toThrow('비활성');
    expect(() => validateRetainedBans(heroes, ['h0', 'h1', 'h2'])).toThrow('역할군');
    expect(() => validateRetainedBans(heroes, ['h0', 'h0'])).toThrow('중복');
    expect(() => validateRetainedBans({ ...heroes, entries: heroes.entries.map(hero => ({ ...hero, active: false })) }, ['h0'])).toThrow('비활성');
  });
});
