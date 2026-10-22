import { useEffect, useState } from 'react';
import type { DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { PageHeader } from '../layout/page-header';
import { DRAFT_PHASE_LABELS, getDraftGuidance, getDraftStep } from './draft-room-view';

function DraftCountdown({ snapshot, connected }: { snapshot: DraftRoomSnapshot; connected: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!connected || snapshot.timer.status !== 'ACTIVE') return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(timer);
  }, [snapshot.serverNow, snapshot.timer.status, connected]);
  const paused = snapshot.timer.status !== 'ACTIVE';
  const ms = paused ? snapshot.timer.remainingMs : snapshot.timer.deadlineAt === null ? null : snapshot.timer.deadlineAt - snapshot.serverNow - elapsed;
  const remaining = connected && ms !== null ? Math.max(0, Math.ceil(ms / 1000)) : null;
  return <div className="draft-countdown" aria-label="남은 시간"><span className="text-[10px] text-slate-500">{paused ? '진행 정지' : '남은 시간'}</span>
    <span className={`font-mono text-2xl tabular-nums ${remaining !== null && remaining <= 5 && !paused ? 'text-amber-300' : 'text-cyan-300'}`}>{remaining === null ? '—' : `${remaining}초`}</span></div>;
}

export function DraftRoomHeader({ controller, admin, onOpenOperator }: { controller: DraftRoomController; admin: boolean; onOpenOperator: () => void }) {
  const [copyNotice, setCopyNotice] = useState('');
  const snapshot = controller.snapshot!;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/draft/${snapshot.roomCode}`);
      setCopyNotice('참가자 공유 링크를 복사했습니다.');
    } catch {
      setCopyNotice('링크를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.');
    }
  };
  const step = getDraftStep(snapshot);
  const title = snapshot.playStatus === 'PLAYING' ? '경기 진행 중' : snapshot.playStatus === 'FINISHED' ? '경기 종료'
    : snapshot.playStatus === 'ABORTED_PLAYED' ? '플레이 후 중단' : snapshot.playStatus === 'NOT_PLAYED' ? '경기 미진행' : DRAFT_PHASE_LABELS[snapshot.phase];
  const labels = ['준비', snapshot.mapSelection.mode === 'POTG' ? '팟지 맵 선택' : '맵 투표', '밴 투표', '결과'];
  return <header className="draft-room-header">
    <PageHeader eyebrow={`OWKR MATCH CONTROL · ${admin ? '밴픽 운영' : '실시간 내전 참여'}`}
      title={`${snapshot.gameIndex}경기 · ${title}`}
      actions={<>{snapshot.isOperator && <button type="button" className="btn-ghost border border-cyan-700 text-xs text-cyan-200" onClick={() => void copyLink()}>공유 링크 복사</button>}
        {snapshot.isOperator && <button type="button" className="btn-ghost text-xs" onClick={onOpenOperator}>참가 현황·운영</button>}
        <DraftCountdown key={`${snapshot.serverNow}:${snapshot.timer.status}:${controller.connected}`} snapshot={snapshot} connected={controller.connected} /></>} />
    {copyNotice && <p className="mb-2 text-xs text-slate-300" role="status">{copyNotice}</p>}
    <ol className="draft-steps" aria-label="밴픽 진행 단계">{labels.map((label, index) => <li key={index} aria-current={step === index ? 'step' : undefined}
      className={step === index ? 'draft-step-current' : step > index ? 'draft-step-done' : ''}><span>{index < step ? '✓' : index + 1}</span>{label}</li>)}</ol>
    <div className="draft-guidance"><p className="text-sm font-medium text-slate-200">{!controller.connected ? '연결 상태를 먼저 확인해 주세요.' : controller.pending ? '요청을 서버에서 확인하고 있습니다.' : getDraftGuidance(snapshot)}</p>
      <span className="text-xs text-slate-500">{snapshot.phase === 'MAP_RESOLVED' ? '맵 선정 중' : snapshot.mapResult?.map.nameKo ?? '맵 선택 전'}</span></div>
  </header>;
}
