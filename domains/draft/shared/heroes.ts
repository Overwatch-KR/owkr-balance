import { validateHeroCatalog } from './catalog.js';
import {
  DRAFT_LIMITS, requireDraft, type DraftCatalog, type DraftHero, type DraftParticipant,
  type DraftRole, type DraftTeam,
} from './model.js';
import { DraftRandom } from './random.js';
import { validateDraftRoster } from './roster.js';

export interface SealedHeroBallot {
  discordId: string;
  ranking: readonly string[];
}

export interface HeroScore {
  heroId: string;
  role: DraftRole;
  positiveScore: number;
  effectiveScore: number;
  lobbyVoterCount: number;
}

export interface BanSlot {
  team: DraftTeam;
  heroId: string | null;
  skipped: readonly { heroId: string; reason: 'ALREADY_BANNED' | 'ROLE_LIMIT' }[];
}

export interface HeroResolution {
  resolutionId: string;
  catalogVersion: string;
  firstTeam: DraftTeam | null;
  scores: Record<DraftTeam, readonly HeroScore[]>;
  slots: readonly BanSlot[];
  bannedHeroIds: readonly string[];
  roleCounts: Record<DraftRole, number>;
  draws: readonly number[];
}

/** @description 순위별 7/5/3점을 합산하고 슬롯 F/S/S/F에 중복·역할 제한을 적용한다. */
export function resolveHeroBans(input: {
  resolutionId: string;
  catalog: DraftCatalog<DraftHero>;
  participants: readonly DraftParticipant[];
  ballots: readonly SealedHeroBallot[];
  entropy: readonly number[];
}): HeroResolution {
  validateHeroCatalog(input.catalog);
  validateDraftRoster(input.participants);
  requireDraft(input.resolutionId.trim(), 'RESOLUTION_ID_REQUIRED', '집계 식별자가 필요합니다.');
  const heroes = new Map(input.catalog.entries.filter(hero => hero.active).map(hero => [hero.heroId, hero]));
  const participants = new Map(input.participants.map(player => [player.discordId, player]));
  requireDraft(input.ballots.length === 10 && new Set(input.ballots.map(ballot => ballot.discordId)).size === 10,
    'BALLOT_COUNT', '중복 없는 10명의 봉인된 표가 필요합니다.');
  for (const ballot of input.ballots) {
    requireDraft(participants.has(ballot.discordId), 'NOT_PARTICIPANT', '현재 명단의 표만 집계할 수 있습니다.');
    const selectedIds = ballot.ranking.filter(Boolean);
    requireDraft(ballot.ranking.length <= 3 && new Set(selectedIds).size === selectedIds.length,
      'INVALID_RANKING', '서로 다른 영웅을 최대 3명 선택해 주세요.');
    requireDraft(ballot.ranking.every(id => id === '' || heroes.has(id)),
    'INVALID_HERO', '비활성 또는 알 수 없는 영웅입니다.');
  }
  const voters = new Map<string, number>();
  for (const ballot of input.ballots) {
    for (const heroId of ballot.ranking.filter(Boolean)) voters.set(heroId, (voters.get(heroId) ?? 0) + 1);
  }
  const random = new DraftRandom(input.entropy);
  const scores: Record<DraftTeam, HeroScore[]> = { A: [], B: [] };
  for (const team of ['A', 'B'] as const) {
    const ballots = input.ballots.filter(ballot => participants.get(ballot.discordId)!.team === team);
    const positiveScores = new Map<string, number>();
    for (const ballot of ballots) {
      ballot.ranking.forEach((heroId, index) => {
        if (!heroId) return;
        positiveScores.set(heroId, (positiveScores.get(heroId) ?? 0) + DRAFT_LIMITS.rankPoints[index]);
      });
    }
    const sorted = [...positiveScores].map(([heroId, positiveScore]): HeroScore => {
      return {
        heroId, role: heroes.get(heroId)!.role, positiveScore,
        effectiveScore: positiveScore,
        lobbyVoterCount: voters.get(heroId) ?? 0,
      };
    }).sort((left, right) => right.effectiveScore - left.effectiveScore
      || right.lobbyVoterCount - left.lobbyVoterCount || left.heroId.localeCompare(right.heroId));
    for (let start = 0; start < sorted.length;) {
      let end = start + 1;
      while (end < sorted.length && sorted[start].effectiveScore === sorted[end].effectiveScore
        && sorted[start].lobbyVoterCount === sorted[end].lobbyVoterCount) end++;
      scores[team].push(...random.shuffle(sorted.slice(start, end)));
      start = end;
    }
  }
  const validScores = {
    A: scores.A.filter(score => score.effectiveScore > 0),
    B: scores.B.filter(score => score.effectiveScore > 0),
  };
  const maxA = validScores.A[0]?.effectiveScore ?? 0;
  const maxB = validScores.B[0]?.effectiveScore ?? 0;
  const firstTeam: DraftTeam | null = maxA === 0 && maxB === 0 ? null
    : maxA === maxB ? random.pick(['A', 'B'] as const) : maxA > maxB ? 'A' : 'B';
  const roleCounts: Record<DraftRole, number> = { TANK: 0, DPS: 0, SUPPORT: 0 };
  const bannedHeroIds: string[] = [];
  const slots: BanSlot[] = [];
  if (firstTeam) {
    const secondTeam: DraftTeam = firstTeam === 'A' ? 'B' : 'A';
    const processingTeams: DraftTeam[] = [firstTeam, secondTeam, secondTeam, firstTeam];
    for (const team of processingTeams) {
      const skipped: BanSlot['skipped'][number][] = [];
      let heroId: string | null = null;
      for (const score of validScores[team]) {
        if (bannedHeroIds.includes(score.heroId)) {
          skipped.push({ heroId: score.heroId, reason: 'ALREADY_BANNED' });
        } else if (roleCounts[score.role] >= DRAFT_LIMITS.maxRoleBans) {
          skipped.push({ heroId: score.heroId, reason: 'ROLE_LIMIT' });
        } else {
          heroId = score.heroId;
          bannedHeroIds.push(heroId);
          roleCounts[score.role]++;
          break;
        }
      }
      slots.push({ team, heroId, skipped });
    }
  }
  return {
    resolutionId: input.resolutionId, catalogVersion: input.catalog.approval.version,
    firstTeam, scores, slots, bannedHeroIds, roleCounts, draws: random.draws,
  };
}

export function validateRetainedBans(catalog: DraftCatalog<DraftHero>, heroIds: readonly string[]): void {
  validateHeroCatalog(catalog);
  requireDraft(heroIds.length <= DRAFT_LIMITS.maxBans && new Set(heroIds).size === heroIds.length,
    'INVALID_RETAINED_BANS', '유지할 밴은 중복 없이 최대 4개여야 합니다.');
  const counts: Record<DraftRole, number> = { TANK: 0, DPS: 0, SUPPORT: 0 };
  for (const id of heroIds) {
    const hero = catalog.entries.find(entry => entry.heroId === id && entry.active);
    requireDraft(hero, 'INVALID_RETAINED_BANS', '비활성 또는 알 수 없는 영웅은 밴을 유지할 수 없습니다.');
    requireDraft(++counts[hero.role] <= DRAFT_LIMITS.maxRoleBans,
      'INVALID_RETAINED_BANS', '같은 역할군의 밴은 최대 2개입니다.');
  }
}
