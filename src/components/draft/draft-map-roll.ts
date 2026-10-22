import type { DraftRoomSnapshot } from '#domain/draft';

export interface DraftMapRollSlot {
  id: string;
  optionId: string;
}

export interface DraftMapRollPhase {
  kind: 'VOTE' | 'MAP';
  slots: readonly DraftMapRollSlot[];
  frames: readonly { atMs: number; slotId: string }[];
  startAtMs: number;
  durationMs: number;
}

export interface DraftMapRollPlan {
  phases: readonly DraftMapRollPhase[];
  voteSlots: readonly DraftMapRollSlot[];
  resultAtMs: number;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const letter of seed) state = Math.imul(state ^ letter.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rollPhase(kind: DraftMapRollPhase['kind'], slots: readonly DraftMapRollSlot[], winner: string,
  startAtMs: number, durationMs: number, random: () => number): DraftMapRollPhase {
  const matching = slots.flatMap((slot, index) => slot.optionId === winner ? [index] : []);
  const target = matching[Math.floor(random() * matching.length)];
  const steps = Math.max(3, Math.floor(durationMs / (175 + random() * 35)));
  const start = ((target - steps) % slots.length + slots.length) % slots.length;
  const holdMs = Math.min(220, durationMs * 0.16);
  const movingMs = durationMs - holdMs;
  const minimumMs = 75;
  const exponent = 3 + random() * 2;
  const intervals = Array.from({ length: steps }, (_, index) => ((index + 1) / steps) ** exponent);
  const total = intervals.reduce((sum, interval) => sum + interval, 0);
  let elapsed = 0;
  const frames = [{ atMs: 0, slotId: slots[start].id }, ...intervals.map((interval, index) => {
    elapsed += minimumMs + interval / total * (movingMs - minimumMs * steps);
    const position = (start + index + 1) % slots.length;
    return { atMs: elapsed, slotId: slots[position].id };
  })];
  frames[frames.length - 1] = { atMs: movingMs, slotId: slots[target].id };
  return { kind, slots, frames, startAtMs, durationMs };
}

/** @description 서버 결과를 왼쪽에서 오른쪽으로 순회하며 시작 칸·회전 수·감속이 달라도 당첨 맵과 득표 확률은 바꾸지 않는다. */
export function createDraftMapRollPlan(snapshot: Pick<DraftRoomSnapshot, 'mapResult' | 'candidates'>): DraftMapRollPlan {
  const result = snapshot.mapResult!;
  const options = snapshot.candidates?.candidates.map(option => option.map.mapId) ?? [];
  if (snapshot.candidates?.randomPool.length) options.push('RANDOM');
  const voteSlots = options.flatMap(optionId => Array.from({ length: result.totals[optionId] ?? 0 }, (_, index) => ({
    id: `${optionId}:${index}`, optionId,
  })));
  const random = seededRandom(JSON.stringify([result.resolutionId, result.draws, result.map.mapId, result.totals]));
  const phases: DraftMapRollPhase[] = [];
  const rollDurationMs = result.rollDurationMs ?? 0;
  if (rollDurationMs === 0) return { phases, voteSlots, resultAtMs: 0 };
  const mapPool = result.method === 'ALL_ABSTAINED' ? snapshot.candidates?.eligiblePool : undefined;
  const needsMapRoll = !!mapPool && mapPool.length > 1 && mapPool.some(map => map.mapId === result.map.mapId);
  if (result.method === 'WEIGHTED' && new Set(voteSlots.map(slot => slot.optionId)).size > 1
    && voteSlots.some(slot => slot.optionId === result.selectedOption)) {
    phases.push(rollPhase('VOTE', voteSlots, result.selectedOption!, 0, rollDurationMs, random));
  }
  if (needsMapRoll) {
    const maps = [...mapPool!];
    for (let index = maps.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [maps[index], maps[target]] = [maps[target], maps[index]];
    }
    const startAtMs = phases[0]?.durationMs ?? 0;
    phases.push(rollPhase('MAP', maps.map(map => ({ id: `map:${map.mapId}`, optionId: map.mapId })), result.map.mapId,
      startAtMs, rollDurationMs - startAtMs, random));
  }
  return { phases, voteSlots, resultAtMs: phases.length ? rollDurationMs : 0 };
}

/** @description 지연 접속이나 일시정지에도 동일한 서버 남은 시간에 해당하는 프레임을 찾는다. */
export function getDraftMapRollFrame(plan: DraftMapRollPlan, elapsedMs: number) {
  const finished = elapsedMs >= plan.resultAtMs;
  const phase = plan.phases.find(entry => elapsedMs < entry.startAtMs + entry.durationMs) ?? plan.phases.at(-1);
  const localTime = elapsedMs - (phase?.startAtMs ?? 0);
  const frame = phase?.frames.findLast(entry => entry.atMs <= localTime);
  return { finished, phase, activeSlotId: frame?.slotId ?? null };
}
