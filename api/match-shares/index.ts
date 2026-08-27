import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeMatchShareCode } from '#domain/balance';
import { getSessionUser, hasValidCsrfToken } from '../_lib/auth.js';
import { sendUnexpectedError } from '../_lib/error.js';
import { disableResponseCache } from '../_lib/http.js';
import {
    createMatchLiveSession,
    getMatchLiveSession,
    MATCH_LIVE_TTL_SECONDS,
    updateMatchLiveSession,
} from '../_lib/match-live-store.js';
import {
    createMatchShare,
    getMatchShare,
    MATCH_SHARE_TTL_SECONDS,
} from '../_lib/match-share-store.js';
import { getRedis } from '../_lib/redis.js';

const queryValue = (value: string | string[] | undefined): string => (
    Array.isArray(value) ? value[0] ?? '' : value ?? ''
);

const normalizeCode = (value: unknown): string => normalizeMatchShareCode(
    typeof value === 'string' ? value : '',
);

/**
 * @description 관리자끼리 스냅샷 공유와 revision 기반 실시간 공동 편집을 하나의 함수에서 처리한다.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const isLiveRequest = queryValue(req.query.mode) === 'live';
    const redis = getRedis();
    if (!redis) {
        return res.status(503).json({
            error: isLiveRequest
                ? '실시간 공동 작업 저장소가 아직 설정되지 않았습니다.'
                : '내전 공유 저장소가 아직 설정되지 않았습니다.',
        });
    }

    try {
        if (isLiveRequest) {
            if (req.method === 'GET') {
                const code = normalizeCode(queryValue(req.query.code));
                if (code.length !== 10) {
                    return res.status(400).json({ error: '공동 작업 코드 10자리를 확인해 주세요.' });
                }

                const session = await getMatchLiveSession(redis, code);
                return session
                    ? res.status(200).json({ code, ...session })
                    : res.status(404).json({ error: '공동 작업 코드를 찾지 못했거나 만료되었습니다.' });
            }

            if (req.method === 'POST') {
                if (!hasValidCsrfToken(req, user)) {
                    return res.status(403).json({ error: '공동 작업 요청을 확인할 수 없습니다.' });
                }
                const body = req.body as { participants?: unknown } | undefined;
                const created = await createMatchLiveSession(redis, body?.participants);
                return created
                    ? res.status(201).json({
                        code: created.code,
                        ...created.session,
                        expiresInSeconds: MATCH_LIVE_TTL_SECONDS,
                    })
                    : res.status(400).json({ error: '참가자의 Discord ID와 팀 배치를 확인해 주세요.' });
            }

            if (req.method === 'PUT') {
                if (!hasValidCsrfToken(req, user)) {
                    return res.status(403).json({ error: '공동 작업 요청을 확인할 수 없습니다.' });
                }
                const body = req.body as {
                    code?: unknown;
                    participants?: unknown;
                    revision?: unknown;
                } | undefined;
                const code = normalizeCode(body?.code);
                if (code.length !== 10) {
                    return res.status(400).json({ error: '공동 작업 코드 10자리를 확인해 주세요.' });
                }

                const result = await updateMatchLiveSession(
                    redis,
                    code,
                    body?.revision,
                    body?.participants,
                );
                if (result.status === 'NOT_FOUND') {
                    return res.status(404).json({ error: '공동 작업 코드를 찾지 못했거나 만료되었습니다.' });
                }
                if (result.status === 'INVALID') {
                    return res.status(400).json({ error: '공동 작업 명단 또는 revision을 확인해 주세요.' });
                }
                if (result.status === 'CONFLICT') {
                    return res.status(409).json({
                        code: 'MATCH_LIVE_CONFLICT',
                        error: '다른 관리자가 먼저 수정했습니다. 최신 변경을 다시 반영합니다.',
                        session: { code, ...result.session },
                    });
                }
                return res.status(200).json({ code, ...result.session });
            }

            res.setHeader('Allow', 'GET, POST, PUT');
            return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
        }

        if (req.method === 'GET') {
            const shared = await getMatchShare(redis, queryValue(req.query.code));
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
        return sendUnexpectedError(
            res,
            error,
            isLiveRequest
                ? '실시간 공동 작업 데이터를 처리하지 못했습니다.'
                : '내전 공유 데이터를 처리하지 못했습니다.',
        );
    }
}
