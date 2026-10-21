import './draft-workspace.css';
import { getDraftTeamLabel, getDraftSideSummary } from './draft-room-view';
import { useState } from 'react';
import { DraftMapSetup } from './draft-map-setup';
import { DraftMapPick } from './draft-map-pick';
import { DraftAsset } from './draft-asset';
import { DraftSelection } from './draft-selection';
import { DraftOperatorDialog } from './draft-operator-dialog';
import { DraftBanResult } from './draft-ban-result';
import { DraftRoomHeader } from './draft-room-header';
import { DraftConnectionStatus } from './draft-connection-status';
import { DraftOperatorActions } from './draft-operator-actions';
import type { DraftRoomController } from '@application/draft/use-draft-room';

const ROLE_LABELS = { TANK: '탱커', DPS: '공격', SUPPORT: '지원' } as const;
const buttonClass = 'btn-ghost border border-slate-800 text-xs disabled:opacity-40';

export function DraftRoomPanel({ controller, admin = false }: { controller: DraftRoomController; admin?: boolean }) {
  const snapshot = controller.snapshot;
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const execute = (type: string, values?: Record<string, unknown>) => {
    setNotice(''); void controller.command(type, values).catch(error => setNotice(error instanceof Error ? error.message : '진행하지 못했습니다.'));
  };
  if (!snapshot) return <div className="border-y border-slate-800 py-6"><DraftConnectionStatus controller={controller} /></div>;
  const self = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId);
  const controlsDisabled = !controller.connected || controller.pending;
  const phaseReady = snapshot.timer.status === 'ACTIVE';
  const copyResult = async () => {
    const names = snapshot.heroResult?.bannedHeroIds.map(id => snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? id);
    const result = [`OWKR 내전 ${snapshot.gameIndex}경기`, `맵: ${snapshot.mapResult?.map.nameKo ?? '미확정'}`,
      snapshot.mapResult?.method === 'POTG' ? `팟지 선택: ${snapshot.participants.find(player => player.discordId === snapshot.mapResult?.selectedByDiscordId)?.displayName ?? '지정 선수'}` : '',
      snapshot.mapResult?.firstAttackTeam ? getDraftSideSummary(snapshot.mapResult.firstAttackTeam) : '',
      `공통 영웅 밴: ${names?.join(', ') || '선택된 밴 없음'}`,
      ...(['A', 'B'] as const).map(team => `${getDraftTeamLabel(team, snapshot.mapResult?.firstAttackTeam)} (게임 로비 ${team === 'A' ? 1 : 2}팀): ${snapshot.participants.filter(player => player.team === team).map(player => `${player.displayName}(${ROLE_LABELS[player.role]})`).join(', ')}`),
    ].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(result); setNotice('맵·밴 결과를 복사했습니다.'); }
    catch { setNotice('복사 권한을 확인해 주세요.'); }
  };
  return <div className={`draft-room-panel ${snapshot.ballots?.self || snapshot.phase === 'MAP_PICKING' ? 'draft-room-selecting' : 'space-y-5'}`}>
    <DraftRoomHeader controller={controller} admin={admin} onOpenOperator={() => setOperatorOpen(true)} />
    <DraftConnectionStatus controller={controller} notice={notice} />
    {snapshot.isOperator && <DraftOperatorActions key={`${snapshot.gameId}:${snapshot.epoch}`} controller={controller} execute={execute} />}
    {self && snapshot.phase === 'LOBBY' && <section className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-800 py-5">
      <div><h3 className="font-semibold text-white">내 팀·역할을 확인해 주세요</h3><p className="mt-2 text-sm text-slate-400">{self.displayName} · {getDraftTeamLabel(self.team, snapshot.mapResult?.firstAttackTeam)} · {ROLE_LABELS[self.role]} · 준비 {snapshot.readyCount}/10</p>
        <p className="mt-2 text-xs text-slate-500">참가자 전원 마이크 필수 · 팀이 바뀌면 다시 준비합니다.</p></div>
      <button type="button" className={`${buttonClass} border-cyan-600 text-cyan-200`} disabled={controlsDisabled || !snapshot.inputConnected || !phaseReady}
        onClick={() => execute('ready.set', { ready: !snapshot.selfReady })}>{snapshot.selfReady ? '준비 취소' : '준비 완료'}</button>
    </section>}
    {snapshot.phase === 'LOBBY' && <p className="text-xs text-slate-400">맵 선정: {snapshot.mapSelection.mode === 'VOTE' ? '참가자 투표' : `팟지 · ${snapshot.participants.find(player => player.discordId === snapshot.mapSelection.pickerDiscordId)?.displayName ?? '선수 지정 필요'}`}</p>}
    {snapshot.phase === 'LOBBY' && snapshot.isOperator && <DraftMapSetup key={snapshot.epoch} controller={controller} onNotice={setNotice} />}
    {snapshot.phase === 'MAP_PICKING' && <DraftMapPick key={`${snapshot.gameId}:${snapshot.epoch}`} controller={controller} onNotice={setNotice} />}
    {snapshot.phase === 'MAP_RESOLVED' && snapshot.mapResult && <section aria-label="확정 맵 확인" className="mx-auto w-full max-w-xl overflow-hidden rounded-md border border-cyan-700 bg-surface-elevated">
      <div className="max-h-48 overflow-hidden"><DraftAsset kind="maps" id={snapshot.mapResult.map.mapId} name={snapshot.mapResult.map.nameKo} /></div>
      <div className="p-4"><h3 className="text-lg font-semibold text-white">{snapshot.mapResult.map.nameKo}</h3>
        <p className="mt-1 text-xs text-slate-400">{snapshot.mapResult.firstAttackTeam ? getDraftSideSummary(snapshot.mapResult.firstAttackTeam) : '공격·수비 구분 없음'}</p>
        <p className="mt-2 text-xs text-cyan-300">모두 같은 3초 확인 시간을 가진 뒤 영웅 선택을 시작합니다.</p></div>
    </section>}
    {snapshot.ballots?.self && <DraftSelection key={`${snapshot.gameId}:${snapshot.epoch}:${snapshot.stageKind}`} controller={controller} onNotice={setNotice} />}
    {snapshot.heroResult && <DraftBanResult key={snapshot.heroResult.resolutionId} snapshot={snapshot} onCopy={() => void copyResult()} />}
    {!snapshot.ballots?.self && !['MAP_PICKING', 'MAP_RESOLVED'].includes(snapshot.phase) && <section aria-label="배정된 팀" className={`grid gap-4 md:grid-cols-2 ${snapshot.heroResult ? 'draft-result-roster' : ''}`}>
      {(['A', 'B'] as const).map(team => <div key={team} className={`border-t-2 pt-3 ${(snapshot.mapResult?.firstAttackTeam ? snapshot.mapResult.firstAttackTeam === team : team === 'B') ? 'border-red-500' : 'border-blue-500'}`}>
        <h3 className="mb-2 font-semibold">{getDraftTeamLabel(team, snapshot.mapResult?.firstAttackTeam)} · 게임 로비 {team === 'A' ? 1 : 2}팀</h3>
        {snapshot.participants.filter(player => player.team === team).map(player => <div key={player.discordId} className="flex items-center justify-between border-b border-slate-800 py-3 text-sm">
          <span>{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</span><span className="text-xs text-slate-400">{ROLE_LABELS[player.role]}</span>
        </div>)}
      </div>)}
    </section>}
    {snapshot.isOperator && operatorOpen && <DraftOperatorDialog onClose={() => setOperatorOpen(false)}><section aria-label="운영 제어" className="border-t border-slate-700 pt-5">
      <h3 className="mb-3 font-semibold">운영 제어</h3><div className="flex flex-wrap gap-2">
        {phaseReady ? <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => {
          const reason = window.prompt('정지 사유를 입력해 주세요.'); if (reason?.trim()) execute('draft.pause', { reason });
        }}>일시정지</button> : null}
        {snapshot.playStatus === 'NOT_STARTED' && snapshot.phase !== 'COMPLETED' && <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => {
          const reason = window.prompt('다시 준비할 사유를 입력해 주세요. 기존 맵·표·밴 결과를 취소하며 이미 공개된 정보는 회수할 수 없습니다.');
          if (reason?.trim()) execute('draft.restart', { reason });
        }}>최신 팀으로 준비 다시 시작</button>}
        {snapshot.phase === 'COMPLETED' && snapshot.playStatus === 'NOT_STARTED' && <>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markNotPlayed')}>경기 미진행</button></>}
        {snapshot.playStatus === 'PLAYING' && <>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markAborted')}>플레이 후 중단</button></>}
      </div>
      <h3 className="mb-2 mt-6 font-semibold">참가자 현황 · {controller.connected ? `${snapshot.progress?.filter(player => player.connectionStatus === 'CONNECTED').length ?? 0}/10 접속` : '상태 확인 중'}</h3>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-700 text-slate-500"><tr><th className="py-2">참가자</th><th>팀·역할</th><th>접속</th><th>입력 연결</th><th>단계 준비</th></tr></thead>
        <tbody>{snapshot.progress?.map(player => <tr key={player.discordId} className="border-b border-slate-800 text-slate-300">
          <td className="py-3 pr-4">{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</td><td className="pr-4">{getDraftTeamLabel(player.team, snapshot.mapResult?.firstAttackTeam)} · {ROLE_LABELS[player.role]}</td>
          <td className="pr-4">{!controller.connected ? '확인 중' : ({ CONNECTED: '접속됨', NEVER_JOINED: '미접속', DISCONNECTED: '연결 끊김', CHECKING: '확인 중' }[player.connectionStatus])}</td>
          <td className="pr-4">{controller.connected && player.inputConnected ? '연결됨' : '복구 필요'}</td><td>{snapshot.phase === 'LOBBY' ? player.ready ? '준비 완료' : '미준비' : player.confirmed ? '확정 완료' : '확정 대기'}</td>
        </tr>)}</tbody></table></div>
    </section></DraftOperatorDialog>}
  </div>;
}
