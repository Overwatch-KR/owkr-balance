import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_DRAFT_MAP_CATALOG, DEFAULT_DRAFT_HERO_CATALOG, DEFAULT_DRAFT_TIMINGS } from '#domain/draft';
import type { DraftHero, DraftParticipant, DraftPhase, DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { DraftRoomPanel } from './draft-room-panel';
import { DraftParticipantEntry } from './draft-participant-entry';
import { DraftControlPage } from './draft-control-page';

const screens = [
  ['login', '공유 링크 로그인'], ['lobby', '팀 확인·준비'], ['map', '맵 투표'], ['operator-map', '운영자 맵 투표'], ['operator-ban', '운영자 밴 투표'],
  ['potg', '팟지 선택'], ['potg-waiting', '팟지 대기'], ['map-result', '맵 확인 3초'], ['ban', '영웅 밴 투표'], ['result', '맵·밴 결과'], ['operator', '운영자 현황'], ['operator-ready', '10인 준비 완료'], ['operator-result', '운영자 결과'], ['operator-playing', '경기 중 운영'], ['operator-finished', '다음 경기'], ['reconnecting', '연결 복구'], ['replaced', '다른 창 연결'],
] as const;
const participants: DraftParticipant[] = ['하늘', '노을', '바다', '별빛', '새벽', '달빛', '구름', '여울', '이슬', '은하'].map((name, index) => ({
  userSheetId: `example-${index}`, discordId: `example-${index}`, displayName: name,
  team: index < 5 ? 'A' : 'B', role: (['TANK', 'DPS', 'DPS', 'SUPPORT', 'SUPPORT'] as const)[index % 5], slot: index % 5,
}));
const maps = DEFAULT_DRAFT_MAP_CATALOG.entries;
const candidates = ['grimsvotn', 'kings-row', 'ilios'].map(id => maps.find(map => map.mapId === id)!);

function exampleSnapshot(screen: string, heroes: readonly DraftHero[]): DraftRoomSnapshot {
  const now = Date.now();
  const score = (heroId: string, points: number) => ({ heroId, role: heroes.find(hero => hero.heroId === heroId)!.role, positiveScore: points, effectiveScore: points, lobbyVoterCount: 2 });
  const phases: Record<string, DraftPhase> = { map: 'MAP_VOTING', 'operator-map': 'MAP_VOTING', 'operator-ban': 'HERO_VOTING', potg: 'MAP_PICKING', 'potg-waiting': 'MAP_PICKING', 'map-result': 'MAP_RESOLVED', ban: 'HERO_VOTING', result: 'HERO_RESOLVED' };
  const phase = phases[screen] ?? (screen === 'operator-result' ? 'HERO_RESOLVED' : ['operator-playing', 'operator-finished'].includes(screen) ? 'COMPLETED' : ['reconnecting', 'replaced'].includes(screen) ? 'HERO_VOTING' : 'LOBBY');
  const stageKind = phase === 'MAP_VOTING' ? 'MAP' : phase === 'HERO_VOTING' ? 'BAN' : null;
  const self = { discordId: participants[0].discordId, ballotRevision: 1, locked: false,
    selection: stageKind === 'MAP' ? ['kings-row'] : ['ana', 'widowmaker'] };
  return {
    roomCode: 'EXAMPLE234', gameId: 'example-game', gameIndex: 1, epoch: 1, roomRevision: 1,
    phase, expiresAt: now + 3600000, timer: { phase, status: 'ACTIVE', deadlineAt: phase === 'MAP_RESOLVED' ? now + 3000 : stageKind ? now + (stageKind === 'MAP' ? DEFAULT_DRAFT_TIMINGS.mapVotingSeconds : DEFAULT_DRAFT_TIMINGS.heroVotingSeconds) * 1000 : null, remainingMs: null, expiresAt: now + 3600000, epoch: 1 },
    participants, selfDiscordId: participants[0].discordId, isOperator: screen.startsWith('operator'), selfReady: true, readyCount: screen === 'operator-ready' ? 10 : 8,
    availableMapCount: maps.length, availableMaps: maps, mapSelection: screen.startsWith('potg') ? { mode: 'POTG', pickerDiscordId: participants[screen === 'potg' ? 0 : 1].discordId } : { mode: 'VOTE', pickerDiscordId: null }, inputConnected: true, heroes, stageKind,
    progress: participants.map((player, index) => ({ ...player, connectionStatus: screen === 'operator-ready' ? 'CONNECTED' : index === 8 ? 'DISCONNECTED' : index === 9 ? 'NEVER_JOINED' : 'CONNECTED',
      inputConnected: screen === 'operator-ready' || index < 8, ready: screen === 'operator-ready' || index < 8, confirmed: index < 6, lastJoinedAt: index < 9 ? now : null, lastDisconnectedAt: index === 8 ? now : null })),
    candidates: { resolutionId: 'example-map', catalogVersion: 'example', mapHistoryRevision: 1, eligiblePool: maps,
      candidates: candidates.map(map => ({ map, firstAttackTeam: map.mode === 'CONTROL' ? null : 'A' })), randomPool: maps.filter(map => !candidates.some(candidate => candidate.mapId === map.mapId)), remainingMapsConfirmed: false, diversityExceptionReason: null, draws: [] },
    mapResult: ['MAP_RESOLVED', 'HERO_VOTING', 'HERO_RESOLVED', 'COMPLETED'].includes(phase)
      ? { resolutionId: 'example-map', method: 'WEIGHTED', selectedOption: screen === 'map-result' ? 'grimsvotn' : 'kings-row', totals: { 'kings-row': 4, ilios: 3, 'circuit-royal': 2, RANDOM: 1 }, map: maps.find(map => map.mapId === (screen === 'map-result' ? 'grimsvotn' : 'kings-row'))!, firstAttackTeam: 'A', draws: [] } : null,
    heroResult: ['HERO_RESOLVED', 'COMPLETED'].includes(phase) ? { resolutionId: 'example-ban', catalogVersion: 'example', firstTeam: 'A', scores: { A: [score('ana', 19), score('sombra', 8)], B: [score('widowmaker', 17), score('dva', 12)] },
      slots: [{ team: 'A', heroId: 'ana', skipped: [] }, { team: 'B', heroId: 'widowmaker', skipped: [] }, { team: 'B', heroId: 'dva', skipped: [] }, { team: 'A', heroId: 'sombra', skipped: [] }], bannedHeroIds: ['ana', 'widowmaker', 'dva', 'sombra'], roleCounts: { TANK: 1, DPS: 1, SUPPORT: 2 }, draws: [] } : null,
    ballots: stageKind ? { self, teammates: stageKind === 'MAP' ? [] : participants.slice(0, 5).map((player, index) => ({
      ...self, discordId: player.discordId, locked: index > 0, selection: index === 0 ? self.selection : stageKind === 'BAN' ? [['ana', 'dva', 'sombra'], ['widowmaker', 'dva', 'ana'], ['genji', 'tracer', 'sombra'], ['dva', 'widowmaker', 'ana'], ['ana', 'sombra', 'genji']][index] : [(['reinhardt', 'genji', 'tracer', 'kiriko', 'juno'])[index]],
    })), confirmedCounts: { A: 4, B: 3 }, mapTotals: stageKind === 'MAP' ? { 'kings-row': 4, ilios: 3, 'circuit-royal': 2, RANDOM: 1 } : null } : null,
    playStatus: screen === 'operator-playing' ? 'PLAYING' : screen === 'operator-finished' ? 'FINISHED' : 'NOT_STARTED', serverNow: now,
  };
}

/** @description 로컬 개발에서 실제 컴포넌트를 가상 데이터로 확인하며 서버 명령이나 인증 요청은 보내지 않는다. */
function DraftPreviewContent({ heroes }: { heroes: readonly DraftHero[] }) {
  const screen = new URLSearchParams(window.location.search).get('screen') ?? 'login';
  const initial = useMemo(() => exampleSnapshot(screen, heroes), [screen, heroes]);
  const [snapshot, setSnapshot] = useState(initial);
  useEffect(() => {
    if (snapshot.phase !== 'MAP_RESOLVED' || !snapshot.timer.deadlineAt) return;
    const timeout = setTimeout(() => setSnapshot(previous => ({ ...exampleSnapshot('ban', heroes), mapResult: previous.mapResult, mapSelection: previous.mapSelection })), Math.max(0, snapshot.timer.deadlineAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [snapshot.phase, snapshot.timer.deadlineAt, heroes]);
  const controller: DraftRoomController = { snapshot, connected: !['reconnecting', 'replaced'].includes(screen), connectionReplaced: screen === 'replaced', reconnecting: screen === 'reconnecting', pending: false, error: '', reconnect: () => {},
    command: async (type, values) => {
      if (type === 'map.configure') setSnapshot(previous => ({ ...previous, epoch: previous.epoch + 1, selfReady: false, readyCount: 0,
        mapSelection: { mode: values?.mapMode === 'POTG' ? 'POTG' : 'VOTE', pickerDiscordId: typeof values?.pickerDiscordId === 'string' ? values.pickerDiscordId : null },
        progress: previous.progress?.map(player => ({ ...player, ready: false })) }));
      if (type === 'map.pick') setSnapshot(previous => {
        const map = maps.find(entry => entry.mapId === values?.mapId)!; const now = Date.now();
        return { ...previous, phase: 'MAP_RESOLVED', serverNow: now, timer: { ...previous.timer, phase: 'MAP_RESOLVED', deadlineAt: now + 3000 },
          mapResult: { resolutionId: 'example-potg', method: 'POTG', selectedOption: map.mapId, selectedByDiscordId: previous.selfDiscordId, totals: {}, map, firstAttackTeam: map.mode === 'ESCORT' || map.mode === 'HYBRID' ? 'A' : null, draws: [] } };
      });
      if (type === 'ready.set') setSnapshot(previous => {
        const ready = values?.ready === true;
        return { ...previous, selfReady: ready, readyCount: previous.readyCount + Number(ready) - Number(previous.selfReady),
          progress: previous.progress?.map(player => player.discordId === previous.selfDiscordId ? { ...player, ready } : player) };
      });
      if (type === 'draft.start') setSnapshot(previous => ({ ...exampleSnapshot(previous.mapSelection.mode === 'POTG' ? 'potg' : 'map', heroes),
        isOperator: previous.isOperator, gameIndex: previous.gameIndex, mapSelection: previous.mapSelection }));
      if (type === 'game.confirmApplied') setSnapshot(previous => ({ ...previous, phase: 'COMPLETED' }));
      if (type === 'game.markStarted') setSnapshot(previous => ({ ...previous, playStatus: 'PLAYING' }));
      if (type === 'game.markFinished') setSnapshot(previous => ({ ...previous, playStatus: 'FINISHED' }));
      if (type === 'game.next') setSnapshot(previous => ({ ...exampleSnapshot('operator', heroes), gameIndex: previous.gameIndex + 1,
        selfReady: false, readyCount: 0, progress: previous.progress?.map(player => ({ ...player, ready: false, confirmed: false })) }));
      if ((type === 'ballot.save' || type === 'ballot.lock') && Array.isArray(values?.selection)) {
        const selection = values.selection.filter((value): value is string => typeof value === 'string');
        setSnapshot(previous => ({ ...previous, ballots: previous.ballots && { ...previous.ballots,
          self: previous.ballots.self && { ...previous.ballots.self, selection, locked: type === 'ballot.lock' || (previous.stageKind === 'BAN' && selection.filter(Boolean).length === 3) } } }));
      }
    } };
  return <main className="draft-preview app-canvas bg-surface text-slate-200">
    <div className={`draft-preview-content mx-auto w-full ${screen.startsWith('operator') ? 'app-workspace draft-control-workspace' : ''}`}>
      <details className="mb-3 text-xs text-slate-500"><summary className="cursor-pointer py-1">개발용 예제 · 가상 참가자 · 실제 내전 아님</summary>
      <nav aria-label="예제 단계" className="my-3 flex flex-wrap gap-2">{screens.map(([id, label]) => <a key={id} href={`?screen=${id}`}
        className={`rounded border px-3 py-2 text-xs ${screen === id ? 'border-cyan-500 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>{label}</a>)}</nav></details>
      {screen === 'login' ? <DraftParticipantEntry pending={false} error="" login={() => {}} reconnect={() => {}} /> : screen.startsWith('operator')
        ? <DraftControlPage controller={controller} onMatching={() => {}} /> : <DraftRoomPanel controller={controller} />}
      <footer className="mt-2 shrink-0 text-center text-[10px] text-slate-600">Overwatch © Blizzard Entertainment · 개발용 미리보기</footer>
    </div>
  </main>;
}


export function DraftPreviewPage() {
  return <DraftPreviewContent heroes={DEFAULT_DRAFT_HERO_CATALOG.entries} />;
}
