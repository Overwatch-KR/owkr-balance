import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const constructor = vi.hoisted(() => vi.fn());
vi.mock('@upstash/redis', () => ({ Redis: class { constructor(options: unknown) { constructor(options); } } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.resetModules(); });

describe('temporary server storage selection', () => {
  it('uses a scoped credential and the server gateway without touching Upstash', async () => {
    vi.stubEnv('OWKR_LOCAL_DATA_ONLY', 'false');
    vi.stubEnv('OWKR_STORAGE_BACKEND', 'server');
    vi.stubEnv('DRAFT_REALTIME_URL', 'https://draft.invalid');
    vi.stubEnv('DRAFT_BRIDGE_SECRET', 's'.repeat(40));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'old-token');
    const { getRedis } = await import('./redis');
    expect(getRedis()).toBe(getRedis());
    expect(constructor).toHaveBeenCalledExactlyOnceWith({ request: expect.any(Function) });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ backend: 'local' })));
    const requester = constructor.mock.calls[0][0];
    await requester.request({ body: ['GET', 'scrims:test'] });
    expect(fetch).toHaveBeenLastCalledWith('https://draft.invalid/storage', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: `Bearer ${createHmac('sha256', 's'.repeat(40)).update('owkr-local-storage-v1').digest('hex')}` }) }));
    fetch.mockRestore();
  });

  it('allows an explicit rollback to the unchanged Upstash configuration', async () => {
    vi.stubEnv('OWKR_LOCAL_DATA_ONLY', 'false');
    vi.stubEnv('OWKR_STORAGE_BACKEND', 'upstash');
    vi.stubEnv('DRAFT_REALTIME_URL', 'https://draft.invalid');
    vi.stubEnv('DRAFT_BRIDGE_SECRET', 's'.repeat(40));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://upstash.invalid');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'old-token');
    const { getRedis } = await import('./redis');
    getRedis();
    expect(constructor).toHaveBeenCalledExactlyOnceWith({ url: 'https://upstash.invalid', token: 'old-token', retry: false });
  });
});
