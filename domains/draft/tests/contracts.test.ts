import { describe, expect, it } from 'vitest';
import {
  applyBallotCommand, sealBallotStage, projectDraftBallots, getOperatorParticipantStatuses,
  hasConnectedOperator, emitDraftStreamEvent, inspectDraftStreamEvent, pauseDraftTimer, resumeDraftTimer,
  correctDraftMapHistory, getUsedDraftMapIds, createDraftReplayPlan, canUseDraftMap,
  type BallotCommand, type DraftTimer,
} from '../shared/public.js';
import { history, heroes, maps, NOW, players, rolls, stage } from './fixtures.js';

const connection = { discordId: players[0].discordId, connectionId: `c-${players[0].discordId}`, authExpiresAt: NOW + 100_000 };
function command(overrides: Partial<BallotCommand> = {}): BallotCommand {
  return { commandId: 'cmd', roomId: 'ROOM234567', gameId: 'game-1', epoch: 1, kind: 'BAN',
    expectedBallotRevision: 0, selection: ['h0'], lock: false, ...overrides };
}
const operators = { ownerId: players[0].discordId, coOperatorId: players[5].discordId, operatorRevision: 1 };

describe('ballot atomic calculation contract', () => {
  it('replaces final selection and locks it together before a delayed draft arrives', () => {
    const original = stage();
    const saved = applyBallotCommand(original, command(), connection, NOW).stage;
    const locked = applyBallotCommand(saved, command({ commandId: 'lock', expectedBallotRevision: 1,
      selection: ['h2', 'h1'], lock: true }), connection, NOW + 1).stage;
    expect(locked.ballots[0]).toMatchObject({ selection: ['h2', 'h1'], locked: true, ballotRevision: 2 });
    expect(() => applyBallotCommand(locked, command({ commandId: 'late', expectedBallotRevision: 1 }), connection, NOW + 2)).toThrow('확정');
    expect(original.ballots[0].selection).toEqual([]);
  });
  it('reuses receipts for the same command and rejects different content', () => {
    const result = applyBallotCommand(stage(), command(), connection, NOW);
    const duplicate = applyBallotCommand(result.stage, command(), connection, NOW + 1);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.receipt).toEqual(result.receipt);
    expect(() => applyBallotCommand(result.stage, command({ selection: [] }), connection, NOW)).toThrow('같은 명령');
  });
  it('returns prior approval after sealing but never accepts a new command at the deadline', () => {
    const result = applyBallotCommand(stage(), command(), connection, NOW);
    const sealed = sealBallotStage(result.stage, 'sealed', NOW + 20_000, rolls);
    expect(applyBallotCommand(sealed, command(), connection, NOW + 20_000).duplicate).toBe(true);
    expect(() => applyBallotCommand(result.stage, command({ commandId: 'new', expectedBallotRevision: 1 }), connection, NOW + 20_000)).toThrow('마감');
    expect(sealed.sealed?.ballots[0].selection).toEqual(['h0']);
  });
  it('checks current identity, input connection, epoch and ballot revision', () => {
    expect(() => applyBallotCommand(stage(), command(), { ...connection, discordId: 'outsider' }, NOW)).toThrow('명단');
    expect(() => applyBallotCommand(stage(), command(), { ...connection, connectionId: 'other-tab' }, NOW)).toThrow('입력 담당');
    expect(() => applyBallotCommand(stage(), command({ epoch: 2 }), connection, NOW)).toThrow('단계');
    expect(() => applyBallotCommand(stage(), command({ expectedBallotRevision: 1 }), connection, NOW)).toThrow('저장된 표');
    expect(() => applyBallotCommand(stage(), command(), connection, connection.authExpiresAt)).toThrow('입장권');
  });
  it('uses personal revisions so another participant can save independently', () => {
    const first = applyBallotCommand(stage(), command(), connection, NOW).stage;
    const second = { ...connection, discordId: players[1].discordId, connectionId: `c-${players[1].discordId}` };
    expect(applyBallotCommand(first, command(), second, NOW).stage.ballots[1].ballotRevision).toBe(1);
  });
  it('seals saved unconfirmed votes and leaves missing votes as abstentions', () => {
    const first = applyBallotCommand(stage(), command(), connection, NOW).stage;
    const sealed = sealBallotStage(first, 'resolution-1', NOW + 20_000, rolls);
    expect(sealed.sealed?.ballots[0].locked).toBe(false);
    expect(sealed.sealed?.ballots[1].selection).toEqual([]);
    expect(sealed.sealed?.entropy).toEqual(rolls);
    expect(sealBallotStage(sealed, 'different', NOW + 25_000)).toBe(sealed);
    expect(() => sealBallotStage(first, 'early', NOW)).toThrow('마감 조건');
  });
  it('counts an explicitly locked abstention and never accepts duplicate or noncandidate selections', () => {
    expect(applyBallotCommand(stage(), command({ selection: [], lock: true }), connection, NOW).stage.ballots[0].locked).toBe(true);
    expect(() => applyBallotCommand(stage(), command({ selection: ['h0', 'h0'] }), connection, NOW)).toThrow('중복');
    expect(() => applyBallotCommand(stage(), command({ selection: ['missing'] }), connection, NOW)).toThrow('선택할 수 없는');
  });
});

