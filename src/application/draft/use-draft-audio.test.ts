import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftRoomSnapshot } from '#domain/draft';
import { useDraftAudio } from './use-draft-audio';

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0,
  effects: [] as { deps: unknown[]; run: () => void | (() => void); cleanup?: () => void; changed: boolean }[],
  audio: { preload: vi.fn(), unlock: vi.fn(async () => true), dispose: vi.fn(), stop: vi.fn(), stopAll: vi.fn(), play: vi.fn<(sound: string, channel: string, options?: unknown) => Promise<null>>(async () => null), setEnabled: vi.fn() },
}));
vi.mock('./draft-audio', () => ({ BAN_BGM_VOLUME: 0.12, createDraftAudio: () => harness.audio }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useState: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.values)) harness.values[i] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[i], (next: unknown) => { harness.values[i] = typeof next === 'function' ? next(harness.values[i]) : next; }];
  },
  useRef: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.values)) harness.values[i] = { current: initial };
    return harness.values[i];
  },
  useEffect: (run: () => void | (() => void), deps: unknown[]) => {
    const i = harness.cursor++;
    const old = harness.effects[i];
    const changed = !old || deps.some((dep, index) => dep !== old.deps[index]);
    harness.effects[i] = { run, deps, cleanup: old?.cleanup, changed };
  },
}));
function view(phase: DraftRoomSnapshot['phase'] = 'MAP_VOTING', overrides: Partial<DraftRoomSnapshot> = {}): DraftRoomSnapshot {
  return { roomCode: 'test', gameId: 'game', epoch: 1, phase, serverNow: 1000,
    timer: { status: 'ACTIVE', deadlineAt: 11000 }, ...overrides } as DraftRoomSnapshot;
}
function DraftAudioHarness(snapshot: DraftRoomSnapshot, connected: boolean) {
  return useDraftAudio(snapshot, connected);
}
function render(snapshot: DraftRoomSnapshot, connected = true) {
  harness.cursor = 0;
  const result = DraftAudioHarness(snapshot, connected);
  for (const effect of harness.effects) if (effect?.changed) { effect.cleanup?.(); effect.cleanup = effect.run() || undefined; effect.changed = false; }
  return result;
}
async function activate(snapshot: DraftRoomSnapshot) {
  render(snapshot).toggle(); await Promise.resolve(); await Promise.resolve(); render(snapshot);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
});
afterEach(() => {
  for (const effect of harness.effects) effect?.cleanup?.();
  harness.effects.length = 0; harness.values.length = 0; harness.cursor = 0;
  vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('draft phase audio', () => {
  it('attempts autoplay on entry and announces the map without requiring a click', async () => {
    const snapshot = view();
    render(snapshot);
    expect(harness.audio.unlock).toHaveBeenCalledOnce();
    await Promise.resolve(); await Promise.resolve();
    render(snapshot);
    expect(harness.audio.play).toHaveBeenCalledWith('mapStart', 'voice');
  });
  it('keeps autoplay blocked until browser activation succeeds', async () => {
    harness.audio.unlock.mockResolvedValueOnce(false);
    const snapshot = view();
    render(snapshot); await Promise.resolve(); await Promise.resolve();
    expect(render(snapshot).ready).toBe(false);
    expect(harness.audio.play).not.toHaveBeenCalled();
    await activate(snapshot);
    expect(harness.audio.play).toHaveBeenCalledWith('mapStart', 'voice');
  });
  it('starts the countdown at five seconds and keeps its loop across incoming revisions', async () => {
    const snapshot = view(); await activate(snapshot);
    expect(harness.audio.play).toHaveBeenCalledWith('mapStart', 'voice');
    await vi.advanceTimersByTimeAsync(4950);
    expect(harness.audio.play).not.toHaveBeenCalledWith('countdown', 'countdown', expect.anything());
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.audio.play).toHaveBeenCalledWith('countdown', 'countdown', { loop: true });
    render({ ...snapshot, roomRevision: 2, serverNow: 6000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(harness.audio.play.mock.calls.filter(([sound]) => sound === 'countdown')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4500);
    expect(harness.audio.stop).toHaveBeenCalledWith('countdown');
  });
  it('stops the bed and countdown on pause/disconnect and stops the bed before results', async () => {
    const snapshot = view('HERO_VOTING'); await activate(snapshot);
    expect(harness.audio.play).toHaveBeenCalledWith('banStart', 'voice');
    expect(harness.audio.play).toHaveBeenCalledWith('banBgm', 'bgm', { loop: true, volume: 0.12 });
    render({ ...snapshot, timer: { ...snapshot.timer, status: 'PAUSED' } });
    expect(harness.audio.setEnabled).toHaveBeenLastCalledWith(false);
    render(snapshot, false);
    render(snapshot, true);
    expect(harness.audio.play.mock.calls.filter(([sound]) => sound === 'banStart')).toHaveLength(1);
    harness.audio.stop.mockClear();
    render(view('HERO_RESOLVED'));
    expect(harness.audio.stop).toHaveBeenCalledWith('bgm');
    expect(harness.audio.stop).toHaveBeenCalledWith('countdown');
  });
  it('mutes every channel and never replays the stage announcement after unmuting', async () => {
    const snapshot = view('HERO_VOTING'); await activate(snapshot);
    render(snapshot).toggle(); render(snapshot);
    expect(harness.audio.setEnabled).toHaveBeenLastCalledWith(false);
    render(snapshot).toggle(); render(snapshot);
    expect(harness.audio.setEnabled).toHaveBeenLastCalledWith(true);
    expect(harness.audio.play.mock.calls.filter(([sound]) => sound === 'banStart')).toHaveLength(1);
  });
});
