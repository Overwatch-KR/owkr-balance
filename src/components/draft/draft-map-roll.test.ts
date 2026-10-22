import { describe, expect, it } from 'vitest';
import { createMapCandidates, resolveMapVote, DEFAULT_DRAFT_MAP_CATALOG } from '#domain/draft';
import { createDraftMapRollPlan, getDraftMapRollFrame } from './draft-map-roll';

function example(counts: readonly number[] = [2, 4, 3, 1], draw = 0.1) {
  const candidates = createMapCandidates({ resolutionId: 'roulette-test', catalog: DEFAULT_DRAFT_MAP_CATALOG,
    usedCanonicalMapIds: [], excludedCanonicalMapIds: [], mapHistoryRevision: 1, entropy: Array(64).fill(0.31) });
  const options = [...candidates.candidates.map(option => option.map.mapId), 'RANDOM'];
  const votes: (string | null)[] = counts.flatMap((count, index) => Array(count).fill(options[index]));
  while (votes.length < 10) votes.push(null);
  return { candidates, mapResult: resolveMapVote(candidates, votes, 1, [draw, ...Array(64).fill(0.31)]) };
}

describe('map roulette presentation', () => {
  it('uses one anonymous slot per vote and lands on the server-selected map', () => {
    const snapshot = example();
    const plan = createDraftMapRollPlan(snapshot);
    expect(plan.voteSlots).toHaveLength(10);
    expect(snapshot.candidates.candidates.map(option => plan.voteSlots.filter(slot => slot.optionId === option.map.mapId).length)).toEqual([2, 4, 3]);
    expect(plan.phases).toHaveLength(1);
    const last = plan.phases[0].frames.at(-1)!;
    expect(plan.voteSlots.find(slot => slot.id === last.slotId)?.optionId).toBe(snapshot.mapResult.selectedOption);
    expect(getDraftMapRollFrame(plan, plan.resultAtMs - 1).finished).toBe(false);
    expect(getDraftMapRollFrame(plan, plan.resultAtMs).finished).toBe(true);
    expect(plan.resultAtMs).toBe(snapshot.mapResult.rollDurationMs);
  });

  it('replays identical frames for all viewers and resumes at the common elapsed time', () => {
    const snapshot = example();
    const first = createDraftMapRollPlan(snapshot);
    const reconnected = createDraftMapRollPlan(structuredClone(snapshot));
    expect(reconnected).toEqual(first);
    expect(getDraftMapRollFrame(first, 1250)).toEqual(getDraftMapRollFrame(reconnected, 1250));
    expect(getDraftMapRollFrame(reconnected, 4000).finished).toBe(true);
  });

  it('limits early speed and slows to long final steps before holding the winner', () => {
    const snapshot = example();
    const variants = Array.from({ length: 20 }, (_, index) => createDraftMapRollPlan({ ...snapshot,
      mapResult: { ...snapshot.mapResult, resolutionId: `roulette-${index}`, rollDurationMs: 2500 + index * 70 } }));
    expect(new Set(variants.map(plan => plan.resultAtMs)).size).toBeGreaterThan(10);
    expect(new Set(variants.map(plan => plan.phases[0].frames[0].slotId)).size).toBeGreaterThan(3);
    expect(new Set(variants.map(plan => plan.phases[0].frames.length)).size).toBeGreaterThan(2);
    for (const plan of variants) {
      const phase = plan.phases[0];
      const last = phase.frames.at(-1)!;
      expect(phase.slots.find(slot => slot.id === last.slotId)?.optionId).toBe(snapshot.mapResult.selectedOption);
      const intervals = phase.frames.slice(1).map((frame, index) => frame.atMs - phase.frames[index].atMs);
      expect(intervals.every(interval => interval > 0)).toBe(true);
      expect(Math.min(...intervals)).toBeGreaterThanOrEqual(60);
      expect(intervals.at(-1)!).toBeGreaterThan(300);
      expect(intervals.every((interval, index) => index === 0 || interval > intervals[index - 1])).toBe(true);
      expect(phase.durationMs - last.atMs).toBeGreaterThanOrEqual(150);
    }
  });

  it('never creates tickets for zero-vote maps', () => {
    const snapshot = example([5, 5, 0, 0]);
    const plan = createDraftMapRollPlan(snapshot);
    expect(plan.voteSlots.some(slot => slot.optionId === snapshot.candidates.candidates[2].map.mapId)).toBe(false);
    expect(plan.voteSlots.some(slot => slot.optionId === 'RANDOM')).toBe(false);
  });

  it('lands on random in one vote loop then reveals the server-selected outside map directly', () => {
    const snapshot = example([2, 4, 3, 1], 0.99);
    expect(snapshot.mapResult.selectedOption).toBe('RANDOM');
    const plan = createDraftMapRollPlan(snapshot);
    expect(plan.phases.map(phase => phase.kind)).toEqual(['VOTE']);
    const phase = plan.phases[0];
    expect(phase.slots.find(slot => slot.id === phase.frames.at(-1)?.slotId)?.optionId).toBe('RANDOM');
    expect(snapshot.candidates.randomPool.some(map => map.mapId === snapshot.mapResult.map.mapId)).toBe(true);
    expect(plan.resultAtMs).toBe(snapshot.mapResult.rollDurationMs);
  });

  it('uses the full eligible pool for abstentions and skips vote roulette for landslides and direct picks', () => {
    const abstained = example([0, 0, 0, 0]);
    const plan = createDraftMapRollPlan(abstained);
    expect(plan.voteSlots).toEqual([]);
    expect(plan.phases.map(phase => phase.kind)).toEqual(['MAP']);
    expect(plan.phases[0].slots).toHaveLength(abstained.candidates.eligiblePool.length);
    const landslide = example([8, 2, 0, 0]);
    expect(createDraftMapRollPlan(landslide).phases).toEqual([]);
    expect(createDraftMapRollPlan({ ...landslide, mapResult: { ...landslide.mapResult, method: 'POTG' } }).resultAtMs).toBe(0);
    expect(createDraftMapRollPlan(example([0, 0, 0, 10])).phases).toEqual([]);
  });

  it('always moves to the next slot on the right and wraps the end to the start', () => {
    let wrapped = false;
    for (let index = 0; index < 40; index++) {
      const snapshot = example();
      snapshot.mapResult.resolutionId = `forward-${index}`;
      for (const phase of createDraftMapRollPlan(snapshot).phases) {
        const positions = phase.frames.map(frame => phase.slots.findIndex(slot => slot.id === frame.slotId));
        positions.slice(1).forEach((position, step) => {
          expect(position).toBe((positions[step] + 1) % phase.slots.length);
          if (position === 0) wrapped = true;
        });
      }
    }
    expect(wrapped).toBe(true);
  });
});
