import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionUser, hasValidCsrfToken } from '../_lib/auth.js';
import { sendUnexpectedError } from '../_lib/error.js';
import { disableResponseCache } from '../_lib/http.js';
import {
    createMatchShare,
    getMatchShare,
    MATCH_SHARE_TTL_SECONDS,
} from '../_lib/match-share-store.js';
import { getRedis } from '../_lib/redis.js';

/**
 * @description 관리자끼리 팀 배치 최소 정보를 공유 코드로 저장하거나 불러온다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: '내전 공유 저장소가 아직 설정되지 않았습니다.' });

    try {
        if (req.method === 'GET') {
            const rawCode = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
            const shared = await getMatchShare(redis, rawCode ?? '');
            return shared
                ? res.status(200).json({ participants: shared.participants })
                : res.status(404).json({ error: '공유 코드를 찾지 못했거나 만료되었습니다.' });
        }

        if (req.method === 'POST') {
            if (!hasValidCsrfToken(req, user)) {
                return res.status(403).json({ error: '내전 공유 요청을 확인할 수 없습니다.' });
            }
            const body = req.body as { participants?: unknown } | undefined;
            const shared = await createMatchShare(redis, body?.participants);
            return shared
                ? res.status(201).json({
                    code: shared.code,
                    expiresInSeconds: MATCH_SHARE_TTL_SECONDS,
                })
                : res.status(400).json({ error: 'Discord ID와 팀 역할 배치를 확인해 주세요.' });
        }

        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    } catch (error) {
        return sendUnexpectedError(res, error, '내전 공유 데이터를 처리하지 못했습니다.');
    }
}
