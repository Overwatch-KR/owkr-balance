import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseCookie, stringifySetCookie } from 'cookie';
import { disableResponseCache, getRequestOrigin } from '../_lib/http.js';

const CONTEXT_COOKIE = 'owkr_draft_oauth_context';

/** @description 같은 사이트의 별도 HttpOnly 쿠키로 참가자 세션을 복구하며 관리자 쿠키는 발급하지 않는다. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  disableResponseCache(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST 요청이 필요합니다.' }); }
  if (req.headers.origin !== getRequestOrigin(req) || !req.headers['content-type']?.startsWith('application/json')) {
    return res.status(403).json({ error: '같은 사이트에서 요청해 주세요.' });
  }
  const base = process.env.DRAFT_REALTIME_URL;
  const secret = process.env.DRAFT_BRIDGE_SECRET;
  if (!base || !secret || secret.length < 32) return res.status(503).json({ error: '참가자 인증 서버가 아직 연결되지 않았습니다.' });
  const body = req.body as { action?: unknown; roomCode?: unknown; code?: unknown } | undefined;
  const cookies = parseCookie(req.headers.cookie ?? '');
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/api/draft-participant' };
  const call = async (action: string, payload: unknown) => {
    const result = await fetch(`${base.replace(/\/$/, '')}/bridge/participant/${action}`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!result.ok) {
      const failure = await result.json() as { code?: string };
      throw new Error(failure.code === 'ROOM_CLOSED' ? 'ROOM_CLOSED' : 'AUTH_FAILED');
    }
    return result.json() as Promise<Record<string, unknown>>;
  };
  const contextHash = (value: string) => createHash('sha256').update(value).digest('hex');
  try {
    if (body?.action === 'start') {
      if (typeof body.roomCode !== 'string' || !/^[A-Z2-9]{10}$/.test(body.roomCode)) return res.status(400).json({ error: '방 코드를 확인해 주세요.' });
      const context = randomBytes(32).toString('base64url');
      const result = await call('start', { roomCode: body.roomCode, contextHash: contextHash(context) });
      res.setHeader('Set-Cookie', stringifySetCookie({ name: CONTEXT_COOKIE, value: context, ...cookieOptions, maxAge: 600 }));
      return res.status(200).json(result);
    }
    if (body?.action === 'exchange') {
      const context = cookies[CONTEXT_COOKIE];
      if (!context || typeof body.code !== 'string' || !/^[\w-]{43}$/.test(body.code)) return res.status(400).json({ error: '인증 시작 문맥이 필요합니다.' });
      const result = await call('exchange', { code: body.code, contextHash: contextHash(context) });
      if (typeof result.handle !== 'string' || typeof result.roomCode !== 'string'
        || !/^[A-Z2-9]{10}$/.test(result.roomCode) || typeof result.expiresAt !== 'number') throw new Error('INVALID_RESPONSE');
      const hasEntry = result.ticket !== undefined || result.ticketExpiresAt !== undefined;
      if (hasEntry && (typeof result.ticket !== 'string' || !result.ticket || result.ticket.length > 8192
        || typeof result.ticketExpiresAt !== 'number' || result.ticketExpiresAt <= Date.now()
        || result.ticketExpiresAt > result.expiresAt || result.ticketExpiresAt > Date.now() + 300_000)) throw new Error('INVALID_RESPONSE');
      const maxAge = Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000));
      res.setHeader('Set-Cookie', [
        stringifySetCookie({ name: `owkr_draft_participant_${result.roomCode}`, value: result.handle, ...cookieOptions, maxAge }),
        stringifySetCookie({ name: CONTEXT_COOKIE, value: '', ...cookieOptions, maxAge: 0 }),
      ]);
      return res.status(200).json({ roomCode: result.roomCode, ...(hasEntry
        ? { ticket: result.ticket, expiresAt: result.ticketExpiresAt, realtimeUrl: base } : {}) });
    }
    if (body?.action === 'refresh') {
      if (typeof body.roomCode !== 'string' || !/^[A-Z2-9]{10}$/.test(body.roomCode)) return res.status(400).json({ error: '방 코드를 확인해 주세요.' });
      const handle = cookies[`owkr_draft_participant_${body.roomCode}`];
      if (!handle) return res.status(401).json({ error: 'Discord로 참여해 주세요.' });
      return res.status(200).json({ ...await call('refresh', { roomCode: body.roomCode, handle }), realtimeUrl: base });
    }
    return res.status(400).json({ error: '참가 인증 작업을 확인해 주세요.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'ROOM_CLOSED') return res.status(410).json({
      code: 'ROOM_CLOSED', error: '종료된 내전입니다. 운영자에게 새 공유 링크를 요청해 주세요.',
    });
    return res.status(401).json({ error: '참가 인증을 완료하지 못했습니다. 방에서 다시 참여해 주세요.' });
  }
}
