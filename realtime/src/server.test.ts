import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createRealtimeServer } from './server.js';
import { createLocalDraftFixtures } from './local-fixtures.js';
import { DraftEngine } from './engine.js';
import { signDraftTicket, verifyDraftTicket } from './tickets.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const origin = 'https://test.example.invalid';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function setup(realCatalogs = false) {
  const fixture = createLocalDraftFixtures(Date.now(), { syntheticCatalogs: !realCatalogs });
  const engine = new DraftEngine(fixture.store, fixture.catalogs);
  const app = await createRealtimeServer({ engine, allowedOrigin: origin, adminPublicKey: keys.publicKey,
    realtimePrivateKey: keys.privateKey, realtimePublicKey: keys.publicKey, localOnly: false });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  cleanup.push(app.close);
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const ticket = (roomCode: string | null = null) => {
    const now = Math.floor(Date.now() / 1000);
    return signDraftTicket({ iss: 'owkr-vercel', purpose: 'admin-entry', sub: fixture.identities[0].discordUserId,
      displayName: '시험 사용자', roomCode, scope: roomCode ? 'join' : 'create', iat: now, exp: now + 60,
    }, keys.privateKey);
  };
  const post = (path: string, body: unknown, token = ticket(), requestOrigin = origin) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { fixture, engine, base, ticket, post };
}

