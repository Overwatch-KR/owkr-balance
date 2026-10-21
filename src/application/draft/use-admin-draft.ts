import { useCallback, useEffect, useRef, useState } from 'react';
import { adminDraftEntry, draftRequest, REALTIME_DRAFT_ENABLED, useDraftRoom } from './use-draft-room';

function readRememberedRoom(userId: string): string | null {
  try {
    const raw = localStorage.getItem(`owkr:draft:v1:${userId}`);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { code: string; expiresAt: number };
    return saved.expiresAt > Date.now() && /^[A-Z2-9]{10}$/.test(saved.code) ? saved.code : null;
  } catch { return null; }
}

/** @description 기존 로그인 문맥에서 방을 명시적으로 만들고 메뉴 전환과 독립적으로 연결을 유지한다. */
export function useAdminDraft({ userId, csrfToken }: { userId: string; csrfToken: string }) {
  const [roomCode, setRoomCode] = useState<string | null>(() => REALTIME_DRAFT_ENABLED ? readRememberedRoom(userId) : null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef<string | null>(null);
  const controller = useDraftRoom({ roomCode, mode: 'admin', userId, csrfToken });
  useEffect(() => {
    if (controller.roomClosed) {
      setRoomCode(null); requestId.current = null;
      try { localStorage.removeItem(`owkr:draft:v1:${userId}`); } catch { /* 종료 상태는 저장소와 무관하게 반영한다. */ }
      return;
    }
    if (!controller.snapshot) return;
    try { localStorage.setItem(`owkr:draft:v1:${userId}`, JSON.stringify({ code: controller.snapshot.roomCode, expiresAt: controller.snapshot.expiresAt })); }
    catch { /* 연결 복원용 코드 저장 실패는 현재 방을 종료하지 않는다. */ }
    const timer = setTimeout(() => {
      setRoomCode(null);
      try { localStorage.removeItem(`owkr:draft:v1:${userId}`); } catch { /* 저장소 접근이 거절되어도 만료한다. */ }
    }, Math.max(0, controller.snapshot.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [controller.snapshot, controller.roomClosed, userId]);
  const createRoom = useCallback(async (sourceId: string): Promise<void> => {
    if (!REALTIME_DRAFT_ENABLED) throw new Error('실시간 밴픽 기능이 아직 공개되지 않았습니다.');
    setCreating(true); setError('');
    requestId.current ??= crypto.randomUUID();
    try {
      const entry = await adminDraftEntry(csrfToken, 'create');
      const created = await draftRequest<{ roomCode: string }>(`${entry.realtimeUrl}/v1/rooms`,
        { sourceId, commandId: requestId.current }, { Authorization: `Bearer ${entry.ticket}` });
      setRoomCode(created.roomCode); requestId.current = null;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '방을 만들지 못했습니다.'); throw failure; }
    finally { setCreating(false); }
  }, [csrfToken]);
  return { controller, roomCode, creating, error, createRoom };
}
