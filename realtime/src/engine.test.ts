import { describe, expect, it } from 'vitest';
import { DraftEngine, parseDraftCommand, type DraftCommand } from './engine.js';
import { createLocalDraftFixtures } from './local-fixtures.js';
import type { DraftTicket } from './tickets.js';
import type { RoomBundle, StoreGuard } from './model.js';

async function setup() {
  let time = Date.now();
  const fixtures = createLocalDraftFixtures(time);
  fixtures.store.now = () => time;
  await fixtures.store.acquireLease();
  const engine = new DraftEngine(fixtures.store, fixtures.catalogs);
  const ids = fixtures.identities.map(identity => identity.discordUserId);
  const ticket = (id = ids[0], roomCode: string | null = null): DraftTicket => ({
    iss: roomCode ? 'owkr-realtime' : 'owkr-vercel', aud: 'owkr-draft', purpose: roomCode ? 'realtime-entry' : 'admin-entry',
    sub: id, displayName: '시험 사용자', roomCode, scope: roomCode ? 'join' : 'create',
    jti: `test-${id}`, iat: Math.floor(time / 1000), exp: Math.floor(time / 1000) + 300,
  });
  const code = await engine.createRoom(ticket(), 'LOCAL23456', 'create-1');
  const run = async (index: number, type: DraftCommand['type'], extra: Partial<DraftCommand> = {}) => {
    const { room } = await engine.requireRoom(code);
    return engine.command(`c${index}`, parseDraftCommand({ commandId: `cmd-${room.revision}-${index}-${type.replaceAll('.', '-')}`,
      type, epoch: room.epoch, expectedRevision: room.revision, expectedBallotRevision: room.stage?.ballots[index]?.ballotRevision ?? 0,
      selection: [], ready: true, reason: '시험', ...extra }));
  };
  const connect = async (index: number) => engine.connect(ticket(ids[index], code), `c${index}`);
  const readyAll = async () => { for (let index = 0; index < 10; index++) { await connect(index); await run(index, 'ready.set'); } };
  const lockAll = async (selection: string[]) => { for (let index = 0; index < 10; index++) await run(index, 'ballot.lock', { selection }); };
  return { ...fixtures, engine, ids, code, ticket, run, connect, readyAll, lockAll, advance(ms: number) { time += ms; } };
}

