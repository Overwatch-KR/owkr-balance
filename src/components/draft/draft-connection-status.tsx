import type { DraftRoomController } from '@application/draft/use-draft-room';

/** @description 연결 안내를 우선 표시해 오래된 저장 알림이 입력 잠금 상태를 가리지 않게 한다. */
export function DraftConnectionStatus({ controller, notice = '' }: { controller: DraftRoomController; notice?: string }) {
  if (controller.connectionReplaced) return <section className="draft-connection-notice" role="status" aria-label="연결 상태">
    <div><p className="font-semibold">다른 창에서 진행 중</p><p>다른 창에서 계속 진행하거나, 이 창으로 연결을 가져올 수 있습니다. 자동 재접속은 중지되었습니다.</p></div>
    <button type="button" className="btn-ghost text-xs" onClick={controller.reconnect}>이 창에서 다시 연결</button>
  </section>;
  if (!controller.connected) return <section className="draft-connection-notice" role="status" aria-label="연결 상태">
    <div><p className="font-semibold">{controller.reconnecting ? '다시 연결 중' : '연결 끊김'} · 입력 잠김</p>
      <p>{controller.error || '최신 상태를 확인한 뒤 입력을 다시 사용할 수 있습니다.'}</p></div>
    <button type="button" className="btn-ghost text-xs" onClick={controller.reconnect}>다시 연결</button>
  </section>;
  const message = controller.error || notice;
  return message ? <p className="draft-connection-notice" role="status">{message}</p> : null;
}
