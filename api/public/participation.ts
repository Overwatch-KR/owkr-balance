import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
    BoundraRuntimeError,
    executeContract,
    implementMutation,
    implementQuery,
} from 'boundra';
import {
    getPublicParticipationQuery,
    submitSatisfactionMutation,
    submitVoteMutation,
} from '../../domains/scrim/shared/public.js';
import { sendUnexpectedError } from '../_lib/error.js';
import { disableResponseCache } from '../_lib/http.js';
import { getRedis } from '../_lib/redis.js';
import {
    getPublicScrims,
    submitSatisfaction as storeSatisfaction,
    submitVote as storeVote,
} from '../_lib/scrim-store.js';

type SubmissionResult = 'OK' | 'INVALID' | 'CLOSED' | 'DUPLICATE' | 'NOT_FOUND';

class PublicParticipationError extends Error {
    readonly result: SubmissionResult;

    constructor(result: SubmissionResult) {
        super(result);
        this.name = 'PublicParticipationError';
        this.result = result;
    }
}

const errorForResult = (result: string): string => ({
    INVALID: '입력 내용을 확인해 주세요.', CLOSED: '참여 가능 시간이 지났거나 아직 시작되지 않았습니다.', DUPLICATE: '이미 영웅 밴 투표를 제출했습니다.', NOT_FOUND: '유효하지 않거나 비활성화된 참여 링크입니다.',
}[result] ?? '요청을 처리하지 못했습니다.');

const unwrapContractError = (error: unknown): unknown => (
    error instanceof BoundraRuntimeError && error.cause !== undefined ? error.cause : error
);

const sendContractError = (
    res: VercelResponse,
    error: unknown,
): VercelResponse => {
    const cause = unwrapContractError(error);
    if (cause instanceof PublicParticipationError) {
        const status = cause.result === 'NOT_FOUND' ? 404 : cause.result === 'DUPLICATE' ? 409 : 400;
        return res.status(status).json({ error: errorForResult(cause.result) });
    }
    if (error instanceof BoundraRuntimeError && error.phase === 'input') {
        return res.status(400).json({ error: '입력 내용을 확인해 주세요.' });
    }
    return sendUnexpectedError(res, error, '공개 참여 요청을 처리하지 못했습니다.');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    const redis = getRedis();
    if (!redis) return res.status(503).json({ error: '참여 저장소가 아직 설정되지 않았습니다.' });
    const token = typeof req.query.token === 'string' ? req.query.token : typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token) return res.status(400).json({ error: '참여 링크를 확인해 주세요.' });
    if (req.method === 'GET') {
        try {
            const payload = await executeContract(implementQuery(
                getPublicParticipationQuery,
                async input => {
                    const participation = await getPublicScrims(redis, input.token);
                    if (!participation) throw new PublicParticipationError('NOT_FOUND');
                    return { serverNow: Date.now(), ...participation };
                },
            ), { token });
            return res.status(200).json(payload);
        } catch (error) {
            return sendContractError(res, error);
        }
    }
    if (req.method === 'POST') {
        const body = req.body && typeof req.body === 'object'
            ? req.body as Record<string, unknown>
            : {};
        try {
            const payload = body.action === 'vote'
                ? await executeContract(implementMutation(
                    submitVoteMutation,
                    async input => {
                        const result = await storeVote(
                            redis,
                            input.token,
                            input.scrimId,
                            input.participantId,
                            input.heroIds,
                        );
                        if (result !== 'OK') throw new PublicParticipationError(result);
                        return { ok: true as const, serverNow: Date.now() };
                    },
                ), body)
                : body.action === 'satisfaction'
                    ? await executeContract(implementMutation(
                        submitSatisfactionMutation,
                        async input => {
                            const result = await storeSatisfaction(
                                redis,
                                input.token,
                                input.scrimId,
                                input.response,
                            );
                            if (result !== 'OK') throw new PublicParticipationError(result);
                            return { ok: true as const, serverNow: Date.now() };
                        },
                    ), body)
                    : null;
            return payload
                ? res.status(201).json(payload)
                : res.status(400).json({ error: errorForResult('INVALID') });
        } catch (error) {
            return sendContractError(res, error);
        }
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