describe('local server persisted flow', () => {
  it('completes ten-person map/preference/ban flow and records played maps across games', async () => {
    const app = await setup();
    await app.readyAll();
    await app.run(0, 'draft.start');
    let bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.phase).toBe('MAP_VOTING');
    const mapId = bundle.room.candidates!.candidates[0].map.mapId;
    await app.lockAll([mapId]);
    expect((await app.engine.requireRoom(app.code)).room.stage?.status).toBe('SEALED');
    await app.engine.tick(app.code);
    app.advance(3000); await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.phase).toBe('HERO_PREFERENCE');
    await app.lockAll([]); await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.phase).toBe('HERO_VOTING');
    await app.lockAll(['local-hero-0', 'local-hero-3', 'local-hero-6']); await app.engine.tick(app.code);
    bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.phase).toBe('HERO_RESOLVED');
    expect(bundle.room.heroResult!.bannedHeroIds.length).toBeLessThanOrEqual(4);
    await app.run(0, 'game.confirmApplied');
    expect((await app.engine.requireRoom(app.code)).history.games[0].startedAt).toBeNull();
    await app.run(0, 'game.markStarted'); await app.run(0, 'game.markFinished');
    await app.run(0, 'game.next');
    bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.gameIndex).toBe(2); expect(bundle.room.progress.every(progress => !progress.ready)).toBe(true);
    for (let index = 0; index < 10; index++) await app.run(index, 'ready.set');
    await app.run(0, 'draft.start');
    bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.candidates!.eligiblePool.some(map => map.mapId === mapId)).toBe(false);
    expect(bundle.room.expiresAt).toBe((await app.store.readSource('LOCAL23456')).source!.expiresAt);
  });

  it('returns one room for a retried create request', async () => {
    const app = await setup();
    expect(await app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-1')).toBe(app.code);
    expect(await app.store.listActiveRooms()).toEqual([app.code]);
    await expect(app.engine.createRoom(app.ticket(), 'OTHER23456', 'create-1')).rejects.toThrow('다른 원본');
    app.advance(171 * 60_000);
    expect(await app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-1')).toBe(app.code);
  });

  it('blocks starting with nine ready participants, including an unready playing operator', async () => {
    const app = await setup(); await app.readyAll();
    await app.run(0, 'ready.set', { ready: false });
    await expect(app.run(0, 'draft.start')).rejects.toThrow('미준비');
    expect((await app.engine.requireRoom(app.code)).room.phase).toBe('LOBBY');
  });

  it('checks committed source changes in the same storage operation as starting', async () => {
    const app = await setup(); await app.readyAll();
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle: RoomBundle, guard: StoreGuard) => {
      if (guard.expectedSourceRaw) {
        const source = JSON.parse(guard.expectedSourceRaw); source.revision++;
        app.store.setSource('LOCAL23456', source);
      }
      return commit(bundle, guard);
    };
    await expect(app.run(0, 'draft.start')).rejects.toThrow('원본이 변경');
    expect((await app.engine.requireRoom(app.code)).room.phase).toBe('LOBBY');
  });

  it('rejects a vote that arrived before the deadline but commits after it', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { app.advance(20_000); return commit(bundle, guard); };
    await expect(app.run(0, 'ballot.lock', { selection: [] })).rejects.toThrow('마감 이후');
    expect((await app.engine.requireRoom(app.code)).room.stage!.ballots[0].locked).toBe(false);
  });

  it('keeps the same sealed ballots and entropy across restart, waiting for explicit resume', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([]);
    const sealed = (await app.engine.requireRoom(app.code)).room.stage!.sealed;
    await app.engine.recover();
    let bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.timer.status).toBe('RECOVERY_PAUSED'); expect(bundle.room.stage!.sealed).toEqual(sealed);
    await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.mapResult).toBeNull();
    await app.run(0, 'draft.resume'); await app.engine.tick(app.code);
    bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.phase).toBe('MAP_RESOLVED');
  });

  it('revokes writes from an old input tab while preserving one ballot', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.engine.connect(app.ticket(app.ids[0], app.code), 'new-tab');
    await expect(app.run(0, 'ballot.lock')).rejects.toThrow('입력 담당');
    expect((await app.engine.requireRoom(app.code)).room.stage!.ballots).toHaveLength(10);
  });

  it('pauses on last operator disconnect, preserving the deadline remainder', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    app.advance(3000); await app.engine.disconnect('c0');
    const { room } = await app.engine.requireRoom(app.code);
    expect(room.timer.status).toBe('PAUSED'); expect(room.timer.remainingMs).toBe(17_000);
    await app.connect(0);
    expect((await app.engine.requireRoom(app.code)).room.timer.status).toBe('PAUSED');
  });

  it('does not pause for an ordinary participant disconnect and keeps approved ballots', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.run(1, 'ballot.lock'); await app.engine.disconnect('c1');
    const { room } = await app.engine.requireRoom(app.code);
    expect(room.timer.status).toBe('ACTIVE'); expect(room.stage!.ballots[1].locked).toBe(true);
  });

  it('rejects non-roster and forged command data without exposing private selections', async () => {
    const app = await setup();
    await expect(app.engine.connect({ ...app.ticket(undefined, app.code), sub: '999999999999999999' }, 'outsider')).rejects.toThrow('명단');
    expect(() => parseDraftCommand({ type: 'ballot.lock', epoch: 1, commandId: 'id', selection: 'h0' })).toThrow('선택');
  });
});
