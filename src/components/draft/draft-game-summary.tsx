import type { DraftRoomSnapshot } from '#domain/draft';
import { DraftAsset } from './draft-asset';
import { getDraftSideSummary } from './draft-room-view';

/** @description 적용 확인 후에도 맵·공수·밴을 함께 표시하고 다음 경기 대기실에는 직전 결과를 구분해 남긴다. */
export function DraftGameSummary({ snapshot, hideBans = false }: { snapshot: DraftRoomSnapshot; hideBans?: boolean }) {
  const previous = snapshot.phase === 'LOBBY' ? snapshot.previousGame : undefined;
  const current = ['HERO_RESOLVED', 'COMPLETED'].includes(snapshot.phase) && snapshot.mapResult && snapshot.heroResult;
  if (!previous && !current) return null;
  const map = previous?.map ?? snapshot.mapResult!.map;
  const attack = previous ? previous.firstAttackTeam : snapshot.mapResult!.firstAttackTeam;
  const bans = previous?.bans ?? snapshot.heroResult!.bannedHeroIds.map(id => snapshot.heroes.find(hero => hero.heroId === id)
    ?? { heroId: id, nameKo: id });
  const title = previous ? `직전 ${previous.gameIndex}경기 결과` : `${snapshot.gameIndex}경기 확정 맵·밴`;
  return <section aria-label={title} className="flex flex-wrap items-center gap-4 border-y border-slate-700 bg-slate-900/50 p-3">
    <div className="w-36 shrink-0 overflow-hidden rounded"><DraftAsset kind="maps" id={map.mapId} name={map.nameKo} /></div>
    <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-cyan-300">{title}</p>
      <h3 className="mt-1 text-lg font-semibold text-white">{map.nameKo}</h3>
      <p className="mt-1 text-xs text-slate-400">{attack ? getDraftSideSummary(attack) : '공격·수비 구분 없음'}</p>
      {previous && <p className="mt-1 text-xs text-slate-500">다음 경기의 맵·밴은 새로 선정합니다.</p>}
    </div>
    {!hideBans && <div><p className="mb-2 text-xs text-slate-400">양 팀 공통 영웅 밴</p>
      {bans.length ? <ul className="flex flex-wrap gap-2">{bans.map(hero => <li key={hero.heroId} className="w-14 text-center">
        <DraftAsset kind="heroes" id={hero.heroId} name={hero.nameKo} /><p className="mt-1 truncate text-[11px] text-slate-200">{hero.nameKo}</p>
      </li>)}</ul> : <p className="text-sm text-slate-300">밴 없음 · 전원 기권</p>}
    </div>}
  </section>;
}
