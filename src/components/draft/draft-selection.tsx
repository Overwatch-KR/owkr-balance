import { useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { getMapVoteLead, MAP_LANDSLIDE_MARGIN, type DraftRole } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftAsset } from './draft-asset';
import { clearDraftBanRank, getDraftTeamLabel, getDraftSideSummary } from './draft-room-view';
import { DraftMyBanVote, DraftTeamScores } from './draft-ban-vote';
import { DraftMapVoteSlots } from './draft-map-vote-slots';
import { DraftMapLead } from './draft-map-lead';

const ROLE_LABELS = { TANK: '탱커', DPS: '공격', SUPPORT: '지원' } as const;

export function DraftSelection({ controller, onNotice }: { controller: DraftRoomController; onNotice?: (message: string) => void }) {
  const snapshot = controller.snapshot!;
  const self = snapshot.ballots?.self;
  const [selection, setSelection] = useState<string[]>(() => [...(self?.selection ?? [])]);
  const [activeRank, setActiveRank] = useState(() => {
    const emptyRank = self?.selection.findIndex(id => !id) ?? -1;
    return snapshot.stageKind === 'BAN' ? Math.min(emptyRank >= 0 ? emptyRank : self?.selection.length ?? 0, 2) : 0;
  });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readyReceipt, setReadyReceipt] = useState<{ revision: number; ready: boolean } | null>(null);
  const submittingRef = useRef(false);
  const [activeRole, setActiveRole] = useState<DraftRole>(() => snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId)?.role ?? 'TANK');
  if (!self) return null;
  const isBan = snapshot.stageKind === 'BAN';
  const isMap = snapshot.stageKind === 'MAP';
  const selectedCount = selection.filter(Boolean).length;
  const mapTotals = snapshot.ballots?.mapTotals ?? {};
  const hasLandslide = (id: string) => getMapVoteLead(mapTotals, id) >= MAP_LANDSLIDE_MARGIN;
  const confirmed = readyReceipt && self.ballotRevision < readyReceipt.revision ? readyReceipt.ready : self.locked;
  const closed = snapshot.stageStatus === 'SEALED';
  const autoReady = selectedCount === (isBan ? 3 : 1);
  const disabled = !controller.connected || controller.pending || submitting || closed || !snapshot.inputConnected || snapshot.timer.status !== 'ACTIVE';
  const selfPlayer = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId);
  const team = snapshot.participants.filter(player => player.team === selfPlayer?.team)
    .sort((left, right) => Number(right.discordId === snapshot.selfDiscordId) - Number(left.discordId === snapshot.selfDiscordId) || left.slot - right.slot);
  const submit = (lock: boolean, nextSelection = selection) => {
    if (disabled || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true); setMessage(''); onNotice?.('');
    void controller.command(lock ? 'ballot.lock' : 'ballot.save', { selection: nextSelection }).then(() => {
      setReadyReceipt(previous => ({ revision: Math.max(self.ballotRevision, previous?.revision ?? 0) + 1,
        ready: lock || nextSelection.filter(Boolean).length === (isBan ? 3 : 1) }));
    }).catch(error => {
      setSelection([...self.selection]);
      const reason = error instanceof Error ? error.message : '저장하지 못했습니다.';
      if (onNotice) onNotice(reason); else setMessage(reason);
    }).finally(() => { submittingRef.current = false; setSubmitting(false); });
  };
  const changeSelection = (next: string[]) => {
    if (disabled || submittingRef.current) return;
    setSelection(next);
    submit(next.filter(Boolean).length === (isBan ? 3 : 1), next);
  };
  const pickMap = (id: string) => changeSelection(selection[0] === id ? [] : [id]);
  const pickHero = (id: string) => {
    if (disabled || submittingRef.current) return;
    if (selection.includes(id)) {
      const rank = selection.indexOf(id); changeSelection(clearDraftBanRank(selection, rank)); setActiveRank(rank); return;
    }
    const next = [...selection];
    next[Math.min(activeRank, next.length, isBan ? 2 : 0)] = id;
    changeSelection(next);
    const emptyRank = next.findIndex(hero => !hero);
    setActiveRank(isBan ? Math.min(emptyRank >= 0 ? emptyRank : next.length, 2) : 0);
  };
  const saved = JSON.stringify(selection) === JSON.stringify(self.selection);
  return <section aria-label="내 투표" className={`draft-selection ${isBan ? 'draft-selection-ban' : 'draft-selection-map'}`}>
    <div className="draft-selection-heading">
      <div><h3 className="text-sm font-semibold text-white">{isMap ? '플레이할 맵을 선택하세요' : '밴할 영웅을 선택하세요'}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{isMap ? '맵을 누르면 자동 준비됩니다. 선택한 맵을 다시 누르면 해제됩니다.' : '3개 선택 시 자동 준비됩니다. 마감 전까지 선택을 바꿀 수 있습니다.'}</p></div>
      {isBan && <DraftTeamScores snapshot={snapshot} />}
    </div>
    {isBan && <aside aria-label="우리 팀 선택 현황" className="draft-team-list">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-white">우리 팀 · {selfPlayer ? getDraftTeamLabel(selfPlayer.team, snapshot.mapResult?.firstAttackTeam) : '확인 중'}</h3></div>
      <div className="draft-nameplates">{team.map(player => {
        const isSelf = player.discordId === snapshot.selfDiscordId;
        const ballot = isSelf ? { ...self, selection, locked: confirmed } : snapshot.ballots?.teammates.find(entry => entry.discordId === player.discordId);
        const ranks = [0, 1, 2];
        return <div key={player.discordId} aria-label={`${player.displayName}${isSelf ? ' 내 선택' : ' 선택 현황'}`}
          className={`draft-nameplate ${isSelf ? 'draft-nameplate-self' : ''} min-w-0 rounded-md border ${isSelf ? 'border-cyan-500/60 bg-cyan-500/[0.06]' : 'border-slate-800 bg-surface-elevated'}`}>
          <div className="flex items-center justify-between gap-2"><p className="draft-player-name truncate font-semibold text-slate-100">{player.displayName}{isSelf && <span className="ml-1.5 text-[10px] text-cyan-300">나</span>}</p>
            <span className={`flex items-center gap-1 text-[10px] ${ballot?.locked ? 'text-emerald-400' : 'text-slate-500'}`}>{ballot?.locked && <Check size={11} />}{ballot?.locked ? '준비' : '선택 중'}</span></div>
          <span className="sr-only">{ROLE_LABELS[player.role]}</span>
          <div className="draft-picks mt-1.5">{ranks.map(rank => {
            const id = ballot?.selection[rank];
            const name = snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? '선택 없음';
            const label = `${player.displayName} ${rank + 1}순위: ${name}`;
            const portrait = <><div className="overflow-hidden rounded-sm">{id ? <DraftAsset kind="heroes" id={id} name={name} />
              : <div className="flex aspect-square items-center justify-center bg-slate-900 text-xs text-slate-600">—</div>}</div>
              </>;
            return <div key={rank} className="min-w-0">
              <div role="img" aria-label={label} title={label} className="relative rounded border border-slate-700 p-0.5">{portrait}</div>
            </div>;
          })}</div>
        </div>;
      })}</div>
    </aside>}
    <div className="draft-candidates">
      {!isMap && <div className="draft-role-tabs" role="group" aria-label="영웅 역할 보기">{(['TANK', 'DPS', 'SUPPORT'] as const).map(role => <button key={role} type="button" aria-pressed={activeRole === role}
        onClick={() => setActiveRole(role)}>{ROLE_LABELS[role]}</button>)}</div>}
      {isMap ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.candidates?.candidates.map(option => <button key={option.map.mapId} type="button" disabled={disabled}
          data-landslide={hasLandslide(option.map.mapId)} aria-pressed={selection[0] === option.map.mapId} onClick={() => pickMap(option.map.mapId)}
          className={`draft-map-vote-candidate overflow-hidden rounded-md border bg-surface-elevated text-left transition disabled:opacity-50 ${selection[0] === option.map.mapId ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800 hover:border-slate-500'}`}>
          <DraftAsset kind="maps" id={option.map.mapId} name={option.map.nameKo} />
          <div className="p-3"><p className="text-sm font-semibold">{option.map.nameKo}</p>
            <p className="mt-1 text-[11px] text-slate-500">{option.firstAttackTeam ? getDraftSideSummary(option.firstAttackTeam) : '공격·수비 구분 없음'}</p>
            <DraftMapVoteSlots optionId={option.map.mapId} name={option.map.nameKo} count={snapshot.ballots?.mapTotals?.[option.map.mapId] ?? 0}
              teamCounts={snapshot.ballots?.mapTeamTotals?.[option.map.mapId]} firstAttackTeam={option.firstAttackTeam} />
            <DraftMapLead optionId={option.map.mapId} name={option.map.nameKo} totals={mapTotals} /></div>
        </button>)}
        {!!snapshot.candidates?.randomPool.length && <button type="button" disabled={disabled} data-landslide={hasLandslide('RANDOM')} aria-pressed={selection[0] === 'RANDOM'} onClick={() => pickMap('RANDOM')}
          className={`draft-map-vote-candidate min-h-12 rounded-md border px-3 py-3 text-sm sm:col-span-2 xl:col-span-3 ${selection[0] === 'RANDOM' ? 'border-cyan-400 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>
          <span>무작위 · 사용한 맵 제외</span><DraftMapVoteSlots optionId="RANDOM" name="무작위" count={snapshot.ballots?.mapTotals?.RANDOM ?? 0}
            teamCounts={snapshot.ballots?.mapTeamTotals?.RANDOM} /><DraftMapLead optionId="RANDOM" name="무작위" totals={mapTotals} /></button>}
      </div> : <div className="draft-role-columns">
        {(['TANK', 'DPS', 'SUPPORT'] as const).map(role => <section key={role} data-active={activeRole === role} aria-label={`${ROLE_LABELS[role]} 영웅`}>
          <h4 className="mb-1 border-b border-slate-800 pb-1 text-xs font-semibold text-slate-400">{ROLE_LABELS[role]}</h4>
          <div className={`draft-hero-grid ${role === 'DPS' ? 'draft-hero-grid-damage' : ''}`}>{snapshot.heroes.filter(hero => hero.role === role).map(hero => <button key={hero.heroId} type="button" disabled={disabled}
            aria-label={hero.nameKo} title={hero.nameKo} aria-pressed={selection.includes(hero.heroId)} onClick={() => pickHero(hero.heroId)}
            className={`relative min-w-0 overflow-hidden rounded border text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50 ${selection.includes(hero.heroId) ? 'border-cyan-400 ring-1 ring-cyan-400' : 'border-slate-800 hover:border-slate-500'}`}>
            <DraftAsset kind="heroes" id={hero.heroId} name={hero.nameKo} />
            <span className="block truncate bg-surface-elevated px-0.5 py-1 text-center text-[9px] text-slate-300">{hero.nameKo}</span>
          </button>)}</div>
        </section>)}
      </div>}
    </div>
    {isBan && <DraftMyBanVote snapshot={snapshot} selection={selection} activeRank={activeRank} disabled={disabled} onRank={setActiveRank} onSelection={changeSelection} />}
      <footer className="draft-selection-actions border-t border-slate-800">
        <div className="draft-selection-feedback"><p className="text-xs text-slate-500" role="status">{!controller.connected ? '연결 복구 후 입력할 수 있습니다.' : closed ? '투표 마감 · 결과를 확인하고 있습니다.' : controller.pending || submitting ? '서버 확인 중…' : confirmed ? '준비 완료 · 마감 전까지 수정할 수 있습니다.' : !saved ? '미저장 · 변경한 선택이 아직 저장되지 않았습니다.' : selectedCount ? isBan ? '선택 저장됨 · 2개 이하는 하단에서 준비해 주세요.' : '선택 저장됨 · 준비를 완료해 주세요.' : '선택 없음 · 기권으로 준비할 수 있습니다.'}</p>
        <p className="mt-1 text-[11px] text-slate-400">{isBan ? '픽을 해제하면 준비가 풀리고, 3개를 채우면 다시 자동 준비됩니다.' : '선택한 맵을 해제하면 준비가 풀리고, 다른 맵을 누르면 준비를 유지한 채 변경됩니다.'}</p>{message && <p className="mt-1 text-xs text-slate-300">{message}</p>}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-xs" disabled={disabled || selectedCount === 0} onClick={() => changeSelection([])}><RotateCcw size={13} />초기화</button>
          <button type="button" className="btn-primary min-w-28 text-xs" disabled={disabled || (confirmed && autoReady)} onClick={() => submit(!confirmed)}><Check size={14} />{confirmed ? autoReady ? '자동 준비 완료' : '준비 취소' : selectedCount ? '준비 완료' : '기권 준비'}</button>
        </div>
      </footer>
  </section>;
}
