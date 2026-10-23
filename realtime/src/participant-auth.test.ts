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

async function setup(discordId?: string, siteAdminParticipant = false, waitingCount?: number) {
  const fixture = createLocalDraftFixtures(Date.now(), { syntheticCatalogs: true });
  if (siteAdminParticipant) {
    fixture.identities[1].discordUserId = '464712715487805442';
    fixture.store.setSource('LOCAL23456', { revision: 1, expiresAt: Date.now() + 3 * 60 * 60 * 1000,
      participants: fixture.identities.map((identity, index) => ({ discordUserId: identity.discordUserId, position: SOURCE_POSITIONS[index] })),
    });
  }
  if (waitingCount !== undefined) fixture.store.setSource('LOCAL23456', { revision: 1, expiresAt: Date.now() + 3 * 60 * 60 * 1000,
    participants: fixture.identities.slice(0, waitingCount).map(identity => ({ discordUserId: identity.discordUserId, position: null })),
  });
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
  it('opens an empty room and upgrades a waiting login through roster collection and team assignment', async () => {
    const app = await setup(undefined, false, 0);
    const redirect = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    expect(session.admission).toMatchObject({ status: 'WAITING', participantCount: 0 });
    expect(session.ticket).toBeUndefined();
    const expiresAt = (await app.engine.requireRoom(app.roomCode)).room.expiresAt;
    for (const count of [5, 10]) {
      app.fixture.store.setSource('LOCAL23456', { revision: count, expiresAt,
        participants: app.fixture.identities.slice(0, count).map(identity => ({ discordUserId: identity.discordUserId, position: null })),
      });
      const entry = await app.auth.refresh(session.handle, app.roomCode);
      expect(entry.admission).toMatchObject({ status: 'WAITING', participantCount: count });
      expect(entry.ticket).toBeUndefined();
    }
    app.fixture.store.setSource('LOCAL23456', { revision: 11, expiresAt,
      participants: app.fixture.identities.map((identity, i) => ({ discordUserId: identity.discordUserId, position: SOURCE_POSITIONS[i] })),
    });
    await app.engine.tick(app.roomCode);
    const entry = await app.auth.refresh(session.handle, app.roomCode);
    expect(entry.admission).toBeUndefined();
    const ticket = verifyDraftTicket(entry.ticket!, keys.publicKey, 'realtime-entry', Date.now());
    await app.engine.connect(ticket, 'formerly-waiting');
    expect((await app.engine.snapshot('formerly-waiting')).selfReady).toBe(true);
    expect((await app.engine.requireRoom(app.roomCode)).room.expiresAt).toBe(expiresAt);
  });
  it('excludes a waiting identity at ten roster entries and admits it later without another OAuth flow', async () => {
    const discordId = '999999999999999999'; const app = await setup(discordId, false, 0);
    const redirect = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const expiresAt = (await app.engine.requireRoom(app.roomCode)).room.expiresAt;
    app.fixture.store.setSource('LOCAL23456', { revision: 2, expiresAt,
      participants: app.fixture.identities.map(identity => ({ discordUserId: identity.discordUserId, position: null })),
    });
    expect(await app.auth.refresh(session.handle, app.roomCode)).toMatchObject({ admission: { status: 'EXCLUDED', participantCount: 10 } });
    app.fixture.store.identities.push({ id: 'new-sheet', discordUserId: discordId, battleTag: '추가참가자#1234' });
    app.fixture.store.setSource('LOCAL23456', { revision: 3, expiresAt,
      participants: app.fixture.identities.slice(0, 10).map((identity, i) => ({ discordUserId: i === 1 ? discordId : identity.discordUserId, position: SOURCE_POSITIONS[i] })),
    });
    const admitted = await app.auth.refresh(session.handle, app.roomCode);
    expect(verifyDraftTicket(admitted.ticket!, keys.publicKey, 'realtime-entry', Date.now()).sub).toBe(discordId);
    expect(app.calls).toHaveLength(2);
  });
  it('still refuses draft start with fewer than ten assigned players and denies waiting identities socket access', async () => {
    const app = await setup(undefined, false, 2); const now = Math.floor(Date.now() / 1000);
    const base = { iss: 'owkr-realtime' as const, aud: 'owkr-draft' as const, purpose: 'realtime-entry' as const,
      displayName: '시험', roomCode: app.roomCode, scope: 'join' as const, jti: 'waiting-test', iat: now, exp: now + 60 };
    await expect(app.engine.connect({ ...base, sub: app.fixture.identities[1].discordUserId }, 'waiting')).rejects.toMatchObject({ code: 'ROOM_ACCESS_DENIED' });
    await app.engine.connect({ ...base, sub: app.fixture.identities[0].discordUserId }, 'operator');
    const snapshot = await app.engine.snapshot('operator');
    expect(snapshot.rosterCount).toBe(2); expect(snapshot.participants).toHaveLength(0);
    await expect(app.engine.command('operator', parseDraftCommand({ type: 'draft.start', commandId: 'start',
      epoch: snapshot.epoch, expectedRevision: snapshot.roomRevision }))).rejects.toMatchObject({ code: 'ROSTER_SIZE' });
  });

  it('uses only identify and returns only a short one-time code to the existing site', async () => {
    const app = await setup();
    expect(app.redirect.origin).toBe('https://discord.com'); expect(app.redirect.searchParams.get('scope')).toBe('identify');
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    expect(redirect.origin).toBe('https://site.invalid'); expect(redirect.pathname).toBe(`/draft/${app.roomCode}`);
    expect(redirect.searchParams.get('draft_code')).toHaveLength(43);
    expect(redirect.toString()).not.toContain('secret');
    const reused = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    expect(reused.pathname).toBe('/draft/auth-error');
    expect(reused.searchParams.get('draft_error')).toBe('OAUTH_STATE_EXPIRED');
  });
  it('exchanges once, validates browser context and restores only the assigned identity', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    const code = redirect.searchParams.get('draft_code')!;
    const session = await app.auth.exchange(code, contextHash);
    const firstEntry = verifyDraftTicket(session.ticket!, keys.publicKey, 'realtime-entry', Date.now());
    expect(firstEntry.sub).toBe(app.fixture.identities[1].discordUserId);
    expect(firstEntry.roomCode).toBe(app.roomCode);
    expect(firstEntry.scope).toBe('join');
    expect(firstEntry.iss).toBe('owkr-realtime');
    expect(firstEntry.exp - firstEntry.iat).toBeLessThanOrEqual(300);
    expect(session.ticketExpiresAt).toBe(firstEntry.exp * 1000);
    expect(session.ticketExpiresAt).toBeLessThan(session.expiresAt);
    await expect(app.auth.exchange(code, contextHash)).rejects.toThrow('이미 사용');
    const refreshed = await app.auth.refresh(session.handle, app.roomCode);
    const identity = verifyDraftTicket(refreshed.ticket!, keys.publicKey, 'realtime-entry', Date.now());
    expect(identity.sub).toBe(app.fixture.identities[1].discordUserId);
    expect(identity.scope).toBe('join'); expect(identity.iss).toBe('owkr-realtime');
    await expect(app.auth.refresh(session.handle, 'OTHER23456')).rejects.toMatchObject({ code: 'ROOM_EXPIRED' });
  });
  it('revokes pending OAuth exchanges and existing recovery sessions when the room closes', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const pending = new URL(await app.auth.begin(app.roomCode, contextHash));
    const pendingRedirect = new URL(await app.auth.callback('discord-code', pending.searchParams.get('state')!, 'https://discord.com'));
    const unfinished = new URL(await app.auth.begin(app.roomCode, contextHash));
    const now = Math.floor(Date.now() / 1000);
    await app.engine.connect({ iss: 'owkr-realtime', aud: 'owkr-draft', purpose: 'realtime-entry',
      sub: app.fixture.identities[0].discordUserId, displayName: '운영자', roomCode: app.roomCode, scope: 'join',
      jti: 'close-ticket', iat: now, exp: now + 60 }, 'operator');
    const { room } = await app.engine.requireRoom(app.roomCode);
    await app.engine.command('operator', parseDraftCommand({ type: 'room.close', commandId: 'close-auth',
      epoch: room.epoch, expectedRevision: room.revision, reason: '내전 종료' }));
    await expect(app.auth.begin(app.roomCode, contextHash)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.auth.refresh(session.handle, app.roomCode)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.auth.exchange(pendingRedirect.searchParams.get('draft_code')!, contextHash)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    const denied = new URL(await app.auth.callback('discord-code', unfinished.searchParams.get('state')!, 'https://discord.com'));
    expect(denied.searchParams.get('draft_error')).toBe('ROOM_CLOSED');
  });
  it('allows a site administrator to participate without granting room operator authority', async () => {
    const app = await setup(undefined, true);
    const redirect = new URL(await app.auth.callback('discord-code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const refreshed = await app.auth.refresh(session.handle, app.roomCode);
    const identity = verifyDraftTicket(refreshed.ticket!, keys.publicKey, 'realtime-entry', Date.now());
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
  it('authenticates an unlisted identity without a participant ticket and rejects foreign issuers', async () => {
    const app = await setup('999999999999999999');
    const foreign = new URL(await app.auth.callback('code', app.state, 'https://malicious.invalid'));
    expect(foreign.origin).toBe('https://site.invalid');
    expect(foreign.pathname).toBe('/draft/auth-error');
    expect(foreign.searchParams.get('draft_error')).toBe('AUTH_FAILED');
    expect(app.calls).toHaveLength(0);
    const denied = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    expect(denied.pathname).toBe(`/draft/${app.roomCode}`);
    expect(denied.searchParams.has('draft_error')).toBe(false);
    const excluded = await app.auth.exchange(denied.searchParams.get('draft_code')!, contextHash);
    expect(excluded.admission?.status).toBe('EXCLUDED');
    expect(excluded.ticket).toBeUndefined();
    expect(denied.toString()).not.toContain('999999999999999999');
    await expect(app.auth.refresh('a'.repeat(43), app.roomCode)).rejects.toThrow('다시 진행');
  });
  it('returns cancellation to the original room without contacting Discord', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('', app.state, null, 'access_denied'));
    expect(redirect.pathname).toBe(`/draft/${app.roomCode}`);
    expect(redirect.searchParams.get('draft_error')).toBe('AUTH_CANCELLED');
    expect(app.calls).toHaveLength(0);
  });
  it('does not trust a room or return URL supplied as state', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('code', 'https://evil.invalid/draft/ATTACK2345', 'https://discord.com'));
    expect(redirect.origin).toBe('https://site.invalid');
    expect(redirect.pathname).toBe('/draft/auth-error');
    expect(app.calls).toHaveLength(0);
  });
  it('hides upstream failures and allows a fresh successful authentication', async () => {
    const app = await setup();
    const failing = new DraftParticipantAuth({ engine: app.engine, appOrigin: 'https://site.invalid', publicOrigin: 'https://draft.invalid',
      clientId: 'client', clientSecret: 'secret', privateKey: keys.privateKey,
      fetch: async () => { throw new Error('private upstream details'); } });
    const failure = new URL(await failing.callback('code', app.state, 'https://discord.com'));
    expect(failure.pathname).toBe(`/draft/${app.roomCode}`);
    expect(failure.searchParams.get('draft_error')).toBe('AUTH_FAILED');
    expect(failure.toString()).not.toContain('private');
    const retry = new URL(await app.auth.begin(app.roomCode, contextHash));
    const success = new URL(await app.auth.callback('code', retry.searchParams.get('state')!, 'https://discord.com'));
    expect(success.searchParams.get('draft_code')).toHaveLength(43);
    expect(success.searchParams.has('draft_error')).toBe(false);
  });
  it('rechecks roster membership on refresh instead of trusting a surviving session handle', async () => {
    const app = await setup();
    const redirect = new URL(await app.auth.callback('code', app.state, 'https://discord.com'));
    const session = await app.auth.exchange(redirect.searchParams.get('draft_code')!, contextHash);
    const source = JSON.parse((await app.fixture.store.readSource('LOCAL23456')).raw!);
    source.participants[1].discordUserId = app.fixture.identities[0].discordUserId; source.revision++;
    app.fixture.store.setSource('LOCAL23456', source);
    await expect(app.auth.refresh(session.handle, app.roomCode)).rejects.toThrow('명단');
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
