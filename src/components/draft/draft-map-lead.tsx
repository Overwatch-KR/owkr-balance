import { Crown } from 'lucide-react';
import { getMapVoteLead, MAP_LANDSLIDE_MARGIN } from '#domain/draft';

/** @description 압승 조건에 도달한 후보에만 왕관을 표시하며 마감 전 선택·변경은 그대로 허용한다. */
export function DraftMapLead({ optionId, name, totals }: {
  optionId: string; name: string; totals: Readonly<Record<string, number>>;
}) {
  if (getMapVoteLead(totals, optionId) < MAP_LANDSLIDE_MARGIN) return null;
  const label = `${name} · ${MAP_LANDSLIDE_MARGIN}표 이상 차이로 압승 조건 도달 · 마감 전 변경 가능`;
  return <span className="draft-map-dominance" role="img" aria-label={label} title={label}>
    <Crown size={20} aria-hidden="true" />
  </span>;
}
