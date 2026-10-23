import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_DRAFT_MAP_CATALOG, DEFAULT_DRAFT_HERO_CATALOG, DEFAULT_DRAFT_TIMINGS, DRAFT_LIMITS, getMapRevealDurationMs, resolveMapVote } from '#domain/draft';
import type { DraftHero, DraftParticipant, DraftPhase, DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftRoomPanel } from './draft-room-panel';
import { DraftParticipantWaiting } from './draft-participant-waiting';
import { DraftEntryHeader } from './draft-entry-header';
import { DraftClosedRoom } from './draft-closed-room';
import { DraftParticipantEntry } from './draft-participant-entry';
import { DraftControlPage } from './draft-control-page';

const screens = [
  ['waiting', '사전 로그인 대기'], ['excluded', '명단 제외'], ['missing', '없는 방'], ['login', '공유 링크 로그인'], ['lobby', '팀 확인·준비'], ['map', '맵 투표'], ['map-test', '맵 추첨 직접 테스트'], ['operator-map', '운영자 맵 투표'], ['operator-ban', '운영자 밴 투표'],
  ['potg', '팟지 선택'], ['potg-waiting', '팟지 대기'], ['map-result', '맵 추첨'], ['operator-map-result', '운영자 맵 추첨'], ['ban', '영웅 밴 투표'], ['result', '맵·밴 결과'], ['operator', '운영자 현황'], ['operator-ready', '10인 준비 완료'], ['operator-result', '운영자 결과'], ['operator-playing', '경기 중 운영'], ['operator-finished', '다음 경기'], ['reconnecting', '연결 복구'], ['replaced', '다른 창 연결'],
] as const;
const participants: DraftParticipant[] = ['하늘', '노을', '바다', '별빛', '새벽', '달빛', '구름', '여울', '이슬', '은하'].map((name, index) => ({
  userSheetId: `example-${index}`, discordId: `example-${index}`, displayName: name,
  team: index < 5 ? 'A' : 'B', role: (['TANK', 'DPS', 'DPS', 'SUPPORT', 'SUPPORT'] as const)[index % 5], slot: index % 5,
}));
const maps = DEFAULT_DRAFT_MAP_CATALOG.entries;
const candidates = ['grimsvotn', 'kings-row', 'ilios'].map(id => maps.find(map => map.mapId === id)!);
const exampleOtherVotes = ['grimsvotn', 'grimsvotn', 'kings-row', 'kings-row', 'kings-row', 'ilios', 'ilios', 'ilios', 'RANDOM'];

function previewMapTotals(selection: readonly string[], otherVotes: readonly string[] = exampleOtherVotes) {
  const votes = [selection[0], ...otherVotes];
  const options = [...candidates.map(map => map.mapId), 'RANDOM'];
  return {
    mapTotals: Object.fromEntries(options.map(id => [id, votes.filter(vote => vote === id).length])),
    mapTeamTotals: Object.fromEntries(options.map(id => [id, {
      A: votes.filter((vote, index) => vote === id && participants[index].team === 'A').length,
      B: votes.filter((vote, index) => vote === id && participants[index].team === 'B').length,
    }])),
  };
}

