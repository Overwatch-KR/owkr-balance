import { useState } from 'react';
import { getDraftTeamLabel } from './draft-room-view';
import type { DraftRoomController } from '@application/draft/use-draft-room';

/** @description 준비 단계에서만 운영자가 맵 선정 방식과 직접 선택할 팟지 선수를 지정한다. */
export function DraftMapSetup({ controller, onNotice }: { controller: DraftRoomController; onNotice?: (message: string) => void }) {
  const snapshot = controller.snapshot!;
  const [mode, setMode] = useState(snapshot.mapSelection.mode);
  const [picker, setPicker] = useState(snapshot.mapSelection.pickerDiscordId ?? '');
  const [message, setMessage] = useState('');
  const unchanged = mode === snapshot.mapSelection.mode && (mode === 'VOTE' || picker === snapshot.mapSelection.pickerDiscordId);
  return <section aria-label="맵 선정 방식" className="border-b border-slate-800 pb-3">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs text-slate-400">맵 선정 방식
        <select className="form-control mt-1" value={mode} disabled={controller.pending || !controller.connected || snapshot.timer.status !== 'ACTIVE'} onChange={event => setMode(event.target.value as 'VOTE' | 'POTG')}>
          <option value="VOTE">참가자 투표</option><option value="POTG">팟지 선수가 직접 선택</option>
        </select></label>
      {mode === 'POTG' && <label className="text-xs text-slate-400">팟지 선수
        <select className="form-control mt-1" value={picker} disabled={controller.pending || !controller.connected} onChange={event => setPicker(event.target.value)}>
          <option value="">선수를 지정하세요</option>{snapshot.participants.map(player => <option key={player.discordId} value={player.discordId}>{player.displayName} · {getDraftTeamLabel(player.team, snapshot.mapResult?.firstAttackTeam)}</option>)}
        </select></label>}
      <button type="button" className="btn-ghost border border-slate-700 text-xs" disabled={unchanged || controller.pending || !controller.connected || snapshot.timer.status !== 'ACTIVE' || (mode === 'POTG' && !picker)} onClick={() => {
        setMessage(''); onNotice?.(''); void controller.command('map.configure', { mapMode: mode, pickerDiscordId: mode === 'POTG' ? picker : null })
          .catch(error => { const reason = error instanceof Error ? error.message : '방식을 적용하지 못했습니다.'; if (onNotice) onNotice(reason); else setMessage(reason); });
      }}>맵 방식 적용</button>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">방식을 바꾸면 전원이 다시 준비합니다. 이미 플레이한 맵은 두 방식 모두 제외합니다.</p>
    {message && <p role="status" className="mt-2 text-xs text-amber-300">{message}</p>}
  </section>;
}
