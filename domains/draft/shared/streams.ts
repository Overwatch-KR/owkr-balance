export interface DraftStreamCursor {
  streamId: string;
  streamSeq: number;
}

export interface DraftStreamEnvelope<T> extends DraftStreamCursor {
  epoch: number;
  roomRevision: number;
  payload: T;
}

/** @description 권한 필터링 후 허용된 메시지에만 수신자 순번을 부여한다. */
export function emitDraftStreamEvent<T>(
  cursor: DraftStreamCursor,
  event: { epoch: number; roomRevision: number; payload: T } | null,
): { cursor: DraftStreamCursor; envelope: DraftStreamEnvelope<T> | null } {
  if (event === null) return { cursor, envelope: null };
  const next = { streamId: cursor.streamId, streamSeq: cursor.streamSeq + 1 };
  return { cursor: next, envelope: { ...next, ...event } };
}

export function inspectDraftStreamEvent(
  cursor: DraftStreamCursor,
  envelope: DraftStreamEnvelope<unknown>,
): 'APPLY' | 'IGNORE' | 'RESYNC' {
  if (envelope.streamId !== cursor.streamId || envelope.streamSeq <= cursor.streamSeq) return 'IGNORE';
  return envelope.streamSeq === cursor.streamSeq + 1 ? 'APPLY' : 'RESYNC';
}
