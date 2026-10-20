import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLocalDraftFixtures } from './local-fixtures.js';
import { DraftEngine, parseDraftCommand } from './engine.js';
import { SOURCE_POSITIONS } from './source.js';
import { DraftParticipantAuth } from './participant-auth.js';
import { verifyDraftTicket } from './tickets.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const contextHash = createHash('sha256').update('browser-only-context').digest('hex');

async function setup(discordId?: string, siteAdminParticipant = false) {
  const fixture = createLocalDraftFixtures(Date.now(), { syntheticCatalogs: true });
  if (siteAdminParticipant) {
    fixture.identities[1].discordUserId = '464712715487805442';
    fixture.store.setSource('LOCAL23456', { revision: 1, expiresAt: Date.now() + 3 * 60 * 60 * 1000,
      participants: fixture.identities.map((identity, index) => ({ discordUserId: identity.discordUserId, position: SOURCE_POSITIONS[index] })),
    });
  }
  await fixture.store.acquireLease();
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
    const firstEntry = verifyDraftTicket(session.ticket, keys.publicKey, 'realtime-entry', Date.now());
    expect(firstEntry.sub).toBe(app.fixture.identities[1].discordUserId);
    expect(firstEntry.roomCode).toBe(app.roomCode);
    expect(firstEntry.scope).toBe('join');
    expect(firstEntry.iss).toBe('owkr-realtime');
    expect(firstEntry.exp - firstEntry.iat).toBeLessThanOrEqual(300);
    expect(session.ticketExpiresAt).toBe(firstEntry.exp * 1000);
    expect(session.ticketExpiresAt).toBeLessThan(session.expiresAt);
    await expect(app.auth.exchange(code, contextHash)).rejects.toThrow('이미 사용');
    const refreshed = await app.auth.refresh(session.handle, app.roomCode);
    const identity = verifyDraftTicket(refreshed.ticket, keys.publicKey, 'realtime-entry', Date.now());
    expect(identity.sub).toBe(app.fixture.identities[1].discordUserId);
    expect(identity.scope).toBe('join'); expect(identity.iss).toBe('owkr-realtime');
    await expect(app.auth.refresh(session.handle, 'OTHER23456')).rejects.toThrow('이 방');
  });
  it('allows a site administrator to participate without granting room operator authority', async () => {
    const app = await setup(undefined, true);
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const refreshed = await app.auth.refresh(session.handle, app.roomCode);
    const identity = verifyDraftTicket(refreshed.ticket, keys.publicKey, 'realtime-entry', Date.now());
    await app.engine.connect(identity, 'site-admin-participant');
    let snapshot = await app.engine.snapshot('site-admin-participant');
    expect(snapshot.selfDiscordId).toBe('464712715487805442');
    expect(snapshot.isOperator).toBe(false);
    expect(snapshot.progress).toBeUndefined();
    await app.engine.command('site-admin-participant', parseDraftCommand({ type: 'ready.set', commandId: 'participant-ready',
      epoch: snapshot.epoch, expectedRevision: snapshot.roomRevision, ready: true }));
    snapshot = await app.engine.snapshot('site-admin-participant');
    expect(snapshot.selfReady).toBe(true);
    await expect(app.engine.command('site-admin-participant', parseDraftCommand({ type: 'draft.pause', commandId: 'participant-cannot-control',
      epoch: snapshot.epoch, expectedRevision: snapshot.roomRevision, reason: '권한 검증' }))).rejects.toThrow('권한');
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
  it('rechecks membership before issuing the first ticket after the OAuth callback', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    const source = JSON.parse((await app.fixture.store.readSource('LOCAL23456')).raw!);
    source.participants[1].discordUserId = app.fixture.identities[0].discordUserId;
    source.revision++;
    app.fixture.store.setSource('LOCAL23456', source);
    await expect(app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash)).rejects.toThrow('명단');
  });
});
