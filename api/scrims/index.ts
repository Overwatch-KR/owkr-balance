import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionUser, hasValidCsrfToken } from '../_lib/auth.js';
import { sendUnexpectedError } from '../_lib/error.js';
import { disableResponseCache } from '../_lib/http.js';
import { getRedis } from '../_lib/redis.js';
import {
    activatePublicLink,
    addUsedBans,
    closeVote,
    confirmFinalBans,
    createScrim,
    deactivatePublicLink,
    deleteScrim,
    extendSatisfaction,
    getScrims,
    openVote,
    resolveTiedBansRandomly,
    updateScrimReview,
} from '../_lib/scrim-store.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: '내전 저장소가 아직 설정되지 않았습니다.' });
    try {
        if (req.method === 'GET') return res.status(200).json({ scrims: await getScrims(redis) });
        if (!hasValidCsrfToken(req, user)) return res.status(403).json({ error: '내전 저장 요청을 확인할 수 없습니다.' });
        const body = req.body as Record<string, unknown> | undefined;
        if (req.method === 'POST') {
            const record = await createScrim(redis, {
                date: body?.date,
                startTime: body?.startTime,
                roster: body?.roster,
            }, { id: user.id, name: user.globalName ?? user.username });
            return record ? res.status(201).json({ scrim: record }) : res.status(400).json({ error: '진행 날짜, 시작 시간, 로스터를 확인해 주세요.' });
        }
        if (req.method === 'PATCH') {
            const id = typeof body?.id === 'string' ? body.id : '';
            const action = body?.action;
            const kind = body?.kind === 'vote' || body?.kind === 'satisfaction' ? body.kind : null;
            if (action === 'delete') {
                const deleted = await deleteScrim(redis, id, user.id);
                return deleted ? res.status(204).end() : res.status(403).json({ error: '직접 만든 내전만 삭제할 수 있습니다.' });
            }
            const record = action === 'activateLink' && kind ? await activatePublicLink(redis, id, kind, Boolean(body?.regenerate))
                : action === 'deactivateLink' && kind ? await deactivatePublicLink(redis, id, kind)
                : action === 'openVote' ? await openVote(redis, id)
                : action === 'closeVote' ? await closeVote(redis, id)
                : action === 'addUsedBans' ? await addUsedBans(redis, id, body?.heroIds)
                : action === 'confirmFinalBans' ? await confirmFinalBans(redis, id, body?.heroIds)
                : action === 'resolveTieRandom' ? await resolveTiedBansRandomly(redis, id)
                : action === 'extendSatisfaction' ? await extendSatisfaction(redis, id)
                : action === 'updateReview'
                    ? await updateScrimReview(
                        redis,
                        id,
                        body?.adminReview,
                        user.globalName ?? user.username,
                    )
                : null;
            return record ? res.status(200).json({ scrim: record }) : res.status(400).json({ error: '내전 상태 또는 요청 내용을 확인해 주세요.' });
        }
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    } catch (error) { return sendUnexpectedError(res, error, '내전 데이터를 처리하지 못했습니다.'); }
}
