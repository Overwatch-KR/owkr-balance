import { DRAFT_LIMITS, requireDraft, type DraftParticipant } from './model.js';

export interface DraftConnection {
  discordId: string;
  connectionId: string;
  lastResponseAt: number;
  authExpiresAt: number;
  closed: boolean;
}

export interface PresenceHistory {
  discordId: string;
  lastJoinedAt: number;
  lastDisconnectedAt: number | null;
}

export interface ParticipantProgress {
  discordId: string;
  ready: boolean;
  confirmed: boolean;
}

export interface OperatorParticipantStatus extends DraftParticipant {
  connectionStatus: 'NEVER_JOINED' | 'CONNECTED' | 'DISCONNECTED' | 'CHECKING';
  inputConnected: boolean;
  ready: boolean;
  confirmed: boolean;
  lastJoinedAt: number | null;
  lastDisconnectedAt: number | null;
}

export interface DraftOperators {
  ownerId: string;
  coOperatorId: string | null;
  operatorRevision: number;
}

export function isDraftOperator(operators: DraftOperators, discordId: string): boolean {
  return discordId === operators.ownerId || discordId === operators.coOperatorId;
}

export function isConnectionAlive(connection: DraftConnection, now: number): boolean {
  return !connection.closed && connection.authExpiresAt > now
    && connection.lastResponseAt > now - DRAFT_LIMITS.presenceTimeoutMs;
}

/** @description 운영 권한을 재검사한 뒤 선택 내용을 포함하지 않는 10인 현황을 계산한다. */
export function getOperatorParticipantStatuses(input: {
  viewerId: string;
  operators: DraftOperators;
  participants: readonly DraftParticipant[];
  connections: readonly DraftConnection[];
  inputConnections: Readonly<Record<string, string>>;
  history: readonly PresenceHistory[];
  progress: readonly ParticipantProgress[];
  now: number;
  recoveryUntil: number | null;
  viewerConnected: boolean;
}): OperatorParticipantStatus[] {
  requireDraft(isDraftOperator(input.operators, input.viewerId), 'OPERATOR_REQUIRED', '현재 방 운영자만 전체 현황을 확인할 수 있습니다.');
  return input.participants.map(player => {
    const live = input.connections.filter(connection => connection.discordId === player.discordId
      && isConnectionAlive(connection, input.now));
    const history = input.history.find(entry => entry.discordId === player.discordId);
    const checking = !input.viewerConnected || (input.recoveryUntil !== null
      && input.now < input.recoveryUntil && live.length === 0);
    const progress = input.progress.find(entry => entry.discordId === player.discordId);
    return {
      userSheetId: player.userSheetId, discordId: player.discordId, displayName: player.displayName,
      team: player.team, role: player.role, slot: player.slot,
      connectionStatus: checking ? 'CHECKING' : live.length ? 'CONNECTED'
        : history ? 'DISCONNECTED' : 'NEVER_JOINED',
      inputConnected: !checking && live.some(connection => connection.connectionId === input.inputConnections[player.discordId]),
      ready: progress?.ready ?? false,
      confirmed: progress?.confirmed ?? false,
      lastJoinedAt: history?.lastJoinedAt ?? null,
      lastDisconnectedAt: history?.lastDisconnectedAt ?? null,
    };
  });
}

export function getDraftStartBlockers(statuses: readonly OperatorParticipantStatus[]): {
  disconnected: string[];
  inputRequired: string[];
  notReady: string[];
} {
  return {
    disconnected: statuses.filter(status => status.connectionStatus !== 'CONNECTED').map(status => status.displayName),
    inputRequired: statuses.filter(status => !status.inputConnected).map(status => status.displayName),
    notReady: statuses.filter(status => !status.ready).map(status => status.displayName),
  };
}

export function hasConnectedOperator(operators: DraftOperators, connections: readonly DraftConnection[], now: number): boolean {
  return connections.some(connection => isDraftOperator(operators, connection.discordId) && isConnectionAlive(connection, now));
}
