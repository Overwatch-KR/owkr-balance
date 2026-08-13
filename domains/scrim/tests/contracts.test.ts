import { BoundraRuntimeError, createBoundraClient } from 'boundra';
import { describe, expect, it } from 'vitest';
import {
    getPublicParticipationQuery,
    submitSatisfactionMutation,
    submitVoteMutation,
} from '../shared/public';

describe('scrim Boundra contracts', () => {
    it('중복 영웅이 포함된 투표 입력을 transport 전에 거부한다', async () => {
        const transport = async () => ({ ok: true, serverNow: Date.now() });
        const client = createBoundraClient(transport);

        await expect(client.mutation(submitVoteMutation, {
            token: 'token',
            scrimId: 'scrim-1',
            participantId: 'participant-1',
            heroIds: ['ana', 'ana'],
        })).rejects.toEqual(expect.objectContaining({
            code: 'RUNTIME-001',
            contract: 'submit-vote',
            phase: 'input',
        } satisfies Partial<BoundraRuntimeError>));
    });

    it('잘못된 공개 참여 응답을 UI에 전달하기 전에 거부한다', async () => {
        const client = createBoundraClient(async () => ({
            serverNow: 'invalid',
            scrims: [],
            kind: 'vote',
        }));

        await expect(client.query(getPublicParticipationQuery, {
            token: 'token',
        })).rejects.toEqual(expect.objectContaining({
            code: 'RUNTIME-002',
            contract: 'get-public-participation',
            phase: 'result',
        } satisfies Partial<BoundraRuntimeError>));
    });

    it('낮은 만족도에 아쉬운 점이 없으면 제출을 거부한다', async () => {
        const client = createBoundraClient(async () => ({ ok: true, serverNow: Date.now() }));

        await expect(client.mutation(submitSatisfactionMutation, {
            token: 'token',
            scrimId: 'scrim-1',
            response: {
                score: 2,
                disappointments: [],
                otherOpinion: '',
            },
        })).rejects.toEqual(expect.objectContaining({
            code: 'RUNTIME-001',
            contract: 'submit-satisfaction',
            phase: 'input',
        } satisfies Partial<BoundraRuntimeError>));
    });
});
