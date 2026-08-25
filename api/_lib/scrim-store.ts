import { randomBytes, randomInt } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import {
    HEROES,
    getScrimTimes,
    type HeroRole,
} from '../../domains/scrim/shared/rules.js';
import type {
    BanDecision,
    HeroVote,
    HeroVoteResult,
    PublicParticipationKind,
    SatisfactionResponse,
    ScrimRecord,
    ScrimRosterParticipant,
} from '../../domains/scrim/shared/public.js';

const SCRIMS_KEY = 'scrims:v1:records';
const SCRIM_SEQUENCE_KEY = 'scrims:v1:sequence';
const SATISFACTION_EXTENSION_MS = 24 * 60 * 60 * 1_000;
const heroById = new Map(HEROES.map(hero => [hero.id, hero]));

const cleanText = (value: unknown, length: number): string => (
    typeof value === 'string' ? value.trim().slice(0, length) : ''
);

const readRecords = async (redis: Redis): Promise<ScrimRecord[]> => {
    const records = await redis.get<ScrimRecord[]>(SCRIMS_KEY) ?? [];
    return records.map(record => {
        if (record.publicLinks) return record;
        const legacy = record as ScrimRecord & { publicToken?: string; publicLinkActive?: boolean };
        const voteLink = legacy.publicToken ? { token: legacy.publicToken, active: Boolean(legacy.publicLinkActive), createdAt: record.createdAt } : undefined;
        return { ...record, publicLinks: voteLink ? { vote: voteLink } : {} };
    });
};

const writeRecords = async (redis: Redis, records: ScrimRecord[]): Promise<void> => {
    await redis.set(SCRIMS_KEY, records);
};

const buildToken = (): string => randomBytes(24).toString('base64url');

export const createScrim = async (
    redis: Redis,
    input: { date: unknown; startTime: unknown; roster: unknown },
    createdBy: { id: string; name: string },
): Promise<ScrimRecord | null> => {
    const date = cleanText(input.date, 10);
    const startTime = cleanText(input.startTime, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime)) return null;
    const { customGameStartsAt, satisfactionExpiresAt } = getScrimTimes(date, startTime);
    if (!Number.isFinite(customGameStartsAt)) return null;
    if (!Array.isArray(input.roster) || input.roster.length === 0 || input.roster.length > 100) return null;
    const ids = new Set<string>();
    const rosterSnapshot: ScrimRosterParticipant[] = [];
    for (const raw of input.roster) {
        if (!raw || typeof raw !== 'object') return null;
        const item = raw as Partial<ScrimRosterParticipant>;
        const id = cleanText(item.id, 200);
        const name = cleanText(item.name, 100);
        const discordName = cleanText(item.discordName, 100);
        const discordUserId = cleanText(item.discordUserId, 30);
        if (!id || !name || ids.has(id)) return null;
        ids.add(id);
        rosterSnapshot.push({
            id,
            name,
            discordName: discordName || undefined,
            discordUserId: discordUserId || undefined,
        });
    }
    const id = String(await redis.incr(SCRIM_SEQUENCE_KEY));
    const record: ScrimRecord = {
        id, date, startTime, customGameStartsAt, satisfactionExpiresAt,
        createdAt: Date.now(), createdBy: createdBy.name, createdById: createdBy.id, rosterSnapshot, publicLinks: {},
        usedBanHeroIds: [], votes: [], satisfactionResponses: [],
    };
    const records = await readRecords(redis);
    records.push(record);
    await writeRecords(redis, records);
    return record;
};

const closeExpiredVotes = async (redis: Redis): Promise<ScrimRecord[]> => {
    const records = await readRecords(redis);
    let changed = false;
    records.forEach(record => {
        if (record.voteOpenedAt && Date.now() >= record.customGameStartsAt) {
            if (!record.voteClosedAt) {
                record.voteClosedAt = record.customGameStartsAt;
                changed = true;
            }
            if (!record.finalBanDecision) {
                record.finalBanDecision = getSuggestedBanDecision(record);
                changed = true;
            }
        }
    });
    if (changed) await writeRecords(redis, records);
    return records;
};

export const getScrims = (redis: Redis): Promise<ScrimRecord[]> => closeExpiredVotes(redis);

export const getPublicScrims = async (redis: Redis, token: string): Promise<{ scrims: ScrimRecord[]; kind: PublicParticipationKind } | null> => {
    const records = await closeExpiredVotes(redis);
    for (const kind of ['vote', 'satisfaction'] as const) {
        const scrims = records.filter(scrim => scrim.publicLinks?.[kind]?.active && scrim.publicLinks[kind]?.token === token)
            .map(scrim => {
                const publicScrim = { ...scrim };
                delete publicScrim.adminReview;
                delete publicScrim.adminReviewUpdatedAt;
                delete publicScrim.adminReviewUpdatedBy;
                return {
                    ...publicScrim,
                    submittedRosterParticipantIds: kind === 'vote'
                        ? scrim.votes.map(vote => vote.rosterParticipantId)
                        : [],
                    votes: [],
                    satisfactionResponses: [],
                };
            });
        if (scrims.length) return { scrims, kind };
    }
    return null;
};