describe('realtime HTTP and WebSocket transport', () => {
  it('serves health and rejects wrong origins and missing credentials', async () => {
    const app = await setup();
    expect((await fetch(`${app.base}/health/ready`)).status).toBe(200);
    expect((await app.post('/v1/rooms', {}, '', 'https://wrong.invalid')).status).toBe(400);
    expect((await app.post('/v1/rooms', {}, '')).status).toBe(400);
  });
  it('creates a room, exchanges a one-time ticket and sends an authenticated stream snapshot', async () => {
    const app = await setup();
    const created = await app.post('/v1/rooms', { sourceId: 'LOCAL23456', commandId: 'create-room' });
    expect(created.status).toBe(201);
    const { roomCode } = await created.json() as { roomCode: string };
    const token = app.ticket(roomCode);
    const entered = await app.post('/v1/entry', {}, token);
    expect(entered.status).toBe(200);
    const { ticket } = await entered.json() as { ticket: string };
    expect((await app.post('/v1/entry', {}, token)).status).toBe(400);
    const socket = new WebSocket(`${app.base.replace('http:', 'ws:')}/v1/socket`, { origin });
    const first = await new Promise<Record<string, unknown>>((resolve, reject) => {
      socket.once('error', reject);
      socket.once('open', () => socket.send(JSON.stringify({ type: 'auth', ticket })));
      socket.once('message', data => resolve(JSON.parse(data.toString())));
    });
    expect(first.type).toBe('room.snapshot'); expect(first.streamSeq).toBe(1);
    expect(first.streamId).toEqual(expect.any(String));
    const payload = first.payload as Record<string, unknown>;
    expect(payload.participants).toHaveLength(10);
    expect(JSON.stringify(payload)).not.toContain('receipts');
    socket.terminate();
  });
  it('restricts ticket issuer, purpose, audience, lifetime and signature', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signDraftTicket({ iss: 'owkr-vercel', purpose: 'admin-entry', sub: '1000000000000000000',
      displayName: '시험', scope: 'create', roomCode: null, iat: now, exp: now + 60 }, keys.privateKey);
    expect(verifyDraftTicket(token, keys.publicKey, 'admin-entry', now * 1000).scope).toBe('create');
    expect(() => verifyDraftTicket(token, keys.publicKey, 'realtime-entry', now * 1000)).toThrow('입장권');
    expect(() => verifyDraftTicket(token, keys.publicKey, 'admin-entry', (now + 60) * 1000)).toThrow('유효기간');
    const parts = token.split('.'); parts[1] = Buffer.from('{}').toString('base64url');
    expect(() => verifyDraftTicket(parts.join('.'), keys.publicKey, 'admin-entry', now * 1000)).toThrow('서명');
  });

  it.each(['VOTE', 'POTG'] as const)('handles ten socket participants for %s map selection', async mapMode => {
    const app = await setup(mapMode === 'POTG');
    const created = await app.post('/v1/rooms', { sourceId: 'LOCAL23456', commandId: 'ten-sockets' });
    const { roomCode } = await created.json() as { roomCode: string };
    const clients = await Promise.all(app.fixture.identities.map(async identity => {
      const now = Math.floor(Date.now() / 1000);
      const ticket = signDraftTicket({ iss: 'owkr-realtime', purpose: 'realtime-entry', sub: identity.discordUserId,
        displayName: identity.battleTag, roomCode, scope: 'join', iat: now, exp: now + 300 }, keys.privateKey);
      const socket = new WebSocket(`${app.base.replace('http:', 'ws:')}/v1/socket`, { origin });
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject); socket.once('open', () => socket.send(JSON.stringify({ type: 'auth', ticket })));
        const listener = (data: import('ws').RawData) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'room.snapshot') { socket.off('message', listener); resolve(); }
          else if (message.type === 'command.rejected') { socket.off('message', listener); reject(new Error(message.message)); }
        };
        socket.on('message', listener);
      });
      const send = async (type: string, index: number, selection: string[] = [], extra: Record<string, unknown> = {}) => {
        const { room } = await app.engine.requireRoom(roomCode);
        const commandId = `${type.replaceAll('.', '-')}-${index}-${room.revision}`;
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('command timeout')), 3000);
          const listener = (data: import('ws').RawData) => {
            const message = JSON.parse(data.toString());
            if (message.commandId !== commandId) return;
            clearTimeout(timeout); socket.off('message', listener);
            if (message.type === 'command.ack') resolve(); else reject(new Error(message.message));
          };
          socket.on('message', listener);
          socket.send(JSON.stringify({ type, commandId, epoch: room.epoch, expectedRevision: room.revision,
            expectedBallotRevision: 0, selection, ready: true, ...extra }));
        });
      };
      return { socket, send };
    }));
    try {
      for (let index = 0; index < clients.length; index++) await clients[index].send('ready.set', index);
      if (mapMode === 'POTG') {
        await clients[0].send('map.configure', 0, [], { mapMode: 'POTG', pickerDiscordId: app.fixture.identities[3].discordUserId });
        for (let index = 0; index < clients.length; index++) await clients[index].send('ready.set', index);
      }
      await clients[0].send('draft.start', 0);
      const started = await app.engine.requireRoom(roomCode);
      if (mapMode === 'POTG') {
        expect(started.room.phase).toBe('MAP_PICKING');
        await expect(clients[0].send('map.pick', 0, [], { mapId: 'grimsvotn' })).rejects.toThrow('팟지 선수만');
        await clients[3].send('map.pick', 3, [], { mapId: 'grimsvotn' });
        const views = await Promise.all([...app.engine.clients.values()].map(client => app.engine.snapshot(client.connectionId)));
        expect(views).toHaveLength(10); expect(views.every(view => view.phase === 'MAP_RESOLVED' && view.mapResult?.map.mapId === 'grimsvotn' && view.ballots === null)).toBe(true);
        expect(new Set(views.map(view => view.timer.deadlineAt)).size).toBe(1);
        return;
      }
      const selected = started.room.candidates!.candidates[0].map.mapId;
      await Promise.all(clients.map((client, index) => client.send('ballot.lock', index, [selected])));
      const sealed = await app.engine.requireRoom(roomCode);
      expect(sealed.room.stage?.sealed?.ballots).toHaveLength(10);
      expect(sealed.room.stage?.sealed?.ballots.every(ballot => ballot.locked && ballot.selection[0] === selected)).toBe(true);
      const resolutionId = sealed.room.stage!.sealed!.resolutionId;
      await app.engine.serial(() => app.engine.tick(roomCode));
      const resolved = await app.engine.requireRoom(roomCode);
      expect(resolved.room.mapResult?.resolutionId).toBe(resolutionId);
      expect(resolved.room.mapResult?.map.mapId).toBe(selected);
    } finally { clients.forEach(client => client.socket.terminate()); }
  });
});
