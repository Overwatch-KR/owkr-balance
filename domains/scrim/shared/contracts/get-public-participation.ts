import { defineQuery, type InferSchema } from 'boundra';
import { z } from 'zod';
import {
    publicParticipationKindSchema,
    publicScrimRecordSchema,
} from '../model';

export const getPublicParticipationInputSchema = z.object({
    token: z.string().min(1).max(200),
});
export const getPublicParticipationResultSchema = z.object({
    serverNow: z.number(),
    scrims: z.array(publicScrimRecordSchema),
    kind: publicParticipationKindSchema,
});

export type GetPublicParticipationQueryInput = InferSchema<typeof getPublicParticipationInputSchema>;
export type GetPublicParticipationQueryResult = InferSchema<typeof getPublicParticipationResultSchema>;

export const getPublicParticipationQuery = defineQuery({
    name: 'get-public-participation',
    input: getPublicParticipationInputSchema,
    result: getPublicParticipationResultSchema,
});
