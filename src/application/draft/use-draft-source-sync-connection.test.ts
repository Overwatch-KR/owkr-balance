import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '#domain/player';
import { useDraftSourceSync } from './use-draft-source-sync';
import { fetchMatchLiveSession, updateMatchLiveSession } from '../../utils/match-live-share';

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0,
  dependencies: new Map<number, readonly unknown[]>(), cleanups: new Map<number, () => void>(),
  effects: [] as { index: number; effect: () => void | (() => void) }[], remote: 1 }));
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = { current: initial };
    return harness.values[index];
  },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const index = harness.cursor++; const previous = harness.dependencies.get(index);
    if (previous && previous.length === dependencies.length && dependencies.every((value, i) => Object.is(value, previous[i]))) return;
    harness.dependencies.set(index, dependencies); harness.effects.push({ index, effect });
  },
}));
vi.mock('#domain/balance', () => ({ createMatchLiveParticipants: (players: Player[]) => players.map(player => ({ discordUserId: String(player.id), position: 'A_TANK' })) }));
vi.mock('../../utils/match-live-share', () => ({ fetchMatchLiveSession: vi.fn(), updateMatchLiveSession: vi.fn() }));
const players = (id: number) => [{ id }] as Player[];
function SourceSyncHarness({ input }: { input: Player[] }) {
  return useDraftSourceSync({ sourceId: 'SOURCE2345', players: input, result: null, csrfToken: 'csrf' });
}
function render(input: Player[]) {
  harness.cursor = 0;
  const value = SourceSyncHarness({ input });
  for (const { index, effect } of harness.effects.splice(0)) {
    harness.cleanups.get(index)?.(); const cleanup = effect();
    if (cleanup) harness.cleanups.set(index, cleanup); else harness.cleanups.delete(index);
  }
  return value;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchMatchLiveSession).mockImplementation(async () => ({ revision: harness.remote,
    participants: [{ discordUserId: String(harness.remote), position: 'A_TANK' }] }) as never);
  vi.mocked(updateMatchLiveSession).mockImplementation(async (_source, _revision, input) => {
    harness.remote = input[0].id; return {} as never;
  });
});
afterEach(() => {
  for (const cleanup of harness.cleanups.values()) cleanup();
  harness.values.length = 0; harness.cursor = 0; harness.effects.length = 0; harness.remote = 1;
  harness.dependencies.clear(); harness.cleanups.clear(); vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks();
});

describe('draft source edit scheduling', () => {
  it('does not publish stale restored state on initial attachment', async () => {
    harness.remote = 3;
    render(players(1)); await vi.advanceTimersByTimeAsync(400);
    expect(fetchMatchLiveSession).not.toHaveBeenCalled(); expect(harness.remote).toBe(3);
  });
  it('clears pending when an edit is reverted before its debounce expires', async () => {
    const original = players(1);
    render(original); render(players(2)); await vi.advanceTimersByTimeAsync(1);
    expect(render(players(2)).pending).toBe(true);
    render(original); await vi.advanceTimersByTimeAsync(400);
    expect(render(original).pending).toBe(false); expect(harness.remote).toBe(1);
  });
  it('publishes the reverted state after an already-running edit finishes', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(updateMatchLiveSession).mockImplementationOnce(async (_source, _revision, input) => {
      await new Promise<void>(resolve => { finish = resolve; }); harness.remote = input[0].id; return {} as never;
    });
    const original = players(1);
    render(original); render(players(2)); await vi.advanceTimersByTimeAsync(350);
    expect(finish).toBeDefined(); render(original); await vi.advanceTimersByTimeAsync(350);
    finish!(); await vi.advanceTimersByTimeAsync(1);
    expect(harness.remote).toBe(1); expect(updateMatchLiveSession).toHaveBeenCalledTimes(2);
    expect(render(original).pending).toBe(false);
  });
  it('does not restart a pending publish for equivalent roster object references', async () => {
    render(players(1)); render(players(2)); await vi.advanceTimersByTimeAsync(100);
    render(players(2)); await vi.advanceTimersByTimeAsync(250);
    expect(updateMatchLiveSession).toHaveBeenCalledTimes(1); expect(harness.remote).toBe(2);
    expect(render(players(2)).pending).toBe(false);
  });
});
