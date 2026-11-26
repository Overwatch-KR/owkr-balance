import { ArrowLeftRight } from 'lucide-react';
import type { DraftMapSelection } from '#domain/draft';
import { getDraftTeamLabel } from './draft-room-view';
import type { DraftRoomController } from '@application/draft/use-draft-room';

interface DraftMapSetupProps {
  controller: DraftRoomController;
  mapSelection: DraftMapSelection;
  onChange: (selection: DraftMapSelection) => void;
  onSwapTeams: () => void;
}

/** @description 시작할 때 사용할 맵 선정 방식과 팟지 선수를 준비 화면에서 선택한다. */
export function DraftMapSetup({ controller, mapSelection, onChange, onSwapTeams }: DraftMapSetupProps) {
  const snapshot = controller.snapshot!;
  const { mode, pickerDiscordId } = mapSelection;
  const disabled = controller.pending || !controller.connected || snapshot.timer.status !== 'ACTIVE';
  const selectClass = 'form-control mt-1 px-1 text-xs sm:px-3 sm:text-sm';
  return <section aria-label="맵 선정 및 팀 교대" className="flex items-end gap-2 border-b border-slate-800 pb-3">
    <label className="min-w-0 flex-1 text-xs text-slate-400 sm:w-44 sm:flex-none">맵 선정 방식
      <select className={selectClass} value={mode} disabled={disabled}
        onChange={event => onChange({ mode: event.target.value === 'POTG' ? 'POTG' : 'VOTE', pickerDiscordId: null })}>
        <option value="VOTE">참가자 투표</option><option value="POTG">팟지 선택</option>
      </select>
    </label>
    {mode === 'POTG' && <label className="min-w-0 flex-1 text-xs text-slate-400 sm:w-52 sm:flex-none">팟지 선수
      <select className={selectClass} value={pickerDiscordId ?? ''} disabled={disabled}
        onChange={event => onChange({ mode, pickerDiscordId: event.target.value || null })}>
        <option value="">선수 선택</option>{snapshot.participants.map(player => <option key={player.discordId} value={player.discordId}>{player.displayName} · {getDraftTeamLabel(player.team)}</option>)}
      </select>
    </label>}
    <button type="button" className="btn-ghost shrink-0 border border-slate-700 px-2 text-xs text-slate-200 sm:px-4"
      disabled={disabled} onClick={onSwapTeams}>
      <ArrowLeftRight size={14} aria-hidden="true" />1·2팀 교대
    </button>
  </section>;
}
