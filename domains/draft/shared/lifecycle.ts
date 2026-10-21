import { requireDraft, type DraftPhase } from './model.js';

export interface DraftTimer {
  phase: DraftPhase;
  status: 'ACTIVE' | 'PAUSED' | 'RECOVERY_PAUSED' | 'ROSTER_CHANGED' | 'CANCELLED' | 'EXPIRED';
  deadlineAt: number | null;
  remainingMs: number | null;
  expiresAt: number;
  epoch: number;
}

export interface DraftTimings {
  mapVotingSeconds: number;
  heroVotingSeconds: number;
}

export const DEFAULT_DRAFT_TIMINGS: Readonly<DraftTimings> = {
  mapVotingSeconds: 20, heroVotingSeconds: 30,
};

export function validateDraftTimings(timings: DraftTimings): void {
  requireDraft(Number.isInteger(timings.mapVotingSeconds) && timings.mapVotingSeconds >= 10 && timings.mapVotingSeconds <= 60
    && Number.isInteger(timings.heroVotingSeconds) && timings.heroVotingSeconds >= 10 && timings.heroVotingSeconds <= 90,
  'INVALID_TIMINGS', '맵 10~60초·밴 10~90초 범위를 확인해 주세요.');
}

export function pauseDraftTimer(timer: DraftTimer, now: number, recovery = false): DraftTimer {
  if (now >= timer.expiresAt) return { ...timer, status: 'EXPIRED', deadlineAt: null };
  if (timer.status === 'CANCELLED' || timer.status === 'EXPIRED' || timer.status === 'ROSTER_CHANGED') return timer;
  return {
    ...timer,
    status: recovery ? 'RECOVERY_PAUSED' : 'PAUSED',
    remainingMs: timer.deadlineAt === null ? timer.remainingMs : Math.max(0, timer.deadlineAt - now),
    deadlineAt: null,
  };
}

export function resumeDraftTimer(timer: DraftTimer, now: number): DraftTimer {
  requireDraft(now < timer.expiresAt, 'ROOM_EXPIRED', '방이 만료되어 재개할 수 없습니다.');
  requireDraft(timer.status === 'PAUSED' || timer.status === 'RECOVERY_PAUSED',
    'INVALID_RESUME', '일시정지 또는 복구 대기 중인 단계만 재개할 수 있습니다.');
  return {
    ...timer, status: 'ACTIVE', remainingMs: null,
    deadlineAt: timer.remainingMs === null ? null : now + Math.max(5000, timer.remainingMs),
  };
}
