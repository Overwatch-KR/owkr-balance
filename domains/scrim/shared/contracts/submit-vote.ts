import { defineMutation, type InferSchema } from 'boundra';
import { z } from 'zod';

export const submitVoteInputSchema = z.object({
    token: z.string().min(1).max(200),
    scrimId: z.string().min(1).max(200),
    participantId: z.string().min(1).max(200),
    heroIds: z.array(z.string().min(1)).min(1).max(3)
        .refine(heroIds => new Set(heroIds).size === heroIds.length, '영웅은 중복해서 선택할 수 없습니다.'),
});
export const submitVoteResultSchema = z.object({
    ok: z.literal(true),
    serverNow: z.number(),
});

export type SubmitVoteMutationInput = InferSchema<typeof submitVoteInputSchema>;
export type SubmitVoteMutationResult = InferSchema<typeof submitVoteResultSchema>;

export const submitVoteMutation = defineMutation({
    name: 'submit-vote',
    input: submitVoteInputSchema,
    result: submitVoteResultSchema,
});
