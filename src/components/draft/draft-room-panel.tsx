import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';

const DRAFT_PHASE_LABELS: Record<DraftRoomSnapshot['phase'], string> = {
  LOBBY: '팀 확인·준비', MAP_VOTING: '맵 투표', MAP_RESOLVED: '선택 맵 확인',
  HERO_PREFERENCE: '선호 영웅', HERO_VOTING: '영웅 밴 투표', HERO_RESOLVED: '맵·밴 결과', COMPLETED: '게임 설정 적용 완료',
};
const ROLE_LABELS = { TANK: '탱커', DPS: '공격', SUPPORT: '지원' } as const;
const STATUS_LABELS = { ACTIVE: '진행 가능', PAUSED: '일시정지', RECOVERY_PAUSED: '서버 복구 · 재개 필요',
  ROSTER_CHANGED: '팀 변경 · 다시 준비 필요', CANCELLED: '취소됨', EXPIRED: '만료됨' } as const;
const buttonClass = 'min-h-10 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-40';

function DraftAsset({ kind, id, name }: { kind: 'heroes' | 'maps'; id: string; name: string }) {
  const { data } = useQuery({ queryKey: ['draft-asset-manifest'], queryFn: async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}draft-assets/manifest.json`);
    if (!response.ok) throw new Error('이미지 목록을 불러오지 못했습니다.');
    return response.json() as Promise<{ assets: { kind: string; id: string; localPath: string }[] }>;
  }, staleTime: Infinity, retry: 1 });
  const source = data?.assets.find(asset => asset.kind === kind && asset.id === id)?.localPath;
  return <div className={`relative overflow-hidden bg-slate-900 ${kind === 'heroes' ? 'aspect-square' : 'aspect-video'}`}>
    <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-slate-500">{name}</span>
    {(source?.startsWith('/draft-assets/maps/') || source?.startsWith('/hero/')) && <img src={`${import.meta.env.BASE_URL}${source.slice(1)}`} alt="" loading="lazy"
      className="relative h-full w-full object-cover" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
  </div>;
}

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

function DraftSelection({ controller }: { controller: DraftRoomController }) {
  const snapshot = controller.snapshot!;
  const self = snapshot.ballots?.self;
  const [selection, setSelection] = useState<string[]>(() => [...(self?.selection ?? [])]);
  const [activeRank, setActiveRank] = useState(0);
  const [message, setMessage] = useState('');
  if (!self) return null;
  const limit = snapshot.stageKind === 'BAN' ? 3 : 1;
  const disabled = !controller.connected || controller.pending || self.locked || !snapshot.inputConnected
    || snapshot.timer.status !== 'ACTIVE';
  const submit = (lock: boolean) => {
    setMessage('');
    void controller.command(lock ? 'ballot.lock' : 'ballot.save', { selection }).then(() => {
      setMessage(lock ? '서버가 최종 선택을 승인했습니다.' : '서버에 선택을 저장했습니다. 아직 확정하지 않았습니다.');
    }).catch(error => setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'));
  };
  const pickHero = (id: string) => {
    if (disabled) return;
    if (selection.includes(id)) { setSelection(selection.filter(hero => hero !== id)); return; }
    const next = [...selection];
    next[Math.min(activeRank, next.length, limit - 1)] = id;
    setSelection(next); setActiveRank(Math.min(next.length, limit - 1));
  };
  const saved = JSON.stringify(selection) === JSON.stringify(self.selection);
  const preferredHero = snapshot.stageKind === 'PREFERENCE' ? snapshot.heroes.find(hero => hero.heroId === selection[0]) : null;
  const assignedRole = snapshot.participants.find(player => player.discordId === snapshot.selfDiscordId)?.role;
  return <section className="grid min-w-0 gap-5 xl:grid-cols-[180px_minmax(0,1fr)_230px]" aria-label="내 투표">
    <aside className="border-b border-slate-800 pb-4 xl:border-b-0 xl:border-r xl:pr-4">
      <h2 className="mb-3 font-semibold text-slate-100">우리 팀</h2>
      {snapshot.participants.filter(player => player.team === snapshot.participants.find(p => p.discordId === snapshot.selfDiscordId)?.team).map(player => {
        const ballot = snapshot.ballots?.teammates.find(entry => entry.discordId === player.discordId);
        return <div key={player.discordId} className="border-b border-slate-800 py-3 text-sm">
          <p className="break-all text-slate-200">{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</p>
          <p className="mt-1 text-xs text-slate-500">{ROLE_LABELS[player.role]} · {ballot?.locked ? '확정 완료' : '확정 대기'}</p>
          {ballot?.selection.length ? <p className="mt-1 text-xs text-cyan-200">{ballot.selection.map(id => snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? id).join(' · ')}</p> : null}
        </div>;
      })}
    </aside>
    <div className="min-w-0">
      {snapshot.stageKind === 'MAP' ? <>
        <h2 className="mb-3 text-lg font-semibold">플레이할 맵에 투표하세요</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.candidates?.candidates.map(option => <button key={option.map.mapId} type="button" disabled={disabled}
            aria-pressed={selection[0] === option.map.mapId} className={`${buttonClass} overflow-hidden p-0 text-left ${selection[0] === option.map.mapId ? 'border-cyan-300 ring-1 ring-cyan-300' : ''}`}
            onClick={() => setSelection([option.map.mapId])}>
            <DraftAsset kind="maps" id={option.map.mapId} name={option.map.nameKo} />
            <span className="block px-3 py-2 font-semibold">{option.map.nameKo}</span>
            <span className="block px-3 pb-3 text-xs text-slate-400">{option.firstAttackTeam ? `첫 공격 ${option.firstAttackTeam}팀 · 첫 수비 ${option.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '공격·수비 구분 없음'}</span>
            <span className="block px-3 pb-3 text-xs text-cyan-300">{snapshot.ballots?.mapTotals?.[option.map.mapId] ?? 0}표</span>
          </button>)}
        </div>
        {!!snapshot.candidates?.randomPool.length && <button type="button" className={`${buttonClass} mt-3 w-full`} disabled={disabled}
          aria-pressed={selection[0] === 'RANDOM'} onClick={() => setSelection(['RANDOM'])}>
          {selection[0] === 'RANDOM' ? '선택됨 · ' : ''}무작위 · 사용한 맵 제외 ({snapshot.ballots?.mapTotals?.RANDOM ?? 0}표)
        </button>}
      </> : <>
        <h2 className="text-lg font-semibold">{snapshot.stageKind === 'PREFERENCE' ? '선호 영웅을 선택하세요' : '밴하고 싶은 영웅을 순서대로 선택하세요'}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">{snapshot.stageKind === 'PREFERENCE'
          ? '내 역할 외 영웅도 선택할 수 있습니다. 같은 팀의 영웅 점수에서 한 번만 3점을 차감합니다.'
          : '1순위 7점 · 2순위 5점 · 3순위 3점. 영웅을 다시 누르면 해제합니다.'}</p>
        {(['TANK', 'DPS', 'SUPPORT'] as const).map(role => <div key={role} className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{ROLE_LABELS[role]}</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {snapshot.heroes.filter(hero => hero.role === role).map(hero => <button key={hero.heroId} type="button" disabled={disabled}
              aria-pressed={selection.includes(hero.heroId)} onClick={() => pickHero(hero.heroId)}
              className={`relative min-w-0 overflow-hidden rounded border text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50 ${selection.includes(hero.heroId) ? 'border-cyan-300 ring-1 ring-cyan-300' : 'border-slate-700 hover:border-slate-400'}`}>
              <DraftAsset kind="heroes" id={hero.heroId} name={hero.nameKo} />
              <span className="block truncate bg-slate-950 px-1 py-1.5 text-center text-[10px] sm:text-xs">{hero.nameKo}</span>
              {selection.includes(hero.heroId) && <span className="absolute right-1 top-1 rounded bg-cyan-300 px-1.5 text-xs font-bold text-slate-950">{selection.indexOf(hero.heroId) + 1}</span>}
            </button>)}
          </div>
        </div>)}
      </>}
    </div>
    <aside className="border-t border-slate-800 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
      <h2 className="font-semibold">내 {snapshot.stageKind === 'BAN' ? '밴 순위' : '선택'}</h2>
      {preferredHero && assignedRole !== preferredHero.role && <p className="mt-2 text-xs leading-5 text-amber-300">배정 역할과 다른 영웅을 선호로 선택했습니다. 팀 역할은 변경되지 않습니다.</p>}
      {Array.from({ length: limit }, (_, index) => <div key={index} className="mt-2 border-b border-slate-800 py-2">
        <button type="button" disabled={disabled} className={`${buttonClass} w-full text-left ${activeRank === index ? 'border-cyan-500' : ''}`} onClick={() => setActiveRank(index)}>
          {snapshot.stageKind === 'BAN' ? `${index + 1}순위 · ` : ''}{selection[index] ? snapshot.heroes.find(hero => hero.heroId === selection[index])?.nameKo
            ?? snapshot.candidates?.candidates.find(option => option.map.mapId === selection[index])?.map.nameKo
            ?? (selection[index] === 'RANDOM' ? '무작위' : selection[index]) : '선택 없음'}
        </button>
        {selection[index] && <div className="mt-1 flex gap-1">
          <button type="button" className="min-h-9 px-2 text-xs text-slate-400" disabled={disabled} onClick={() => setSelection(selection.filter((_, slot) => slot !== index))}>{index + 1}번 해제</button>
          {index > 0 && <button type="button" className="min-h-9 px-2 text-xs text-cyan-300" disabled={disabled} onClick={() => {
            const next = [...selection]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSelection(next);
          }}>{index + 1}순위 위로</button>}
        </div>}
      </div>)}
      <p className="my-3 text-xs leading-5 text-slate-400" role="status">{self.locked ? '확정 완료 · 변경할 수 없습니다.' : controller.pending ? '서버 승인 대기 중…' : saved ? '저장된 선택과 같습니다.' : '아직 저장하지 않은 선택입니다.'}</p>
      <div className="grid gap-2">
        <button type="button" className={buttonClass} disabled={disabled} onClick={() => setSelection([])}>선택 초기화</button>
        <button type="button" className={buttonClass} disabled={disabled} onClick={() => submit(false)}>선택 저장</button>
        <button type="button" className={`${buttonClass} border-cyan-500 bg-cyan-500/15 font-semibold text-cyan-200`} disabled={disabled} onClick={() => submit(true)}>
          {self.locked ? '확정 완료' : selection.length ? '선택 확정 · 준비' : '기권 확정 · 준비'}
        </button>
      </div>
      {message && <p className="mt-3 text-xs leading-5 text-slate-300" role="status">{message}</p>}
    </aside>
  </section>;
}

