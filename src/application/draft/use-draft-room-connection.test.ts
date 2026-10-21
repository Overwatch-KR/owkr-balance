import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_CONNECTION_REPLACED_CLOSE_CODE } from '#domain/draft';
import { useDraftRoom } from './use-draft-room';

const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[],
  queryClient: { setQueryData: vi.fn(), removeQueries: vi.fn() }, setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useMemo: (compute: () => unknown) => compute(), useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => { const setter = vi.fn(); harness.setters.push(setter); return [initial, setter]; },
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: null }), useQueryClient: () => harness.queryClient }));

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  harness.effects.length = 0; harness.setters.length = 0;
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

function ConnectionHarness() {
  useDraftRoom({ roomCode: 'ROOM234567', mode: 'participant' });
  return null;
}

async function setup() {
  vi.useFakeTimers();
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn();
    constructor() { sockets.push(this); }
  }
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('window', { location: { href: 'https://site.invalid/draft/ROOM234567', hostname: 'site.invalid' } });
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ticket: 'ticket', expiresAt: Date.now() + 300000, realtimeUrl: 'https://draft.invalid' }) }));
  vi.stubGlobal('fetch', fetcher);
  ConnectionHarness();
  for (const effect of harness.effects.splice(0)) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
  await vi.advanceTimersByTimeAsync(0);
  sockets[0].onopen?.();
  return { sockets, fetcher };
}

describe('draft connection replacement recovery', () => {
  it('stops reconnect and ticket renewal when the server takes the connection over', async () => {
    const app = await setup();
    app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'connection.replaced' }) });
    // A lost closing handshake must not revive the old tab either.
    app.sockets[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.sockets).toHaveLength(1);
    expect(app.fetcher).toHaveBeenCalledTimes(1);
    expect(harness.setters[1]).toHaveBeenCalledWith(true);
    expect(harness.setters[3]).toHaveBeenCalledWith(expect.stringContaining('자동 재접속은 중지'));
  });
  it('also stops reconnect when only the replacement close code arrives', async () => {
    const app = await setup();
    app.sockets[0].onclose?.({ code: DRAFT_CONNECTION_REPLACED_CLOSE_CODE });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.sockets).toHaveLength(1);
    expect(app.fetcher).toHaveBeenCalledTimes(1);
  });
  it('discards late snapshots after replacement so they cannot reactivate the old tab', async () => {
    const app = await setup();
    app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'connection.replaced' }) });
    app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'room.snapshot', streamId: 'late', streamSeq: 1,
      epoch: 1, roomRevision: 2, payload: { epoch: 1, stageKind: null } }) });
    expect(harness.queryClient.setQueryData).not.toHaveBeenCalled();
    expect(harness.setters[0]).not.toHaveBeenCalledWith(true);
    app.sockets[0].onclose?.({ code: DRAFT_CONNECTION_REPLACED_CLOSE_CODE });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.fetcher).toHaveBeenCalledTimes(1);
  });
  it('continues automatic recovery for an ordinary connection failure', async () => {
    const app = await setup();
    app.sockets[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.sockets).toHaveLength(2);
    expect(app.fetcher).toHaveBeenCalledTimes(2);
  });
});
