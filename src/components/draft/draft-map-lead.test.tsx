import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMapCandidates, DEFAULT_DRAFT_MAP_CATALOG, getMapVoteLead, resolveMapVote } from '#domain/draft';
import { DraftMapLead } from './draft-map-lead';

describe('live map landslide indicator', () => {
  it.each([
    { counts: [7, 2, 1, 0], lead: 5, reached: false },
    { counts: [8, 2, 0, 0], lead: 6, reached: true },
    { counts: [5, 5, 0, 0], lead: 0, reached: false },
    { counts: [2, 0, 0, 8], lead: 6, reached: true, random: true },
    { counts: [6, 0, 0, 0], lead: 6, reached: true },
  ])('agrees with server resolution for $counts', ({ counts, lead, reached, random }) => {
    const candidates = createMapCandidates({ resolutionId: 'lead-test', catalog: DEFAULT_DRAFT_MAP_CATALOG,
      usedCanonicalMapIds: [], excludedCanonicalMapIds: [], mapHistoryRevision: 1, entropy: Array(64).fill(.31) });
    const ids = [...candidates.candidates.map(option => option.map.mapId), 'RANDOM'];
    const totals = Object.fromEntries(ids.map((id, i) => [id, counts[i]]));
    const option = random ? 'RANDOM' : ids[0];
    const ballots: (string | null)[] = counts.flatMap((count, i) => Array<string>(count).fill(ids[i]));
    while (ballots.length < 10) ballots.push(null);
    const result = resolveMapVote(candidates, ballots, 1, Array(64).fill(.31));
    expect(result.method === 'LANDSLIDE').toBe(reached);
    expect(getMapVoteLead(totals, option)).toBe(lead);
    const markup = renderToStaticMarkup(<DraftMapLead optionId={option} name="맵" totals={totals} />);
    if (reached) {
      expect(markup).toContain('draft-map-dominance');
      expect(markup).toContain('6표 이상 차이로 압승 조건 도달');
      expect(markup).not.toContain('role="meter"');
    } else expect(markup).toBe('');
    expect(getMapVoteLead(totals, ids[random ? 0 : 1])).toBe(0);
  });

  it('shows no lead for empty voting and removes the effect after a changed ballot', () => {
    expect(getMapVoteLead({}, 'map')).toBe(0);
    const render = (a: number, b: number) => renderToStaticMarkup(<DraftMapLead optionId="map" name="맵" totals={{ map: a, other: b }} />);
    expect(render(8, 2)).toContain('draft-map-dominance');
    expect(render(7, 2)).toBe('');
    expect(render(7, 3)).toBe('');
  });
});
