import { requireDraft } from './model.js';

export type BallotKind = 'MAP' | 'PREFERENCE' | 'BAN';

export interface DraftBallot {
  discordId: string;
  ballotRevision: number;
  selection: readonly string[];
  locked: boolean;
}

export interface BallotReceipt {
  discordId: string;
  commandId: string;
  body: string;
  ballot: DraftBallot;
  acceptedAt: number;
}

export interface BallotStage {
  roomId: string;
  gameId: string;
  epoch: number;
  kind: BallotKind;
  status: 'OPEN' | 'PAUSED' | 'SEALED';
  deadlineAt: number;
  expiresAt: number;
  allowedIds: readonly string[];
  ballots: readonly DraftBallot[];
  receipts: readonly BallotReceipt[];
  inputConnections: Readonly<Record<string, string>>;
  sealed: SealedBallots | null;
}

export interface SealedBallots {
  resolutionId: string;
  sealedAt: number;
  ballots: readonly DraftBallot[];
  entropy: readonly number[];
}

export interface BallotCommand {
  commandId: string;
  roomId: string;
  gameId: string;
  epoch: number;
  kind: BallotKind;
  expectedBallotRevision: number;
  selection: readonly string[];
  lock: boolean;
}

export interface BallotConnection {
  discordId: string;
  connectionId: string;
  authExpiresAt: number;
}

/** @description 저장할 상태와 영수증을 함께 계산하며 실제 원자 저장은 서버 어댑터가 수행한다. */
export function applyBallotCommand(
  stage: BallotStage,
  command: BallotCommand,
  connection: BallotConnection,
  now: number,
): { stage: BallotStage; receipt: BallotReceipt; duplicate: boolean } {
  requireDraft(connection.authExpiresAt > now, 'AUTH_EXPIRED', '입장권을 갱신해 주세요.');
  requireDraft(now < stage.expiresAt, 'ROOM_EXPIRED', '방이 만료되었습니다.');
  requireDraft(stage.roomId === command.roomId && stage.gameId === command.gameId
    && stage.epoch === command.epoch && stage.kind === command.kind,
  'STALE_STAGE', '경기 단계가 바뀌었습니다. 최신 상태를 확인해 주세요.');
  const ballot = stage.ballots.find(item => item.discordId === connection.discordId);
  requireDraft(ballot, 'NOT_PARTICIPANT', '현재 명단의 참가자만 입력할 수 있습니다.');
  requireDraft(stage.inputConnections[connection.discordId] === connection.connectionId,
    'READ_ONLY_CONNECTION', '입력 담당 연결을 다시 지정해 주세요.');
  requireDraft(command.commandId.trim() && command.commandId.length <= 128,
    'INVALID_COMMAND_ID', '유효한 명령 식별자가 필요합니다.');
  const body = JSON.stringify([command.roomId, command.gameId, command.epoch, command.kind,
    command.expectedBallotRevision, command.selection, command.lock]);
  const previous = stage.receipts.find(receipt => receipt.discordId === connection.discordId
    && receipt.commandId === command.commandId);
  if (previous) {
    requireDraft(previous.body === body, 'COMMAND_REUSED', '같은 명령 식별자를 다른 내용에 사용할 수 없습니다.');
    return { stage, receipt: structuredClone(previous), duplicate: true };
  }
  requireDraft(stage.status === 'OPEN' && now < stage.deadlineAt,
    'BALLOT_CLOSED', '투표가 정지되었거나 마감되었습니다.');
  requireDraft(!ballot.locked, 'BALLOT_LOCKED', '확정한 표는 변경할 수 없습니다.');
  requireDraft(command.expectedBallotRevision === ballot.ballotRevision,
    'BALLOT_CONFLICT', '저장된 표가 변경되었습니다. 최신 상태로 다시 제출해 주세요.');
  const limit = stage.kind === 'BAN' ? 3 : 1;
  requireDraft(command.selection.length <= limit && new Set(command.selection).size === command.selection.length,
    'INVALID_SELECTION', '선택 개수 또는 중복 선택을 확인해 주세요.');
  requireDraft(command.selection.every(id => stage.allowedIds.includes(id)),
    'INVALID_SELECTION', '현재 선택할 수 없는 맵 또는 영웅입니다.');
  requireDraft(stage.receipts.length < 2000, 'COMMAND_LIMIT', '이 단계의 입력 한도를 초과했습니다. 운영자에게 문의해 주세요.');
  const nextBallot: DraftBallot = {
    discordId: connection.discordId, ballotRevision: ballot.ballotRevision + 1,
    selection: [...command.selection], locked: command.lock,
  };
  const receipt: BallotReceipt = {
    discordId: connection.discordId, commandId: command.commandId, body,
    ballot: structuredClone(nextBallot), acceptedAt: now,
  };
  return {
    stage: { ...stage, ballots: stage.ballots.map(item => item.discordId === connection.discordId ? nextBallot : item),
      receipts: [...stage.receipts, receipt] },
    receipt: structuredClone(receipt), duplicate: false,
  };
}

/** @description 마감 또는 10인 확정 시 표를 봉인하며 재실행은 같은 봉인 스냅샷을 반환한다. */
export function sealBallotStage(stage: BallotStage, resolutionId: string, now: number, entropy: readonly number[] = []): BallotStage {
  if (stage.sealed) return stage;
  requireDraft(stage.status === 'OPEN', 'BALLOT_CLOSED', '정지된 단계는 봉인할 수 없습니다.');
  requireDraft(stage.ballots.length === 10 && new Set(stage.ballots.map(ballot => ballot.discordId)).size === 10,
    'BALLOT_COUNT', '중복 없는 10명의 표가 필요합니다.');
  requireDraft(now >= stage.deadlineAt || stage.ballots.every(ballot => ballot.locked),
    'NOT_READY_TO_SEAL', '아직 투표 마감 조건을 충족하지 않았습니다.');
  requireDraft(resolutionId.trim(), 'RESOLUTION_ID_REQUIRED', '집계 식별자가 필요합니다.');
  return { ...stage, status: 'SEALED', sealed: {
    resolutionId, sealedAt: now, ballots: structuredClone(stage.ballots), entropy: [...entropy],
  } };
}
