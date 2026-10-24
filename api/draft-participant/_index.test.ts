import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './index.js';

function request(body: unknown, headers: Record<string, string> = {}): VercelRequest {
  return { method: 'POST', body, headers: { host: 'site.example.invalid', origin: 'https://site.example.invalid',
    'content-type': 'application/json', ...headers } } as VercelRequest;
}
function response(): VercelResponse {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as unknown as VercelResponse;
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure() {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_ORIGIN', 'https://site.example.invalid');
  vi.stubEnv('DRAFT_REALTIME_URL', 'https://draft.example.invalid'); vi.stubEnv('DRAFT_BRIDGE_SECRET', 'x'.repeat(40));
}

describe('same-site participant session bridge', () => {
  it('requires a same-site JSON POST before sending any server-side request', async () => {
    configure(); const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request({ action: 'start', roomCode: 'ROOM234567' }, { origin: 'https://attacker.invalid' }), res);
    expect(res.status).toHaveBeenCalledWith(403); expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns only the safe closed-room code instead of upstream private error text', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'ROOM_CLOSED', message: 'private upstream details' }), { status: 400 })));
    const res = response(); await handler(request({ action: 'start', roomCode: 'ROOM234567' }), res);
    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith({ code: 'ROOM_CLOSED', error: '종료된 내전입니다. 운영자에게 새 공유 링크를 요청해 주세요.' });
  });
  it('sets an HttpOnly browser context while exposing only the 디스코드 redirect', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ redirect: 'https://discord.com/oauth2/authorize?state=abc' }))));
    const res = response(); await handler(request({ action: 'start', roomCode: 'ROOM234567' }), res);
    const cookie = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find((call: readonly unknown[]) => call[0] === 'Set-Cookie')?.[1] as string;
    expect(cookie).toContain('owkr_draft_oauth_context='); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure');
    expect(cookie).not.toContain('owkr_session');
    expect(res.json).toHaveBeenCalledWith({ redirect: 'https://discord.com/oauth2/authorize?state=abc' });
  });
  it.each([
    ['ROOM_EXPIRED', 410, '새 공유 링크'],
    ['INACTIVE_ROOM', 410, '새 공유 링크'],
    ['BRIDGE_ACCESS_DENIED', 503, '연결 설정'],
    ['UNAVAILABLE', 503, '잠시 후'],
    ['NOT_PARTICIPANT', 403, '명단'],
    ['EXCHANGE_EXPIRED', 401, '다시 인증'],
    ['INVALID_AUTH_CONTEXT', 401, '브라우저'],
    ['INVALID_SESSION', 401, '다시 참여'],
    ['PARTICIPANT_SESSION_EXPIRED', 401, '만료'],
  ])('preserves the safe reason for %s without exposing upstream details', async (code, status, message) => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, message: 'private upstream details' }), { status: 400 })));
    const res = response();
    await handler(request({ action: 'start', roomCode: 'ROOM234567' }), res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ code, error: expect.stringContaining(message) });
    expect(JSON.stringify((res.json as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('private upstream details');
    expect((res.setHeader as ReturnType<typeof vi.fn>).mock.calls.some(call => call[0] === 'Set-Cookie')).toBe(false);
  });
  it.each(['network', 'html', 'unknown', 'null'])('reports %s upstream failure as service unavailability instead of a login failure', async kind => {
    configure();
    const fetcher = vi.fn();
    if (kind === 'network') fetcher.mockRejectedValue(new Error('private network details'));
    else fetcher.mockResolvedValue(new Response(kind === 'html' ? '<html>Bad Gateway</html>'
      : kind === 'null' ? 'null' : JSON.stringify({ code: 'PRIVATE_ERROR', message: 'private upstream details' }), { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    await handler(request({ action: 'start', roomCode: 'ROOM234567' }), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ code: 'UNAVAILABLE', error: expect.stringContaining('잠시 후') });
  });
  it('stores a room-scoped recovery handle in a separate secure cookie and never returns it to JavaScript', async () => {
    configure(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ handle: 'h'.repeat(43), roomCode: 'ROOM234567', expiresAt: Date.now() + 100_000 }))));
    const res = response(); await handler(request({ action: 'exchange', code: 'c'.repeat(43) }, { cookie: `owkr_draft_oauth_context=${'b'.repeat(43)}` }), res);
    const cookies = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find((call: readonly unknown[]) => call[0] === 'Set-Cookie')?.[1] as string[];
    expect(cookies[0]).toContain('owkr_draft_participant_ROOM234567='); expect(cookies[0]).toContain('HttpOnly'); expect(cookies[0]).toContain('Secure');
    expect(cookies[0]).not.toContain('owkr_session=');
    expect(res.json).toHaveBeenCalledWith({ roomCode: 'ROOM234567' });
  });
  it('requires the participant cookie, ignoring a surviving administrator cookie', async () => {
    configure(); const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ active: true }))); vi.stubGlobal('fetch', fetcher);
    const res = response(); await handler(request({ action: 'refresh', roomCode: 'ROOM234567' }, { cookie: 'owkr_session=administrator-cookie' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(fetcher.mock.calls[0][0]).toContain('/status');
  });
  it('shows missing or inactive rooms before asking a signed-out visitor to log in', async () => {
    configure();
    for (const code of ['ROOM_EXPIRED', 'INACTIVE_ROOM', 'ROOM_CLOSED']) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code }), { status: 400 })));
      const res = response(); await handler(request({ action: 'refresh', roomCode: 'ROOM234567' }), res);
      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code }));
    }
  });
  it('persists the waiting session cookie without exposing the handle or issuing a participant ticket', async () => {
    configure(); const admission = { status: 'WAITING', displayName: '대기 참가자', participantCount: 2 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      handle: 'h'.repeat(43), roomCode: 'ROOM234567', expiresAt: Date.now() + 100_000, admission,
    }))));
    const res = response();
    await handler(request({ action: 'exchange', code: 'c'.repeat(43) }, { cookie: `owkr_draft_oauth_context=${'b'.repeat(43)}` }), res);
    expect(res.json).toHaveBeenCalledWith({ roomCode: 'ROOM234567', admission });
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', expect.arrayContaining([expect.stringContaining('HttpOnly')]));
  });
  it('returns the first short-lived ticket while keeping the recovery handle in an HttpOnly cookie', async () => {
    configure();
    const expiresAt = Date.now() + 3_600_000;
    const ticketExpiresAt = Date.now() + 299_000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      handle: 'h'.repeat(43), roomCode: 'ROOM234567', expiresAt, ticket: 'signed-ticket', ticketExpiresAt,
    }))));
    const res = response();
    await handler(request({ action: 'exchange', code: 'c'.repeat(43) }, { cookie: `owkr_draft_oauth_context=${'b'.repeat(43)}` }), res);
    expect(res.json).toHaveBeenCalledWith({ roomCode: 'ROOM234567', ticket: 'signed-ticket',
      expiresAt: ticketExpiresAt, realtimeUrl: 'https://draft.example.invalid' });
    const cookies = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0] === 'Set-Cookie')?.[1] as string[];
    expect(cookies[0]).toContain('HttpOnly');
    expect(Number(cookies[0].match(/Max-Age=(\d+)/)?.[1])).toBeGreaterThanOrEqual(3599);
    expect(cookies[1]).toContain('Max-Age=0');
  });
  it.each(['expired', 'longer-than-session', 'missing-ticket'])('rejects an invalid first ticket: %s', async kind => {
    configure();
    const expiresAt = Date.now() + 100_000;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      handle: 'h'.repeat(43), roomCode: 'ROOM234567', expiresAt,
      ticket: kind === 'missing-ticket' ? undefined : 'signed-ticket',
      ticketExpiresAt: kind === 'expired' ? Date.now() - 1 : expiresAt + 1000,
    }))));
    const res = response();
    await handler(request({ action: 'exchange', code: 'c'.repeat(43) }, { cookie: `owkr_draft_oauth_context=${'b'.repeat(43)}` }), res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect((res.setHeader as ReturnType<typeof vi.fn>).mock.calls.some(call => call[0] === 'Set-Cookie')).toBe(false);
  });
});
