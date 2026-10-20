import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionUser, hasValidCsrfToken, isAllowedAdmin } from '../_lib/auth.js';
import { disableResponseCache } from '../_lib/http.js';
import { signDraftTicket } from '../../realtime/src/tickets.js';

/** @description 기존 관리자 인증을 별도 키로 서명한 60초 입장권으로만 연결한다. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  disableResponseCache(res);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'POST 요청이 필요합니다.' }); }
  const user = getSessionUser(req);
  if (!user || !isAllowedAdmin(user.id)) return res.status(401).json({ error: '운영자 로그인이 필요합니다.' });
  if (!hasValidCsrfToken(req, user)) return res.status(403).json({ error: '요청 인증을 확인해 주세요.' });
  const privateKey = process.env.DRAFT_ADMIN_PRIVATE_KEY;
  const realtimeUrl = process.env.DRAFT_REALTIME_URL;
  if (!privateKey || !realtimeUrl) return res.status(503).json({ error: '실시간 밴픽 서버가 아직 연결되지 않았습니다.' });
  const body = req.body as { scope?: unknown; roomCode?: unknown } | undefined;
  if (!body || !['create', 'join'].includes(String(body.scope))) return res.status(400).json({ error: '입장권 용도를 확인해 주세요.' });
  if (body.scope === 'join' && (typeof body.roomCode !== 'string' || !/^[A-Z2-9]{10}$/.test(body.roomCode))) {
    return res.status(400).json({ error: '방 코드를 확인해 주세요.' });
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    const ticket = signDraftTicket({ iss: 'owkr-vercel', purpose: 'admin-entry', sub: user.id,
      displayName: user.globalName ?? user.username, scope: body.scope as 'create' | 'join',
      roomCode: body.scope === 'join' ? body.roomCode as string : null, iat: now, exp: now + 60,
    }, privateKey);
    return res.status(200).json({ ticket, expiresAt: (now + 60) * 1000, realtimeUrl });
  } catch { return res.status(503).json({ error: '실시간 입장권 설정을 확인해 주세요.' }); }
}
