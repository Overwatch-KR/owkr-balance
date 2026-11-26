import { useState } from 'react';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftOperatorDialog } from './draft-operator-dialog';
import { DRAFT_FEARLESS_LABELS } from './draft-room-view';

export function DraftFearlessDialog({ controller, onClose }: { controller: DraftRoomController; onClose: () => void }) {
  const snapshot = controller.snapshot!;
  const [error, setError] = useState('');
  const mode = snapshot.fearlessMode ?? 'OFF';
  const games = snapshot.fearlessHistory ?? [];
  const excluded = new Set(snapshot.fearlessExcludedHeroIds);
  const editable = snapshot.phase === 'LOBBY' && snapshot.timer.status === 'ACTIVE';
  return <DraftOperatorDialog title="피어리스 밴 관리" closeLabel="피어리스 밴 관리 닫기" onClose={onClose}>
    <p className="text-sm text-slate-200">{DRAFT_FEARLESS_LABELS[mode]} · {snapshot.gameIndex}경기 밴 불가 영웅 {excluded.size}명</p>
    <p className="mt-1 text-xs text-slate-400">체크한 기록을 집계에 반영합니다. 해제하면 해당 경기의 밴 기록만 집계에서 제외됩니다.</p>
    {!editable && <p className="mt-2 text-xs text-amber-300">준비 단계에서 반영 여부를 바꿀 수 있습니다.</p>}
    {(error || !controller.connected) && <p role="status" className="mt-2 text-xs text-amber-300">{error || '연결을 복구하면 다시 변경할 수 있습니다.'}</p>}
    {games.length === 0 ? <p className="mt-4 border-t border-slate-800 pt-4 text-sm text-slate-400">아직 이전 경기 기록이 없습니다.</p>
      : <div className="mt-4 space-y-4">{games.map(game => <section key={game.gameId} className="border-t border-slate-800 pt-3">
        <h3 className="text-sm font-semibold">{game.gameIndex}경기 <span className="font-normal text-slate-400">· {game.mapName}{game.played ? '' : ' · 미진행'}</span></h3>
        {game.bans.length === 0 ? <p className="mt-2 text-xs text-slate-400">확정 밴 없음</p> : <fieldset
          aria-label={`${game.gameIndex}경기 밴 반영`}
          className="mt-2 grid gap-2 sm:grid-cols-2">
          {game.bans.map(hero => <label key={hero.heroId} className="flex min-h-10 items-center gap-2 rounded border border-slate-800 px-3 text-sm">
            <input type="checkbox" className="accent-cyan-400" checked={game.played && !game.exemptHeroIds.includes(hero.heroId)}
              disabled={!editable || !game.played || !controller.connected || controller.pending}
              aria-label={`${game.gameIndex}경기 ${hero.nameKo} 반영`} onChange={event => {
                setError('');
                const fearlessException = { gameId: game.gameId, heroId: hero.heroId, exempt: !event.target.checked };
                void controller.command('fearless.setException', { fearlessException })
                  .catch(failure => setError(failure instanceof Error ? failure.message : '반영 여부를 저장하지 못했습니다.'));
              }} />
            <span>{hero.nameKo}</span>
          </label>)}
        </fieldset>}
      </section>)}</div>}
  </DraftOperatorDialog>;
}
