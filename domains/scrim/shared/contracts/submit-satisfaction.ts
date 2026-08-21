import { defineMutation, type InferSchema } from 'boundra';
import { z } from 'zod';
import { SATISFACTION_OPTIONS } from '../constants.js';

const satisfactionAnswerSchema = z.object({
    score: z.number().int().min(1).max(5),
    disappointments: z.array(z.enum(SATISFACTION_OPTIONS)).max(SATISFACTION_OPTIONS.length)
        .refine(items => new Set(items).size === items.length, '아쉬운 점은 중복해서 선택할 수 없습니다.'),
    otherOpinion: z.string().max(1_000).optional(),
}).refine(
    answer => answer.score >= 3 || answer.disappointments.length > 0,
    { message: '별점이 2점 이하라면 아쉬운 점을 하나 이상 선택해 주세요.', path: ['disappointments'] },
);

export const submitSatisfactionInputSchema = z.object({
    token: z.string().min(1).max(200),
    scrimId: z.string().min(1).max(200),
    response: satisfactionAnswerSchema,
});
export const submitSatisfactionResultSchema = z.object({
    ok: z.literal(true),
    serverNow: z.number(),
});

export type SubmitSatisfactionMutationInput = InferSchema<typeof submitSatisfactionInputSchema>;
export type SubmitSatisfactionMutationResult = InferSchema<typeof submitSatisfactionResultSchema>;

export const submitSatisfactionMutation = defineMutation({
    name: 'submit-satisfaction',
    input: submitSatisfactionInputSchema,
    result: submitSatisfactionResultSchema,
});