export const updateScrim = async (
    redis: Redis,
    id: string,
    mutate: (record: ScrimRecord) => boolean,
): Promise<ScrimRecord | null> => {
    const records = await readRecords(redis);
    const index = records.findIndex(record => record.id === id);
    if (index < 0 || !mutate(records[index])) return null;
    await writeRecords(redis, records);
    return records[index];
};

export const activatePublicLink = async (redis: Redis, id: string, kind: PublicParticipationKind, regenerate: boolean): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        const now = Date.now();
        const current = record.publicLinks?.[kind];
        record.publicLinks = {
            ...record.publicLinks,
            [kind]: (!current || regenerate)
                ? { token: buildToken(), active: true, createdAt: now }
                : { ...current, active: true },
        };
        if (kind === 'satisfaction' && record.satisfactionExpiresAt < now) {
            record.satisfactionExpiresAt = now + SATISFACTION_EXTENSION_MS;
        }
        return true;
    })
);

export const extendSatisfaction = async (redis: Redis, id: string): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        const now = Date.now();
        const currentLink = record.publicLinks?.satisfaction;
        record.satisfactionExpiresAt = Math.max(record.satisfactionExpiresAt, now)
            + SATISFACTION_EXTENSION_MS;
        record.publicLinks = {
            ...record.publicLinks,
            satisfaction: currentLink
                ? { ...currentLink, active: true }
                : { token: buildToken(), active: true, createdAt: now },
        };
        return true;
    })
);

export const updateScrimReview = async (
    redis: Redis,
    id: string,
    review: unknown,
    actorName: string,
): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        const nextReview = cleanText(review, 4_000);
        record.adminReview = nextReview || undefined;
        record.adminReviewUpdatedAt = Date.now();
        record.adminReviewUpdatedBy = actorName;
        return true;
    })
);

export const deactivatePublicLink = async (redis: Redis, id: string, kind: PublicParticipationKind): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        const current = record.publicLinks?.[kind];
        if (!current) return false;
        record.publicLinks = { ...record.publicLinks, [kind]: { ...current, active: false } };
        return true;
    })
);

export const openVote = async (redis: Redis, id: string): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        if (Date.now() >= record.customGameStartsAt) return false;
        const currentLink = record.publicLinks?.vote;
        record.publicLinks = {
            ...record.publicLinks,
            vote: !currentLink || !currentLink.active
                ? { token: buildToken(), active: true, createdAt: Date.now() }
                : currentLink,
        };
        record.voteOpenedAt = Date.now();
        record.voteClosedAt = undefined;
        return true;
    })
);

export const closeVote = async (redis: Redis, id: string): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        if (!record.voteOpenedAt) return false;
        record.voteClosedAt = Date.now();
        record.finalBanDecision = getSuggestedBanDecision(record);
        return true;
    })
);

export const addUsedBans = async (redis: Redis, id: string, heroIds: unknown): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        if (!Array.isArray(heroIds) || heroIds.some(value => typeof value !== 'string' || !heroById.has(value))) return false;
        record.usedBanHeroIds = [...new Set([...record.usedBanHeroIds, ...heroIds])];
        return true;
    })
);

export const getVoteResults = (record: ScrimRecord): HeroVoteResult[] => {
    const counts = new Map<string, number>();
    record.votes.forEach(vote => vote.heroIds.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1)));
    return [...counts].map(([heroId, votes]) => ({ heroId, votes, role: heroById.get(heroId)!.role }))
        .sort((a, b) => b.votes - a.votes || a.heroId.localeCompare(b.heroId));
};

export const getSuggestedBanDecision = (record: ScrimRecord): BanDecision => {
    const results = getVoteResults(record);
    if (!results.length) return { heroIds: [], automaticallySelected: false, hasTie: false, excludedHeroIds: [] };
    const topVotes = results[0].votes;
    const first = results.filter(result => result.votes === topVotes);
    if (first.length !== 1) return { heroIds: [], automaticallySelected: false, hasTie: true, excludedHeroIds: [] };
    const excludedHeroIds = results.filter(result => result.role === first[0].role && result.heroId !== first[0].heroId).map(result => result.heroId);
    const secondPool = results.filter(result => result.role !== first[0].role);
    if (!secondPool.length) return { heroIds: [first[0].heroId], automaticallySelected: false, hasTie: false, excludedHeroIds };
    const second = secondPool.filter(result => result.votes === secondPool[0].votes);
    if (second.length !== 1) return { heroIds: [first[0].heroId], automaticallySelected: false, hasTie: true, excludedHeroIds };
    return { heroIds: [first[0].heroId, second[0].heroId], automaticallySelected: true, hasTie: false, excludedHeroIds, resolvedBy: 'automatic' };
};

