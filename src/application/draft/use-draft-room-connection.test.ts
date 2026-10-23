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

async function setup(failureCode?: string, status = failureCode ? 400 : 200, admission?: { status: 'WAITING' | 'EXCLUDED'; displayName: string; participantCount: number }) {
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
  const fetcher = vi.fn(async () => ({ ok: status < 400, status, json: async (): Promise<Record<string, unknown>> => status >= 400 ? { code: failureCode, error: '요청을 확인해 주세요.' } : admission ? { admission } : ({ ticket: 'ticket', expiresAt: Date.now() + 300000, realtimeUrl: 'https://draft.invalid' }) }));
  vi.stubGlobal('fetch', fetcher);
  ConnectionHarness();
  for (const effect of harness.effects.splice(0)) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
  await vi.advanceTimersByTimeAsync(0);
  sockets[0]?.onopen?.();
  return { sockets, fetcher };
}

describe('draft connection replacement recovery', () => {
  it('polls waiting and excluded status without sockets or another login and connects when assigned', async () => {
    const app = await setup(undefined, 200, { status: 'WAITING', displayName: '하늘', participantCount: 0 });
    expect(app.sockets).toHaveLength(0);
    expect(harness.setters[8]).toHaveBeenCalledWith(expect.objectContaining({ status: 'WAITING' }));
    app.fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ admission: { status: 'EXCLUDED', displayName: '하늘', participantCount: 10 } }) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(harness.setters[8]).toHaveBeenCalledWith(expect.objectContaining({ status: 'EXCLUDED' }));
    expect(app.sockets).toHaveLength(0);
    app.fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ticket: 'new-ticket', expiresAt: Date.now() + 300000, realtimeUrl: 'https://draft.invalid' }) });
    await vi.advanceTimersByTimeAsync(5000);
    expect(app.sockets).toHaveLength(1);
    expect(harness.setters[7]).not.toHaveBeenCalledWith(true);
    expect(app.fetcher.mock.calls).toHaveLength(3);
  });
  it('stops waiting polls and shows room absence when the waiting room disappears', async () => {
    const app = await setup(undefined, 200, { status: 'WAITING', displayName: '하늘', participantCount: 0 });
    app.fetcher.mockResolvedValueOnce({ ok: false, status: 410, json: async () => ({ code: 'ROOM_EXPIRED', error: '없는 방' }) });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.fetcher).toHaveBeenCalledTimes(2); expect(app.sockets).toHaveLength(0);
    expect(harness.setters[9]).toHaveBeenCalledWith('ROOM_EXPIRED');
    expect(harness.setters[7]).not.toHaveBeenCalledWith(true);
  });
  it.each([400, 401, 403])('requests participant login only after an authentication rejection (%s)', async status => {
    const app = await setup('AUTH_REQUIRED', status);
    await vi.advanceTimersByTimeAsync(360000);
    expect(harness.setters[7]).toHaveBeenCalledWith(true);
    expect(app.fetcher).toHaveBeenCalledTimes(1);
    expect(app.sockets).toHaveLength(0);
  });
  it('does not turn a service outage into a participant logout', async () => {
    const app = await setup('UNAVAILABLE', 503);
    expect(harness.setters[7]).not.toHaveBeenCalledWith(true);
    expect(app.sockets).toHaveLength(0);
  });
  it('stops automatic reconnect and late updates when participant renewal is rejected', async () => {
    const app = await setup();
    app.fetcher.mockResolvedValueOnce({ ok: false, status: 401,
      json: async () => ({ code: 'PARTICIPANT_SESSION_EXPIRED', error: '참가 인증이 만료되었습니다.' }) });
    await vi.advanceTimersByTimeAsync(270000);
    app.sockets[0].onclose?.({ code: 1006 });
    app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'room.snapshot', streamId: 'late', streamSeq: 1,
      payload: { epoch: 1, stageKind: null } }) });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.fetcher).toHaveBeenCalledTimes(2);
    expect(app.sockets).toHaveLength(1);
    expect(harness.setters[7]).toHaveBeenLastCalledWith(true);
    expect(harness.queryClient.setQueryData).not.toHaveBeenCalled();
  });
  it('ignores a late renewal rejection from a socket already replaced by a new connection', async () => {
    const app = await setup();
    type EntryResponse = Awaited<ReturnType<typeof app.fetcher>>;
    let finish!: (response: EntryResponse) => void;
    app.fetcher.mockReturnValueOnce(new Promise<EntryResponse>(resolve => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(270000);
    app.sockets[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.sockets).toHaveLength(2);
    finish({ ok: false, status: 401, json: async () => ({ code: 'PARTICIPANT_SESSION_EXPIRED', error: '이전 연결의 인증 만료' }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.setters[7]).not.toHaveBeenCalledWith(true);
    expect(app.sockets[1].close).not.toHaveBeenCalled();
  });
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
  it.each(['event', 'close-code', 'rejection'])('stops reconnect, ticket renewal and late updates after room closure via %s', async mode => {
    const app = await setup();
    if (mode === 'event') app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'room.closed' }) });
    if (mode === 'rejection') app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'command.rejected', code: 'ROOM_CLOSED', message: '종료된 방입니다.' }) });
    app.sockets[0].onclose?.({ code: mode === 'close-code' ? 4002 : 1006 });
    app.sockets[0].onmessage?.({ data: JSON.stringify({ type: 'room.snapshot', streamId: 'late', streamSeq: 1,
      epoch: 1, roomRevision: 2, payload: { epoch: 1, stageKind: null } }) });
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.sockets).toHaveLength(1); expect(app.fetcher).toHaveBeenCalledTimes(1);
    expect(harness.queryClient.setQueryData).not.toHaveBeenCalled();
  });
  it.each(['ROOM_CLOSED', 'ROOM_EXPIRED', 'INACTIVE_ROOM'])('clears an unavailable room (%s) during initial HTTP recovery without opening a socket', async code => {
    const app = await setup(code);
    await vi.advanceTimersByTimeAsync(360000);
    expect(app.sockets).toHaveLength(0); expect(app.fetcher).toHaveBeenCalledTimes(1);
    expect(harness.setters[6]).toHaveBeenCalledWith(true);
  });
  it('continues automatic recovery for an ordinary connection failure', async () => {
    const app = await setup();
    app.sockets[0].onclose?.({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1600);
    expect(app.sockets).toHaveLength(2);
    expect(app.fetcher).toHaveBeenCalledTimes(2);
    expect(harness.setters[7]).not.toHaveBeenCalledWith(true);
  });
});
