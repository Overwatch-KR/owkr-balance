import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inspectDraftStreamEvent, type DraftRoomSnapshot, type DraftStreamCursor, type DraftStreamEnvelope } from '#domain/draft';

export const REALTIME_DRAFT_ENABLED = import.meta.env.VITE_ENABLE_REALTIME_DRAFT === 'true';

interface ParticipantExchangeResponse { roomCode: string; ticket?: string; expiresAt?: number; realtimeUrl?: string }
interface EntryResponse { ticket: string; expiresAt: number; realtimeUrl: string }
interface PendingCommand { resolve: () => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }

export async function draftRequest<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
  const result = await response.json() as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(result.error ?? result.message ?? '요청을 완료하지 못했습니다.');
  return result;
}

let exchangePromise: Promise<ParticipantExchangeResponse> | null = null;

export async function participantEntry(roomCode: string): Promise<EntryResponse> {
  if (import.meta.env.DEV && import.meta.env.VITE_DRAFT_LOCAL_URL && import.meta.env.VITE_DRAFT_LOCAL_USER_ID
    && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const base = new URL(String(import.meta.env.VITE_DRAFT_LOCAL_URL));
    if (base.origin !== 'http://127.0.0.1:8787') throw new Error('로컬 시험 서버 주소를 확인해 주세요.');
    const local = await draftRequest<{ ticket: string }>(`${base.origin}/__local__/ticket`,
      { discordId: String(import.meta.env.VITE_DRAFT_LOCAL_USER_ID), roomCode });
    const entry = await draftRequest<Omit<EntryResponse, 'realtimeUrl'>>(`${base.origin}/v1/entry`, {}, { Authorization: `Bearer ${local.ticket}` });
    return { ...entry, realtimeUrl: base.origin };
  }
  const currentUrl = new URL(window.location.href);
  const code = currentUrl.searchParams.get('draft_code');
  if (code) {
    currentUrl.searchParams.delete('draft_code');
    window.history.replaceState({}, '', currentUrl);
    exchangePromise = draftRequest<ParticipantExchangeResponse>('/api/draft-participant', { action: 'exchange', code });
  }
  const exchanging = exchangePromise;
  if (exchanging) {
    try {
      const entry = await exchanging;
      if (entry.roomCode === roomCode && typeof entry.ticket === 'string' && entry.ticket
        && typeof entry.expiresAt === 'number' && entry.expiresAt > Date.now() && typeof entry.realtimeUrl === 'string') {
        return { ticket: entry.ticket, expiresAt: entry.expiresAt, realtimeUrl: entry.realtimeUrl };
      }
    } finally { if (exchangePromise === exchanging) exchangePromise = null; }
  }
  return draftRequest('/api/draft-participant', { action: 'refresh', roomCode });
}

export async function adminDraftEntry(csrfToken: string, scope: 'create' | 'join', roomCode?: string): Promise<EntryResponse> {
  const bridge = await draftRequest<EntryResponse>('/api/draft-bridge', { scope, roomCode }, { 'X-CSRF-Token': csrfToken });
  if (scope === 'create') return bridge;
  const result = await draftRequest<Omit<EntryResponse, 'realtimeUrl'>>(`${bridge.realtimeUrl}/v1/entry`, {}, { Authorization: `Bearer ${bridge.ticket}` });
  return { ...result, realtimeUrl: bridge.realtimeUrl };
}

export interface DraftRoomController {
  snapshot: DraftRoomSnapshot | null;
  connected: boolean;
  pending: boolean;
  error: string;
  reconnect: () => void;
  command: (type: string, values?: Record<string, unknown>) => Promise<void>;
}

