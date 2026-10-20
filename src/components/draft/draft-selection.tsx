import { useState } from 'react';
import { ArrowUp, Check, RotateCcw, Save, X } from 'lucide-react';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftAsset } from './draft-asset';

const ROLE_LABELS = { TANK: '탱커', DPS: '공격', SUPPORT: '지원' } as const;

export function DraftSelection({ controller }: { controller: DraftRoomController }) {
  const snapshot = controller.snapshot!;
  const self = snapshot.ballots?.self;
  const [selection, setSelection] = useState<string[]>(() => [...(self?.selection ?? [])]);
  const [activeRank, setActiveRank] = useState(0);
  const [message, setMessage] = useState('');
  if (!self) return null;
  const isBan = snapshot.stageKind === 'BAN';
  const isMap = snapshot.stageKind === 'MAP';
  const disabled = !controller.connected || controller.pending || self.locked || !snapshot.inputConnected || snapshot.timer.status !== 'ACTIVE';
  const selfPlayer = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId);
  const team = snapshot.participants.filter(player => player.team === selfPlayer?.team)
    .sort((left, right) => Number(right.discordId === snapshot.selfDiscordId) - Number(left.discordId === snapshot.selfDiscordId) || left.slot - right.slot);
  const submit = (lock: boolean) => {
    setMessage('');
    void controller.command(lock ? 'ballot.lock' : 'ballot.save', { selection }).then(() => {
      setMessage(lock ? '선택을 확정했습니다.' : '선택을 저장했습니다. 준비를 누르면 확정됩니다.');
    }).catch(error => setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'));
  };
  const pickHero = (id: string) => {
    if (disabled) return;
    if (selection.includes(id)) { setSelection(selection.filter(hero => hero !== id)); return; }
    const next = [...selection];
    next[Math.min(activeRank, next.length, isBan ? 2 : 0)] = id;
    setSelection(next); setActiveRank(Math.min(next.length, isBan ? 2 : 0));
  };
  const saved = JSON.stringify(selection) === JSON.stringify(self.selection);
  const preferredHero = snapshot.stageKind === 'PREFERENCE' ? snapshot.heroes.find(hero => hero.heroId === selection[0]) : null;
  return <section aria-label="내 투표" className="draft-selection">
    <aside aria-label="우리 팀 선택 현황" className="draft-team-list">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">우리 팀 · {selfPlayer?.team}팀</h3></div>
      <div className="draft-nameplates">{team.map(player => {
        const isSelf = player.discordId === snapshot.selfDiscordId;
        const ballot = isSelf ? { ...self, selection } : snapshot.ballots?.teammates.find(entry => entry.discordId === player.discordId);
        const ranks = isBan ? [2, 1, 0] : [0];
        return <div key={player.discordId} aria-label={`${player.displayName}${isSelf ? ' 내 선택' : ' 선택 현황'}`}
          className={`draft-nameplate min-w-0 rounded-md border p-1.5 ${isSelf ? 'border-cyan-500/60 bg-cyan-500/[0.06]' : 'border-slate-800 bg-surface-elevated'}`}>
          <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-100">{player.displayName}{isSelf && <span className="ml-1.5 text-[10px] text-cyan-300">나</span>}</p>
            <span className={`flex items-center gap-1 text-[10px] ${ballot?.locked ? 'text-emerald-400' : 'text-slate-500'}`}>{ballot?.locked && <Check size={11} />}{ballot?.locked ? '준비' : '선택 중'}</span></div>
          <span className="sr-only">{ROLE_LABELS[player.role]}</span>
          <div className="draft-picks mt-1.5">{ranks.map(rank => {
            const id = ballot?.selection[rank];
            const name = (isMap ? snapshot.candidates?.candidates.find(option => option.map.mapId === id)?.map.nameKo : snapshot.heroes.find(hero => hero.heroId === id)?.nameKo) ?? (id === 'RANDOM' ? '무작위' : '선택 없음');
            const label = `${player.displayName} ${isBan ? `${rank + 1}순위` : '선택'}: ${name}`;
            const portrait = <><div className="overflow-hidden rounded-sm">{id && id !== 'RANDOM' ? <DraftAsset kind={isMap ? 'maps' : 'heroes'} id={id} name={name} />
              : <div className="flex aspect-square items-center justify-center bg-slate-900 text-xs text-slate-600">{id === 'RANDOM' ? '?' : '—'}</div>}</div>
              </>;
            return <div key={rank} className="min-w-0">
              {isSelf && !isMap ? <button type="button" aria-label={label} aria-pressed={activeRank === rank} disabled={disabled}
                className={`relative block w-full rounded border p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${activeRank === rank ? 'border-cyan-400' : 'border-slate-700'} disabled:opacity-60`}
                onClick={() => setActiveRank(rank)}>{portrait}</button>
                : <div role="img" aria-label={label} title={label} className="relative rounded border border-slate-700 p-0.5">{portrait}</div>}
              {isSelf && id && !isMap && <div className="flex justify-center">
                <button type="button" aria-label={`${rank + 1}순위 해제`} disabled={disabled} className="flex min-h-5 min-w-5 items-center justify-center text-slate-500 hover:text-white disabled:opacity-40" onClick={() => setSelection(selection.filter((_, index) => index !== rank))}><X size={12} /></button>
                {rank > 0 && <button type="button" aria-label={`${rank + 1}순위 위로`} disabled={disabled} className="flex min-h-5 min-w-5 items-center justify-center text-slate-500 hover:text-white disabled:opacity-40" onClick={() => {
                  const next = [...selection]; [next[rank - 1], next[rank]] = [next[rank], next[rank - 1]]; setSelection(next);
                }}><ArrowUp size={12} /></button>}
              </div>}
            </div>;
          })}</div>
        </div>;
      })}</div>
    </aside>
    <div className="draft-candidates">
      <div className="draft-selection-heading border-b border-slate-800 pb-2">
        <h3 className="text-base font-semibold text-white">{isMap ? '플레이할 맵을 선택하세요' : isBan ? '밴할 영웅을 선택하세요' : '플레이하고 싶은 영웅을 선택하세요'}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{isMap ? '맵을 고른 뒤 준비를 누르세요.' : isBan ? '1순위 7점 · 2순위 5점 · 3순위 3점. 내 이름 아래 슬롯을 눌러 수정하세요.' : '선호 영웅은 팀의 밴 점수에서 한 번만 3점을 차감합니다.'}</p>
      </div>
      {isMap ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.candidates?.candidates.map(option => <button key={option.map.mapId} type="button" disabled={disabled}
          aria-pressed={selection[0] === option.map.mapId} onClick={() => setSelection([option.map.mapId])}
          className={`overflow-hidden rounded-md border bg-surface-elevated text-left transition disabled:opacity-50 ${selection[0] === option.map.mapId ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800 hover:border-slate-500'}`}>
          <DraftAsset kind="maps" id={option.map.mapId} name={option.map.nameKo} />
          <div className="p-3"><p className="text-sm font-semibold">{option.map.nameKo}</p>
            <p className="mt-1 text-[11px] text-slate-500">{option.firstAttackTeam ? `첫 공격 ${option.firstAttackTeam}팀 · 첫 수비 ${option.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '공격·수비 구분 없음'}</p>
            <p className="mt-2 text-xs text-cyan-300">{snapshot.ballots?.mapTotals?.[option.map.mapId] ?? 0}표</p></div>
        </button>)}
        {!!snapshot.candidates?.randomPool.length && <button type="button" disabled={disabled} aria-pressed={selection[0] === 'RANDOM'} onClick={() => setSelection(['RANDOM'])}
          className={`min-h-12 rounded-md border px-3 py-3 text-sm sm:col-span-2 xl:col-span-3 ${selection[0] === 'RANDOM' ? 'border-cyan-400 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>
          무작위 · 사용한 맵 제외 ({snapshot.ballots?.mapTotals?.RANDOM ?? 0}표)</button>}
      </div> : <div className="draft-role-columns">
        {(['TANK', 'DPS', 'SUPPORT'] as const).map(role => <section key={role} aria-label={`${ROLE_LABELS[role]} 영웅`}>
          <h4 className="mb-1 border-b border-slate-800 pb-1 text-xs font-semibold text-slate-400">{ROLE_LABELS[role]}</h4>
          <div className={`draft-hero-grid ${role === 'DPS' ? 'draft-hero-grid-damage' : ''}`}>{snapshot.heroes.filter(hero => hero.role === role).map(hero => <button key={hero.heroId} type="button" disabled={disabled}
            aria-label={hero.nameKo} title={hero.nameKo} aria-pressed={selection.includes(hero.heroId)} onClick={() => pickHero(hero.heroId)}
            className={`relative min-w-0 overflow-hidden rounded border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50 ${selection.includes(hero.heroId) ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800 hover:border-slate-500'}`}>
            <DraftAsset kind="heroes" id={hero.heroId} name={hero.nameKo} />
            <span className="block truncate bg-surface-elevated px-0.5 py-1 text-center text-[9px] text-slate-300">{hero.nameKo}</span>
            {selection.includes(hero.heroId) && <span className="absolute right-0.5 top-0.5 rounded bg-cyan-400 px-1 text-[10px] font-bold text-black">{selection.indexOf(hero.heroId) + 1}</span>}
          </button>)}</div>
        </section>)}
      </div>}
      {preferredHero && selfPlayer?.role !== preferredHero.role && <p className="mt-3 text-xs text-amber-300">배정 역할과 다른 선호 영웅입니다. 팀 역할은 변경되지 않습니다.</p>}
      <footer className="draft-selection-actions border-t border-slate-800">
        <p className="text-xs text-slate-500" role="status">{self.locked ? '준비 완료 · 선택 확정' : controller.pending ? '선택을 반영하고 있습니다…' : saved ? '선택을 확인하고 준비를 눌러 주세요.' : '저장하지 않은 선택이 있습니다.'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => setSelection([])}><RotateCcw size={13} />초기화</button>
          <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => submit(false)}><Save size={13} />저장</button>
          <button type="button" className="btn-primary min-w-28 text-xs" disabled={disabled} onClick={() => submit(true)}><Check size={14} />{self.locked ? '준비 완료' : selection.length ? '준비' : '기권 · 준비'}</button>
        </div>
      </footer>
      {message && <p className="mt-1 text-xs text-slate-300" role="status">{message}</p>}
    </div>
  </section>;
}
