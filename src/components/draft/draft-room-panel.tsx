import './draft-workspace.css';
import { useEffect, useState } from 'react';
import { DraftMapSetup } from './draft-map-setup';
import { DraftMapPick } from './draft-map-pick';
import { DraftAsset } from './draft-asset';
import { DraftSelection } from './draft-selection';
import { DraftOperatorDialog } from './draft-operator-dialog';
import { DraftBanResult } from './draft-ban-result';
import type { DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';

const DRAFT_PHASE_LABELS: Record<DraftRoomSnapshot['phase'], string> = {
  LOBBY: '팀 확인·준비', MAP_VOTING: '맵 투표', MAP_PICKING: '팟지 맵 선택', MAP_RESOLVED: '선택 맵 확인',
  HERO_PREFERENCE: '선호 영웅', HERO_VOTING: '영웅 밴 투표', HERO_RESOLVED: '맵·밴 결과', COMPLETED: '게임 설정 적용 완료',
};
const ROLE_LABELS = { TANK: '탱커', DPS: '공격', SUPPORT: '지원' } as const;
const STATUS_LABELS = { ACTIVE: '진행 가능', PAUSED: '일시정지', RECOVERY_PAUSED: '서버 복구 · 재개 필요',
  ROSTER_CHANGED: '팀 변경 · 다시 준비 필요', CANCELLED: '취소됨', EXPIRED: '만료됨' } as const;
const buttonClass = 'btn-ghost border border-slate-800 text-xs disabled:opacity-40';

function DraftCountdown({ snapshot }: { snapshot: DraftRoomSnapshot }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(timer);
  }, [snapshot.serverNow]);
  const remaining = snapshot.timer.deadlineAt === null ? null
    : Math.max(0, Math.ceil((snapshot.timer.deadlineAt - snapshot.serverNow - elapsed) / 1000));
  return <span className="font-mono text-xl tabular-nums text-cyan-300" aria-label="남은 시간">{remaining === null ? '—' : `${remaining}초`}</span>;
}

