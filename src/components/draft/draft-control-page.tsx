import type { DraftRoomController } from '@application/draft/use-draft-room';
import { PageHeader } from '../layout/page-header';
import { DraftRoomPanel } from './draft-room-panel';

export function DraftControlPage({ controller, onMatching }: { controller: DraftRoomController; onMatching: () => void }) {
  return <section>
    <PageHeader title="밴픽 운영" actions={controller.snapshot?.isOperator && <button type="button" className="btn-ghost text-xs" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/draft/${controller.snapshot!.roomCode}`).catch(() => undefined)}>공유 링크 복사</button>} description="기존 대진표의 팀으로 맵과 영웅 밴을 준비합니다. 선수로 배정된 운영자도 같은 화면에서 본인 표를 확정합니다." />
    {controller.snapshot || controller.error ? <DraftRoomPanel controller={controller} /> : <div className="border-y border-slate-800 py-10 text-sm text-slate-400">
      <p>연결된 실시간 내전 방이 없습니다. 대진표에서 팀을 편성한 뒤 방을 만들어 주세요.</p>
      <button type="button" className="mt-4 min-h-10 rounded-md border border-slate-600 px-4 text-slate-200" onClick={onMatching}>대진표에서 준비</button>
    </div>}
  </section>;
}

export function DraftOperationBar({ controller, roomCode, onOpen }: { controller: DraftRoomController; roomCode: string; onOpen: () => void }) {
  const snapshot = controller.snapshot;
  const problems = snapshot?.progress?.filter(player => player.connectionStatus !== 'CONNECTED' || !player.inputConnected
    || (snapshot.phase === 'LOBBY' && !player.ready)).map(player => player.displayName);
  return <aside className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-cyan-900 bg-cyan-950/20 px-3 py-3 text-xs" aria-label="실시간 밴픽 운영 상태">
    <div><p className="font-semibold text-cyan-200">실시간 밴픽 · {controller.connected ? `${snapshot?.gameIndex ?? 1}경기` : '연결 확인 중 · 제어 잠금'}</p>
      <p className="mt-1 text-slate-400">{controller.connected ? problems?.length ? `확인 필요: ${problems.join(', ')}` : '참가자 상태 확인됨' : '참가자 접속 상태를 다시 확인하고 있습니다.'}</p></div>
    <div className="flex gap-2">
      <button type="button" className="min-h-9 rounded border border-slate-700 px-3" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/draft/${roomCode}`).catch(() => undefined)}>방 링크 복사</button>
      {snapshot?.isOperator && <button type="button" disabled={!controller.connected || controller.pending} className="min-h-9 rounded border border-slate-700 px-3 disabled:opacity-40" onClick={() => {
        const reason = window.prompt('정지 사유를 입력해 주세요.');
        if (reason?.trim()) void controller.command('draft.pause', { reason }).catch(() => undefined);
      }}>일시정지</button>}
      <button type="button" className="min-h-9 rounded border border-cyan-700 px-3 text-cyan-200" onClick={onOpen}>밴픽 운영·참가자 현황</button>
    </div>
  </aside>;
}
