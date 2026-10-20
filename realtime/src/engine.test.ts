import { describe, expect, it } from 'vitest';
import { DraftEngine, parseDraftCommand, type DraftCommand } from './engine.js';
import { createLocalDraftFixtures } from './local-fixtures.js';
import type { DraftTicket } from './tickets.js';
import type { RoomBundle, StoreGuard } from './model.js';

async function setup(options: { realCatalogs?: boolean } = {}) {
  let time = Date.now();
  const fixtures = createLocalDraftFixtures(time, { syntheticCatalogs: !options.realCatalogs });
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


describe('POTG selection with the bundled catalog', () => {
  async function startPotg() {
    const app = await setup({ realCatalogs: true }); await app.readyAll();
    await app.run(0, 'map.configure', { mapMode: 'POTG', pickerDiscordId: app.ids[3] });
    expect((await app.engine.requireRoom(app.code)).room.progress.every(player => !player.ready)).toBe(true);
    for (let index = 0; index < 10; index++) await app.run(index, 'ready.set');
    await app.run(0, 'draft.start'); return app;
  }
  async function finish(app: Awaited<ReturnType<typeof setup>>) {
    await app.lockAll([]); await app.engine.tick(app.code);
    await app.lockAll(['ana', 'dva', 'genji']); await app.engine.tick(app.code);
    await app.run(0, 'game.confirmApplied'); await app.run(0, 'game.markStarted'); await app.run(0, 'game.markFinished');
  }
  it('allows only the designated player, freezes all players for the same three seconds, then opens preference', async () => {
    const app = await startPotg();
    const before = await app.engine.snapshot('c0');
    expect(before.phase).toBe('MAP_PICKING'); expect(before.availableMaps).toHaveLength(31);
    expect(before.availableMaps.some(map => map.mapId === 'grimsvotn')).toBe(true);
    await expect(app.run(0, 'map.pick', { mapId: 'grimsvotn' })).rejects.toThrow('팟지 선수만');
    await expect(app.run(1, 'map.pick', { mapId: 'grimsvotn' })).rejects.toThrow('팟지 선수만');
    await expect(app.run(3, 'ballot.lock', { selection: ['grimsvotn'] })).rejects.toThrow('현재 입력');
    await app.run(3, 'map.pick', { mapId: 'grimsvotn' });
    const snapshots = await Promise.all(Array.from({ length: 10 }, (_, index) => app.engine.snapshot(`c${index}`)));
    expect(new Set(snapshots.map(view => view.timer.deadlineAt)).size).toBe(1);
    expect(snapshots.every(view => view.phase === 'MAP_RESOLVED' && view.ballots === null)).toBe(true);
    expect(snapshots[0].timer.deadlineAt! - snapshots[0].serverNow).toBe(3000);
    await expect(app.run(3, 'ballot.lock', { selection: ['ana'] })).rejects.toThrow('현재 입력');
    await expect(app.run(3, 'map.pick', { mapId: 'kings-row' })).rejects.toThrow('팟지 맵 선택 단계');
    app.advance(2999); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c3')).phase).toBe('MAP_RESOLVED');
    app.advance(1); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c3')).phase).toBe('HERO_PREFERENCE');
  });
  it('reuses the same invitation across three games, resetting ready/map/bans while preserving played-map exclusions', async () => {
    const app = await startPotg(); const original = await app.engine.requireRoom(app.code);
    for (const [index, mapId] of ['grimsvotn', 'kings-row', 'ilios'].entries()) {
      if (index > 0) {
        await app.run(0, 'game.next');
        const reset = await app.engine.snapshot('c3');
        expect(reset.roomCode).toBe(app.code); expect(reset.gameIndex).toBe(index + 1);
        expect(reset.phase).toBe('LOBBY'); expect(reset.readyCount).toBe(0);
        expect(reset.mapResult).toBeNull(); expect(reset.heroResult).toBeNull();
        expect(reset.expiresAt).toBe(original.room.expiresAt);
        for (let player = 0; player < 10; player++) await app.run(player, 'ready.set');
        await app.run(0, 'draft.start');
        await expect(app.run(3, 'map.pick', { mapId: 'grimsvotn' })).rejects.toThrow('사용했거나');
      }
      await app.run(3, 'map.pick', { mapId }); app.advance(3000); await app.engine.tick(app.code);
      await finish(app);
    }
    const result = await app.engine.requireRoom(app.code);
    expect(result.history.games.map(game => game.map.mapId)).toEqual(['grimsvotn', 'kings-row', 'ilios']);
    expect(result.history.games.every(game => game.mapSelection?.pickerDiscordId === app.ids[3])).toBe(true);
    expect((await app.engine.snapshot('c0')).availableMapCount).toBe(28);
  });
  it('checks source and pause state atomically and rejects reassignment outside the lobby', async () => {
    const app = await startPotg();
    await expect(app.run(3, 'map.configure', { mapMode: 'VOTE' })).rejects.toThrow('권한');
    await expect(app.run(0, 'map.configure', { mapMode: 'VOTE' })).rejects.toThrow('준비 단계');
    await app.run(0, 'draft.pause');
    await expect(app.run(3, 'map.pick', { mapId: 'grimsvotn' })).rejects.toThrow('팟지 맵 선택 단계');
    await app.run(0, 'draft.resume');
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => {
      if (guard.expectedSourceRaw) { const source = JSON.parse(guard.expectedSourceRaw); source.revision++; app.store.setSource('LOCAL23456', source); }
      return commit(bundle, guard);
    };
    await expect(app.run(3, 'map.pick', { mapId: 'grimsvotn' })).rejects.toThrow('원본이 변경');
    expect((await app.engine.requireRoom(app.code)).room.mapResult).toBeNull();
  });
  it('starts the full three-second reveal at storage commit even when saving is delayed', async () => {
    const app = await startPotg(); const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { if (bundle.room.phase === 'MAP_RESOLVED') app.advance(1250); return commit(bundle, guard); };
    await app.run(3, 'map.pick', { mapId: 'grimsvotn' });
    const view = await app.engine.snapshot('c0');
    expect(view.timer.deadlineAt! - view.serverNow).toBe(3000);
  });
  it('also holds a voted map for three full seconds after delayed result persistence', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([(await app.engine.requireRoom(app.code)).room.candidates!.candidates[0].map.mapId]);
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { if (bundle.room.phase === 'MAP_RESOLVED') app.advance(1250); return commit(bundle, guard); };
    await app.engine.tick(app.code); const view = await app.engine.snapshot('c0');
    expect(view.timer.deadlineAt! - view.serverNow).toBe(3000);
  });
  it('keeps a retried configuration idempotent after it invalidates previous ready commands', async () => {
    const app = await setup(); await app.readyAll(); const view = await app.engine.snapshot('c0');
    const command = parseDraftCommand({ commandId: 'configure-once', type: 'map.configure', epoch: view.epoch, expectedRevision: view.roomRevision, mapMode: 'POTG', pickerDiscordId: app.ids[3] });
    await app.engine.command('c0', command);
    expect((await app.engine.command('c0', command)).duplicate).toBe(true);
    await expect(app.engine.command('c1', parseDraftCommand({ commandId: 'old-ready', type: 'ready.set', epoch: view.epoch, expectedRevision: view.roomRevision, ready: true }))).rejects.toThrow('경기 세대');
  });
});