export const confirmFinalBans = async (redis: Redis, id: string, heroIds: unknown): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        if (!Array.isArray(heroIds) || heroIds.length !== 2 || heroIds.some(value => typeof value !== 'string' || !heroById.has(value))) return false;
        const roles = heroIds.map(heroId => heroById.get(heroId)!.role as HeroRole);
        if (new Set(heroIds).size !== 2 || roles[0] === roles[1]) return false;
        const suggestion = getSuggestedBanDecision(record);
        record.finalBanDecision = {
            ...suggestion,
            heroIds: [...heroIds],
            automaticallySelected: false,
            resolvedBy: 'manual',
        };
        return true;
    })
);

export const resolveTiedBansRandomly = async (
    redis: Redis,
    id: string,
): Promise<ScrimRecord | null> => (
    updateScrim(redis, id, record => {
        const suggestion = getSuggestedBanDecision(record);
        if (!suggestion.hasTie) return false;
        const results = getVoteResults(record);
        if (!results.length) return false;

        const firstVoteCount = results[0].votes;
        const firstCandidates = results.filter(result => result.votes === firstVoteCount);
        const first = firstCandidates[randomInt(firstCandidates.length)];
        const secondPool = results.filter(result => result.role !== first.role);
        if (!secondPool.length) return false;
        const secondVoteCount = secondPool[0].votes;
        const secondCandidates = secondPool.filter(result => result.votes === secondVoteCount);
        const second = secondCandidates[randomInt(secondCandidates.length)];
        const excludedHeroIds = results
            .filter(result => result.role === first.role && result.heroId !== first.heroId)
            .map(result => result.heroId);

        record.finalBanDecision = {
            heroIds: [first.heroId, second.heroId],
            automaticallySelected: false,
            hasTie: true,
            excludedHeroIds,
            resolvedBy: 'random',
        };
        return true;
    })
);

export const submitVote = async (redis: Redis, token: string, id: string, participantId: unknown, heroIds: unknown): Promise<'OK' | 'INVALID' | 'CLOSED' | 'DUPLICATE' | 'NOT_FOUND'> => {
    const records = await readRecords(redis);
    const record = records.find(item => item.id === id && item.publicLinks?.vote?.active && item.publicLinks.vote.token === token);
    if (!record) return 'NOT_FOUND';
    const now = Date.now();
    if (!record.voteOpenedAt || record.voteClosedAt || now < record.voteOpenedAt || now >= record.customGameStartsAt) return 'CLOSED';
    if (typeof participantId !== 'string' || !record.rosterSnapshot.some(person => person.id === participantId) || !Array.isArray(heroIds) || heroIds.length < 1 || heroIds.length > 3 || new Set(heroIds).size !== heroIds.length || heroIds.some(value => typeof value !== 'string' || !heroById.has(value) || record.usedBanHeroIds.includes(value))) return 'INVALID';
    if (record.votes.some(vote => vote.rosterParticipantId === participantId)) return 'DUPLICATE';
    record.votes.push({ rosterParticipantId: participantId, heroIds, submittedAt: now } satisfies HeroVote);
    await writeRecords(redis, records);
    return 'OK';
};

export const submitSatisfaction = async (redis: Redis, token: string, id: string, response: unknown): Promise<'OK' | 'INVALID' | 'CLOSED' | 'NOT_FOUND'> => {
    const records = await readRecords(redis);
    const record = records.find(item => item.id === id && item.publicLinks?.satisfaction?.active && item.publicLinks.satisfaction.token === token);
    if (!record) return 'NOT_FOUND';
    const now = Date.now();
    if (now < record.customGameStartsAt || now > record.satisfactionExpiresAt) return 'CLOSED';
    if (!response || typeof response !== 'object') return 'INVALID';
    const input = response as Partial<SatisfactionResponse>;
    const score = input.score;
    const disappointments = Array.isArray(input.disappointments) ? input.disappointments.filter(item => typeof item === 'string').slice(0, 7) : [];
    const otherOpinion = cleanText(input.otherOpinion, 1000);
    const allowed = new Set(['팀 밸런스', '영웅 밴 방식', '진행 속도', '음성채팅 분위기', '참가자 매너', '경기 수', '기타']);
    if (!Number.isInteger(score) || score! < 1 || score! > 5 || disappointments.some(item => !allowed.has(item)) || new Set(disappointments).size !== disappointments.length || (score! < 3 && disappointments.length === 0)) return 'INVALID';
    record.satisfactionResponses.push({ score: score!, disappointments, otherOpinion: otherOpinion || undefined, submittedAt: now });
    await writeRecords(redis, records);
    return 'OK';
};

export const deleteScrim = async (redis: Redis, id: string, actorId: string): Promise<boolean> => {
    const records = await readRecords(redis);
    const record = records.find(item => item.id === id);
    if (!record || record.createdById !== actorId) return false;
    await writeRecords(redis, records.filter(item => item.id !== id));
    return true;
};