function exampleSnapshot(screen: string, heroes: readonly DraftHero[]): DraftRoomSnapshot {
  const now = Date.now();
  const score = (heroId: string, points: number) => ({ heroId, role: heroes.find(hero => hero.heroId === heroId)!.role, positiveScore: points, effectiveScore: points, lobbyVoterCount: 2 });
  const phases: Record<string, DraftPhase> = { map: 'MAP_VOTING', 'map-test': 'MAP_VOTING', 'operator-map': 'MAP_VOTING', 'operator-ban': 'HERO_VOTING', potg: 'MAP_PICKING', 'potg-waiting': 'MAP_PICKING', 'map-result': 'MAP_RESOLVED', 'operator-map-result': 'MAP_RESOLVED', ban: 'HERO_VOTING', result: 'HERO_RESOLVED' };
  const phase = phases[screen] ?? (screen === 'operator-result' ? 'HERO_RESOLVED' : ['operator-playing', 'operator-finished'].includes(screen) ? 'COMPLETED' : ['reconnecting', 'replaced'].includes(screen) ? 'HERO_VOTING' : 'LOBBY');
  const stageKind = phase === 'MAP_VOTING' ? 'MAP' : phase === 'HERO_VOTING' ? 'BAN' : null;
  const params = new URLSearchParams(window.location.search);
  const variant = params.get('result');
  const elapsed = Number(params.get('revealAt'));
  const isReveal = phase === 'MAP_RESOLVED';
  const rollDurationMs = isReveal && variant !== 'landslide' ? 3200 : 0;
  const revealDurationMs = rollDurationMs + DRAFT_LIMITS.mapRevealMs;
  const frozenReveal = isReveal && params.has('revealAt') && Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= revealDurationMs;
  const randomMap = maps.find(map => !candidates.some(candidate => candidate.mapId === map.mapId))!;
  const selectedMap = isReveal ? variant === 'random' || variant === 'abstained' ? randomMap : candidates[0] : maps.find(map => map.mapId === 'kings-row')!;
  const self = { discordId: participants[0].discordId, ballotRevision: 1, locked: stageKind === 'MAP' && screen !== 'map-test',
    selection: stageKind === 'MAP' ? screen === 'map-test' ? [] : ['kings-row'] : ['ana', 'widowmaker'] };
  return {
    roomCode: 'EXAMPLE234', gameId: 'example-game', gameIndex: 1, epoch: 1, roomRevision: 1,
    phase, expiresAt: now + 3600000, timer: { phase, status: frozenReveal ? 'PAUSED' : 'ACTIVE', deadlineAt: frozenReveal ? null : isReveal ? now + revealDurationMs : stageKind ? now + (stageKind === 'MAP' ? DEFAULT_DRAFT_TIMINGS.mapVotingSeconds : DEFAULT_DRAFT_TIMINGS.heroVotingSeconds) * 1000 : null, remainingMs: frozenReveal ? revealDurationMs - elapsed : null, expiresAt: now + 3600000, epoch: 1 },
    participants, selfDiscordId: participants[0].discordId, isOperator: screen.startsWith('operator'), selfReady: true, readyCount: screen === 'operator-ready' ? 10 : 8,
    availableMapCount: maps.length, availableMaps: maps, mapSelection: screen.startsWith('potg') ? { mode: 'POTG', pickerDiscordId: participants[screen === 'potg' ? 0 : 1].discordId } : { mode: 'VOTE', pickerDiscordId: null }, inputConnected: true, heroes, stageKind,
    progress: participants.map((player, index) => ({ ...player, connectionStatus: screen === 'operator-ready' ? 'CONNECTED' : index === 8 ? 'DISCONNECTED' : index === 9 ? 'NEVER_JOINED' : 'CONNECTED',
      inputConnected: screen === 'operator-ready' || index < 8, ready: screen === 'operator-ready' || index < 8, confirmed: index < 6, lastJoinedAt: index < 9 ? now : null, lastDisconnectedAt: index === 8 ? now : null })),
    candidates: { resolutionId: 'example-map', catalogVersion: 'example', mapHistoryRevision: 1, eligiblePool: maps,
      candidates: candidates.map(map => ({ map, firstAttackTeam: map.mode === 'CONTROL' ? null : 'A' })), randomPool: maps.filter(map => !candidates.some(candidate => candidate.mapId === map.mapId)), remainingMapsConfirmed: false, diversityExceptionReason: null, draws: [] },
    mapResult: ['MAP_RESOLVED', 'HERO_VOTING', 'HERO_RESOLVED', 'COMPLETED'].includes(phase)
      ? { resolutionId: 'example-map', method: variant === 'landslide' ? 'LANDSLIDE' : variant === 'abstained' ? 'ALL_ABSTAINED' : 'WEIGHTED',
        selectedOption: variant === 'abstained' ? null : variant === 'random' ? 'RANDOM' : selectedMap.mapId,
        totals: variant === 'abstained' ? {} : variant === 'landslide' ? { grimsvotn: 8, 'kings-row': 2, ilios: 0, RANDOM: 0 } : { 'kings-row': 4, ilios: 3, grimsvotn: 2, RANDOM: 1 },
        map: selectedMap, firstAttackTeam: selectedMap.mode === 'ESCORT' || selectedMap.mode === 'HYBRID' ? 'A' : null, draws: [], rollDurationMs } : null,
    heroResult: ['HERO_RESOLVED', 'COMPLETED'].includes(phase) ? { resolutionId: 'example-ban', catalogVersion: 'example', firstTeam: 'A', scores: { A: [score('ana', 19), score('sombra', 8)], B: [score('widowmaker', 17), score('dva', 12)] },
      slots: [{ team: 'A', heroId: 'ana', skipped: [] }, { team: 'B', heroId: 'widowmaker', skipped: [] }, { team: 'B', heroId: 'dva', skipped: [] }, { team: 'A', heroId: 'sombra', skipped: [] }], bannedHeroIds: ['ana', 'widowmaker', 'dva', 'sombra'], roleCounts: { TANK: 1, DPS: 1, SUPPORT: 2 }, draws: [] } : null,
    ballots: stageKind ? { self, teammates: stageKind === 'MAP' ? [] : participants.slice(0, 5).map((player, index) => ({
      ...self, discordId: player.discordId, locked: index > 0, selection: index === 0 ? self.selection : stageKind === 'BAN' ? [['ana', 'dva', 'sombra'], ['widowmaker', 'dva', 'ana'], ['genji', 'tracer', 'sombra'], ['dva', 'widowmaker', 'ana'], ['ana', 'sombra', 'genji']][index] : [(['reinhardt', 'genji', 'tracer', 'kiriko', 'juno'])[index]],
    })), confirmedCounts: { A: 4, B: 3 }, ...(stageKind === 'MAP' ? previewMapTotals(self.selection) : { mapTotals: null }) } : null,
    playStatus: screen === 'operator-playing' ? 'PLAYING' : screen === 'operator-finished' ? 'FINISHED' : 'NOT_STARTED', serverNow: now,
  };
}

