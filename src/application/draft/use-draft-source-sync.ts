import { useEffect, useRef, useState } from 'react';
import { createMatchLiveParticipants, type MatchResultData } from '#domain/balance';
import type { Player } from '#domain/player';
import { fetchMatchLiveSession, updateMatchLiveSession } from '../../utils/match-live-share';

/** @description 공동 편집에 참여하지 않고 밴픽 전용 원본의 최신 순번에 대진표 변경을 저장한다. */
export async function publishDraftSource(sourceId: string, players: Player[], result: MatchResultData | null, csrfToken: string) {
  const source = await fetchMatchLiveSession(sourceId);
  const participants = createMatchLiveParticipants(players, result);
  if (!participants) throw new Error('밴픽 명단의 Discord 연결을 확인해 주세요.');
  if (JSON.stringify(source.participants) === JSON.stringify(participants)) return;
  await updateMatchLiveSession(sourceId, source.revision, players, result, csrfToken);
}

/** @description 복원 시 기존 편성을 덮지 않고, 이 화면에서 편성이 바뀔 때만 전용 원본에 순차 반영한다. */
export function useDraftSourceSync({ sourceId, players, result, csrfToken }: {
  sourceId?: string; players: Player[]; result: MatchResultData | null; csrfToken: string;
}) {
  const baseline = useRef<{ sourceId: string; fingerprint: string } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const fingerprint = JSON.stringify(createMatchLiveParticipants(players, result));
  useEffect(() => {
    if (!sourceId) { baseline.current = null; return; }
    if (baseline.current?.sourceId !== sourceId) {
      baseline.current = { sourceId, fingerprint };
      queueMicrotask(() => { setPending(false); setError(''); }); return;
    }
    if (baseline.current.fingerprint === fingerprint) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    queueMicrotask(() => { if (!cancelled) setPending(true); });
    const publish = () => {
      queue.current = queue.current.catch(() => undefined).then(async () => {
        if (cancelled) return;
        try {
          await publishDraftSource(sourceId, players, result, csrfToken);
          if (!cancelled) {
            baseline.current = { sourceId, fingerprint }; setPending(false); setError('');
          }
        } catch (failure) {
          if (!cancelled) {
            setError(failure instanceof Error ? failure.message : '밴픽 명단을 갱신하지 못했습니다.');
            timer = setTimeout(publish, 3000);
          }
        }
      });
    };
    timer = setTimeout(publish, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sourceId, fingerprint, players, result, csrfToken]);
  return { pending: Boolean(sourceId) && pending, error: sourceId ? error : '' };
}
