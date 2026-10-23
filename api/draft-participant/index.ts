import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseCookie, stringifySetCookie } from 'cookie';
import { disableResponseCache, getRequestOrigin } from '../_lib/http.js';

const CONTEXT_COOKIE = 'owkr_draft_oauth_context';

const BRIDGE_FAILURES: Record<string, { status: number; error: string }> = {
  ROOM_CLOSED: { status: 410, error: '종료된 내전입니다. 운영자에게 새 공유 링크를 요청해 주세요.' },
  ROOM_EXPIRED: { status: 410, error: '내전 방이 없거나 만료되었습니다. 운영자에게 새 공유 링크를 요청해 주세요.' },
  INACTIVE_ROOM: { status: 410, error: '현재 사용 중인 내전 방이 아닙니다. 운영자에게 새 공유 링크를 요청해 주세요.' },
  SOURCE_OUTDATED: { status: 503, error: '최신 명단을 확인하고 있습니다. 잠시 후 다시 확인해 주세요.' },
  NOT_PARTICIPANT: { status: 403, error: '이 내전 명단에 등록된 Discord 계정으로 참여해 주세요. 운영자에게 명단을 확인해 주세요.' },
  EXCHANGE_EXPIRED: { status: 401, error: '참가 인증 교환 코드가 만료되었거나 이미 사용되었습니다. 방에서 다시 인증해 주세요.' },
  INVALID_AUTH_CONTEXT: { status: 401, error: '인증을 시작한 브라우저에서 다시 참여해 주세요.' },
  INVALID_SESSION: { status: 401, error: '이 방의 참가 인증이 필요합니다. Discord로 다시 참여해 주세요.' },
  PARTICIPANT_SESSION_EXPIRED: { status: 401, error: '참가 인증이 만료되었습니다. Discord로 다시 참여해 주세요.' },
  BRIDGE_ACCESS_DENIED: { status: 503, error: '참가 인증 서버 연결 설정을 확인해야 합니다. 운영자에게 문의해 주세요.' },
  UNAVAILABLE: { status: 503, error: '참가 인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
  INVALID_RESPONSE: { status: 502, error: '참가 인증 서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
};

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
      const failure: unknown = await result.json().catch(() => null);
      const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : null;
      throw new Error(typeof code === 'string' && Object.hasOwn(BRIDGE_FAILURES, code) ? code : 'UNAVAILABLE');
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
      if (result.admission !== undefined) {
        const admission = result.admission as { status?: unknown; displayName?: unknown; participantCount?: unknown };
        if (!admission || !['WAITING', 'EXCLUDED'].includes(String(admission.status)) || typeof admission.displayName !== 'string'
          || admission.displayName.length > 100 || !Number.isInteger(admission.participantCount)
          || Number(admission.participantCount) < 0 || Number(admission.participantCount) > 10 || hasEntry) throw new Error('INVALID_RESPONSE');
      }
      const maxAge = Math.max(0, Math.floor((result.expiresAt - Date.now()) / 1000));
      res.setHeader('Set-Cookie', [
        stringifySetCookie({ name: `owkr_draft_participant_${result.roomCode}`, value: result.handle, ...cookieOptions, maxAge }),
        stringifySetCookie({ name: CONTEXT_COOKIE, value: '', ...cookieOptions, maxAge: 0 }),
      ]);
      return res.status(200).json({ roomCode: result.roomCode, ...(hasEntry
        ? { ticket: result.ticket, expiresAt: result.ticketExpiresAt, realtimeUrl: base } : result.admission ? { admission: result.admission } : {}) });
    }
    if (body?.action === 'refresh') {
      if (typeof body.roomCode !== 'string' || !/^[A-Z2-9]{10}$/.test(body.roomCode)) return res.status(400).json({ error: '방 코드를 확인해 주세요.' });
      const handle = cookies[`owkr_draft_participant_${body.roomCode}`];
      if (!handle) {
        await call('status', { roomCode: body.roomCode });
        return res.status(401).json({ error: 'Discord로 참여해 주세요.' });
      }
      return res.status(200).json({ ...await call('refresh', { roomCode: body.roomCode, handle }), realtimeUrl: base });
    }
    return res.status(400).json({ error: '참가 인증 작업을 확인해 주세요.' });
  } catch (error) {
    const code = error instanceof Error && Object.hasOwn(BRIDGE_FAILURES, error.message) ? error.message : 'UNAVAILABLE';
    const failure = BRIDGE_FAILURES[code];
    return res.status(failure.status).json({ code, error: failure.error });
  }
}