/** @description 로컬 개발에서 실제 컴포넌트를 가상 데이터로 확인하며 서버 명령이나 인증 요청은 보내지 않는다. */
function DraftPreviewContent({ heroes }: { heroes: readonly DraftHero[] }) {
  const screen = new URLSearchParams(window.location.search).get('screen') ?? 'login';
  const initial = useMemo(() => exampleSnapshot(screen, heroes), [screen, heroes]);
  const [snapshot, setSnapshot] = useState(initial);
  const [otherVotes, setOtherVotes] = useState<readonly string[]>(exampleOtherVotes);
  const testReveal = (variant: 'vote' | 'random' | 'landslide' | 'abstained') => {
    const now = Date.now();
    const entropy = Array.from(crypto.getRandomValues(new Uint32Array(64)), value => value / 4294967296);
    if (variant === 'random') entropy[0] = 0.99;
    const candidateSnapshot = { ...initial.candidates!, resolutionId: `preview-${now}-${entropy[1]}` };
    const ownChoice = snapshot.stageKind === 'MAP' ? snapshot.ballots?.self?.selection[0] ?? null : null;
    const votes = variant === 'abstained' ? Array<string | null>(10).fill(null)
      : variant === 'landslide' ? Array<string | null>(10).fill('kings-row')
      : variant === 'vote' ? [ownChoice, ...otherVotes]
      : ['grimsvotn', 'grimsvotn', 'kings-row', 'kings-row', 'kings-row', 'ilios', 'ilios', 'ilios', 'RANDOM', variant === 'random' ? 'RANDOM' : ownChoice];
    const mapResult = resolveMapVote(candidateSnapshot, votes, 1, entropy);
    setSnapshot(previous => ({ ...previous, epoch: previous.epoch + 1, phase: 'MAP_RESOLVED', stageKind: null,
      ballots: null, candidates: candidateSnapshot, mapResult, heroResult: null, serverNow: now,
      timer: { ...previous.timer, phase: 'MAP_RESOLVED', status: 'ACTIVE', deadlineAt: now + getMapRevealDurationMs(mapResult), remainingMs: null } }));
  };
  useEffect(() => {
    if (snapshot.phase !== 'MAP_RESOLVED' || !snapshot.timer.deadlineAt) return;
    const timeout = setTimeout(() => setSnapshot(previous => ({ ...exampleSnapshot('ban', heroes), mapResult: previous.mapResult, mapSelection: previous.mapSelection })), Math.max(0, snapshot.timer.deadlineAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [snapshot.phase, snapshot.timer.deadlineAt, heroes]);
  const controller: DraftRoomController = { snapshot, connected: !['reconnecting', 'replaced'].includes(screen), connectionReplaced: screen === 'replaced', reconnecting: screen === 'reconnecting', pending: false, error: '', reconnect: () => {},
    command: async (type, values) => {
      if (type === 'map.configure') setSnapshot(previous => ({ ...previous, epoch: previous.epoch + 1,
        mapSelection: { mode: values?.mapMode === 'POTG' ? 'POTG' : 'VOTE', pickerDiscordId: typeof values?.pickerDiscordId === 'string' ? values.pickerDiscordId : null },
        progress: previous.progress?.map(player => ({ ...player, ready: player.connectionStatus === 'CONNECTED' && player.inputConnected })) }));
      if (type === 'map.pick') setSnapshot(previous => {
        const map = maps.find(entry => entry.mapId === values?.mapId)!; const now = Date.now();
        return { ...previous, phase: 'MAP_RESOLVED', serverNow: now, timer: { ...previous.timer, phase: 'MAP_RESOLVED', deadlineAt: now + DRAFT_LIMITS.mapRevealMs },
          mapResult: { resolutionId: 'example-potg', method: 'POTG', selectedOption: map.mapId, selectedByDiscordId: previous.selfDiscordId, totals: {}, map, firstAttackTeam: map.mode === 'ESCORT' || map.mode === 'HYBRID' ? 'A' : null, draws: [] } };
      });
      if (type === 'ready.set') setSnapshot(previous => {
        const ready = values?.ready === true;
        return { ...previous, selfReady: ready, readyCount: previous.readyCount + Number(ready) - Number(previous.selfReady),
          progress: previous.progress?.map(player => player.discordId === previous.selfDiscordId ? { ...player, ready } : player) };
      });
      if (type === 'draft.start') setSnapshot(previous => ({ ...exampleSnapshot(previous.mapSelection.mode === 'POTG' ? 'potg' : 'map', heroes),
        isOperator: previous.isOperator, gameIndex: previous.gameIndex, mapSelection: previous.mapSelection }));
      if (type === 'map.swapSides') setSnapshot(previous => ({ ...previous, mapResult: previous.mapResult && { ...previous.mapResult, firstAttackTeam: previous.mapResult.firstAttackTeam === 'A' ? 'B' : 'A' } }));
      if (type === 'game.confirmApplied') setSnapshot(previous => ({ ...previous, phase: 'COMPLETED' }));
      if (type === 'game.markStarted') setSnapshot(previous => ({ ...previous, playStatus: 'PLAYING' }));
      if (type === 'game.markFinished') setSnapshot(previous => ({ ...previous, playStatus: 'FINISHED' }));
      if (type === 'game.next') setSnapshot(previous => ({ ...exampleSnapshot('operator', heroes), gameIndex: previous.gameIndex + 1,
        selfReady: true, readyCount: previous.readyCount, previousGame: previous.mapResult && previous.heroResult ? { gameIndex: previous.gameIndex, map: previous.mapResult.map, firstAttackTeam: previous.mapResult.firstAttackTeam, bans: previous.heroResult.bannedHeroIds.map(id => heroes.find(hero => hero.heroId === id)!) } : undefined,
        progress: previous.progress?.map(player => ({ ...player, ready: player.connectionStatus === 'CONNECTED' && player.inputConnected, confirmed: false })) }));
      if ((type === 'ballot.save' || type === 'ballot.lock') && Array.isArray(values?.selection)) {
        const selection = values.selection.filter((value): value is string => typeof value === 'string');
        setSnapshot(previous => ({ ...previous, ballots: previous.ballots && { ...previous.ballots,
          ...(previous.stageKind === 'MAP' ? previewMapTotals(selection, otherVotes) : {}),
          self: previous.ballots.self && { ...previous.ballots.self, ballotRevision: previous.ballots.self.ballotRevision + 1,
            selection, locked: type === 'ballot.lock' || selection.filter(Boolean).length === (previous.stageKind === 'BAN' ? 3 : 1) } } }));
      }
    } };
  const entryScreen = ['login', 'waiting', 'excluded', 'missing'].includes(screen);
  return <main className={`draft-preview app-canvas bg-surface text-slate-200 ${entryScreen ? 'draft-entry-page' : ''}`}>
    <div className={`draft-preview-content mx-auto w-full ${screen.startsWith('operator') ? 'app-workspace draft-control-workspace' : ''} ${entryScreen ? 'draft-entry-content' : ''}`}>
      <details className="draft-preview-navigation mb-3 text-xs text-slate-500"><summary className="cursor-pointer py-1">개발용 예제 · 가상 참가자 · 실제 내전 아님</summary>
      <nav aria-label="예제 단계" className="my-3 flex flex-wrap gap-2">{screens.map(([id, label]) => <a key={id} href={`?screen=${id}`}
        className={`rounded border px-3 py-2 text-xs ${screen === id ? 'border-cyan-500 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>{label}</a>)}</nav></details>
      {entryScreen && <DraftEntryHeader />}
      {screen === 'map-test' && <section className="mb-3 shrink-0 border-y border-cyan-900 py-3" aria-label="로컬 맵 추첨 테스트">
        <p className="text-sm font-semibold text-cyan-200">맵 추첨 테스트 · 실제 내전과 연결되지 않습니다</p>
        <p className="mt-1 text-xs text-slate-400">맵을 선택한 뒤 추첨을 시작하세요. 2.5~4초 추첨 → 확정 맵 하나를 4초 확인 → 밴 투표 순서로 진행합니다.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-xs" onClick={() => testReveal('vote')}>투표 종료·추첨 보기</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => testReveal('random')}>무작위 당첨 테스트</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => testReveal('landslide')}>압도적 득표 테스트</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => testReveal('abstained')}>전원 기권 테스트</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => {
            const votes = [...Array<string>(7).fill(candidates[0].mapId), ...Array<string>(2).fill(candidates[1].mapId)];
            setOtherVotes(votes);
            const view = exampleSnapshot('map-test', heroes);
            setSnapshot(previous => ({ ...view, epoch: previous.epoch + 1,
              ballots: { ...view.ballots!, ...previewMapTotals([], votes) } }));
          }}>압승 경계 테스트 · 첫 맵 선택·해제</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => { setOtherVotes(exampleOtherVotes); setSnapshot(exampleSnapshot('map-test', heroes)); }}>다시 투표</button>
        </div>
      </section>}
      {screen === 'waiting' || screen === 'excluded' ? <DraftParticipantWaiting admission={{ status: screen === 'waiting' ? 'WAITING' : 'EXCLUDED', displayName: '하늘', participantCount: screen === 'waiting' ? 4 : 10 }} error="" login={() => {}} /> : screen === 'missing' ? <DraftClosedRoom reason="ROOM_EXPIRED" /> : screen === 'login' ? <DraftParticipantEntry pending={false} error="" login={() => {}} reconnect={() => {}} /> : screen.startsWith('operator')
        ? <DraftControlPage controller={controller} onMatching={() => {}} /> : <DraftRoomPanel controller={controller} />}
      <footer className="mt-2 shrink-0 text-center text-[10px] text-slate-600">Overwatch © Blizzard Entertainment · 개발용 미리보기</footer>
    </div>
  </main>;
}


export function DraftPreviewPage() {
  return <DraftPreviewContent heroes={DEFAULT_DRAFT_HERO_CATALOG.entries} />;
}