describe('recipient data and presence', () => {
  it('never exposes opponent ballots even to a participating operator', () => {
    const original = stage();
    original.ballots = original.ballots.map((ballot, index) => ({ ...ballot, selection: index < 5 ? ['h0'] : ['h2'], locked: true }));
    const view = projectDraftBallots({ viewerId: players[0].discordId, operators, participants: players, stage: original });
    expect(view.teammates).toHaveLength(5);
    expect(JSON.stringify(view)).not.toContain('h2');
    expect(view.confirmedCounts).toEqual({ A: 5, B: 5 });
  });
  it('exposes only own map vote and anonymous option totals', () => {
    const original = stage('MAP');
    original.ballots = original.ballots.map(ballot => ({ ...ballot, selection: ['h0'] }));
    const view = projectDraftBallots({ viewerId: players[0].discordId, operators, participants: players, stage: original });
    expect(view.teammates).toEqual([]);
    expect(view.mapTotals?.h0).toBe(10);
    expect(view.self?.discordId).toBe(players[0].discordId);
  });
  it('denies an unlisted account and gives a nonplaying operator no private votes', () => {
    expect(() => projectDraftBallots({ viewerId: 'outsider', operators, participants: players, stage: stage() })).toThrow('권한');
    const view = projectDraftBallots({ viewerId: 'operator-only', operators: { ...operators, coOperatorId: 'operator-only' }, participants: players, stage: stage() });
    expect(view.self).toBeNull(); expect(view.teammates).toEqual([]);
  });
  it('distinguishes never joined, disconnected, input recovery and approved confirmation', () => {
    const states = getOperatorParticipantStatuses({
      viewerId: operators.ownerId, operators, participants: players,
      connections: [{ discordId: players[0].discordId, connectionId: 'read-tab', lastResponseAt: NOW, authExpiresAt: NOW + 60_000, closed: false }],
      inputConnections: { [players[0].discordId]: 'old-tab' },
      history: [{ discordId: players[1].discordId, lastJoinedAt: NOW - 1000, lastDisconnectedAt: NOW }],
      progress: [{ discordId: players[1].discordId, ready: true, confirmed: true }], now: NOW, recoveryUntil: null, viewerConnected: true,
    });
    expect(states[0]).toMatchObject({ connectionStatus: 'CONNECTED', inputConnected: false });
    expect(states[1]).toMatchObject({ connectionStatus: 'DISCONNECTED', confirmed: true });
    expect(states[2].connectionStatus).toBe('NEVER_JOINED');
  });
  it('treats 45 seconds without a response as disconnected and one co-operator as sufficient', () => {
    const connections = [{ discordId: operators.coOperatorId!, connectionId: 'co', lastResponseAt: NOW - 44_999, authExpiresAt: NOW + 60_000, closed: false }];
    expect(hasConnectedOperator(operators, connections, NOW)).toBe(true);
    connections[0].lastResponseAt--;
    expect(hasConnectedOperator(operators, connections, NOW)).toBe(false);
  });
  it('does not consume stream sequence numbers for filtered events or infer gaps from room revision', () => {
    const cursor = { streamId: 'stream-a', streamSeq: 3 };
    expect(emitDraftStreamEvent(cursor, null).cursor).toEqual(cursor);
    const next = emitDraftStreamEvent(cursor, { epoch: 1, roomRevision: 100, payload: {} });
    expect(next.envelope?.streamSeq).toBe(4);
    expect(inspectDraftStreamEvent(cursor, next.envelope!)).toBe('APPLY');
    expect(inspectDraftStreamEvent(cursor, { ...next.envelope!, streamSeq: 5 })).toBe('RESYNC');
    expect(inspectDraftStreamEvent(cursor, { ...next.envelope!, streamId: 'old' })).toBe('IGNORE');
  });
});

