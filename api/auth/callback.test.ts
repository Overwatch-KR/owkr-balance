import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState } from '../_lib/auth.js';
import handler from './callback.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('general-site administrator login boundary', () => {
  it('blocks an ordinary participant and clears previous administrator cookies', async () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
    vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'false'); vi.stubEnv('APP_ORIGIN', 'https://site.example.invalid');
    vi.stubEnv('DISCORD_CLIENT_ID', 'client'); vi.stubEnv('DISCORD_CLIENT_SECRET', 'secret');
    const request = { method: 'GET', headers: { host: 'site.example.invalid' }, query: {} } as VercelRequest;
    const state = createOAuthState(request);
    request.headers.cookie = state.cookie.split(';')[0]; request.query = { code: 'code', state: state.state };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: '1000000000000000001', username: 'participant' })));
    vi.stubGlobal('fetch', fetcher);
    const response = { status: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn(), redirect: vi.fn(), setHeader: vi.fn() } as unknown as VercelResponse;
    await handler(request, response);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith(expect.stringContaining('접근 권한이 없습니다'));
    expect(response.send).toHaveBeenCalledWith(expect.stringContaining('공유받은 내전 링크'));
    const cookies = (response.setHeader as ReturnType<typeof vi.fn>).mock.calls.find(call => call[0] === 'Set-Cookie')?.[1] as string[];
    expect(cookies.find(cookie => cookie.startsWith('owkr_session='))).toContain('Max-Age=0');
    expect(response.redirect).not.toHaveBeenCalled();
  });
});
