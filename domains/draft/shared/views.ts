import { requireDraft, type DraftParticipant, type DraftTeam } from './model.js';
import type { BallotStage, DraftBallot } from './ballots.js';
import { isDraftOperator, type DraftOperators } from './presence.js';

export interface ParticipantBallotView {
  self: DraftBallot | null;
  teammates: readonly DraftBallot[];
  confirmedCounts: Record<DraftTeam, number>;
  mapTotals: Readonly<Record<string, number>> | null;
}

function publicBallot(ballot: DraftBallot): DraftBallot {
  return {
    discordId: ballot.discordId, ballotRevision: ballot.ballotRevision,
    selection: [...ballot.selection], locked: ballot.locked,
  };
}

/** @description 운영자도 본인 팀의 표만 받고 맵 개인 표는 본인 것만 받는다. */
export function projectDraftBallots(input: {
  viewerId: string;
  operators: DraftOperators;
  participants: readonly DraftParticipant[];
  stage: BallotStage;
}): ParticipantBallotView {
  const viewer = input.participants.find(player => player.discordId === input.viewerId);
  requireDraft(viewer || isDraftOperator(input.operators, input.viewerId), 'ROOM_ACCESS_DENIED', '방 참가 권한이 없습니다.');
  const currentIds = new Map(input.participants.map(player => [player.discordId, player.team]));
  const ballots = input.stage.ballots.filter(ballot => currentIds.has(ballot.discordId));
  const self = ballots.find(ballot => ballot.discordId === viewer?.discordId);
  const confirmedCounts: Record<DraftTeam, number> = { A: 0, B: 0 };
  for (const ballot of ballots) {
    if (ballot.locked) confirmedCounts[currentIds.get(ballot.discordId)!]++;
  }
  const mapTotals = input.stage.kind === 'MAP'
    ? Object.fromEntries(input.stage.allowedIds.map(id => [id, ballots.filter(ballot => ballot.selection[0] === id).length]))
    : null;
  return {
    self: self ? publicBallot(self) : null,
    teammates: viewer && input.stage.kind !== 'MAP'
      ? ballots.filter(ballot => currentIds.get(ballot.discordId) === viewer.team).map(publicBallot) : [],
    confirmedCounts, mapTotals,
  };
}