/** @description 메뉴 콘텐츠보다 상위에서 연결을 유지하고 수신자 순번으로 상태를 복구한다. */
export function useDraftRoom(options: {
  roomCode: string | null;
  mode: 'admin' | 'participant';
  userId?: string;
  csrfToken?: string;
}): DraftRoomController {
  const { roomCode, mode, userId = '', csrfToken = '' } = options;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['draft-room', mode, userId, roomCode], [mode, userId, roomCode]);
  const query = useQuery<DraftRoomSnapshot | null>({ queryKey, enabled: false, queryFn: async () => null, initialData: null });
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<DraftRoomSnapshot | null>(null);
  const ballotRevisionRef = useRef(0);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!roomCode) return;
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let renewalTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let cursor: DraftStreamCursor | null = null;
    let awaitingSnapshot = true;
    const entry = () => mode === 'admin' ? adminDraftEntry(csrfToken, 'join', roomCode) : participantEntry(roomCode);
    const failPending = (message: string) => {
      for (const command of pendingRef.current.values()) { clearTimeout(command.timeout); command.reject(new Error(message)); }
      pendingRef.current.clear(); setPending(false);
    };
    const renew = async (socket: WebSocket) => {
      try {
        const response = await entry();
        if (disposed || socket !== socketRef.current || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type: 'auth.renew', ticket: response.ticket }));
        renewalTimer = setTimeout(() => void renew(socket), Math.max(1000, response.expiresAt - Date.now() - 30_000));
      } catch (failure) { if (!disposed) { setError(failure instanceof Error ? failure.message : '인증 갱신에 실패했습니다.'); socket.close(); } }
    };
    const connect = async () => {
      try {
        const response = await entry();
        if (disposed) return;
        const endpoint = new URL('/v1/socket', response.realtimeUrl);
        endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(endpoint);
        socketRef.current = socket;
        cursor = null; awaitingSnapshot = true;
        socket.onopen = () => {
          if (!disposed) socket.send(JSON.stringify({ type: 'auth', ticket: response.ticket }));
          renewalTimer = setTimeout(() => void renew(socket), Math.max(1000, response.expiresAt - Date.now() - 30_000));
        };
        socket.onmessage = event => {
          if (disposed || socket !== socketRef.current) return;
          try {
            const message = JSON.parse(String(event.data)) as Record<string, unknown>;
            if (message.type === 'room.snapshot' || message.type === 'room.updated') {
              const envelope = message as unknown as DraftStreamEnvelope<DraftRoomSnapshot>;
              if (message.type === 'room.snapshot') {
                if (!awaitingSnapshot || envelope.streamSeq !== 1) return;
                cursor = { streamId: envelope.streamId, streamSeq: 0 }; awaitingSnapshot = false;
              }
              if (!cursor) return;
              const decision = inspectDraftStreamEvent(cursor, envelope);
              if (decision === 'IGNORE') return;
              if (decision === 'RESYNC') { awaitingSnapshot = true; setConnected(false); socket.send(JSON.stringify({ type: 'snapshot.request' })); return; }
              cursor = { streamId: envelope.streamId, streamSeq: envelope.streamSeq };
              const previous = snapshotRef.current;
              snapshotRef.current = envelope.payload;
              if (previous?.epoch !== envelope.payload.epoch || previous?.stageKind !== envelope.payload.stageKind) ballotRevisionRef.current = 0;
              ballotRevisionRef.current = Math.max(ballotRevisionRef.current, envelope.payload.ballots?.self?.ballotRevision ?? 0);
              queryClient.setQueryData(queryKey, envelope.payload);
              setConnected(true); failures = 0; return;
            }
            if (message.type === 'command.ack') {
              const id = String(message.commandId);
              const command = pendingRef.current.get(id);
              if (typeof message.ballotRevision === 'number') ballotRevisionRef.current = Math.max(ballotRevisionRef.current, message.ballotRevision);
              if (command) { clearTimeout(command.timeout); pendingRef.current.delete(id); command.resolve(); }
              setPending(pendingRef.current.size > 0); setError(''); return;
            }
            if (message.type === 'command.rejected') {
              const reason = typeof message.message === 'string' ? message.message : '선택을 저장하지 못했습니다.';
              setError(reason);
              const command = pendingRef.current.get(String(message.commandId));
              if (command) { clearTimeout(command.timeout); pendingRef.current.delete(String(message.commandId)); command.reject(new Error(reason)); }
              else failPending(reason);
              setPending(pendingRef.current.size > 0);
              if (message.code === 'CONFLICT' || message.code === 'BALLOT_CONFLICT') {
                awaitingSnapshot = true; setConnected(false); socket.send(JSON.stringify({ type: 'snapshot.request' }));
              }
            }
            if (message.type === 'storage.unavailable') { setConnected(false); setError('저장소 복구 중입니다. 입력은 저장되지 않습니다.'); failPending('저장소 복구 중입니다.'); }
          } catch { setError('연결 상태를 확인하지 못했습니다. 다시 연결해 주세요.'); socket.close(); }
        };
        socket.onclose = () => {
          clearTimeout(renewalTimer);
          if (disposed) return;
          setConnected(false); failPending('연결이 끊겨 저장 여부를 다시 확인해야 합니다.');
          reconnectTimer = setTimeout(() => void connect(), Math.min(15_000, 1000 * 2 ** failures++) + Math.random() * 300);
        };
        socket.onerror = () => socket.close();
      } catch (failure) {
        if (disposed) return;
        setConnected(false); setError(failure instanceof Error ? failure.message : '참가 인증이 필요합니다.');
      }
    };
    void connect();
    return () => {
      disposed = true; clearTimeout(reconnectTimer); clearTimeout(renewalTimer);
      socketRef.current?.close(); socketRef.current = null;
      failPending('연결이 종료되었습니다.');
      queryClient.removeQueries({ queryKey, exact: true }); snapshotRef.current = null;
    };
  }, [roomCode, mode, userId, csrfToken, queryClient, queryKey, attempt]);

  const command = useCallback(async (type: string, values: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    const snapshot = snapshotRef.current;
    if (!connected || !socket || socket.readyState !== WebSocket.OPEN || !snapshot) throw new Error('최신 상태로 연결한 뒤 입력해 주세요.');
    const commandId = crypto.randomUUID();
    setPending(true);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRef.current.delete(commandId); setPending(pendingRef.current.size > 0);
        reject(new Error('저장 승인을 확인하지 못했습니다. 상태를 새로 확인해 주세요.'));
      }, 12_000);
      pendingRef.current.set(commandId, { resolve, reject, timeout });
      socket.send(JSON.stringify({ type, commandId, epoch: snapshot.epoch, expectedRevision: snapshot.roomRevision,
        expectedBallotRevision: ballotRevisionRef.current, ...values }));
    });
  }, [connected]);
  return { snapshot: query.data ?? null, connected, pending, error, reconnect: () => setAttempt(value => value + 1), command };
}
