import type { DraftAudio } from '@application/draft/draft-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { getMapRevealDurationMs } from '#domain/draft';
import type { DraftRoomSnapshot } from '#domain/draft';
import { DraftAsset } from './draft-asset';
import { createDraftMapRollPlan, getDraftMapRollFrame } from './draft-map-roll';
import { DraftMapVoteSlots } from './draft-map-vote-slots';
import { getDraftSideSummary } from './draft-room-view';

function remainingTime(snapshot: DraftRoomSnapshot): number {
  return snapshot.timer.status === 'ACTIVE'
    ? Math.max(0, (snapshot.timer.deadlineAt ?? snapshot.serverNow) - snapshot.serverNow)
    : snapshot.timer.remainingMs ?? getMapRevealDurationMs(snapshot.mapResult);
}

/** @description 서버 시간에 맞춰 득표 슬롯을 추첨한 뒤 중앙의 확정 맵 하나만 별도로 4초간 공개한다. */
export function DraftMapReveal({ snapshot, audio }: { snapshot: DraftRoomSnapshot; audio?: DraftAudio }) {
  const result = snapshot.mapResult!;
  const sounded = useRef(false);
  const reducedMotion = useReducedMotion();
  const plan = useMemo(() => createDraftMapRollPlan(snapshot), [snapshot]);
  const totalDurationMs = getMapRevealDurationMs(result);
  const baseElapsed = Math.max(0, totalDurationMs - remainingTime(snapshot));
  const [elapsed, setElapsed] = useState(baseElapsed);
  useEffect(() => {
    if (snapshot.timer.status !== 'ACTIVE') return;
    if (reducedMotion) {
      const timeout = setTimeout(() => setElapsed(plan.resultAtMs), Math.max(0, plan.resultAtMs - baseElapsed));
      return () => clearTimeout(timeout);
    }
    const started = performance.now();
    let frame: number;
    const update = () => {
      const next = Math.min(totalDurationMs, baseElapsed + performance.now() - started);
      setElapsed(next);
      if (next < plan.resultAtMs) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [baseElapsed, reducedMotion, snapshot.timer.status, totalDurationMs, plan.resultAtMs]);
  const frame = getDraftMapRollFrame(plan, snapshot.timer.status === 'ACTIVE' ? Math.max(baseElapsed, elapsed) : baseElapsed);
  const finished = frame.finished;
  useEffect(() => {
    if (finished && snapshot.timer.status === 'ACTIVE' && !sounded.current && audio?.isReady()) {
      sounded.current = true;
      void audio.play('mapComplete', 'voice');
    }
  }, [finished, snapshot.timer.status, audio]);
  useEffect(() => () => audio?.stop('voice'), [audio]);
  const drawingMap = !finished && frame.phase?.kind === 'MAP';
  const activeOption = frame.phase?.slots.find(slot => slot.id === frame.activeSlotId)?.optionId;
  const voteWinner = result.selectedOption;
  const activeVoteSlot = !reducedMotion && !finished && frame.phase?.kind === 'VOTE' ? frame.activeSlotId : null;
  const winningVoteSlot = finished || drawingMap ? plan.phases.find(phase => phase.kind === 'VOTE')?.frames.at(-1)?.slotId
    ?? plan.voteSlots.find(slot => slot.optionId === voteWinner)?.id : undefined;
  const showVotes = result.method !== 'POTG' && result.method !== 'ALL_ABSTAINED';
  const title = finished ? '맵 선정 완료' : drawingMap ? '미사용 맵 추첨 중' : '맵 추첨 중';
  const explanation = result.method === 'POTG' ? '지정 선수가 선택한 맵입니다.'
    : result.method === 'LANDSLIDE' ? '6표 이상 차이 · 압도적 득표로 선택되었습니다.'
    : result.method === 'ALL_ABSTAINED' ? '전원 기권 · 미사용 전체 맵에서 추첨합니다.'
    : drawingMap ? '무작위 당첨 · 표시된 후보를 제외한 미사용 맵에서 추첨합니다.'
    : '각 표가 추첨 칸 하나가 됩니다. 표를 많이 받은 맵일수록 선택될 가능성이 높습니다.';
  if (finished) return <section className="draft-map-confirmed" aria-label="확정 맵 확인" data-roll-finished="true" data-landslide={result.method === 'LANDSLIDE'}>
    <figure className="draft-map-confirmed-card">
      {result.method === 'LANDSLIDE' && <div className="draft-landslide-banner" role="status">
        <span className="draft-landslide-rays" aria-hidden="true" />
        <strong>압승</strong><span>압도적인 득표로 맵 확정</span>
        <span className="draft-landslide-score">{result.totals[result.selectedOption ?? ''] ?? 0}표 · 6표 이상 차이</span>
      </div>}
      <DraftAsset kind="maps" id={result.map.mapId} name={result.map.nameKo} />
      <figcaption className="p-4 text-center sm:p-6" aria-live="polite">
        <p className="text-xs font-semibold text-cyan-300">선택된 맵</p>
        <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{result.map.nameKo}</h2>
        <p className="mt-2 text-xs text-slate-400">{result.firstAttackTeam ? getDraftSideSummary(result.firstAttackTeam) : '공격·수비 구분 없음'}</p>
        <p className="mt-3 text-xs text-slate-500">확정 맵을 4초간 확인한 뒤 영웅 밴 투표를 시작합니다.</p>
      </figcaption>
    </figure>
  </section>;
  return <section className="draft-map-reveal" aria-label="맵 추첨" data-roll-finished={finished}>
    <header className="border-b border-slate-800 pb-3">
      <h3 className="text-base font-semibold text-white" aria-live="polite">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">{explanation}</p>
    </header>
    {showVotes && <div className="draft-map-roll-options">{snapshot.candidates?.candidates.map(({ map }) => {
      const active = !reducedMotion && !finished && !drawingMap && activeOption === map.mapId;
      const winner = finished && voteWinner === map.mapId;
      return <article key={map.mapId} className="draft-map-roll-option" data-active={active} data-winner={winner}>
        <DraftAsset kind="maps" id={map.mapId} name={map.nameKo} />
        <div className="p-2 sm:p-3"><h4 className="truncate text-xs font-semibold text-slate-100 sm:text-sm">{map.nameKo}</h4>
          <DraftMapVoteSlots optionId={map.mapId} name={map.nameKo} count={result.totals[map.mapId] ?? 0}
            slots={plan.voteSlots} activeSlotId={activeVoteSlot} winningSlotId={winningVoteSlot} /></div>
      </article>;
    })}
      {!!snapshot.candidates?.randomPool.length && <article className="draft-map-roll-random draft-map-roll-option"
        data-active={!reducedMotion && !finished && (drawingMap || activeOption === 'RANDOM')} data-winner={finished && voteWinner === 'RANDOM'}>
        <h4 className="text-sm font-semibold text-slate-100">무작위 · 미사용 맵</h4>
        <DraftMapVoteSlots optionId="RANDOM" name="무작위" count={result.totals.RANDOM ?? 0}
          slots={plan.voteSlots} activeSlotId={activeVoteSlot} winningSlotId={winningVoteSlot} />
      </article>}
    </div>}
    {drawingMap && <div className="draft-map-mystery" aria-label="미사용 맵 추첨 중">
      <span className="text-5xl font-semibold text-slate-500" aria-hidden="true">?</span>
      <div className="draft-map-vote-slots" aria-hidden="true">{frame.phase?.slots.map(slot => <span key={slot.id}
        data-roll-slot={slot.id} data-active={!reducedMotion && frame.activeSlotId === slot.id} />)}</div>
    </div>}
    <div className="draft-map-roll-result" aria-live="polite" aria-atomic="true">
      <p className="text-sm text-cyan-200">{drawingMap ? '무작위 맵을 추첨하고 있습니다…' : '투표 슬롯을 추첨하고 있습니다…'}</p>
    </div>
  </section>;
}
