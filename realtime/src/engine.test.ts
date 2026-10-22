import { describe, expect, it, vi } from 'vitest';
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
  const finishMapReveal = async () => {
    const { room } = await engine.requireRoom(code);
    expect(room.phase).toBe('MAP_RESOLVED');
    time = room.timer.deadlineAt!;
    await engine.tick(code);
  };
  return { ...fixtures, engine, ids, code, ticket, run, connect, readyAll, lockAll, finishMapReveal, advance(ms: number) { time += ms; } };
}

describe('local server persisted flow', () => {
  it('shares the randomized roll deadline and holds the confirmed map for another full four seconds', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    const { room } = await app.engine.requireRoom(app.code);
    const options = room.candidates!.candidates;
    for (let index = 0; index < 10; index++) await app.run(index, 'ballot.save', { selection: [options[index % 2].map.mapId] });
    await app.engine.tick(app.code);
    const views = await Promise.all(Array.from({ length: 10 }, (_, index) => app.engine.snapshot(`c${index}`)));
    const duration = views[0].mapResult!.rollDurationMs!;
    expect(duration).toBeGreaterThanOrEqual(2500);
    expect(duration).toBeLessThanOrEqual(4000);
    expect(new Set(views.map(view => view.timer.deadlineAt)).size).toBe(1);
    expect(views[0].timer.deadlineAt! - views[0].serverNow).toBe(duration + 4000);
    app.advance(duration); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c0')).phase).toBe('MAP_RESOLVED');
    app.advance(3999); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c0')).phase).toBe('MAP_RESOLVED');
    app.advance(1); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c0')).phase).toBe('HERO_VOTING');
  });
  it('completes ten-person map/ban flow and records played maps across games', async () => {
    const app = await setup();
    await app.readyAll();
    await app.run(0, 'draft.start');
    let bundle = await app.engine.requireRoom(app.code);
    expect(bundle.room.phase).toBe('MAP_VOTING');
    const mapId = bundle.room.candidates!.candidates[0].map.mapId;
    await app.lockAll([mapId]);
    expect((await app.engine.requireRoom(app.code)).room.stage?.status).toBe('SEALED');
    await app.engine.tick(app.code);
    await app.finishMapReveal();
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

  it('saves map changes, deselection and abstention before automatically sealing ten ready ballots', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    const bundle = await app.engine.requireRoom(app.code);
    const mapId = bundle.room.candidates!.candidates[0].map.mapId;
    await app.run(0, 'ballot.save', { selection: [mapId] });
    let view = await app.engine.snapshot('c0');
    expect(view.ballots?.self).toMatchObject({ selection: [mapId], locked: true });
    expect(view.ballots?.mapTotals?.[mapId]).toBe(1);
    expect(view.ballots?.mapTeamTotals?.[mapId]).toEqual({ A: 1, B: 0 });
    await app.run(0, 'ballot.save', { selection: ['RANDOM'] });
    view = await app.engine.snapshot('c0');
    expect(view.ballots?.self).toMatchObject({ selection: ['RANDOM'], locked: true });
    expect(view.ballots?.mapTotals?.[mapId] ?? 0).toBe(0);
    expect(view.ballots?.mapTotals?.RANDOM).toBe(1);
    expect(view.ballots?.mapTeamTotals?.[mapId]).toEqual({ A: 0, B: 0 });
    expect(view.ballots?.mapTeamTotals?.RANDOM).toEqual({ A: 1, B: 0 });
    await app.run(0, 'ballot.save', { selection: [] });
    expect((await app.engine.snapshot('c0')).ballots?.self).toMatchObject({ selection: [], locked: false });
    await app.run(0, 'ballot.lock', { selection: [] });
    expect((await app.engine.snapshot('c0')).ballots?.self).toMatchObject({ selection: [], locked: true });
    await app.run(0, 'ballot.save', { selection: [mapId] });
    for (let index = 1; index < 10; index++) await app.run(index, 'ballot.save', { selection: [mapId] });
    expect((await app.engine.requireRoom(app.code)).room.stage?.status).toBe('SEALED');
    await expect(app.run(0, 'ballot.save', { selection: [] })).rejects.toThrow('마감');
    await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.mapResult?.map.mapId).toBe(mapId);
  });

  it('automatically confirms ten three-pick saves and seals the stage without confirm commands', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([]); await app.engine.tick(app.code);
    await app.finishMapReveal();
    const selection = ['local-hero-0', 'local-hero-3', 'local-hero-6'];
    await app.run(0, 'ballot.save', { selection });
    expect((await app.engine.snapshot('c0')).ballots?.self?.locked).toBe(true);
    await app.run(0, 'ballot.save', { selection: [selection[0], '', selection[2]] });
    expect((await app.engine.snapshot('c0')).ballots?.self?.locked).toBe(false);
    await app.run(0, 'ballot.save', { selection: [...selection].reverse() });
    expect((await app.engine.snapshot('c0')).ballots?.self).toMatchObject({ locked: true, selection: [...selection].reverse() });
    for (let index = 1; index < 10; index++) await app.run(index, 'ballot.save', { selection });
    const { room } = await app.engine.requireRoom(app.code);
    expect(room.stage?.status).toBe('SEALED');
    expect((await app.engine.snapshot('c0')).stageStatus).toBe('SEALED');
    await expect(app.run(0, 'ballot.save', { selection: [] })).rejects.toThrow('마감');
    expect(room.stage?.sealed?.ballots.every(ballot => ballot.locked)).toBe(true);
    await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.phase).toBe('HERO_RESOLVED');
  });

  it('returns one room for a retried create request', async () => {
    const app = await setup();
    expect(await app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-1')).toBe(app.code);
    expect(await app.store.listActiveRooms()).toEqual([app.code]);
    await expect(app.engine.createRoom(app.ticket(), 'OTHER23456', 'create-1')).rejects.toThrow('다른 원본');
    app.advance(171 * 60_000);
    await expect(app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-1')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
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

  it('recovers a persisted legacy preference stage into an empty paused ban vote', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([]); await app.engine.tick(app.code);
    await app.finishMapReveal();
    const bundle = await app.engine.requireRoom(app.code);
    const epoch = bundle.room.epoch;
    Object.assign(bundle.room, { phase: 'HERO_PREFERENCE' });
    Object.assign(bundle.room.timer, { phase: 'HERO_PREFERENCE' });
    Object.assign(bundle.room.stage!, { kind: 'PREFERENCE', ballots: bundle.room.stage!.ballots.map(ballot => ({ ...ballot, selection: ['local-hero-0'], locked: true })) });
    const revision = bundle.room.revision++;
    await app.store.commit(bundle, { expectedRoomRevision: revision, expectedHistoryRevision: bundle.history.mapHistoryRevision });
    await app.engine.recover();
    const recovered = (await app.engine.requireRoom(app.code)).room;
    expect(recovered.phase).toBe('HERO_VOTING');
    expect(recovered.epoch).toBe(epoch + 1);
    expect(recovered.timer.status).toBe('RECOVERY_PAUSED');
    expect(recovered.timer.remainingMs).toBe(40_000);
    expect(recovered.stage?.kind).toBe('BAN');
    expect(recovered.stage?.ballots.every(ballot => !ballot.locked && ballot.selection.length === 0)).toBe(true);
    await app.run(0, 'draft.resume');
    await app.lockAll(['local-hero-0']); await app.engine.tick(app.code);
    expect((await app.engine.requireRoom(app.code)).room.heroResult?.scores.A[0].effectiveScore).toBe(35);
  });

  it('replaces the old connection while preserving readiness, ballots and operator presence', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    const mapId = (await app.engine.requireRoom(app.code)).room.candidates!.candidates[0].map.mapId;
    await app.run(0, 'ballot.lock', { selection: [mapId] });
    expect(await app.engine.connect(app.ticket(app.ids[0], app.code), 'new-tab')).toEqual(['c0']);
    expect(app.engine.clients.has('c0')).toBe(false);
    await expect(app.run(0, 'ballot.lock')).rejects.toThrow('먼저 방에 연결');
    await app.engine.disconnect('c0'); await app.engine.tick(app.code);
    const view = await app.engine.snapshot('new-tab');
    expect(view.timer.status).toBe('ACTIVE');
    expect(view.selfReady).toBe(true);
    expect(view.ballots?.self?.selection).toEqual([mapId]);
    expect(view.ballots?.self?.locked).toBe(true);
    expect((await app.engine.requireRoom(app.code)).room.stage!.ballots).toHaveLength(10);
    expect(app.engine.clients.size).toBe(10);
  });

  it('keeps the previous connection usable if persisting the new connection fails', async () => {
    const app = await setup(); await app.connect(0);
    const commit = vi.spyOn(app.store, 'commit').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(app.engine.connect(app.ticket(app.ids[0], app.code), 'failed-tab')).rejects.toThrow('storage unavailable');
    expect(app.engine.clients.has('failed-tab')).toBe(false);
    expect(app.engine.clients.get('c0')?.input).toBe(true);
    commit.mockRestore();
    expect((await app.engine.snapshot('c0')).inputConnected).toBe(true);
  });

  it('repeated tabs never grow the authenticated connection count', async () => {
    const app = await setup(); await app.readyAll();
    let previousId = 'c0';
    for (let index = 0; index < 30; index++) {
      const id = `tab-${index}`;
      expect(await app.engine.connect(app.ticket(app.ids[0], app.code), id)).toEqual([previousId]);
      expect(app.engine.clients.size).toBe(10);
      previousId = id;
    }
  });

  it('scopes replacement to the same room and does not kick the account from another room', async () => {
    const app = await setup();
    const otherRoom = await app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-other-room');
    await app.connect(0);
    await app.engine.connect(app.ticket(app.ids[0], otherRoom), 'other-room');
    expect(await app.engine.connect(app.ticket(app.ids[0], app.code), 'new-tab')).toEqual(['c0']);
    expect(app.engine.clients.has('other-room')).toBe(true);
    expect((await app.engine.snapshot('other-room')).inputConnected).toBe(true);
    expect(app.engine.clients.size).toBe(2);
  });

  it('preserves a manual pause when the operator switches tabs and allows the latest tab to resume', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.run(0, 'draft.pause');
    await app.engine.connect(app.ticket(app.ids[0], app.code), 'new-tab');
    await app.engine.disconnect('c0');
    const { room } = await app.engine.requireRoom(app.code);
    expect(room.timer.status).toBe('PAUSED');
    await app.engine.command('new-tab', parseDraftCommand({ type: 'draft.resume', commandId: 'resume-from-new-tab',
      epoch: room.epoch, expectedRevision: room.revision }));
    expect((await app.engine.requireRoom(app.code)).room.timer.status).toBe('ACTIVE');
  });

  it('leaves only the last tab after simultaneous serialized connection attempts', async () => {
    const app = await setup(); await app.readyAll();
    const replacements = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      app.engine.serial(() => app.engine.connect(app.ticket(app.ids[0], app.code), `parallel-${index}`))));
    expect(replacements[0]).toEqual(['c0']);
    expect(replacements[7]).toEqual(['parallel-6']);
    expect(app.engine.clients.size).toBe(10);
    expect(app.engine.clients.has('parallel-7')).toBe(true);
    expect((await app.engine.snapshot('parallel-7')).selfReady).toBe(true);
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
    await app.lockAll(['ana', 'dva', 'genji']); await app.engine.tick(app.code);
    await app.run(0, 'game.confirmApplied'); await app.run(0, 'game.markStarted'); await app.run(0, 'game.markFinished');
  }
  it('allows only the designated player, freezes all players for the same four seconds, then opens bans', async () => {
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
    expect(snapshots[0].timer.deadlineAt! - snapshots[0].serverNow).toBe(4000);
    await expect(app.run(3, 'ballot.lock', { selection: ['ana'] })).rejects.toThrow('현재 입력');
    await expect(app.run(3, 'map.pick', { mapId: 'kings-row' })).rejects.toThrow('팟지 맵 선택 단계');
    app.advance(3999); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c3')).phase).toBe('MAP_RESOLVED');
    app.advance(1); await app.engine.tick(app.code);
    expect((await app.engine.snapshot('c3')).phase).toBe('HERO_VOTING');
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
      await app.run(3, 'map.pick', { mapId }); await app.finishMapReveal();
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
  it('starts the full four-second reveal at storage commit even when saving is delayed', async () => {
    const app = await startPotg(); const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { if (bundle.room.phase === 'MAP_RESOLVED') app.advance(1250); return commit(bundle, guard); };
    await app.run(3, 'map.pick', { mapId: 'grimsvotn' });
    const view = await app.engine.snapshot('c0');
    expect(view.timer.deadlineAt! - view.serverNow).toBe(4000);
  });
  it('also holds a voted map for three full seconds after delayed result persistence', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([(await app.engine.requireRoom(app.code)).room.candidates!.candidates[0].map.mapId]);
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { if (bundle.room.phase === 'MAP_RESOLVED') app.advance(1250); return commit(bundle, guard); };
    await app.engine.tick(app.code); const view = await app.engine.snapshot('c0');
    expect(view.timer.deadlineAt! - view.serverNow).toBe(4000);
  });
  it('keeps a retried configuration idempotent after it invalidates previous ready commands', async () => {
    const app = await setup(); await app.readyAll(); const view = await app.engine.snapshot('c0');
    const command = parseDraftCommand({ commandId: 'configure-once', type: 'map.configure', epoch: view.epoch, expectedRevision: view.roomRevision, mapMode: 'POTG', pickerDiscordId: app.ids[3] });
    await app.engine.command('c0', command);
    expect((await app.engine.command('c0', command)).duplicate).toBe(true);
    await expect(app.engine.command('c1', parseDraftCommand({ commandId: 'old-ready', type: 'ready.set', epoch: view.epoch, expectedRevision: view.roomRevision, ready: true }))).rejects.toThrow('경기 세대');
  });
});


