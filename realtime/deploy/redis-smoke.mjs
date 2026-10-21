import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from '@upstash/redis';
import { WebSocket } from 'ws';
import { RedisRealtimeStore } from '../realtime/src/store.js';
import { DraftEngine, parseDraftCommand } from '../realtime/src/engine.js';
import { createRealtimeServer } from '../realtime/src/server.js';
import { createLocalDraftFixtures } from '../realtime/src/local-fixtures.js';
import { DraftParticipantAuth } from '../realtime/src/participant-auth.js';
import { signDraftTicket, verifyDraftTicket } from '../realtime/src/tickets.js';
import { SOURCE_POSITIONS } from '../realtime/src/source.js';

const namespace = `draft:v1:deploytest:${randomUUID()}:`;
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN,
  automaticDeserialization: false, retry: { retries: 0 } });
const touched = new Set();
const requestMetrics = new AsyncLocalStorage();
const countRequest = () => { const metric = requestMetrics.getStore(); if (metric) metric.redisRequests++; };
const measure = async work => {
  const metric = { redisRequests: 0 }; const began = performance.now();
  const value = await requestMetrics.run(metric, work);
  return { value, elapsedMs: Math.round(performance.now() - began), redisRequests: metric.redisRequests };
};
const authentication = [];
const roomReads = [];
const key = value => { const mapped = namespace + value; touched.add(mapped); return mapped; };
const scoped = new Proxy(redis, { get(target, name) {
  if (name === 'eval') return (script, keys, args) => { countRequest(); return target.eval(script, keys.map(key), args); };
  if (['set', 'get', 'getdel', 'zrange'].includes(name)) return (first, ...args) => { countRequest(); return target[name](key(first), ...args); };
  throw new Error(`Unscoped Redis operation denied: ${String(name)}`);
} });
const fixture = createLocalDraftFixtures();
const origin = process.env.DRAFT_APP_ORIGIN;
const base = process.env.DRAFT_SMOKE_URL ?? 'https://civilwar.devbot.me';
const port = Number(process.env.DRAFT_SMOKE_PORT ?? 8788);
const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
let engine;
let app;
const sockets = [];
const timings = [];
let roomCode;
const start = async () => {
  engine = new DraftEngine(new RedisRealtimeStore(scoped), fixture.catalogs);
  app = await createRealtimeServer({ engine, allowedOrigin: origin, localOnly: false,
    adminPublicKey: keys.publicKey, realtimePrivateKey: keys.privateKey, realtimePublicKey: keys.publicKey });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
};
const post = async (path, body, token) => {
  const response = await fetch(base + path, { method: 'POST', headers: { Origin: origin,
    'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  assert.ok(response.ok, `${path}: ${JSON.stringify(result)}`);
  return result;
};
const adminTicket = () => { const now = Math.floor(Date.now() / 1000); return signDraftTicket({
  iss: 'owkr-vercel', purpose: 'admin-entry', sub: fixture.identities[0].discordUserId,
  displayName: 'deployment synthetic admin', roomCode: null, scope: 'create', iat: now, exp: now + 60 }, keys.privateKey); };
const connect = async identity => {
  const now = Math.floor(Date.now() / 1000);
  const ticket = signDraftTicket({ iss: 'owkr-realtime', purpose: 'realtime-entry', sub: identity.discordUserId,
    displayName: identity.battleTag, roomCode, scope: 'join', iat: now, exp: now + 300 }, keys.privateKey);
  const socket = new WebSocket(base.replace('https:', 'wss:').replace('http:', 'ws:') + '/v1/socket', { origin });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('socket snapshot timeout')), 30000);
    socket.on('error', reject);
    socket.once('close', (code, reason) => { clearTimeout(timeout); reject(new Error(`socket closed: ${code} ${reason}`)); });
    socket.on('message', data => {
      const event = JSON.parse(data.toString());
      if (event.type === 'room.snapshot') { socket.snapshot = event.payload; clearTimeout(timeout); resolve(); }
      if (event.type === 'command.rejected') { clearTimeout(timeout); reject(new Error(JSON.stringify(event))); }
    });
    socket.once('open', () => socket.send(JSON.stringify({ type: 'auth', ticket })));
  });
  return socket;
};
const send = async (socket, type, selection = [], extra = {}) => {
  const { room } = await engine.requireRoom(roomCode);
  const commandId = randomUUID();
  const began = performance.now();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.off('message', listener); reject(new Error(`${type} timeout`)); }, 30000);
    const listener = data => { const event = JSON.parse(data.toString());
      if (event.commandId !== commandId) return;
      clearTimeout(timeout); socket.off('message', listener);
      if (event.type === 'command.ack') resolve(); else reject(new Error(`${type}: ${JSON.stringify(event)}`));
    };
    socket.on('message', listener);
    socket.send(JSON.stringify({ type, commandId, epoch: room.epoch, expectedRevision: room.revision,
      expectedBallotRevision: 0, ready: true, selection, ...extra }));
  });
  timings.push(performance.now() - began);
};
try {
  await redis.set(key('match-live:v1:LOCAL23456'), JSON.stringify({ revision: 1, expiresAt: Date.now() + 1800000,
    participants: fixture.identities.map((identity, index) => ({ discordUserId: identity.discordUserId, position: SOURCE_POSITIONS[index] })) }), { ex: 1800 });
  await redis.hset(key('user-sheet:v2:entries'), Object.fromEntries(fixture.identities.map(identity => [identity.id, JSON.stringify(identity)])));
  await redis.expire(key('user-sheet:v2:entries'), 1800);
  await redis.set(key('user-sheet:v2:version'), '1', { ex: 1800 });
  await start();
  assert.equal((await fetch(base + '/health/ready')).status, 200);
  const payload = { sourceId: 'LOCAL23456', commandId: randomUUID() };
  const created = await post('/v1/rooms', payload, adminTicket()); roomCode = created.roomCode;
  assert.equal((await post('/v1/rooms', payload, adminTicket())).roomCode, roomCode);
  const auth = new DraftParticipantAuth({ engine, appOrigin: origin, publicOrigin: base,
    clientId: 'synthetic-client', clientSecret: 'synthetic-secret', privateKey: keys.privateKey,
    fetch: async url => new Response(JSON.stringify(String(url).endsWith('/token')
      ? { access_token: 'synthetic-access-token', token_type: 'Bearer', scope: 'identify' }
      : { id: fixture.identities[1].discordUserId })),
  });
  for (let index = 0; index < 5; index++) {
    const contextHash = 'c'.repeat(64);
    const authorize = new URL(await auth.begin(roomCode, contextHash));
    const returned = new URL(await auth.callback('synthetic-code', authorize.searchParams.get('state'), 'https://discord.com'));
    const measured = await measure(async () => {
      const session = await auth.exchange(returned.searchParams.get('draft_code'), contextHash);
      const entry = session.ticket ? { ticket: session.ticket } : await auth.refresh(session.handle, roomCode);
      return { ...entry, requiresImmediateRefresh: !session.ticket };
    });
    assert.equal(verifyDraftTicket(measured.value.ticket, keys.publicKey, 'realtime-entry', Date.now()).sub, fixture.identities[1].discordUserId);
    authentication.push({ elapsedMs: measured.elapsedMs, redisRequests: measured.redisRequests,
      requiresImmediateRefresh: measured.value.requiresImmediateRefresh });
  }
  for (let index = 0; index < 10; index++) {
    const measured = await measure(() => engine.requireRoom(roomCode));
    roomReads.push({ elapsedMs: measured.elapsedMs, redisRequests: measured.redisRequests });
  }
  await Promise.all(fixture.identities.map(connect));
  assert.equal(sockets.length, 10);
  for (const socket of sockets) await send(socket, 'ready.set');
  await send(sockets[0], 'draft.start');
  const { room } = await engine.requireRoom(roomCode);
  const mapId = room.candidates.candidates[0].map.mapId;
  await Promise.all(sockets.map(socket => send(socket, 'ballot.lock', [mapId])));
  const sealed = await engine.requireRoom(roomCode);
  assert.equal(sealed.room.stage.sealed.ballots.length, 10);
  assert.ok(sealed.room.stage.sealed.ballots.every(ballot => ballot.locked));
  assert.ok(sealed.room.stage.sealed.resolutionId);
  const ttl = await redis.pttl(key(`draft:v1:room:${roomCode}`));
  assert.ok(ttl > 0 && ttl <= 1800000);
  const conflict = await engine.requireRoom(roomCode);
  await assert.rejects(engine.store.commit(conflict, { expectedRoomRevision: -1, expectedHistoryRevision: -1 }), /변경을 저장하지/);
  const waitForPhase = async phase => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const state = await engine.requireRoom(roomCode);
      if (state.room.phase === phase) return state;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`phase timeout: ${phase}`);
  };
  const reveal = await waitForPhase('MAP_RESOLVED');
  assert.ok(reveal.room.timer.deadlineAt > reveal.now && reveal.room.timer.deadlineAt <= reveal.now + 3000);
  await waitForPhase('HERO_VOTING');
  const selection = ['TANK', 'DPS', 'SUPPORT'].map(role => fixture.catalogs.heroes.entries.find(hero => hero.role === role && hero.active).heroId);
  await Promise.all(sockets.map(socket => send(socket, 'ballot.lock', selection)));
  await waitForPhase('HERO_RESOLVED');
  await send(sockets[0], 'game.confirmApplied');
  await send(sockets[0], 'game.markStarted');
  await send(sockets[0], 'game.markFinished');
  await send(sockets[0], 'game.next');
  for (const socket of sockets) await send(socket, 'ready.set');
  await send(sockets[0], 'draft.start');
  const nextGame = await engine.requireRoom(roomCode);
  assert.equal(nextGame.room.gameIndex, 2);
  assert.equal(nextGame.room.expiresAt, sealed.room.expiresAt);
  assert.ok(nextGame.room.candidates.eligiblePool.every(map => map.mapId !== mapId));
  assert.equal(nextGame.history.games[0].map.mapId, mapId);
  const soakSeconds = Number(process.env.DRAFT_SMOKE_SECONDS ?? 120);
  for (let second = 0; second < soakSeconds; second++) {
    assert.equal((await fetch(base + '/health/ready', { signal: AbortSignal.timeout(10000) })).status, 200);
    assert.ok(sockets.every(socket => socket.readyState === WebSocket.OPEN));
    for (const socket of sockets) socket.ping();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const beforeRestart = await engine.requireRoom(roomCode);
  const preservedResolution = beforeRestart.room.mapResult?.resolutionId;
  for (const socket of sockets) socket.terminate();
  await app.close(); app = null;
  await start();
  const recovered = await engine.requireRoom(roomCode);
  assert.equal(recovered.room.timer.status, 'RECOVERY_PAUSED');
  assert.equal(recovered.room.mapResult?.resolutionId, preservedResolution);
  assert.equal(recovered.history.games[0].map.mapId, mapId);
  const guard = { expectedRoomRevision: recovered.room.revision,
    expectedHistoryRevision: recovered.history.mapHistoryRevision, expectedSourceRaw: recovered.sourceRaw };
  await assert.rejects(engine.store.commit(recovered, { ...guard, authExpiresAt: recovered.now - 1 }),
    error => error.code === 'AUTH_EXPIRED');
  await assert.rejects(engine.store.commit(recovered, { ...guard, acceptBefore: recovered.now - 1 }),
    error => error.code === 'BALLOT_CLOSED');
  const sourceKey = key('match-live:v1:LOCAL23456');
  const source = JSON.parse(await redis.get(sourceKey));
  source.revision++;
  await redis.set(sourceKey, JSON.stringify(source), { keepttl: true });
  await assert.rejects(engine.store.commit(recovered, guard), error => error.code === 'SOURCE_OUTDATED');
  const fresh = await engine.requireRoom(roomCode);
  assert.equal(fresh.source.revision, source.revision);
  await redis.hdel(key('user-sheet:v2:entries'), fixture.identities[1].id);
  assert.equal((await engine.store.load(roomCode)).source, null);
  const historyKey = key(`draft:v1:session:${recovered.history.draftSessionId}`);
  const savedHistory = await redis.get(historyKey);
  const savedHistoryExpiry = recovered.history.expiresAt;
  await redis.del(historyKey);
  assert.equal(await engine.store.load(roomCode), null);
  await redis.set(historyKey, savedHistory, { pxat: savedHistoryExpiry });
  assert.ok(await engine.store.load(roomCode));
  const now = Math.floor(Date.now() / 1000);
  const closeTicket = verifyDraftTicket(signDraftTicket({ iss: 'owkr-realtime', purpose: 'realtime-entry',
    sub: fixture.identities[0].discordUserId, displayName: 'synthetic operator', roomCode,
    scope: 'join', iat: now, exp: now + 60 }, keys.privateKey), keys.publicKey, 'realtime-entry', Date.now());
  await engine.connect(closeTicket, 'close-operator');
  const beforeClose = await engine.requireRoom(roomCode);
  await engine.command('close-operator', parseDraftCommand({ type: 'room.close', commandId: randomUUID(),
    epoch: beforeClose.room.epoch, expectedRevision: beforeClose.room.revision, reason: 'isolated closure verification' }));
  const closed = await engine.store.load(roomCode);
  assert.equal(closed.room.timer.status, 'CANCELLED');
  assert.equal(closed.history.activeRoomId, null);
  assert.deepEqual(closed.history.games, beforeClose.history.games);
  assert.deepEqual(await engine.store.listActiveRooms(), []);
  await assert.rejects(engine.requireRoom(roomCode), error => error.code === 'ROOM_CLOSED');
  await assert.rejects(engine.store.commit(beforeClose, { expectedRoomRevision: beforeClose.room.revision,
    expectedHistoryRevision: beforeClose.history.mapHistoryRevision }), error => error.code === 'ROOM_CLOSED');
  await engine.disconnect('close-operator');
  await redis.hset(key('user-sheet:v2:entries'), Object.fromEntries(fixture.identities.map(identity => [identity.id, JSON.stringify(identity)])));
  for (const legacy of [false, true]) {
    const idleCode = await engine.createRoom(verifyDraftTicket(adminTicket(), keys.publicKey, 'admin-entry', Date.now()), 'LOCAL23456', randomUUID());
    await engine.connect({ ...closeTicket, roomCode: idleCode }, 'idle-operator');
    const initial = await engine.requireRoom(idleCode);
    await engine.command('idle-operator', parseDraftCommand({ type: 'ready.set', commandId: randomUUID(), epoch: initial.room.epoch,
      expectedRevision: initial.room.revision, ready: true }));
    const recent = await engine.requireRoom(idleCode);
    assert.ok(recent.room.lastActivityAt >= initial.room.lastActivityAt);
    const premature = structuredClone(recent); premature.room.revision++; premature.room.timer.status = 'CANCELLED';
    premature.history.activeRoomId = null; premature.history.mapHistoryRevision++;
    await assert.rejects(engine.store.commit(premature, { expectedRoomRevision: recent.room.revision,
      expectedHistoryRevision: recent.history.mapHistoryRevision, idleForMs: 7200000 }), error => error.code === 'ROOM_NOT_IDLE');
    const aged = structuredClone(recent.room);
    aged.createdAt = Date.now() - 7202000; aged.lastActivityAt = Date.now() - 7201000;
    if (legacy) { delete aged.lastActivityAt; aged.audit = aged.audit.map(entry => ({ ...entry, at: aged.createdAt })); }
    await redis.set(key(`draft:v1:room:${idleCode}`), JSON.stringify(aged), { pxat: aged.expiresAt });
    const delayed = await engine.store.load(idleCode); delayed.room.lastActivityAt = -1;
    await assert.rejects(engine.store.commit(delayed, { expectedRoomRevision: delayed.room.revision,
      expectedHistoryRevision: delayed.history.mapHistoryRevision }), error => error.code === 'ROOM_CLOSED');
    await engine.tick(idleCode);
    const idleClosed = await engine.store.load(idleCode);
    assert.equal(idleClosed.room.timer.status, 'CANCELLED');
    assert.equal(idleClosed.room.audit.at(-1).action, 'room.close.idle');
    assert.deepEqual(await engine.store.listActiveRooms(), []);
    await engine.disconnect('idle-operator');
  }
  timings.sort((a, b) => a - b);
  console.log(JSON.stringify({ status: 'passed', transport: base, sockets: 10, soakSeconds,
    authentication, roomReads,
    acknowledgedCommands: timings.length, commandMs: { median: Math.round(timings[Math.floor(timings.length / 2)]),
      p95: Math.round(timings[Math.floor(timings.length * .95)]), max: Math.round(timings.at(-1)) },
    checks: ['actual Redis Lua', 'isolated namespace', 'idempotent creation', base.startsWith('https:') ? '10 TLS WebSockets' : '10 loopback WebSockets', '10 simultaneous locked ballots',
      '3 second map reveal', 'hero bans without preference', 'game start and finish', 'next game excludes played map', 'fixed expiry', 'revision conflict', 'restart recovery paused', 'sealed resolution preserved',
      'expired authentication rejected', 'late ballot rejected', 'stale source write rejected', 'fresh source revision', 'removed identity rejected', 'missing history rejected', 'room closure persisted', 'closed room removed from active index', 'game history retained', 'stale writes cannot reopen closed room', 'idle activity timestamp persisted', 'premature idle closure rejected', 'idle boundary commands rejected', 'modern and legacy idle rooms closed'],
    rssMiB: Math.round(process.memoryUsage().rss / 1048576) }, null, 2));
} finally {
  for (const socket of sockets) socket.terminate();
  if (app) await app.close();
  if (touched.size) await redis.del(...touched);
}
