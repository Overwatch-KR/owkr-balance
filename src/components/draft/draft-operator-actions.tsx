import { useState } from 'react';
import { getDraftStartBlockers } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { getDraftPrimaryAction } from './draft-room-view';

export function DraftOperatorActions({ controller, execute }: { controller: DraftRoomController; execute: (type: string, values?: Record<string, unknown>) => void }) {
  const snapshot = controller.snapshot!;
  const [remainingMapsConfirmed, setRemainingMapsConfirmed] = useState(false);
  const [diversityExceptionReason, setDiversityExceptionReason] = useState('');
  const action = getDraftPrimaryAction(snapshot);
  const progress = snapshot.progress ?? [];
  const blockers = getDraftStartBlockers(progress);
  const problems = [blockers.disconnected.length ? `미접속: ${blockers.disconnected.join(', ')}` : '',
    blockers.inputRequired.length ? `입력 연결 필요: ${blockers.inputRequired.join(', ')}` : '',
    blockers.notReady.length ? `미준비: ${blockers.notReady.join(', ')}` : ''].filter(Boolean);
  const remainingConfirmation = snapshot.mapSelection.mode === 'VOTE' && snapshot.availableMapCount > 0 && snapshot.availableMapCount < 4;
  const pickerMissing = snapshot.mapSelection.mode === 'POTG' && !snapshot.participants.some(player => player.discordId === snapshot.mapSelection.pickerDiscordId);
  const startBlocked = progress.length !== 10 || problems.length > 0 || snapshot.availableMapCount === 0 || pickerMissing || (remainingConfirmation && !remainingMapsConfirmed);
  const disabled = !controller.connected || controller.pending || (action?.type === 'draft.start' && startBlocked)
    || (action?.requiresActive && snapshot.timer.status !== 'ACTIVE');
  if (!snapshot.isOperator || controller.roomClosed) return null;
  return <section className="draft-operator-actions" aria-label="다음 운영 작업">
    <div className="draft-operator-action-row"><div className="min-w-0">
      <p className="text-xs font-semibold text-cyan-300">운영자 · 다음 작업</p>
      <p className="mt-1 text-sm text-slate-200">{snapshot.phase === 'LOBBY' ? controller.connected
        ? `접속 ${progress.filter(player => player.connectionStatus === 'CONNECTED').length}/10 · 준비 ${snapshot.readyCount}/10`
        : '참가자 상태 확인 중' : action?.label ?? '밴픽 진행 중 · 참가자의 선택을 기다리고 있습니다.'}</p>
      {snapshot.phase === 'LOBBY' && controller.connected && <div className="mt-2 space-y-1 text-xs text-amber-200" aria-label="시작 조건">
        {progress.length !== 10 ? <p>참가자 10명의 최신 상태를 확인하고 있습니다.</p> : problems.map(problem => <p key={problem}>{problem}</p>)}
        {snapshot.availableMapCount === 0 && <p>미사용 맵이 없습니다.</p>}{pickerMissing && <p>맵을 선택할 팟지 선수를 지정해 주세요.</p>}
        {!startBlocked && <p className="text-emerald-400">10명 모두 준비되었습니다. 밴픽을 시작할 수 있습니다.</p>}
      </div>}
    </div>{action && <button type="button" className="btn-primary shrink-0 text-sm" disabled={disabled} onClick={() => execute(action.type,
      action.type === 'draft.start' ? { remainingMapsConfirmed, diversityExceptionReason } : undefined)}>{controller.pending ? '처리 중…' : action.label}</button>}</div>
    {snapshot.phase === 'LOBBY' && <div className="mt-3 text-xs text-slate-400">
      {remainingConfirmation && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={!controller.connected || controller.pending} checked={remainingMapsConfirmed} onChange={event => setRemainingMapsConfirmed(event.target.checked)} />남은 맵 {snapshot.availableMapCount}개로 진행 · 무작위 없음</label>}
      <details><summary className="cursor-pointer py-2">고급 맵 설정 · 모드 다양성 예외</summary><label className="mt-1 block">예외 사유 (필요할 때만)
        <input className="form-control mt-1" maxLength={500} disabled={!controller.connected || controller.pending} value={diversityExceptionReason} onChange={event => setDiversityExceptionReason(event.target.value)} /></label></details>
    </div>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
      <p className="text-xs text-slate-500">{snapshot.playStatus === 'PLAYING' ? '진행 중인 경기의 종료 또는 중단을 먼저 기록해 주세요.' : '방을 닫으면 모든 연결과 공유 링크 참여가 종료됩니다.'} 2시간 동안 조작이 없으면 자동 종료됩니다.</p>
      <button type="button" className="btn-ghost text-xs text-red-300" disabled={!controller.connected || controller.pending || snapshot.playStatus === 'PLAYING'}
        onClick={() => {
          if (window.confirm('내전을 종료하고 밴픽방을 닫을까요? 모든 참가자의 연결이 종료되고 이 공유 링크는 다시 사용할 수 없습니다. 경기 기록과 원본 팀 편성은 유지됩니다.')) execute('room.close', { reason: '운영자 내전 종료' });
        }}>내전 종료·방 닫기</button>
    </div>
  </section>;
}