describe('closing a draft room', () => {
  const closeType = 'room.close' as DraftCommand['type'];
  it('lets an operator close a room even after the source roster disappears and releases its active slot', async () => {
    const app = await setup(); await app.readyAll();
    const before = (await app.store.load(app.code))!;
    app.store.setSource('LOCAL23456', null);
    await app.run(0, closeType);
    const closed = (await app.store.load(app.code))!;
    expect(closed.room.timer).toMatchObject({ status: 'CANCELLED', deadlineAt: null, remainingMs: null });
    expect(closed.history.activeRoomId).toBeNull();
    expect(closed.room.expiresAt).toBe(before.room.expiresAt);
    expect(closed.history.games).toEqual(before.history.games);
    expect(closed.room.audit.at(-1)).toMatchObject({ actorId: app.ids[0], action: 'room.close', reason: '시험' });
    expect(await app.store.listActiveRooms()).not.toContain(app.code);
    await expect(app.engine.requireRoom(app.code)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.engine.connect(app.ticket(app.ids[1], app.code), 'late')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.engine.renew(app.ticket(app.ids[1], app.code), 'c1')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.run(1, 'ready.set')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await expect(app.engine.createRoom(app.ticket(), 'LOCAL23456', 'create-1')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await app.engine.disconnect('c1');
    expect((await app.store.load(app.code))!.room.timer.status).toBe('CANCELLED');
    const fresh = new DraftEngine(app.store, app.catalogs);
    await fresh.recover();
    await expect(fresh.requireRoom(app.code)).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
  });
  it('rejects participants, stale revisions and missing closure reasons without changing the room', async () => {
    const app = await setup(); await app.readyAll();
    await expect(app.run(1, closeType)).rejects.toMatchObject({ code: 'OPERATOR_REQUIRED' });
    await expect(app.run(0, closeType, { expectedRevision: -1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(app.run(0, closeType, { reason: '' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    expect((await app.engine.requireRoom(app.code)).room.timer.status).toBe('ACTIVE');
  });
  it('does not reopen a closed room through stale stored writes and permits a new independent room', async () => {
    const app = await setup(); await app.readyAll();
    const stale = (await app.store.load(app.code))!;
    await app.run(0, closeType);
    await expect(app.store.commit(stale, { expectedRoomRevision: stale.room.revision,
      expectedHistoryRevision: stale.history.mapHistoryRevision })).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    const newCode = await app.engine.createRoom(app.ticket(), 'LOCAL23456', 'new-room');
    expect(newCode).not.toBe(app.code);
    expect(await app.store.listActiveRooms()).toEqual([newCode]);
  });
  it('requires a playing game to finish first and preserves recorded game and map history', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([]); await app.engine.tick(app.code); await app.finishMapReveal();
    await app.lockAll([]); await app.engine.tick(app.code); await app.run(0, 'game.confirmApplied');
    await app.run(0, 'game.markStarted');
    await expect(app.run(0, closeType)).rejects.toMatchObject({ code: 'GAME_NOT_CLOSED' });
    await app.run(0, 'game.markFinished');
    const before = (await app.store.load(app.code))!;
    await app.run(0, closeType);
    expect((await app.store.load(app.code))!.history.games).toEqual(before.history.games);
  });
  it('acknowledges the exact close command retry without accepting a different command', async () => {
    const app = await setup(); await app.readyAll();
    const { room } = await app.engine.requireRoom(app.code);
    const command = parseDraftCommand({ type: closeType, commandId: 'close-retry', epoch: room.epoch,
      expectedRevision: room.revision, reason: '내전 종료' });
    const first = await app.engine.command('c0', command);
    expect(await app.engine.command('c0', command)).toEqual({ revision: first.revision, duplicate: true });
    await expect(app.engine.command('c0', { ...command, commandId: 'another-close' })).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
  });
});


describe('automatic idle room closure', () => {
  const idleMs = 2 * 60 * 60 * 1000;
  it('closes exactly at two idle hours and preserves history and fixed expiration', async () => {
    const app = await setup();
    const before = (await app.store.load(app.code))!;
    app.advance(idleMs - 1); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('ACTIVE');
    app.advance(1); await app.engine.tick(app.code);
    const closed = (await app.store.load(app.code))!;
    expect(closed.room.timer.status).toBe('CANCELLED');
    expect(closed.history.activeRoomId).toBeNull();
    expect(closed.history.games).toEqual(before.history.games);
    expect(closed.room.expiresAt).toBe(before.room.expiresAt);
    expect(closed.room.audit.at(-1)).toMatchObject({ actorId: 'system', action: 'room.close.idle' });
    expect(await app.store.listActiveRooms()).toEqual([]);
    await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.audit).toHaveLength(1);
  });
  it('renews idle time on an accepted command but not reads, reconnects or ticket renewal', async () => {
    const app = await setup(); await app.readyAll();
    app.advance(30 * 60_000); await app.connect(0); await app.run(0, 'ready.set', { ready: false });
    const active = (await app.store.load(app.code))!;
    expect(active.room).toHaveProperty('lastActivityAt', active.now);
    app.advance(idleMs - 1); await app.connect(0);
    await app.engine.renew(app.ticket(app.ids[0], app.code), 'c0');
    await app.engine.snapshot('c0'); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room).toHaveProperty('lastActivityAt', active.now);
    app.advance(1); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('CANCELLED');
  });
  it('does not extend idle time for replayed commands or source changes', async () => {
    const app = await setup(); await app.connect(0);
    const { room } = await app.engine.requireRoom(app.code);
    const command = parseDraftCommand({ type: 'ready.set', commandId: 'idle-retry', epoch: room.epoch,
      expectedRevision: room.revision, ready: true });
    await app.engine.command('c0', command);
    app.advance(60 * 60_000); await app.connect(0);
    expect((await app.engine.command('c0', command)).duplicate).toBe(true);
    app.store.setSource('LOCAL23456', null); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('ROSTER_CHANGED');
    app.advance(60 * 60_000); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('CANCELLED');
  });
  it('closes idle rooms during recovery and before issuing fresh access without resurrecting them', async () => {
    const app = await setup(); app.advance(idleMs);
    await expect(app.engine.connect(app.ticket(app.ids[0], app.code), 'late')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    const other = await setup(); other.advance(idleMs);
    const engine = new DraftEngine(other.store, other.catalogs); await engine.recover();
    expect((await other.store.load(other.code))!.room.timer.status).toBe('CANCELLED');
    expect(await other.store.listActiveRooms()).toEqual([]);
  });
  it('uses stored command history for legacy rooms without a last activity field', async () => {
    const app = await setup(); await app.connect(0);
    app.advance(30 * 60_000); await app.connect(0); await app.run(0, 'ready.set');
    const legacy = (await app.store.load(app.code))!;
    delete (legacy.room as typeof legacy.room & { lastActivityAt?: number }).lastActivityAt;
    const revision = legacy.room.revision++;
    await app.store.commit(legacy, { expectedRoomRevision: revision, expectedHistoryRevision: legacy.history.mapHistoryRevision });
    app.advance(idleMs - 1); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('ACTIVE');
    app.advance(1); await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('CANCELLED');
  });
  it('rejects activity that reaches storage at the idle boundary instead of reviving the room', async () => {
    const app = await setup(); await app.connect(0); app.advance(idleMs - 1); await app.connect(0);
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { app.advance(1); return commit(bundle, guard); };
    await expect(app.run(0, 'ready.set')).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
    await app.engine.tick(app.code);
    expect((await app.store.load(app.code))!.room.timer.status).toBe('CANCELLED');
  });
  it('stamps ballot activity at the accepted storage time', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    const commit = app.store.commit.bind(app.store);
    app.store.commit = async (bundle, guard) => { app.advance(250); return commit(bundle, guard); };
    const ack = await app.run(0, 'ballot.save');
    const bundle = (await app.store.load(app.code))!;
    expect(bundle.room).toHaveProperty('lastActivityAt', ack.acceptedAt);
    expect(bundle.room).toHaveProperty('lastActivityAt', bundle.now);
  });
  it('also closes forgotten playing rooms without fabricating a game finish record', async () => {
    const app = await setup(); await app.readyAll(); await app.run(0, 'draft.start');
    await app.lockAll([]); await app.engine.tick(app.code); await app.finishMapReveal();
    await app.lockAll([]); await app.engine.tick(app.code); await app.run(0, 'game.confirmApplied'); await app.run(0, 'game.markStarted');
    const before = (await app.store.load(app.code))!;
    app.advance(idleMs); await app.engine.tick(app.code);
    const closed = (await app.store.load(app.code))!;
    expect(closed.room.timer.status).toBe('CANCELLED');
    expect(closed.history.games).toEqual(before.history.games);
  });
});
