import type { DraftAudio } from '@application/draft/draft-audio';
import { useRef, useState } from 'react';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftAsset } from './draft-asset';

const MODE_LABELS = { CONTROL: '쟁탈', HYBRID: '혼합', ESCORT: '호위', PUSH: '밀기', FLASHPOINT: '플래시포인트' } as const;

/** @description 미사용 맵을 모두 탐색하되 지정된 팟지 선수만 한 맵을 확정할 수 있다. */
export function DraftMapPick({ controller, onNotice, audio }: { audio?: DraftAudio; controller: DraftRoomController; onNotice?: (message: string) => void }) {
  const snapshot = controller.snapshot!;
  const picked = useRef(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('ALL');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const picker = snapshot.participants.find(player => player.discordId === snapshot.mapSelection.pickerDiscordId);
  const isPicker = snapshot.selfDiscordId === snapshot.mapSelection.pickerDiscordId;
  const disabled = !isPicker || !controller.connected || !snapshot.inputConnected || controller.pending || snapshot.timer.status !== 'ACTIVE';
  const maps = snapshot.availableMaps.filter(map => (mode === 'ALL' || map.mode === mode)
    && `${map.nameKo} ${map.nameEn}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(maps.length / 6));
  const currentPage = Math.min(page, pages - 1);
  const selectedMap = snapshot.availableMaps.find(map => map.mapId === selected);
  return <section aria-label="팟지 맵 선택" className="draft-map-pool min-w-0">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-white">{isPicker ? '팟지 맵을 선택하세요' : `${picker?.displayName ?? '지정 선수'}님의 맵 선택을 기다리고 있습니다`}</h3>
        <p className="mt-1 text-xs text-slate-500">미사용 맵 {snapshot.availableMaps.length}개 · 확정 후 모두 4초간 맵을 확인합니다.</p></div>
      <div className="flex gap-2"><input aria-label="맵 검색" className="form-control max-w-44" placeholder="맵 이름 검색" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
        <select aria-label="맵 모드 필터" className="form-control max-w-32" value={mode} onChange={event => { setMode(event.target.value); setPage(0); }}><option value="ALL">전체 모드</option>
          {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{maps.slice(currentPage * 6, currentPage * 6 + 6).map(map => <button key={map.mapId} type="button" disabled={disabled}
      aria-label={map.nameKo} aria-pressed={selected === map.mapId} onClick={() => { if (selected !== map.mapId) { void audio?.play(picked.current ? 'mapChange' : 'mapFirst', 'click'); picked.current = true; setSelected(map.mapId); } }}
      className={`min-w-0 overflow-hidden rounded-md border bg-surface-elevated text-left disabled:cursor-default ${selected === map.mapId ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800 enabled:hover:border-slate-500'}`}>
      <DraftAsset kind="maps" id={map.mapId} name={map.nameKo} /><div className="flex items-center justify-between gap-2 px-2 py-2"><span className="truncate text-xs font-semibold">{map.nameKo}</span><span className="shrink-0 text-[10px] text-slate-500">{MODE_LABELS[map.mode]}</span></div>
    </button>)}</div>
    {!maps.length && <p className="py-8 text-center text-sm text-slate-500">검색 조건에 맞는 미사용 맵이 없습니다.</p>}
    <footer className="draft-map-pick-actions mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
      <div className="flex items-center gap-2"><button type="button" className="btn-ghost text-xs" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전 맵</button><span className="text-xs text-slate-500">{currentPage + 1} / {pages}</span><button type="button" className="btn-ghost text-xs" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>다음 맵</button></div>
      {isPicker && <div className="flex items-center gap-3"><span className="text-xs text-slate-400">{selectedMap?.nameKo ?? '선택한 맵 없음'}</span><button type="button" className="btn-primary text-xs" disabled={disabled || !selectedMap} onClick={() => {
        setError(''); onNotice?.(''); void controller.command('map.pick', { mapId: selected }).catch(failure => {
          const reason = failure instanceof Error ? failure.message : '맵을 확정하지 못했습니다.';
          if (onNotice) onNotice(reason); else setError(reason);
        });
      }}>이 맵으로 확정</button></div>}
    </footer>
    {error && <p role="status" className="mt-2 text-xs text-amber-300">{error}</p>}
  </section>;
}
