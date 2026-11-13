import type { DraftMapRollSlot } from './draft-map-roll';
import type { DraftTeam } from '#domain/draft';

export function DraftMapVoteSlots({ optionId, name, count, slots, activeSlotId, winningSlotId, teamCounts }: {
  optionId: string; name: string; count: number; slots?: readonly DraftMapRollSlot[]; activeSlotId?: string | null; winningSlotId?: string;
  teamCounts?: Record<DraftTeam, number>;
}) {
  const entries = slots?.filter(slot => slot.optionId === optionId)
    ?? Array.from({ length: count }, (_, index) => ({ id: `${optionId}:${index}`, optionId }));
  return <div className="draft-map-vote-slots" role="img" aria-label={`${name} ${count}표`}>
    {entries.length ? entries.map((slot, index) => {
      const team = teamCounts ? index < teamCounts.A ? 'A' : 'B' : null;
      return <span key={slot.id} data-roll-slot={slot.id} data-team={team ?? undefined}
        data-active={activeSlotId === slot.id} data-winner={winningSlotId === slot.id} aria-hidden="true" />;
    }) : <span className="draft-map-vote-empty" aria-hidden="true" />}
    <span className="draft-map-vote-count" aria-hidden="true">{count}표</span>
  </div>;
}
