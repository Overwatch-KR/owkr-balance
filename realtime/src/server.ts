import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { DRAFT_CONNECTION_REPLACED_CLOSE_CODE, DraftRuleError, requireDraft, emitDraftStreamEvent, type DraftStreamCursor } from '../../domains/draft/shared/public.js';
import { DraftEngine, parseDraftCommand } from './engine.js';
import { signDraftTicket, verifyDraftTicket } from './tickets.js';
import type { RoomBundle } from './model.js';
import type { DraftParticipantAuth } from './participant-auth.js';

export interface RealtimeServerOptions {
  engine: DraftEngine;
  allowedOrigin: string;
  adminPublicKey: string;
  realtimePrivateKey: string;
  realtimePublicKey: string;
  localOnly: boolean;
  localTicketPrivateKey?: string;
  localUserIds?: readonly string[];
  participantAuth?: DraftParticipantAuth;
  bridgeSecret?: string;
}

function respond(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    requireDraft(bytes <= 16_384, 'BODY_TOO_LARGE', '요청 크기를 초과했습니다.');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString()) as unknown;
  requireDraft(body && typeof body === 'object' && !Array.isArray(body), 'INVALID_BODY', '요청 형식을 확인해 주세요.');
  return body as Record<string, unknown>;
}

function errorBody(error: unknown): { code: string; message: string } {
  return error instanceof DraftRuleError ? { code: error.code, message: error.message }
    : { code: 'UNAVAILABLE', message: '저장 또는 연결에 실패했습니다. 최신 상태를 다시 확인해 주세요.' };
}

