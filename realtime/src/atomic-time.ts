import type { RoomBundle } from './model.js';
import { DRAFT_LIMITS } from '../../domains/draft/shared/public.js';

/** @description 새 기록의 예약값만 저장소 원자 실행 시각으로 치환한다. */
export function stampAtomicTimes(bundle: RoomBundle, now: number): void {
  if (bundle.room.phase === 'MAP_RESOLVED' && bundle.room.timer.deadlineAt === -1) {
    bundle.room.timer.deadlineAt = now + DRAFT_LIMITS.mapRevealMs;
  }
  const stamp = <T>(value: T): T => JSON.parse(JSON.stringify(value)
    .replaceAll('"acceptedAt":-1', `"acceptedAt":${now}`)
    .replaceAll('"sealedAt":-1', `"sealedAt":${now}`)
    .replaceAll('"startedAt":-1', `"startedAt":${now}`)
    .replaceAll('"finishedAt":-1', `"finishedAt":${now}`)
    .replaceAll('"appliedAt":-1', `"appliedAt":${now}`)) as T;
  bundle.room = stamp(bundle.room); bundle.history = stamp(bundle.history); bundle.now = now;
}
