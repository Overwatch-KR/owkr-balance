import { DRAFT_LIMITS, requireDraft, type DraftParticipant, type DraftSource } from './model.js';

export function validateDraftRoster(participants: readonly DraftParticipant[]): void {
  requireDraft(participants.length === 10, 'ROSTER_SIZE', '배정된 참가자 10명이 필요합니다.');
  requireDraft(participants.every(player => /^\d{17,20}$/.test(player.discordId)),
    'DISCORD_ID_REQUIRED', '모든 참가자의 Discord ID를 확인해 주세요.');
  requireDraft(new Set(participants.map(player => player.discordId)).size === 10,
    'DUPLICATE_DISCORD_ID', '같은 Discord 계정을 중복 배정할 수 없습니다.');
  requireDraft(participants.every(player => player.userSheetId.trim() && player.displayName.trim()),
    'PLAYER_ID_REQUIRED', '유저 시트 식별자와 표시 이름이 필요합니다.');
  requireDraft(new Set(participants.map(player => player.userSheetId)).size === 10,
    'DUPLICATE_PLAYER_ID', '유저 시트 식별자가 중복되었습니다.');
  requireDraft(participants.every(player => player.team === 'A' || player.team === 'B'),
    'INVALID_TEAM', '팀 배정을 확인해 주세요.');
  for (const team of ['A', 'B'] as const) {
    const players = participants.filter(player => player.team === team);
    requireDraft(players.length === 5 && players.filter(p => p.role === 'TANK').length === 1
      && players.filter(p => p.role === 'DPS').length === 2
      && players.filter(p => p.role === 'SUPPORT').length === 2,
    'INVALID_ROLES', `${team}팀은 탱커 1명·공격 2명·지원 2명이 필요합니다.`);
    requireDraft(players.every(p => Number.isInteger(p.slot) && p.slot >= 0 && p.slot < 5)
      && new Set(players.map(p => p.slot)).size === 5,
    'INVALID_SLOTS', `${team}팀의 배정 슬롯을 확인해 주세요.`);
  }
}

export function getDraftRoomExpiry(now: number, sourceExpiresAt: number, sessionExpiresAt: number): number {
  requireDraft([now, sourceExpiresAt, sessionExpiresAt].every(Number.isSafeInteger),
    'INVALID_TIME', '유효기간을 확인해 주세요.');
  requireDraft(sourceExpiresAt - now >= DRAFT_LIMITS.minSourceRemainingMs,
    'SOURCE_EXPIRING', '원본 공동 작업이 10분 이내 만료됩니다. 새 원본을 만들어 주세요.');
  const expiresAt = Math.min(now + DRAFT_LIMITS.roomLifetimeMs, sourceExpiresAt, sessionExpiresAt);
  requireDraft(expiresAt > now, 'SESSION_EXPIRED', '내전 운영 묶음이 만료되었습니다.');
  return expiresAt;
}

/** @description 실제 저장소 원자 연산 안에서 읽은 원본을 시작 기대값과 대조한다. */
export function validateDraftSource(
  source: DraftSource | null,
  expected: Pick<DraftSource, 'sourceId' | 'revision' | 'rosterHash'>,
  now: number,
): asserts source is DraftSource {
  requireDraft(source && source.expiresAt > now, 'SOURCE_EXPIRED', '원본 공동 작업이 만료되었습니다.');
  requireDraft(source.sourceId === expected.sourceId && source.revision === expected.revision
    && source.rosterHash === expected.rosterHash,
  'SOURCE_OUTDATED', '최신 팀을 다시 확인해 주세요.');
  validateDraftRoster(source.participants);
}
