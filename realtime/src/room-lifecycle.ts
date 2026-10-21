import type { DraftRoomRecord } from './model.js';

/** @description 기존 방은 저장된 조작·투표 기록으로 보완하며 접속과 조회는 활동에 포함하지 않는다. */
export function getLastDraftActivityAt(room: DraftRoomRecord): number {
  if (typeof room.lastActivityAt === 'number') return room.lastActivityAt;
  return Math.max(room.createdAt, ...room.audit.map(entry => entry.at),
    ...(room.stage?.receipts.map(receipt => receipt.acceptedAt) ?? []));
}
