import { useMemo, useState } from 'react';
import type { DraftHero, DraftMap, DraftParticipant, DraftPhase, DraftRoomSnapshot } from '#domain/draft';
import type { DraftRoomController } from '@application/draft/use-draft-room';
import { useQuery } from '@tanstack/react-query';
import { DraftRoomPanel } from './draft-room-panel';
import { DraftParticipantEntry } from './draft-participant-entry';

const screens = [
  ['login', '공유 링크 로그인'], ['lobby', '팀 확인·준비'], ['map', '맵 투표'],
  ['preference', '선호 영웅'], ['ban', '영웅 밴 투표'], ['result', '맵·밴 결과'], ['operator', '운영자 현황'],
] as const;
const roles = { tank: 'TANK', damage: 'DPS', support: 'SUPPORT' } as const;
const participants: DraftParticipant[] = ['하늘', '노을', '바다', '별빛', '새벽', '달빛', '구름', '여울', '이슬', '은하'].map((name, index) => ({
  userSheetId: `example-${index}`, discordId: `example-${index}`, displayName: name,
  team: index < 5 ? 'A' : 'B', role: (['TANK', 'DPS', 'DPS', 'SUPPORT', 'SUPPORT'] as const)[index % 5], slot: index % 5,
}));
const maps: DraftMap[] = ['kings-row', 'ilios', 'circuit-royal', 'busan'].map((id, index) => ({
  mapId: id, canonicalMapId: id, nameKo: ['왕의 길', '일리오스', '서킷 로얄', '부산'][index],
  nameEn: id, mode: (['HYBRID', 'CONTROL', 'ESCORT', 'CONTROL'] as const)[index], active: true,
}));

function exampleSnapshot(screen: string, heroes: readonly DraftHero[]): DraftRoomSnapshot {
  const now = Date.now();
  const score = (heroId: string, points: number) => ({ heroId, role: heroes.find(hero => hero.heroId === heroId)!.role, positiveScore: points, preferredDeduction: 0, effectiveScore: points, lobbyVoterCount: 2 });
  const phases: Record<string, DraftPhase> = { map: 'MAP_VOTING', preference: 'HERO_PREFERENCE', ban: 'HERO_VOTING', result: 'HERO_RESOLVED' };
  const phase = phases[screen] ?? 'LOBBY';
  const stageKind = phase === 'MAP_VOTING' ? 'MAP' : phase === 'HERO_PREFERENCE' ? 'PREFERENCE' : phase === 'HERO_VOTING' ? 'BAN' : null;
  const self = { discordId: participants[0].discordId, ballotRevision: 1, locked: false,
    selection: stageKind === 'MAP' ? ['kings-row'] : stageKind === 'PREFERENCE' ? ['reinhardt'] : ['ana', 'widowmaker', 'dva'] };
  return {
    roomCode: 'EXAMPLE234', gameId: 'example-game', gameIndex: 1, epoch: 1, roomRevision: 1,
    phase, expiresAt: now + 3600000, timer: { phase, status: 'ACTIVE', deadlineAt: stageKind ? now + 30000 : null, remainingMs: null, expiresAt: now + 3600000, epoch: 1 },
    participants, selfDiscordId: participants[0].discordId, isOperator: screen === 'operator', selfReady: true, readyCount: 8,
    availableMapCount: 31, inputConnected: true, heroes, stageKind,
    progress: participants.map((player, index) => ({ ...player, connectionStatus: index === 8 ? 'DISCONNECTED' : index === 9 ? 'NEVER_JOINED' : 'CONNECTED',
      inputConnected: index < 8, ready: index < 8, confirmed: index < 6, lastJoinedAt: index < 9 ? now : null, lastDisconnectedAt: index === 8 ? now : null })),
    candidates: { resolutionId: 'example-map', catalogVersion: 'example', mapHistoryRevision: 1, eligiblePool: maps,
      candidates: maps.slice(0, 3).map(map => ({ map, firstAttackTeam: map.mode === 'CONTROL' ? null : 'A' })), randomPool: maps.slice(3), remainingMapsConfirmed: false, diversityExceptionReason: null, draws: [] },
    mapResult: ['HERO_PREFERENCE', 'HERO_VOTING', 'HERO_RESOLVED'].includes(phase)
      ? { resolutionId: 'example-map', method: 'WEIGHTED', selectedOption: 'kings-row', totals: { 'kings-row': 4, ilios: 3, 'circuit-royal': 2, RANDOM: 1 }, map: maps[0], firstAttackTeam: 'A', draws: [] } : null,
    heroResult: phase === 'HERO_RESOLVED' ? { resolutionId: 'example-ban', catalogVersion: 'example', firstTeam: 'A', scores: { A: [score('ana', 19), score('sombra', 8)], B: [score('widowmaker', 17), score('dva', 12)] },
      slots: [{ team: 'A', heroId: 'ana', skipped: [] }, { team: 'B', heroId: 'widowmaker', skipped: [] }, { team: 'B', heroId: 'dva', skipped: [] }, { team: 'A', heroId: 'sombra', skipped: [] }], bannedHeroIds: ['ana', 'widowmaker', 'dva', 'sombra'], roleCounts: { TANK: 1, DPS: 2, SUPPORT: 1 }, draws: [] } : null,
    ballots: stageKind ? { self, teammates: stageKind === 'MAP' ? [] : participants.slice(0, 5).map((player, index) => ({
      ...self, discordId: player.discordId, locked: index > 0, selection: index === 0 ? self.selection : stageKind === 'BAN' ? [['ana', 'dva', 'sombra'], ['widowmaker', 'dva', 'ana'], ['genji', 'tracer', 'sombra'], ['dva', 'widowmaker', 'ana'], ['ana', 'sombra', 'genji']][index] : [(['reinhardt', 'genji', 'tracer', 'kiriko', 'juno'])[index]],
    })), confirmedCounts: { A: 4, B: 3 }, mapTotals: stageKind === 'MAP' ? { 'kings-row': 4, ilios: 3, 'circuit-royal': 2, RANDOM: 1 } : null } : null,
    playStatus: 'NOT_STARTED', serverNow: now,
  };
}

