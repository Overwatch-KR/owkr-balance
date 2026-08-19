import { createBoundraClient, type BoundraTransport } from 'boundra';
import {
    getPublicParticipation,
    submitSatisfaction,
    submitVote,
} from '../../domains/scrim/client/public';
import type {
    GetPublicParticipationQueryInput,
    SubmitSatisfactionMutationInput,
    SubmitVoteMutationInput,
} from '../../domains/scrim/shared/public';
import { requestJson } from './api';

const publicParticipationTransport: BoundraTransport = async (request, options) => {
    if (request.name === 'get-public-participation') {
        const input = request.input as GetPublicParticipationQueryInput;
        return requestJson(`/api/public/participation?token=${encodeURIComponent(input.token)}`, {
            signal: options?.signal,
        });
    }
    if (request.name === 'submit-vote') {
        const input = request.input as SubmitVoteMutationInput;
        return requestJson('/api/public/participation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'vote', ...input }),
            signal: options?.signal,
        });
    }
    if (request.name === 'submit-satisfaction') {
        const input = request.input as SubmitSatisfactionMutationInput;
        return requestJson('/api/public/participation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'satisfaction', ...input }),
            signal: options?.signal,
        });
    }
    throw new Error(`지원하지 않는 내전 계약입니다: ${request.name}`);
};

const publicParticipationClient = createBoundraClient(publicParticipationTransport);

export const loadPublicParticipation = (
    input: GetPublicParticipationQueryInput,
) => getPublicParticipation(publicParticipationClient, input);

export const submitPublicVote = (
    input: SubmitVoteMutationInput,
) => submitVote(publicParticipationClient, input);

export const submitPublicSatisfaction = (
    input: SubmitSatisfactionMutationInput,
) => submitSatisfaction(publicParticipationClient, input);
