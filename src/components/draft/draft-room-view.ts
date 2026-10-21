import { DRAFT_LIMITS, type DraftRoomSnapshot } from '#domain/draft';

export const DRAFT_PHASE_LABELS: Record<DraftRoomSnapshot['phase'], string> = {
  LOBBY: '팀 확인·준비', MAP_VOTING: '맵 투표', MAP_PICKING: '팟지 맵 선택', MAP_RESOLVED: '선택 맵 확인',
  HERO_VOTING: '영웅 밴 투표', HERO_RESOLVED: '맵·밴 결과', COMPLETED: '게임 설정 적용 완료',
};

export function getDraftStep(snapshot: DraftRoomSnapshot): number {
  if (snapshot.phase === 'LOBBY') return 0;
  if (['MAP_VOTING', 'MAP_PICKING', 'MAP_RESOLVED'].includes(snapshot.phase)) return 1;
  if (snapshot.phase === 'HERO_VOTING') return 2;
  return 3;
}

/** @description 현재 권한·단계에 맞는 다음 행동을 안내하고 실제 경기 상태를 별도로 반영한다. */
export function getDraftGuidance(snapshot: DraftRoomSnapshot): string {
  if (snapshot.timer.status === 'PAUSED') return '운영자가 진행을 일시정지했습니다.';
  if (snapshot.timer.status === 'RECOVERY_PAUSED') return '서버 연결이 복구되었습니다. 운영자가 재개하면 이어집니다.';
  if (snapshot.timer.status === 'ROSTER_CHANGED') return '팀이 변경되었습니다. 운영자가 최신 팀으로 준비를 다시 시작해야 합니다.';
  if (['EXPIRED', 'CANCELLED'].includes(snapshot.timer.status)) return '진행이 종료되었습니다. 운영자에게 공유 링크를 확인해 주세요.';
  if (snapshot.playStatus === 'PLAYING') return '경기 진행 중 · 종료 후 운영자가 다음 경기를 준비합니다.';
  if (['FINISHED', 'ABORTED_PLAYED', 'NOT_PLAYED'].includes(snapshot.playStatus)) return '경기 기록 완료 · 운영자가 다음 경기를 준비합니다.';
  const self = snapshot.participants.some(player => player.discordId === snapshot.selfDiscordId);
  if (snapshot.phase === 'LOBBY') return !self ? '참가자 10명의 접속과 준비를 확인한 뒤 밴픽을 시작하세요.'
    : snapshot.selfReady ? '준비 완료 · 다른 참가자를 기다리는 중' : '내 팀과 역할을 확인하고 준비 완료를 눌러 주세요.';
  if (snapshot.phase === 'MAP_PICKING') {
    const picker = snapshot.participants.find(player => player.discordId === snapshot.mapSelection.pickerDiscordId);
    return snapshot.selfDiscordId === picker?.discordId ? '플레이할 맵을 고른 뒤 확정해 주세요.' : `${picker?.displayName ?? '지정 선수'}님의 맵 선택을 기다리는 중`;
  }
  if (snapshot.phase === 'MAP_RESOLVED') return '확정 맵을 3초간 확인한 뒤 밴 투표로 이동합니다.';
  if (snapshot.ballots?.self?.locked) return snapshot.stageKind === 'BAN' ? '준비 완료 · 마감 전까지 픽을 수정할 수 있습니다.' : '선택 확정 완료 · 다른 참가자를 기다리는 중';
  if (snapshot.stageKind && !snapshot.ballots?.self) return '참가자들이 선택하고 있습니다. 참가 현황에서 확정 상태를 확인하세요.';
  if (snapshot.phase === 'MAP_VOTING') return '플레이할 맵을 선택하고 선택 확정을 눌러 주세요.';
  if (snapshot.phase === 'HERO_VOTING') return '밴할 영웅을 선택하세요. 3개 선택 시 자동 준비됩니다.';
  if (snapshot.phase === 'HERO_RESOLVED') return snapshot.isOperator ? '맵과 밴 결과를 확인하고 게임 로비에 적용해 주세요.' : '맵과 밴 결과 확정 · 운영자의 게임 설정 적용을 기다리는 중';
  return snapshot.isOperator ? '게임 설정 적용 완료 · 실제 경기 시작을 기록해 주세요.' : '게임 설정 적용 완료 · 실제 경기 시작을 기다리는 중';
}

export interface DraftPrimaryAction { type: string; label: string; requiresActive: boolean }
export function getDraftPrimaryAction(snapshot: DraftRoomSnapshot): DraftPrimaryAction | null {
  if (['EXPIRED', 'CANCELLED', 'ROSTER_CHANGED'].includes(snapshot.timer.status)) return null;
  if (['FINISHED', 'ABORTED_PLAYED', 'NOT_PLAYED'].includes(snapshot.playStatus)) return { type: 'game.next', label: '다음 경기', requiresActive: false };
  if (snapshot.playStatus === 'PLAYING') return { type: 'game.markFinished', label: '경기 종료', requiresActive: false };
  if (snapshot.timer.status === 'PAUSED' || snapshot.timer.status === 'RECOVERY_PAUSED') return { type: 'draft.resume', label: '밴픽 재개', requiresActive: false };
  if (snapshot.phase === 'LOBBY') return { type: 'draft.start', label: '밴픽 시작', requiresActive: true };
  if (snapshot.phase === 'HERO_RESOLVED') return { type: 'game.confirmApplied', label: '게임 설정 적용 확인', requiresActive: true };
  if (snapshot.phase === 'COMPLETED') return { type: 'game.markStarted', label: '실제 경기 시작', requiresActive: true };
  return null;
}

/** @description 우리 팀의 저장된 표만 합산하며 본인 표를 중복 계산하지 않는다. */
export function getDraftTeamScores(snapshot: DraftRoomSnapshot) {
  const team = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId)?.team;
  const members = new Set(snapshot.participants.filter(player => player.team === team).map(player => player.discordId));
  const ballots = new Map(snapshot.ballots?.teammates.map(ballot => [ballot.discordId, ballot]));
  if (snapshot.ballots?.self) ballots.set(snapshot.selfDiscordId, snapshot.ballots.self);
  const points = new Map<string, number>();
  for (const ballot of ballots.values()) {
    if (!members.has(ballot.discordId)) continue;
    ballot.selection.forEach((id, rank) => {
      if (id && rank < DRAFT_LIMITS.rankPoints.length) points.set(id, (points.get(id) ?? 0) + DRAFT_LIMITS.rankPoints[rank]);
    });
  }
  return snapshot.heroes.filter(hero => hero.active && points.has(hero.heroId))
    .map(hero => ({ hero, points: points.get(hero.heroId)! }))
    .sort((left, right) => right.points - left.points || left.hero.heroId.localeCompare(right.hero.heroId)).slice(0, 3);
}


/** @description 해제한 순위는 빈 칸으로 남기고 뒤의 영웅 순위를 유지한다. */
export function clearDraftBanRank(selection: readonly string[], rank: number): string[] {
  const next = selection.map((id, index) => index === rank ? '' : id);
  while (next.length && !next[next.length - 1]) next.pop();
  return next;
}