export function DraftRoomPanel({ controller }: { controller: DraftRoomController }) {
  const snapshot = controller.snapshot;
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [remainingMapsConfirmed, setRemainingMapsConfirmed] = useState(false);
  const [diversityExceptionReason, setDiversityExceptionReason] = useState('');
  const execute = (type: string, values?: Record<string, unknown>) => {
    setNotice(''); void controller.command(type, values).catch(error => setNotice(error instanceof Error ? error.message : '진행하지 못했습니다.'));
  };
  if (!snapshot) return <div className="border-y border-slate-800 py-10 text-center text-sm text-slate-400">
    {controller.error || '방 상태를 확인하고 있습니다.'}<button type="button" className={`${buttonClass} ml-3`} onClick={controller.reconnect}>다시 연결</button>
  </div>;
  const self = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId);
  const controlsDisabled = !controller.connected || controller.pending;
  const phaseReady = snapshot.timer.status === 'ACTIVE';
  const copyResult = async () => {
    const names = snapshot.heroResult?.bannedHeroIds.map(id => snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? id);
    const result = [`OWKR 내전 ${snapshot.gameIndex}경기`, `맵: ${snapshot.mapResult?.map.nameKo ?? '미확정'}`,
      snapshot.mapResult?.method === 'POTG' ? `팟지 선택: ${snapshot.participants.find(player => player.discordId === snapshot.mapResult?.selectedByDiscordId)?.displayName ?? '지정 선수'}` : '',
      snapshot.mapResult?.firstAttackTeam ? `첫 공격: ${snapshot.mapResult.firstAttackTeam}팀 / 첫 수비: ${snapshot.mapResult.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '',
      `공통 영웅 밴: ${names?.join(', ') || '선택된 밴 없음'}`,
      ...(['A', 'B'] as const).map(team => `${team}팀 (게임 로비 ${team === 'A' ? 1 : 2}팀): ${snapshot.participants.filter(player => player.team === team).map(player => `${player.displayName}(${ROLE_LABELS[player.role]})`).join(', ')}`),
    ].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(result); setNotice('맵·밴 결과를 복사했습니다.'); }
    catch { setNotice('복사 권한을 확인해 주세요.'); }
  };
  return <div className={`draft-room-panel ${snapshot.ballots?.self || snapshot.phase === 'MAP_PICKING' ? 'draft-room-selecting' : 'space-y-5'}`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
      <div><p className="text-xs text-slate-500">OWKR MATCH CONTROL · {snapshot.gameIndex}경기</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{DRAFT_PHASE_LABELS[snapshot.phase]}</h2>
        <p className="mt-1 text-xs text-slate-400">{snapshot.mapResult?.map.nameKo ?? '맵 선택 전'} · {controller.connected ? '연결됨' : '연결 확인 중 · 입력 중지'} · {STATUS_LABELS[snapshot.timer.status]}</p>
      </div><div className="flex items-center gap-3">{snapshot.isOperator && <button type="button" className={buttonClass} onClick={() => setOperatorOpen(true)}>운영·10인 현황</button>}<DraftCountdown key={`${snapshot.serverNow}`} snapshot={snapshot} /></div>
    </header>
    {(controller.error || notice) && <p role="status" className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">{notice || controller.error}</p>}
    {controller.connectionReplaced && <div className="flex flex-wrap items-center gap-3 border-y border-amber-900 py-3 text-xs text-amber-200">
      <span>다른 창에서 계속 진행하거나, 이 창으로 연결을 가져올 수 있습니다.</span>
      <button type="button" className={buttonClass} onClick={controller.reconnect}>이 창에서 다시 연결</button>
    </div>}
    {self && snapshot.phase === 'LOBBY' && <section className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-800 py-5">
      <div><h3 className="font-semibold text-white">내 팀·역할을 확인해 주세요</h3><p className="mt-2 text-sm text-slate-400">{self.displayName} · {self.team}팀 · {ROLE_LABELS[self.role]} · 준비 {snapshot.readyCount}/10</p>
        <p className="mt-2 text-xs text-slate-500">참가자 전원 마이크 필수 · 팀이 바뀌면 다시 준비합니다.</p></div>
      <button type="button" className={`${buttonClass} border-cyan-600 text-cyan-200`} disabled={controlsDisabled || !snapshot.inputConnected || !phaseReady}
        onClick={() => execute('ready.set', { ready: !snapshot.selfReady })}>{snapshot.selfReady ? '준비 완료 · 취소' : '내 준비 완료'}</button>
    </section>}
    {snapshot.phase === 'LOBBY' && <p className="text-xs text-slate-400">맵 선정: {snapshot.mapSelection.mode === 'VOTE' ? '참가자 투표' : `팟지 · ${snapshot.participants.find(player => player.discordId === snapshot.mapSelection.pickerDiscordId)?.displayName ?? '선수 지정 필요'}`}</p>}
    {snapshot.phase === 'LOBBY' && snapshot.isOperator && <DraftMapSetup key={snapshot.epoch} controller={controller} />}
    {snapshot.phase === 'MAP_PICKING' && <DraftMapPick key={`${snapshot.gameId}:${snapshot.epoch}`} controller={controller} />}
    {snapshot.phase === 'MAP_RESOLVED' && snapshot.mapResult && <section aria-label="확정 맵 확인" className="mx-auto w-full max-w-xl overflow-hidden rounded-md border border-cyan-700 bg-surface-elevated">
      <div className="max-h-48 overflow-hidden"><DraftAsset kind="maps" id={snapshot.mapResult.map.mapId} name={snapshot.mapResult.map.nameKo} /></div>
      <div className="p-4"><h3 className="text-lg font-semibold text-white">{snapshot.mapResult.map.nameKo}</h3>
        <p className="mt-1 text-xs text-slate-400">{snapshot.mapResult.firstAttackTeam ? `첫 공격 ${snapshot.mapResult.firstAttackTeam}팀 · 첫 수비 ${snapshot.mapResult.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '공격·수비 구분 없음'}</p>
        <p className="mt-2 text-xs text-cyan-300">모두 같은 3초 확인 시간을 가진 뒤 영웅 선택을 시작합니다.</p></div>
    </section>}
    {snapshot.ballots?.self && <DraftSelection key={`${snapshot.gameId}:${snapshot.epoch}:${snapshot.stageKind}`} controller={controller} />}
    {snapshot.heroResult && <DraftBanResult key={snapshot.heroResult.resolutionId} snapshot={snapshot} onCopy={() => void copyResult()} />}
    {!snapshot.ballots?.self && !['MAP_PICKING', 'MAP_RESOLVED'].includes(snapshot.phase) && <section aria-label="배정된 팀" className={`grid gap-4 md:grid-cols-2 ${snapshot.heroResult ? 'draft-result-roster' : ''}`}>
      {(['A', 'B'] as const).map(team => <div key={team} className={`border-t-2 pt-3 ${(snapshot.heroResult && snapshot.mapResult?.firstAttackTeam ? snapshot.mapResult.firstAttackTeam === team : team === 'B') ? 'border-red-500' : 'border-blue-500'}`}>
        <h3 className="mb-2 font-semibold">{snapshot.heroResult && snapshot.mapResult?.firstAttackTeam ? snapshot.mapResult.firstAttackTeam === team ? '공격 · ' : '수비 · ' : ''}{team}팀 · 게임 로비 {team === 'A' ? 1 : 2}팀</h3>
        {snapshot.participants.filter(player => player.team === team).map(player => <div key={player.discordId} className="flex items-center justify-between border-b border-slate-800 py-3 text-sm">
          <span>{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</span><span className="text-xs text-slate-400">{ROLE_LABELS[player.role]}</span>
        </div>)}
      </div>)}
    </section>}
    {snapshot.isOperator && operatorOpen && <DraftOperatorDialog onClose={() => setOperatorOpen(false)}><section aria-label="운영 제어" className="border-t border-slate-700 pt-5">
      <h3 className="mb-3 font-semibold">운영 제어</h3><div className="flex flex-wrap gap-2">
        {snapshot.phase === 'LOBBY' && <button type="button" className={buttonClass} disabled={controlsDisabled || !phaseReady}
          onClick={() => execute('draft.start', { remainingMapsConfirmed, diversityExceptionReason })}>10인 준비 검사·밴픽 시작</button>}
        {phaseReady ? <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => {
          const reason = window.prompt('정지 사유를 입력해 주세요.'); if (reason?.trim()) execute('draft.pause', { reason });
        }}>일시정지</button> : (snapshot.timer.status === 'PAUSED' || snapshot.timer.status === 'RECOVERY_PAUSED')
          ? <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('draft.resume')}>명시적으로 재개</button> : null}
        {snapshot.playStatus === 'NOT_STARTED' && snapshot.phase !== 'COMPLETED' && <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => {
          const reason = window.prompt('다시 준비할 사유를 입력해 주세요. 기존 맵·선호·표·밴 결과를 취소하며 이미 공개된 정보는 회수할 수 없습니다.');
          if (reason?.trim()) execute('draft.restart', { reason });
        }}>최신 팀으로 준비 다시 시작</button>}
        {snapshot.phase === 'HERO_RESOLVED' && <button type="button" className={buttonClass} disabled={controlsDisabled || !phaseReady} onClick={() => execute('game.confirmApplied')}>게임 설정 적용 확인</button>}
        {snapshot.phase === 'COMPLETED' && snapshot.playStatus === 'NOT_STARTED' && <>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markStarted')}>실제 경기 시작</button>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markNotPlayed')}>경기 미진행</button></>}
        {snapshot.playStatus === 'PLAYING' && <>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markFinished')}>실제 경기 종료</button>
          <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.markAborted')}>플레이 후 중단</button></>}
        {['FINISHED', 'ABORTED_PLAYED', 'NOT_PLAYED'].includes(snapshot.playStatus) && <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.next')}>다음 경기 · 준비·맵·밴 초기화</button>}
      </div>
      {snapshot.phase === 'LOBBY' && <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>미사용 맵 {snapshot.availableMapCount}개</span>
        {snapshot.mapSelection.mode === 'VOTE' && snapshot.availableMapCount > 0 && snapshot.availableMapCount < 4 && <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" checked={remainingMapsConfirmed} onChange={event => setRemainingMapsConfirmed(event.target.checked)} />남은 맵으로 진행 · 무작위 없음</label>}
        <label className="flex items-center gap-2">모드 다양성 예외 사유 (필요할 때만)
          <input className="min-h-10 rounded border border-slate-700 bg-slate-950 px-2 text-slate-200" maxLength={500}
            value={diversityExceptionReason} onChange={event => setDiversityExceptionReason(event.target.value)} /></label>
      </div>}
      <h3 className="mb-2 mt-6 font-semibold">참가자 현황 · {controller.connected ? `${snapshot.progress?.filter(player => player.connectionStatus === 'CONNECTED').length ?? 0}/10 접속` : '상태 확인 중'}</h3>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-slate-700 text-slate-500"><tr><th className="py-2">참가자</th><th>팀·역할</th><th>접속</th><th>입력 연결</th><th>단계 준비</th></tr></thead>
        <tbody>{snapshot.progress?.map(player => <tr key={player.discordId} className="border-b border-slate-800 text-slate-300">
          <td className="py-3 pr-4">{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</td><td className="pr-4">{player.team} · {ROLE_LABELS[player.role]}</td>
          <td className="pr-4">{!controller.connected ? '확인 중' : ({ CONNECTED: '접속됨', NEVER_JOINED: '미접속', DISCONNECTED: '연결 끊김', CHECKING: '확인 중' }[player.connectionStatus])}</td>
          <td className="pr-4">{controller.connected && player.inputConnected ? '연결됨' : '복구 필요'}</td><td>{snapshot.phase === 'LOBBY' ? player.ready ? '준비 완료' : '미준비' : player.confirmed ? '확정 완료' : '확정 대기'}</td>
        </tr>)}</tbody></table></div>
    </section></DraftOperatorDialog>}
  </div>;
}
