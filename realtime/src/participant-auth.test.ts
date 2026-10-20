import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLocalDraftFixtures } from './local-fixtures.js';
import { DraftEngine } from './engine.js';
import { DraftParticipantAuth } from './participant-auth.js';
import { verifyDraftTicket } from './tickets.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const contextHash = createHash('sha256').update('browser-only-context').digest('hex');

async function setup(discordId?: string) {
  const fixture = createLocalDraftFixtures(Date.now(), { syntheticCatalogs: true }); await fixture.store.acquireLease();
  const engine = new DraftEngine(fixture.store, fixture.catalogs);
  const now = Math.floor(Date.now() / 1000);
  const roomCode = await engine.createRoom({ iss: 'owkr-vercel', aud: 'owkr-draft', purpose: 'admin-entry',
    sub: fixture.identities[0].discordUserId, displayName: '운영자', roomCode: null, scope: 'create', jti: 'create', iat: now, exp: now + 60,
  }, 'LOCAL23456', 'create');
  const calls: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    calls.push(String(input));
    return new Response(JSON.stringify(String(input).endsWith('/token')
      ? { access_token: 'secret-oauth-access-token', token_type: 'Bearer', scope: 'identify' }
      : { id: discordId ?? fixture.identities[1].discordUserId, username: 'participant' }), { status: 200 });
  }) as typeof fetch;
  const auth = new DraftParticipantAuth({ engine, appOrigin: 'https://site.invalid', publicOrigin: 'https://draft.invalid',
    clientId: 'client', clientSecret: 'secret', privateKey: keys.privateKey, fetch: fetcher });
  const redirect = new URL(await auth.begin(roomCode, contextHash));
  return { auth, engine, fixture, roomCode, state: redirect.searchParams.get('state')!, calls, redirect };
}

describe('participant-specific OAuth and same-site recovery', () => {
  it('uses only identify and returns only a short one-time code to the existing site', async () => {
    const app = await setup();
    expect(app.redirect.origin).toBe('https://discord.com'); expect(app.redirect.searchParams.get('scope')).toBe('identify');
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    expect(redirect.origin).toBe('https://site.invalid'); expect(redirect.pathname).toBe(`/draft/${app.roomCode}`);
    expect(redirect.searchParams.get('draft_code')).toHaveLength(43);
    expect(redirect.toString()).not.toContain('secret');
    await expect(app.auth.callback('discord-code', app.state, 'https://discord.com')).rejects.toThrow('이미 사용');
  });
  it('exchanges once, validates browser context and restores only the assigned identity', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    const code = redirect.searchParams.get('draft_code')!;
    const session = await app.auth.exchange(code, contextHash);
    await expect(app.auth.exchange(code, contextHash)).rejects.toThrow('이미 사용');
    const refreshed = await app.auth.refresh(session.handle, app.roomCode);
    const identity = verifyDraftTicket(refreshed.ticket, keys.publicKey, 'realtime-entry', Date.now());
    expect(identity.sub).toBe(app.fixture.identities[1].discordUserId);
    expect(identity.scope).toBe('join'); expect(identity.iss).toBe('owkr-realtime');
    await expect(app.auth.refresh(session.handle, 'OTHER23456')).rejects.toThrow('이 방');
  });
  it('rejects a wrong browser context without creating a session', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    await expect(app.auth.exchange(redirect.searchParams.get('draft_code')!, 'a'.repeat(64))).rejects.toThrow('브라우저');
  });
  it('denies unlisted Discord identities and foreign issuers', async () => {
    const app = await setup('999999999999999999');
    await expect(app.auth.callback('code', app.state, 'https://malicious.invalid')).rejects.toThrow('응답');
    expect(app.calls).toHaveLength(0);
    await expect(app.auth.callback('code', app.state, 'https://discord.com')).rejects.toThrow('명단');
  });
  it('rechecks roster membership on refresh instead of trusting a surviving session handle', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const source = JSON.parse((await app.fixture.store.readSource('LOCAL23456')).raw!);
    source.participants[1].discordUserId = app.fixture.identities[0].discordUserId; source.revision++;
    app.fixture.store.setSource('LOCAL23456', source);
    await expect(app.auth.refresh(session.handle, app.roomCode)).rejects.toThrow('제외');
  });
});