/** @description 로컬 개발에서 실제 컴포넌트를 가상 데이터로 확인하며 서버 명령이나 인증 요청은 보내지 않는다. */
function DraftPreviewContent({ heroes }: { heroes: readonly DraftHero[] }) {
  const screen = new URLSearchParams(window.location.search).get('screen') ?? 'login';
  const initial = useMemo(() => exampleSnapshot(screen, heroes), [screen, heroes]);
  const [snapshot, setSnapshot] = useState(initial);
  const controller: DraftRoomController = { snapshot, connected: true, pending: false, error: '', reconnect: () => {},
    command: async (type, values) => {
      if (type === 'ready.set') setSnapshot(previous => ({ ...previous, selfReady: values?.ready === true }));
      if ((type === 'ballot.save' || type === 'ballot.lock') && Array.isArray(values?.selection)) {
        const selection = values.selection.filter((value): value is string => typeof value === 'string');
        setSnapshot(previous => ({ ...previous, ballots: previous.ballots && { ...previous.ballots,
          self: previous.ballots.self && { ...previous.ballots.self, selection, locked: type === 'ballot.lock' } } }));
      }
    } };
  return <main className="draft-preview app-canvas bg-surface text-slate-200">
    <div className="draft-preview-content mx-auto w-full max-w-[1500px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div><p className="text-xs text-cyan-400">OWKR MATCH CONTROL</p><h1 className="mt-1 text-2xl font-semibold">{screen === 'operator' ? '밴픽 운영' : '실시간 내전 참여'}</h1></div>
        <span className="rounded border border-amber-700 px-3 py-2 text-xs text-amber-300">예제 화면 · 가상 참가자 · 실제 내전 아님</span>
      </div>
      <nav aria-label="예제 단계" className="mb-3 flex flex-wrap gap-2">{screens.map(([id, label]) => <a key={id} href={`?screen=${id}`}
        className={`rounded border px-3 py-2 text-xs ${screen === id ? 'border-cyan-500 text-cyan-200' : 'border-slate-800 text-slate-400'}`}>{label}</a>)}</nav>
      {screen === 'login' ? <DraftParticipantEntry pending={false} error="" login={() => {}} reconnect={() => {}} /> : <DraftRoomPanel controller={controller} />}
      <footer className="mt-2 shrink-0 text-center text-[10px] text-slate-600">Overwatch © Blizzard Entertainment · 개발용 미리보기</footer>
    </div>
  </main>;
}


export function DraftPreviewPage() {
  const { data, error } = useQuery({ queryKey: ['draft-preview-heroes'], queryFn: async (): Promise<DraftHero[]> => {
    const response = await fetch(`${import.meta.env.BASE_URL}draft-assets/manifest.json`);
    if (!response.ok) throw new Error('예제 이미지 목록을 불러오지 못했습니다.');
    const manifest = await response.json() as { assets: { kind: string; id: string; name: string; role?: string }[] };
    return manifest.assets.filter(asset => asset.kind === 'heroes').map(asset => ({
      heroId: asset.id, nameKo: asset.name, role: roles[asset.role as keyof typeof roles], active: true,
    }));
  }, staleTime: Infinity });
  if (!data) return <main className="min-h-screen app-canvas bg-surface p-8 text-slate-200">{error ? error.message : '예제 화면을 준비하고 있습니다.'}</main>;
  return <DraftPreviewContent heroes={data} />;
}
