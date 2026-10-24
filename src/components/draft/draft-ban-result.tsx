import type { DraftAudio } from '@application/draft/draft-audio';
import { useDraftBanReveal } from '@application/draft/use-draft-ban-reveal';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Ban, Copy, RotateCcw } from 'lucide-react';
import type { DraftRoomSnapshot, DraftTeam } from '#domain/draft';
import { DraftAsset } from './draft-asset';
import { getDraftTeamLabel } from './draft-room-view';

function teamAppearance(team: DraftTeam | null, firstAttackTeam: DraftTeam | null) {
  const attacking = firstAttackTeam !== null && team === firstAttackTeam;
  const red = firstAttackTeam === null ? team === 'A' : attacking;
  return {
    label: team === null ? '선택 팀 정보 없음' : getDraftTeamLabel(team, firstAttackTeam),
    border: team === null ? 'border-slate-700' : red ? 'border-red-500/70' : 'border-blue-500/70',
    text: team === null ? 'text-slate-400' : red ? 'text-red-300' : 'text-blue-300',
    bar: team === null ? 'bg-slate-700' : red ? 'bg-red-500' : 'bg-blue-500',
    surface: team === null ? 'bg-slate-900' : red ? 'bg-red-500/10' : 'bg-blue-500/10',
  };
}

/** @description 서버의 슬롯 순서·선택 팀을 보존해 결과를 순차 공개하며 진영 미배정 맵은 게임 로비 팀 번호를 표시한다. */
export function DraftBanResult({ snapshot, onCopy, audio }: { audio?: DraftAudio; snapshot: DraftRoomSnapshot; onCopy: () => void }) {
  const reducedMotion = useReducedMotion();
  const [replay, setReplay] = useState(0);
  const result = snapshot.heroResult!;
  const visible = useDraftBanReveal(audio, result.resolutionId, replay);
  const attack = snapshot.mapResult?.firstAttackTeam ?? null;
  const slots = result.slots.length ? result.slots : result.bannedHeroIds.map(heroId => ({ team: null, heroId }));
  return <section aria-label="최종 영웅 밴" className="overflow-hidden rounded-lg border border-slate-800 bg-surface-elevated">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 sm:px-5">
      <div><h3 className="text-base font-semibold text-white">밴 결과 <span className="ml-2 text-xs font-normal text-slate-500">{result.bannedHeroIds.length}/4</span></h3>
        <p className="mt-1 text-xs text-slate-500">{snapshot.mapResult?.map.nameKo ?? '맵 미확정'} · 양 팀 공통 적용</p></div>
      <div className="flex gap-1"><button type="button" className="btn-ghost text-xs" onClick={() => setReplay(value => value + 1)}><RotateCcw size={13} />다시 보기</button>
        <button type="button" className="btn-ghost text-xs" onClick={onCopy}><Copy size={13} />결과 복사</button></div>
    </header>
    <div className="px-4 py-4 sm:px-8">
      <div className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">{(['A', 'B'] as const).map(team => {
        const appearance = teamAppearance(team, attack);
        const orders = slots.flatMap((slot, index) => slot.team === team ? [index + 1] : []);
        return <p key={team} className={`flex items-center gap-2 ${appearance.text}`}><span className={`h-1.5 w-5 rounded-full ${appearance.bar}`} />{appearance.label}
          {!!orders.length && <span className="text-slate-500">{orders.join('·')}번 밴</span>}</p>;
      })}</div>
      {slots.length ? <ol key={replay} aria-label="밴 확정 순서" className="mx-auto grid app-form-content grid-cols-4 gap-x-0 gap-y-4">{slots.map((slot, index) => {
        const hero = snapshot.heroes.find(entry => entry.heroId === slot.heroId);
        const appearance = teamAppearance(slot.team, attack);
        const score = slot.team && result.scores[slot.team].find(entry => entry.heroId === slot.heroId)?.effectiveScore;
        return <motion.li key={index} data-ban-order={index + 1} data-ban-team={slot.team ?? 'unknown'}
          data-ban-revealed={index < visible} aria-hidden={index >= visible}
          initial={{ opacity: 0 }} animate={{ opacity: index < visible ? 1 : 0, y: reducedMotion || index < visible ? 0 : -18, scale: reducedMotion || index < visible ? 1 : 1.12 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.18, type: 'spring', stiffness: 500, damping: 26 }}
          className="min-w-0 text-center">
          <p className="mb-2 font-mono text-[10px] font-semibold tracking-[0.2em] text-slate-500">BAN 0{index + 1}</p>
          <div className={`relative mx-auto w-full max-w-24 overflow-hidden rounded-md border-2 p-1 shadow-lg shadow-black/30 ${appearance.border} ${appearance.surface}`}>
            {slot.heroId ? <DraftAsset kind="heroes" id={slot.heroId} name={hero?.nameKo ?? slot.heroId} /> : <div className="flex aspect-square items-center justify-center bg-slate-950 text-slate-600"><Ban size={30} /></div>}
            {slot.heroId && <span className="absolute bottom-1 right-1 rounded-tl-md bg-black/80 p-1 text-red-300"><Ban size={13} /></span>}
          </div>
          <p className="mt-2 truncate px-1 text-[10px] sm:text-sm font-semibold text-slate-100">{hero?.nameKo ?? slot.heroId ?? '밴 없음'}</p>
          <div className="relative my-3 flex h-7 items-center justify-center">
            <div className={`absolute inset-x-0 h-1.5 ${appearance.bar}`} />
            <span className={`relative flex h-7 min-w-7 items-center justify-center rounded-full border bg-slate-950 px-1 font-mono text-xs font-semibold ${appearance.border} ${appearance.text}`} aria-label={typeof score === 'number' ? `밴 점수 ${score}` : `밴 순서 ${index + 1}`}>{typeof score === 'number' ? score : index + 1}</span>
          </div>
          <p className={`text-[11px] font-medium ${appearance.text}`}>{appearance.label} 선택</p>
        </motion.li>;
      })}</ol> : <p className="py-6 text-center text-sm text-slate-400">전원 기권 · 선택된 밴 없음</p>}
      <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">밴은 각 팀의 투표를 합산한 결과입니다. 운영자가 맵·팀·진영·밴을 게임에 적용합니다.</p>
    </div>
  </section>;
}
