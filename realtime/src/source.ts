import { createHash } from 'node:crypto';
import { requireDraft, validateDraftRoster, type DraftParticipant, type DraftSource } from '../../domains/draft/shared/public.js';

export const SOURCE_POSITIONS = [
  'A:TANK:0', 'A:DPS:0', 'A:DPS:1', 'A:SUPPORT:0', 'A:SUPPORT:1',
  'B:TANK:0', 'B:DPS:0', 'B:DPS:1', 'B:SUPPORT:0', 'B:SUPPORT:1',
] as const;

export interface SourceIdentity {
  id: string;
  discordUserId?: string;
  battleTag: string;
}

export function parseDraftSource(sourceId: string, raw: string | null, identities: readonly SourceIdentity[]): DraftSource | null {
  if (!raw) return null;
  const source = JSON.parse(raw) as {
    expiresAt: number; revision: number; participants: { discordUserId: string; position: string | null }[];
  };
  requireDraft(Number.isSafeInteger(source.revision) && source.revision >= 0
    && Number.isSafeInteger(source.expiresAt) && Array.isArray(source.participants),
  'INVALID_SOURCE_ROSTER', '원본 명단 정보를 확인해 주세요.');
  const participants: DraftParticipant[] = [];
  const assigned = source.participants.filter(player => player.position !== null);
  if (assigned.length === 0) {
    const ids = source.participants.map(player => player.discordUserId);
    requireDraft(ids.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id))
      && new Set(ids).size === ids.length, 'INVALID_SOURCE_ROSTER', '대기 명단의 디스코드 계정을 확인해 주세요.');
    const pendingRosterDiscordIds = ids.slice(0, 10);
    return { sourceId, revision: source.revision, expiresAt: source.expiresAt, participants: [], pendingRosterDiscordIds,
      rosterHash: createHash('sha256').update(JSON.stringify(pendingRosterDiscordIds)).digest('hex') };
  }
  requireDraft(assigned.length === 10, 'INVALID_SOURCE_ROSTER', '원본의 10인 배정을 확인해 주세요.');
  for (const position of SOURCE_POSITIONS) {
    const matches = assigned.filter(player => player.position === position);
    requireDraft(matches.length === 1, 'INVALID_SOURCE_ROSTER', '원본의 10인 배정을 확인해 주세요.');
    const player = matches[0];
    const identitiesForPlayer = identities.filter(identity => identity.discordUserId === player.discordUserId);
    requireDraft(identitiesForPlayer.length === 1, 'SOURCE_IDENTITY_REQUIRED', '유저 시트의 디스코드 ID 연결을 확인해 주세요.');
    const identity = identitiesForPlayer[0];
    const [team, role] = position.split(':');
    participants.push({
      userSheetId: identity.id, discordId: player.discordUserId, displayName: identity.battleTag,
      team: team as DraftParticipant['team'], role: role as DraftParticipant['role'],
      slot: SOURCE_POSITIONS.indexOf(position) % 5,
    });
  }
  requireDraft(assigned.length === 10, 'INVALID_SOURCE_ROSTER', '배정된 슬롯은 정확히 10개여야 합니다.');
  validateDraftRoster(participants);
  return {
    sourceId, revision: source.revision, expiresAt: source.expiresAt, participants,
    rosterHash: createHash('sha256').update(JSON.stringify(participants.map(player => [
      player.userSheetId, player.discordId, player.team, player.role, player.slot,
    ]))).digest('hex'),
  };
}
