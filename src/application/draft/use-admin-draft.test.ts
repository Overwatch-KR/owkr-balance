import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminDraft } from './use-admin-draft';

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void | (() => void))[],
  controller: { snapshot: null, roomClosed: false }, request: vi.fn(), entry: vi.fn(), ref: { current: null } }));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: () => harness.ref,
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
  },
}));
vi.mock('./use-draft-room', () => ({ REALTIME_DRAFT_ENABLED: true,
  useDraftRoom: () => harness.controller, draftRequest: harness.request, adminDraftEntry: harness.entry }));
afterEach(() => {
  harness.values.length = 0; harness.effects.length = 0; harness.cursor = 0;
  harness.controller = { snapshot: null, roomClosed: false }; harness.ref.current = null;
  vi.unstubAllGlobals(); vi.clearAllMocks();
});
function AdminDraftHarness() {
  return useAdminDraft({ userId: 'operator', csrfToken: 'csrf' });
}
function render() {
  harness.cursor = 0;
  const result = AdminDraftHarness();
  for (const effect of harness.effects.splice(0)) effect();
  return result;
}

describe('admin closed room memory', () => {
  it('reuses a request only for the same source and gives an independent source a new request id', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    const draft = render();
    harness.entry.mockResolvedValue({ ticket: 'entry', realtimeUrl: 'https://draft.invalid' });
    harness.request.mockRejectedValue(new Error('unavailable'));
    await expect(draft.createRoom('SOURCE2345')).rejects.toThrow('unavailable');
    await expect(draft.createRoom('SOURCE2345')).rejects.toThrow('unavailable');
    harness.request.mockResolvedValue({ roomCode: 'NEWROOM234' });
    await draft.createRoom('SOURCE6789');
    const ids = harness.request.mock.calls.map(call => call[1].commandId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });
  it('forgets the closed room and permits creation of a new independent room', async () => {
    const storage = new Map([['owkr:draft:v1:operator', JSON.stringify({ code: 'ROOM234567', expiresAt: Date.now() + 60000 })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) });
    expect(render().roomCode).toBe('ROOM234567');
    harness.controller.roomClosed = true;
    render();
    expect(storage.has('owkr:draft:v1:operator')).toBe(false);
    const closed = render(); expect(closed.roomCode).toBeNull();
    harness.entry.mockResolvedValue({ ticket: 'entry', realtimeUrl: 'https://draft.invalid' });
    harness.request.mockResolvedValue({ roomCode: 'NEWROOM234' });
    await closed.createRoom('LOCAL23456');
    harness.controller.roomClosed = false;
    expect(render().roomCode).toBe('NEWROOM234');
  });
});
