import { afterEach, describe, expect, it, vi } from 'vitest';
import { participantEntry } from './use-draft-room';

function setup(code = true) {
  const location = { href: `https://site.invalid/draft/ROOM234567${code ? `?draft_code=${'c'.repeat(43)}` : ''}` };
  const replaceState = vi.fn((_state: unknown, _title: string, url: URL) => { location.href = String(url); });
  vi.stubGlobal('window', { location, history: { replaceState } });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  return { location, replaceState, fetcher };
}
const entry = () => ({ roomCode: 'ROOM234567', ticket: 'signed-ticket', expiresAt: Date.now() + 299_000, realtimeUrl: 'https://draft.invalid' });
const response = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => { vi.unstubAllGlobals(); });

describe('participant first entry request', () => {
  it('uses the exchanged ticket without an immediate refresh and removes the one-time code from the URL', async () => {
    const app = setup(); const result = entry(); app.fetcher.mockResolvedValueOnce(response(result));
    expect(await participantEntry('ROOM234567')).toEqual({ ticket: result.ticket, expiresAt: result.expiresAt, realtimeUrl: result.realtimeUrl });
    expect(app.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(app.fetcher.mock.calls[0][1].body).action).toBe('exchange');
    expect(app.location.href).not.toContain('draft_code');
  });

  it('refreshes on subsequent reconnects instead of reusing the initial ticket', async () => {
    const app = setup(); app.fetcher.mockResolvedValueOnce(response(entry()));
    await participantEntry('ROOM234567');
    app.fetcher.mockResolvedValueOnce(response({ ...entry(), ticket: 'fresh-ticket' }));
    expect((await participantEntry('ROOM234567')).ticket).toBe('fresh-ticket');
    expect(JSON.parse(app.fetcher.mock.calls[1][1].body).action).toBe('refresh');
  });

  it('falls back to refresh while an older server is still serving the exchange', async () => {
    const app = setup(); app.fetcher.mockResolvedValueOnce(response({ roomCode: 'ROOM234567' })).mockResolvedValueOnce(response(entry()));
    await participantEntry('ROOM234567');
    expect(app.fetcher.mock.calls.map(call => JSON.parse(call[1].body).action)).toEqual(['exchange', 'refresh']);
  });

  it('does not use a ticket for another room', async () => {
    const app = setup(); app.fetcher.mockResolvedValueOnce(response({ ...entry(), roomCode: 'OTHER23456' })).mockResolvedValueOnce(response(entry()));
    await participantEntry('ROOM234567');
    expect(app.fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not reuse expired tickets or keep a rejected exchange promise across retries', async () => {
    const app = setup(); app.fetcher.mockResolvedValueOnce(response({ ...entry(), expiresAt: Date.now() - 1 })).mockResolvedValueOnce(response(entry()));
    await participantEntry('ROOM234567'); expect(app.fetcher).toHaveBeenCalledTimes(2);
    const failed = setup(); failed.fetcher.mockRejectedValueOnce(new Error('temporary failure'));
    await expect(participantEntry('ROOM234567')).rejects.toThrow('temporary failure');
    failed.fetcher.mockResolvedValueOnce(response(entry()));
    await participantEntry('ROOM234567');
    expect(JSON.parse(failed.fetcher.mock.calls[1][1].body).action).toBe('refresh');
  });

  it('shares a single exchange when initial entry is requested twice before the first result arrives', async () => {
    const app = setup(); const result = entry(); let finish!: (value: Response) => void;
    app.fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
    const first = participantEntry('ROOM234567'); const second = participantEntry('ROOM234567');
    finish(response(result));
    expect(await first).toEqual(await second); expect(app.fetcher).toHaveBeenCalledTimes(1);
  });
});
