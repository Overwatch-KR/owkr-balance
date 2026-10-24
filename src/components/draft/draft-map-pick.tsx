import type { DraftAudio } from '@application/draft/draft-audio';
import { useDraftRemainingTime } from '@application/draft/use-draft-remaining-time';
import { POTG_MAP_PICK_SECONDS } from '#domain/draft';
import { Hourglass, MapPin, MousePointer2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftAsset } from './draft-asset';

const MODE_LABELS = { CONTROL: '쟁탈', HYBRID: '혼합', ESCORT: '호위', PUSH: '밀기', FLASHPOINT: '플래시포인트' } as const;

/** @description 선택자에게 맵 미리보기와 확정을 제공하고 시청자에게는 선정 상태·제한 시간과 미사용 풀을 표시한다. */
export function DraftMapPick({ controller, onNotice, audio }: { audio?: DraftAudio; controller: DraftRoomController; onNotice?: (message: string) => void }) {
  const snapshot = controller.snapshot!;
  const picked = useRef(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('ALL');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const remaining = useDraftRemainingTime(snapshot, controller.connected);
  const picker = snapshot.participants.find(player => player.discordId === snapshot.mapSelection.pickerDiscordId);
  const isPicker = snapshot.selfDiscordId === snapshot.mapSelection.pickerDiscordId;
  const disabled = !isPicker || !controller.connected || !snapshot.inputConnected || controller.pending || snapshot.timer.status !== 'ACTIVE' || remaining === 0;
  const maps = snapshot.availableMaps.filter(map => (mode === 'ALL' || map.mode === mode)
    && `${map.nameKo} ${map.nameEn}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedMap = snapshot.availableMaps.find(map => map.mapId === selected);
  const paused = snapshot.timer.status !== 'ACTIVE';
  const seconds = remaining === null ? null : Math.ceil(remaining / 1000);
  return <section aria-label="팟지 맵 선택" className="draft-map-pool min-w-0">
    <header className="mb-5 border-b border-slate-800 pb-4">
      <div className="flex items-center justify-between gap-4">
        <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-300"><MapPin size={14} />POTG · 맵 선정</p>
          <h3 className="text-lg font-semibold text-white sm:text-xl">{isPicker ? '플레이할 전장을 골라 주세요' : `${picker?.displayName ?? '지정 선수'}님의 맵 선택을 기다리고 있습니다`}</h3>
          <p className="mt-2 text-xs text-slate-400">{isPicker ? '맵을 살펴본 뒤 오른쪽에서 확정하세요.' : '팟지 선수가 확정하면 선택한 맵을 모두 함께 확인합니다.'}</p>
        </div>
        <div className="shrink-0 text-right" role="timer" aria-label="팟지 맵 선정 남은 시간">
          <p className="text-[10px] text-slate-500">{!controller.connected ? '연결 확인 중' : paused ? '일시정지' : '선정 제한 시간'}</p>
          <p className={`mt-1 font-mono text-4xl font-semibold tabular-nums ${seconds !== null && seconds <= 5 && !paused ? 'text-amber-300' : 'text-cyan-200'}`}>{seconds === null ? '—' : seconds}<span className="ml-1 text-sm font-normal text-slate-500">초</span></p>
        </div>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-800" aria-hidden="true"><div className={`h-full transition-[width] duration-100 ${seconds !== null && seconds <= 5 ? 'bg-amber-400' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, Math.max(0, (remaining ?? 0) / (POTG_MAP_PICK_SECONDS * 10)))}%` }} /></div>
      <p className="mt-2 text-[11px] text-slate-500">{POTG_MAP_PICK_SECONDS}초 안에 확정하지 않으면 미사용 맵 중 무작위로 확정됩니다.</p>
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-400">미사용 맵 {snapshot.availableMaps.length}개</p>
          <div className="flex gap-2"><input aria-label="맵 검색" className="form-control max-w-44" placeholder="맵 이름 검색" value={search} onChange={event => { setSearch(event.target.value); }} />
            <select aria-label="맵 모드 필터" className="form-control max-w-32" value={mode} onChange={event => { setMode(event.target.value); }}><option value="ALL">전체 모드</option>
              {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div className="draft-potg-map-scroll" role="region" aria-label="미사용 맵 목록" tabIndex={0}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">{maps.map(map => {
          const content = <><DraftAsset kind="maps" id={map.mapId} name={map.nameKo} /><div className="px-2 py-2.5"><p className="truncate text-xs font-semibold text-slate-100">{map.nameKo}</p><p className="mt-1 text-[10px] text-slate-500">{MODE_LABELS[map.mode]}</p></div></>;
          const className = `min-w-0 overflow-hidden rounded-md border bg-surface-elevated text-left ${selected === map.mapId ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800'}`;
          return isPicker ? <button key={map.mapId} type="button" disabled={disabled} aria-label={map.nameKo} aria-pressed={selected === map.mapId}
            onClick={() => { if (selected !== map.mapId) { void audio?.play(picked.current ? 'mapChange' : 'mapFirst', 'click'); picked.current = true; setSelected(map.mapId); } }}
            className={`${className} enabled:hover:border-cyan-700 disabled:opacity-60`}>{content}</button>
            : <article key={map.mapId} aria-label={map.nameKo} className={className}>{content}</article>;
        })}</div>
        {!maps.length && <p className="py-8 text-center text-sm text-slate-500">검색 조건에 맞는 미사용 맵이 없습니다.</p>}
        </div>

      </div>
      <aside className="overflow-hidden rounded-lg xl:sticky xl:top-4 border border-slate-800 bg-slate-900/40" aria-label={isPicker ? '선택한 맵 미리보기' : '팟지 선정 현황'}>
        {isPicker && selectedMap ? <><DraftAsset kind="maps" id={selectedMap.mapId} name={selectedMap.nameKo} /><div className="p-4"><p className="text-xs text-cyan-300">선택한 맵</p><h4 className="mt-2 text-xl font-semibold text-white">{selectedMap.nameKo}</h4><p className="mt-1 text-xs text-slate-400">{MODE_LABELS[selectedMap.mode]}</p></div></>
          : <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-6 text-center">{isPicker ? <MousePointer2 size={32} className="text-cyan-500" /> : <Hourglass size={32} className="text-cyan-500" />}
            <p className="font-semibold text-slate-100">{isPicker ? '맵을 선택해 주세요' : `${picker?.displayName ?? '지정 선수'}님이 선정 중`}</p>
            <p className="max-w-52 text-xs leading-5 text-slate-500">{isPicker ? '왼쪽에서 고른 맵을 이곳에서 미리 확인할 수 있습니다.' : '다른 참가자는 기다려 주세요. 선정이 끝나면 자동으로 다음 단계로 이동합니다.'}</p></div>}
        {isPicker && <div className="border-t border-slate-800 p-4"><button type="button" className="btn-primary min-h-11 w-full justify-center text-sm" disabled={disabled || !selectedMap} onClick={() => {
          setError(''); onNotice?.(''); void controller.command('map.pick', { mapId: selected }).catch(failure => {
            const reason = failure instanceof Error ? failure.message : '맵을 확정하지 못했습니다.';
            if (onNotice) onNotice(reason); else setError(reason);
          });
        }}>이 맵으로 확정</button><p className="mt-2 text-center text-[11px] text-slate-500">확정 맵을 4초간 확인한 뒤 영웅 밴을 시작합니다.</p></div>}
      </aside>
    </div>
    {error && <p role="status" className="mt-2 text-xs text-amber-300">{error}</p>}
  </section>;
}
