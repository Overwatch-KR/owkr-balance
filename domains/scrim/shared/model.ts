import { z } from 'zod';

export const heroRoleSchema = z.enum(['tank', 'damage', 'support']);

export const scrimRosterParticipantSchema = z.object({
    id: z.string(),
    name: z.string(),
    discordName: z.string().optional(),
});

export const heroVoteSchema = z.object({
    rosterParticipantId: z.string(),
    heroIds: z.array(z.string()),
    submittedAt: z.number(),
});

export const satisfactionResponseSchema = z.object({
    score: z.number(),
    disappointments: z.array(z.string()),
    otherOpinion: z.string().optional(),
    submittedAt: z.number(),
});

export const banDecisionSchema = z.object({
    heroIds: z.array(z.string()),
    automaticallySelected: z.boolean(),
    hasTie: z.boolean(),
    excludedHeroIds: z.array(z.string()),
    resolvedBy: z.enum(['automatic', 'manual', 'random']).optional(),
});

export const publicParticipationKindSchema = z.enum(['vote', 'satisfaction']);

export const publicParticipationLinkSchema = z.object({
    token: z.string(),
    active: z.boolean(),
    createdAt: z.number(),
});

export const scrimRecordSchema = z.object({
    id: z.string(),
    date: z.string(),
    startTime: z.string(),
    customGameStartsAt: z.number(),
    satisfactionExpiresAt: z.number(),
    createdAt: z.number(),
    createdBy: z.string(),
    createdById: z.string().optional(),
    rosterSnapshot: z.array(scrimRosterParticipantSchema),
    voteOpenedAt: z.number().optional(),
    voteClosedAt: z.number().optional(),
    publicLinks: z.object({
        vote: publicParticipationLinkSchema.optional(),
        satisfaction: publicParticipationLinkSchema.optional(),
    }).optional(),
    usedBanHeroIds: z.array(z.string()),
    votes: z.array(heroVoteSchema),
    satisfactionResponses: z.array(satisfactionResponseSchema),
    finalBanDecision: banDecisionSchema.optional(),
    adminReview: z.string().optional(),
    adminReviewUpdatedAt: z.number().optional(),
    adminReviewUpdatedBy: z.string().optional(),
});

export const publicScrimRecordSchema = scrimRecordSchema.extend({
    submittedRosterParticipantIds: z.array(z.string()).optional(),
});

export type ScrimRosterParticipant = z.infer<typeof scrimRosterParticipantSchema>;
export type HeroVote = z.infer<typeof heroVoteSchema>;
export type SatisfactionResponse = z.infer<typeof satisfactionResponseSchema>;
export type BanDecision = z.infer<typeof banDecisionSchema>;
export type PublicParticipationKind = z.infer<typeof publicParticipationKindSchema>;
export type PublicParticipationLink = z.infer<typeof publicParticipationLinkSchema>;
export type ScrimRecord = z.infer<typeof scrimRecordSchema>;
export type PublicScrimRecord = z.infer<typeof publicScrimRecordSchema>;

export type VoteParticipationStatus = 'VOTING_OPEN' | 'VOTING_CLOSED';
export type SatisfactionParticipationStatus = 'SATISFACTION_PENDING' | 'SATISFACTION_OPEN' | 'SATISFACTION_EXPIRED';
export type ParticipationStatus = VoteParticipationStatus | SatisfactionParticipationStatus;

export interface HeroVoteResult {
    heroId: string;
    votes: number;
    role: z.infer<typeof heroRoleSchema>;
}