export function DraftRoomPanel({ controller }: { controller: DraftRoomController }) {
  const snapshot = controller.snapshot;
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
      snapshot.mapResult?.firstAttackTeam ? `첫 공격: ${snapshot.mapResult.firstAttackTeam}팀 / 첫 수비: ${snapshot.mapResult.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '',
      `공통 영웅 밴: ${names?.join(', ') || '선택된 밴 없음'}`,
      ...(['A', 'B'] as const).map(team => `${team}팀 (게임 로비 ${team === 'A' ? 1 : 2}팀): ${snapshot.participants.filter(player => player.team === team).map(player => `${player.displayName}(${ROLE_LABELS[player.role]})`).join(', ')}`),
    ].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(result); setNotice('맵·밴 결과를 복사했습니다.'); }
    catch { setNotice('복사 권한을 확인해 주세요.'); }
  };
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
      <div><p className="text-xs text-slate-500">OWKR MATCH CONTROL · {snapshot.gameIndex}경기</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{DRAFT_PHASE_LABELS[snapshot.phase]}</h2>
        <p className="mt-1 text-xs text-slate-400">{snapshot.mapResult?.map.nameKo ?? '맵 선택 전'} · {controller.connected ? '연결됨' : '연결 확인 중 · 입력 중지'} · {STATUS_LABELS[snapshot.timer.status]}</p>
      </div><DraftCountdown key={`${snapshot.serverNow}`} snapshot={snapshot} />
    </header>
    {(controller.error || notice) && <p role="status" className="border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">{notice || controller.error}</p>}
    {self && snapshot.phase === 'LOBBY' && <section className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-800 py-5">
      <div><h3 className="font-semibold text-white">내 팀·역할을 확인해 주세요</h3><p className="mt-2 text-sm text-slate-400">{self.displayName} · {self.team}팀 · {ROLE_LABELS[self.role]} · 준비 {snapshot.readyCount}/10</p>
        <p className="mt-2 text-xs text-slate-500">참가자 전원 마이크 필수 · 팀이 바뀌면 다시 준비합니다.</p></div>
      <button type="button" className={`${buttonClass} border-cyan-600 text-cyan-200`} disabled={controlsDisabled || !snapshot.inputConnected || !phaseReady}
        onClick={() => execute('ready.set', { ready: !snapshot.selfReady })}>{snapshot.selfReady ? '준비 완료 · 취소' : '내 준비 완료'}</button>
    </section>}
    {snapshot.ballots?.self && <DraftSelection key={`${snapshot.gameId}:${snapshot.epoch}:${snapshot.stageKind}`} controller={controller} />}
    {snapshot.heroResult && <section aria-label="최종 영웅 밴" className="border-y border-slate-700 py-5">
      <div className="mb-4 flex items-center justify-between"><div><h3 className="font-semibold">공통 영웅 밴 · {snapshot.heroResult.bannedHeroIds.length}/4</h3>
        <p className="mt-2 text-xs text-slate-400">{snapshot.mapResult?.map.nameKo} · {snapshot.mapResult?.firstAttackTeam ? `첫 공격 ${snapshot.mapResult.firstAttackTeam}팀 · 첫 수비 ${snapshot.mapResult.firstAttackTeam === 'A' ? 'B' : 'A'}팀` : '공격·수비 구분 없음'}</p></div>
        <button type="button" className={buttonClass} onClick={() => void copyResult()}>맵·밴 결과 복사</button></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{snapshot.heroResult.bannedHeroIds.map(id => <div key={id} className="overflow-hidden rounded border border-red-900">
        <DraftAsset kind="heroes" id={id} name={snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? id} />
        <p className="bg-red-950/40 p-2 text-center text-sm">{snapshot.heroes.find(hero => hero.heroId === id)?.nameKo ?? id} · 밴</p>
      </div>)}</div>{!snapshot.heroResult.bannedHeroIds.length && <p className="text-sm text-slate-400">선택된 밴 없음</p>}
      <p className="mt-4 text-xs text-slate-500">운영자가 게임의 맵·팀·진영·밴을 직접 적용해야 합니다.</p>
    </section>}
    {!snapshot.ballots?.self && <section aria-label="배정된 팀" className="grid gap-6 md:grid-cols-2">
      {(['A', 'B'] as const).map(team => <div key={team} className={`border-t-2 pt-3 ${team === 'A' ? 'border-blue-500' : 'border-red-500'}`}>
        <h3 className="mb-2 font-semibold">{team}팀 · 게임 로비 {team === 'A' ? 1 : 2}팀</h3>
        {snapshot.participants.filter(player => player.team === team).map(player => <div key={player.discordId} className="flex items-center justify-between border-b border-slate-800 py-3 text-sm">
          <span>{player.displayName}{player.discordId === snapshot.selfDiscordId ? ' (나)' : ''}</span><span className="text-xs text-slate-400">{ROLE_LABELS[player.role]}</span>
        </div>)}
      </div>)}
    </section>}
    {snapshot.isOperator && <section aria-label="운영 제어" className="border-t border-slate-700 pt-5">
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
        {['FINISHED', 'ABORTED_PLAYED', 'NOT_PLAYED'].includes(snapshot.playStatus) && <button type="button" className={buttonClass} disabled={controlsDisabled} onClick={() => execute('game.next')}>같은 방 다음 경기</button>}
      </div>
      {snapshot.phase === 'LOBBY' && <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>미사용 맵 {snapshot.availableMapCount}개</span>
        {snapshot.availableMapCount > 0 && snapshot.availableMapCount < 4 && <label className="flex min-h-10 items-center gap-2">
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
    </section>}
  </div>;
}