/** @description 실시간 연결은 직접 처리하며 저장에 성공한 상태만 권한별로 전달한다. */
export async function createRealtimeServer(options: RealtimeServerOptions) {
  const { engine } = options;
  await engine.store.acquireLease();
  try { await engine.recover(); }
  catch (error) { await engine.store.releaseLease(); throw error; }
  let healthy = true;
  let shuttingDown = false;
  let housekeeping = false;
  let lastLeaseAt = Date.now();
  const sockets = new Map<string, WebSocket>();
  const streams = new Map<string, { cursor: DraftStreamCursor; fingerprint: string }>();
  const rates = new Map<string, { tokens: number; updatedAt: number; finalTokens: number }>();

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/health/live') {
        respond(response, 200, { status: 'alive' }); return;
      }
      if (request.method === 'GET' && url.pathname === '/health/ready') {
        respond(response, healthy && !shuttingDown ? 200 : 503, { status: healthy && !shuttingDown ? 'ready' : 'unavailable', mode: options.localOnly ? 'local-only' : 'redis' }); return;
      }
      if (request.method === 'GET' && url.pathname === '/auth/discord/callback') {
        requireDraft(options.participantAuth, 'AUTH_NOT_CONFIGURED', '참가자 인증이 아직 연결되지 않았습니다.');
        const redirect = await options.participantAuth.callback(url.searchParams.get('code') ?? '',
          url.searchParams.get('state') ?? '', url.searchParams.get('iss'), url.searchParams.get('error'));
        response.writeHead(302, { Location: redirect, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(); return;
      }
      if (request.method === 'POST' && url.pathname.startsWith('/bridge/participant/')) {
        const received = Buffer.from(request.headers.authorization?.replace(/^Bearer /, '') ?? '');
        const expected = Buffer.from(options.bridgeSecret ?? '');
        requireDraft(healthy && options.participantAuth && expected.length >= 32 && received.length === expected.length
          && timingSafeEqual(received, expected) && !request.headers.origin, 'BRIDGE_ACCESS_DENIED', '서버 간 인증이 필요합니다.');
        const body = await readBody(request);
        if (url.pathname.endsWith('/start')) {
          const redirect = await options.participantAuth.begin(String(body.roomCode ?? ''), String(body.contextHash ?? ''));
          respond(response, 200, { redirect }); return;
        }
        if (url.pathname.endsWith('/exchange')) {
          respond(response, 200, await options.participantAuth.exchange(String(body.code ?? ''), String(body.contextHash ?? ''))); return;
        }
        if (url.pathname.endsWith('/refresh')) {
          respond(response, 200, await options.participantAuth.refresh(String(body.handle ?? ''), String(body.roomCode ?? ''))); return;
        }
        respond(response, 404, { code: 'NOT_FOUND' }); return;
      }
      requireDraft(request.headers.origin === options.allowedOrigin, 'ORIGIN_DENIED', '허용되지 않은 사이트 요청입니다.');
      response.setHeader('Access-Control-Allow-Origin', options.allowedOrigin);
      response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.writeHead(204); response.end(); return;
      }
      requireDraft(healthy && !shuttingDown, 'UNAVAILABLE', '저장소 연결을 복구 중입니다.');
      requireDraft(request.method === 'POST', 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
      if (options.localOnly && url.pathname === '/__local__/ticket') {
        const body = await readBody(request);
        requireDraft(typeof body.discordId === 'string' && options.localUserIds?.includes(body.discordId)
          && options.localTicketPrivateKey, 'LOCAL_IDENTITY_REQUIRED', '로컬 시험 계정만 사용할 수 있습니다.');
        const now = Math.floor(Date.now() / 1000);
        const ticket = signDraftTicket({ iss: 'owkr-vercel', purpose: 'admin-entry', sub: body.discordId,
          displayName: '로컬 시험 사용자', scope: body.roomCode ? 'join' : 'create',
          roomCode: typeof body.roomCode === 'string' ? body.roomCode : null, iat: now, exp: now + 60,
        }, options.localTicketPrivateKey);
        respond(response, 200, { ticket }); return;
      }
      const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const ticket = verifyDraftTicket(token, options.adminPublicKey, 'admin-entry', Date.now());
      const body = await readBody(request);
      if (url.pathname === '/v1/rooms') {
        requireDraft(typeof body.sourceId === 'string' && typeof body.commandId === 'string', 'INVALID_BODY', '원본 코드와 생성 식별자가 필요합니다.');
        const code = await engine.serial(() => engine.createRoom(ticket, body.sourceId as string, body.commandId as string));
        respond(response, 201, { roomCode: code, url: `${options.allowedOrigin}/draft/${code}` }); return;
      }
      if (url.pathname === '/v1/entry') {
        requireDraft(ticket.scope === 'join' && ticket.roomCode, 'ROOM_ACCESS_DENIED', '방 입장용 입장권이 필요합니다.');
        const bundle = await engine.requireRoom(ticket.roomCode);
        const { isDraftOperator } = await import('../../domains/draft/shared/public.js');
        requireDraft(isDraftOperator(bundle.history.operators, ticket.sub)
          || bundle.source?.participants.some(player => player.discordId === ticket.sub), 'ROOM_ACCESS_DENIED', '현재 명단 또는 운영 권한이 없습니다.');
        requireDraft(await engine.store.consumeNonce(ticket.jti, ticket.exp * 1000), 'TICKET_REUSED', '이미 교환한 입장권입니다.');
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = Math.min(now + 300, Math.floor(bundle.room.expiresAt / 1000));
        const entry = signDraftTicket({ iss: 'owkr-realtime', purpose: 'realtime-entry', sub: ticket.sub,
          displayName: ticket.displayName, roomCode: ticket.roomCode, scope: 'join', iat: now, exp: expiresAt,
        }, options.realtimePrivateKey);
        respond(response, 200, { ticket: entry, expiresAt: expiresAt * 1000 }); return;
      }
      respond(response, 404, { code: 'NOT_FOUND' });
    })().catch(error => { if (!response.headersSent) respond(response, error instanceof DraftRuleError ? 400 : 503, errorBody(error)); else response.end(); });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.maxHeadersCount = 50;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_384, perMessageDeflate: false });
  server.on('upgrade', (request, socket, head) => {
    if (!healthy || shuttingDown || request.headers.origin !== options.allowedOrigin
      || request.url !== '/v1/socket' || wss.clients.size >= 240) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(request, socket, head, websocket => wss.emit('connection', websocket));
  });

  async function publish(connectionId: string, force = false, bundle?: RoomBundle): Promise<void> {
    const socket = sockets.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) { socket.close(1013, 'snapshot required'); return; }
    const payload = await engine.snapshot(connectionId, bundle);
    const state = streams.get(connectionId)!;
    const visible = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'serverNow' && key !== 'roomRevision'));
    const fingerprint = JSON.stringify(visible);
    if (!force && state.fingerprint === fingerprint) return;
    state.fingerprint = fingerprint;
    const result = emitDraftStreamEvent(state.cursor, { epoch: Number(payload.epoch), roomRevision: Number(payload.roomRevision), payload });
    state.cursor = result.cursor;
    socket.send(JSON.stringify({ type: force ? 'room.snapshot' : 'room.updated', ...result.envelope }));
  }

  async function publishRoom(code: string, forceConnectionId?: string): Promise<void> {
    const clients = [...engine.clients].filter(([, client]) => client.roomCode === code);
    if (clients.length === 0) return;
    const bundle = await engine.requireRoom(code);
    for (const [id] of clients) {
      try { await publish(id, id === forceConnectionId, bundle); }
      catch { sockets.get(id)?.close(1008, 'room access ended'); }
    }
  }

  wss.on('connection', (socket: WebSocket) => {
    const id = randomUUID();
    sockets.set(id, socket);
    let joined = false;
    let joining = false;
    let pendingMessages = 0;
    const authTimer = setTimeout(() => { if (!joined) socket.close(1008, 'authentication required'); }, 5000);
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => { const client = engine.clients.get(id); if (client) client.lastResponseAt = Date.now(); });
    socket.on('message', (data, binary) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (pendingMessages >= 20) { socket.close(1008, 'input queue limit'); return; }
      if (!joined && pendingMessages === 0) {
        try {
          requireDraft(!binary, 'AUTH_REQUIRED', '인증 메시지가 필요합니다.');
          const initial = JSON.parse(data.toString()) as Record<string, unknown>;
          requireDraft(initial.type === 'auth' && typeof initial.ticket === 'string', 'AUTH_REQUIRED', '인증 메시지가 필요합니다.');
          verifyDraftTicket(initial.ticket, options.realtimePublicKey, 'realtime-entry', Date.now());
          clearTimeout(authTimer);
        } catch (error) {
          socket.send(JSON.stringify({ type: 'command.rejected', ...errorBody(error) }));
          socket.close(1008, 'authentication failed'); return;
        }
      }
      pendingMessages++;
      void engine.serial(async () => {
        let commandId: string | undefined;
        if (socket.readyState !== WebSocket.OPEN) return;
        try {
          requireDraft(healthy && !shuttingDown && !binary, 'UNAVAILABLE', '현재 입력을 처리할 수 없습니다.');
          const message = JSON.parse(data.toString()) as Record<string, unknown>;
          if (!joined) {
            requireDraft(!joining && message.type === 'auth' && typeof message.ticket === 'string', 'AUTH_REQUIRED', '인증 메시지가 필요합니다.');
            joining = true;
            const ticket = verifyDraftTicket(message.ticket, options.realtimePublicKey, 'realtime-entry', Date.now());
            const replaced = await engine.connect(ticket, id);
            for (const oldId of replaced) {
              const previous = sockets.get(oldId);
              if (!previous) continue;
              streams.delete(oldId);
              if (previous.readyState === WebSocket.OPEN) previous.send(JSON.stringify({ type: 'connection.replaced' }));
              previous.close(DRAFT_CONNECTION_REPLACED_CLOSE_CODE, 'connection replaced');
              const timer = setTimeout(() => previous.terminate(), 1000);
              timer.unref();
              previous.once('close', () => clearTimeout(timer));
            }
            streams.set(id, { cursor: { streamId: randomUUID(), streamSeq: 0 }, fingerprint: '' });
            joined = true; joining = false; clearTimeout(authTimer);
            await publishRoom(ticket.roomCode!, id); return;
          }
          if (message.type === 'snapshot.request') {
            streams.set(id, { cursor: { streamId: randomUUID(), streamSeq: 0 }, fingerprint: '' });
            await publish(id, true); return;
          }
          if (message.type === 'auth.renew') {
            requireDraft(typeof message.ticket === 'string', 'INVALID_TICKET', '갱신 입장권이 필요합니다.');
            const ticket = verifyDraftTicket(message.ticket, options.realtimePublicKey, 'realtime-entry', Date.now());
            await engine.renew(ticket, id);
            socket.send(JSON.stringify({ type: 'auth.renewed', expiresAt: ticket.exp * 1000 })); return;
          }
          const command = parseDraftCommand(message);
          commandId = command.commandId;
          const client = engine.clients.get(id);
          requireDraft(client, 'AUTH_REQUIRED', '현재 연결이 종료되었습니다.');
          const now = Date.now();
          const rateKey = `${client.roomCode}:${client.discordId}`;
          const bucket = rates.get(rateKey) ?? { tokens: 10, finalTokens: 10, updatedAt: now };
          const elapsed = (now - bucket.updatedAt) / 1000;
          bucket.tokens = Math.min(10, bucket.tokens + elapsed * 5);
          bucket.finalTokens = Math.min(10, bucket.finalTokens + elapsed * 2); bucket.updatedAt = now;
          const field = command.type === 'ballot.lock' ? 'finalTokens' : 'tokens';
          requireDraft(bucket[field] >= 1, 'RATE_LIMITED', '입력이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.');
          bucket[field]--; rates.set(rateKey, bucket);
          const result = await engine.command(id, command);
          socket.send(JSON.stringify({ type: 'command.ack', commandId: command.commandId, ...result }));
          await publishRoom(client.roomCode);
        } catch (error) {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'command.rejected', commandId, ...errorBody(error) }));
          if (!joined) socket.close(1008, 'authentication failed');
        }
      }).finally(() => { pendingMessages--; });
    });
    socket.on('close', () => {
      clearTimeout(authTimer); sockets.delete(id); streams.delete(id);
      const code = engine.clients.get(id)?.roomCode;
      void engine.serial(async () => { await engine.disconnect(id); if (code) await publishRoom(code); }).catch(() => { healthy = false; });
    });
  });

  let renewingLease = false;
  const leaseInterval = setInterval(() => {
    if (renewingLease || shuttingDown) return;
    renewingLease = true;
    void engine.store.renewLease().then(renewed => {
      if (renewed) lastLeaseAt = Date.now();
      else healthy = false;
    }).catch(() => { healthy = false; }).finally(() => { renewingLease = false; });
  }, 5000);
  leaseInterval.unref();

  const interval = setInterval(() => {
    if (housekeeping || shuttingDown) return;
    housekeeping = true;
    void engine.serial(async () => {
      try {
        if (!healthy || Date.now() - lastLeaseAt >= 5000) {
          requireDraft(await engine.store.renewLease(), 'WRITER_LOST', '서버 쓰기 잠금을 잃었습니다.');
          if (!healthy) await engine.recover();
          lastLeaseAt = Date.now(); healthy = true;
        }
        for (const [id, client] of engine.clients) {
          const socket = sockets.get(id);
          if (client.authExpiresAt <= Date.now() || Date.now() - client.lastResponseAt >= 45_000) socket?.terminate();
          else if (Date.now() - client.lastResponseAt >= 20_000) socket?.ping();
        }
        for (const code of await engine.store.listActiveRooms()) { await engine.tick(code); await publishRoom(code); }
        for (const [key, bucket] of rates) if (Date.now() - bucket.updatedAt > 60_000) rates.delete(key);
      } catch {
        healthy = false;
        for (const socket of sockets.values()) if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'storage.unavailable', message: '저장소 복구 중 · 입력 중지' }));
        }
      }
    }).finally(() => { housekeeping = false; });
  }, 1000);
  interval.unref();

  return {
    server,
    async close(): Promise<void> {
      shuttingDown = true; clearInterval(interval); clearInterval(leaseInterval);
      for (const socket of wss.clients) socket.terminate();
      await engine.serial(async () => { await engine.recover(); await engine.store.releaseLease(); });
      await new Promise<void>(resolve => wss.close(() => resolve()));
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