describe('map history, replay and recovery rules', () => {
  it('preserves original records and appends named corrections', () => {
    const original = history();
    const corrected = correctDraftMapHistory({ history: original, actor: { discordId: operators.ownerId, displayName: '운영자' },
      roomId: 'ROOM234567', expectedRevision: 0, correctionId: 'correction-1', gameId: 'old-game', reason: '실제로 쟁탈을 진행함',
      after: { mapId: 'control', canonicalMapId: 'control', played: true }, catalog: maps, now: NOW + 2000 });
    expect(getUsedDraftMapIds(corrected)).toEqual(['control']);
    expect(corrected.games[0]).toEqual(original.games[0]);
    expect(corrected.corrections[0]).toMatchObject({ reason: '실제로 쟁탈을 진행함', recordedAt: NOW + 2000, actor: { displayName: '운영자' } });
    expect(original.corrections).toEqual([]);
  });
  it('keeps a map used when another actual game still uses it', () => {
    const original = history(); original.games = [...original.games, { ...original.games[0], gameId: 'another' }];
    const corrected = correctDraftMapHistory({ history: original, actor: { discordId: operators.ownerId, displayName: '운영자' },
      roomId: 'ROOM234567', expectedRevision: 0, correctionId: 'c', gameId: 'old-game', reason: '미진행 오기 정정',
      after: { mapId: 'escort', canonicalMapId: 'escort', played: false }, catalog: maps, now: NOW + 2000 });
    expect(getUsedDraftMapIds(corrected)).toEqual(['escort']);
  });
  it('binds replay to one session, game, epoch and map while preserving or swapping sides', () => {
    const original = history();
    const replay = createDraftReplayPlan({ history: original, actor: { discordId: operators.ownerId, displayName: '운영자' },
      expectedRevision: 0, roomId: 'ROOM234567', gameId: 'replay-game', epoch: 2, originalGameId: 'old-game', targetMap: maps.entries[1],
      excludedCanonicalMapIds: [], reason: '밸런스 조정', banPolicy: 'RETAIN', heroCatalog: heroes, swapSides: true, now: NOW + 2000 });
    expect(replay.firstAttackTeam).toBe('B'); expect(replay.retainedHeroIds).toEqual(['h0', 'h3']);
    const input = { history: original, map: maps.entries[1], excludedCanonicalMapIds: [], gameId: 'replay-game', epoch: 2, replay };
    expect(canUseDraftMap(input)).toBe(true);
    expect(canUseDraftMap({ ...input, epoch: 3 })).toBe(false);
    expect(canUseDraftMap({ ...input, gameId: 'next-game' })).toBe(false);
    expect(canUseDraftMap({ ...input, replay: null })).toBe(false);
  });
  it('waits for explicit recovery resume, grants at least five seconds and keeps fixed expiry', () => {
    const timer: DraftTimer = { phase: 'HERO_VOTING', status: 'ACTIVE', deadlineAt: NOW - 1000,
      remainingMs: null, expiresAt: NOW + 60_000, epoch: 1 };
    const paused = pauseDraftTimer(timer, NOW, true);
    expect(paused.status).toBe('RECOVERY_PAUSED'); expect(paused.deadlineAt).toBeNull();
    const resumed = resumeDraftTimer(paused, NOW + 1000);
    expect(resumed.deadlineAt).toBe(NOW + 6000); expect(resumed.expiresAt).toBe(timer.expiresAt);
    expect(() => resumeDraftTimer(paused, timer.expiresAt)).toThrow('만료');
  });
});
