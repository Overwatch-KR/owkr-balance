import { ArrowUp, X } from 'lucide-react';
import type { DraftRoomSnapshot } from '#domain/draft';
import { clearDraftBanRank, getDraftTeamScores } from './draft-room-view';
import { DraftAsset } from './draft-asset';

export function DraftTeamScores({ snapshot }: { snapshot: DraftRoomSnapshot }) {
  const scores = getDraftTeamScores(snapshot);
  return <section className="draft-team-scores" aria-label="우리 팀 밴 점수">
    <ol aria-label="득표 상위 영웅" className="draft-score-slots">{[0, 1, 2].map(index => {
      const entry = scores[index];
      return <li key={index} aria-label={`${index + 1}번째: ${entry ? `${entry.hero.nameKo} ${entry.points}점` : '득표 없음'}`}>
        <div className="draft-score-portrait" title={entry ? `${entry.hero.nameKo} · ${entry.points}점` : '득표 없음'}>{entry
          ? <DraftAsset kind="heroes" id={entry.hero.heroId} name={entry.hero.nameKo} /> : <span>—</span>}</div>
        <span className="draft-score-value">{entry?.points ?? '—'}</span>
      </li>;
    })}</ol>
  </section>;
}

export function DraftMyBanVote({ snapshot, selection, activeRank, disabled, onRank, onSelection }: {
  snapshot: DraftRoomSnapshot; selection: string[]; activeRank: number; disabled: boolean;
  onRank: (rank: number) => void; onSelection: (selection: string[]) => void;
}) {
  return <aside className="draft-my-vote" aria-label="내 밴 투표">
    <h3>내 밴 투표</h3>
    <ol className="draft-my-vote-slots">{[0, 1, 2].map(rank => {
      const id = selection[rank];
      const hero = snapshot.heroes.find(entry => entry.heroId === id);
      return <li key={rank} data-my-vote-rank={rank + 1}>
        <button type="button" className={`draft-my-vote-slot ${activeRank === rank ? 'draft-pick-active' : ''}`} aria-label={`내 밴 투표 ${rank + 1}순위: ${hero?.nameKo ?? '선택 없음'}`}
          aria-pressed={activeRank === rank} disabled={disabled} onClick={() => onRank(rank)}>
          {hero ? <DraftAsset kind="heroes" id={hero.heroId} name={hero.nameKo} /> : <span className="draft-empty-vote">—</span>}
        </button>
        <div className="draft-my-vote-tools">
          <button type="button" aria-label={`${rank + 1}순위 위로`} disabled={disabled || rank === 0 || !id} onClick={() => {
            const next = [...selection]; [next[rank - 1], next[rank]] = [next[rank], next[rank - 1]]; onSelection(next); onRank(rank - 1);
          }}><ArrowUp size={13} /></button>
          <button type="button" aria-label={`${rank + 1}순위 해제`} disabled={disabled || !id} onClick={() => {
            onSelection(clearDraftBanRank(selection, rank)); onRank(rank);
          }}><X size={13} /></button>
        </div>
      </li>;
    })}</ol>
  </aside>;
}
