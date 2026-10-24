import { useEffect, useState } from 'react';
import type { DraftRoomSnapshot } from '#domain/draft';

/** @description 서버 시각을 기준으로 남은 시간을 표시하고 일시정지·연결 해제 시 진행을 멈춘다. */
export function useDraftRemainingTime(snapshot: DraftRoomSnapshot, connected: boolean): number | null {
  const [sample, setSample] = useState({ serverNow: snapshot.serverNow, elapsed: 0 });
  useEffect(() => {
    if (!connected || snapshot.timer.status !== 'ACTIVE') return;
    const started = performance.now();
    const interval = setInterval(() => setSample({ serverNow: snapshot.serverNow, elapsed: performance.now() - started }), 100);
    return () => clearInterval(interval);
  }, [snapshot.serverNow, snapshot.timer.status, connected]);
  if (!connected) return null;
  if (snapshot.timer.status !== 'ACTIVE') return snapshot.timer.remainingMs;
  if (snapshot.timer.deadlineAt === null) return null;
  return Math.max(0, snapshot.timer.deadlineAt - snapshot.serverNow - (sample.serverNow === snapshot.serverNow ? sample.elapsed : 0));
}
