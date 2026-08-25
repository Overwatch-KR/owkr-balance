import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionUser, hasValidCsrfToken } from '../_lib/auth.js';
import {
    addEventParticipation,
    getEventUserSheetCandidates,
    getEventParticipation,
    saveEventParticipation,
} from '../_lib/event-participant-store.js';
import { sendUnexpectedError } from '../_lib/error.js';
import { disableResponseCache } from '../_lib/http.js';
import { getRedis } from '../_lib/redis.js';
import { getScrims } from '../_lib/scrim-store.js';
import { readUserSheetSnapshot } from '../_lib/user-sheet-store.js';

/**
 * @description 이벤트 실제 참여자 조회와 관리자 확정 저장을 처리한다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: '이벤트 참여자 저장소가 아직 설정되지 않았습니다.' });

    try {
        if (req.method === 'GET' && req.query.source === 'user-sheet') {
            const userSheet = await readUserSheetSnapshot(redis);
            return res.status(200).json(getEventUserSheetCandidates(userSheet.entries));
        }
        const scrims = await getScrims(redis);
        if (req.method === 'GET') {
            return res.status(200).json(await getEventParticipation(redis, scrims));
        }
        if (req.method === 'PATCH' || req.method === 'POST') {
            if (!hasValidCsrfToken(req, user)) {
                return res.status(403).json({ error: '이벤트 참여자 저장 요청을 확인할 수 없습니다.' });
            }
            const body = req.body as Record<string, unknown> | undefined;
            const snapshot = req.method === 'POST'
                ? await addEventParticipation(redis, scrims, body?.participants)
                : await saveEventParticipation(
                    redis,
                    scrims,
                    body?.participantIds,
                    getEventUserSheetCandidates((await readUserSheetSnapshot(redis)).entries),
                );
            return snapshot
                ? res.status(200).json(snapshot)
                : res.status(400).json({ error: '저장할 이벤트 참여자를 확인해 주세요.' });
        }
        res.setHeader('Allow', 'GET, POST, PATCH');
        return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
    } catch (error) {
        return sendUnexpectedError(res, error, '이벤트 참여자를 처리하지 못했습니다.');
    }
}
