import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import { DraftEngine } from './engine.js';
import { createLocalDraftFixtures } from './local-fixtures.js';
import { LOAD_ROOM_SCRIPT, RedisRealtimeStore } from './store.js';
import type { RoomBundle } from './model.js';

async function setup() {
  const fixture = createLocalDraftFixtures();
  await fixture.store.acquireLease();
  const engine = new DraftEngine(fixture.store, fixture.catalogs);
  const now = Math.floor(Date.now() / 1000);
  const code = await engine.createRoom({ iss: 'owkr-vercel', aud: 'owkr-draft', purpose: 'admin-entry',
    sub: fixture.identities[0].discordUserId, displayName: '시험', roomCode: null, scope: 'create', jti: 'setup', iat: now, exp: now + 60,
  }, 'LOCAL23456', 'create');
  const bundle = await engine.requireRoom(code);
  const reply = (value: RoomBundle = bundle) => JSON.stringify({ room: JSON.stringify(value.room), history: JSON.stringify(value.history),
    value: value.sourceRaw, identities: fixture.identities, now: value.now });
  const get = vi.fn().mockResolvedValue(JSON.stringify(bundle.room));
  const evaluate = vi.fn().mockResolvedValue(reply());
  const store = new RedisRealtimeStore({ get, eval: evaluate } as unknown as Redis);
  return { fixture, bundle, code, reply, get, evaluate, store };
}

describe('Redis room read contracts', () => {
  it('uses explicit keys and one atomic read after discovering immutable key locations', async () => {
    const app = await setup();
    expect(await app.store.load(app.code)).toEqual(app.bundle);
    await app.store.load(app.code);
    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.evaluate).toHaveBeenCalledTimes(2);
    expect(app.evaluate).toHaveBeenLastCalledWith(LOAD_ROOM_SCRIPT, [
      `draft:v1:room:${app.code}`, `draft:v1:session:${app.bundle.room.draftSessionId}`,
      'match-live:v1:LOCAL23456', 'user-sheet:v2:entries', 'user-sheet:v2:version',
    ], [app.bundle.room.draftSessionId, 'LOCAL23456']);
  });

  it('reads new room/history/source versions and Redis time rather than caching permissions or state', async () => {
    const app = await setup(); await app.store.load(app.code);
    const updated = structuredClone(app.bundle);
    updated.room.revision++; updated.history.mapHistoryRevision++; updated.now += 1000;
    const source = JSON.parse(updated.sourceRaw!); source.revision++;
    updated.sourceRaw = JSON.stringify(source);
    app.evaluate.mockResolvedValueOnce(app.reply(updated));
    const loaded = await app.store.load(app.code);
    expect(loaded?.room.revision).toBe(updated.room.revision);
    expect(loaded?.history.mapHistoryRevision).toBe(updated.history.mapHistoryRevision);
    expect(loaded?.source?.revision).toBe(source.revision);
    expect(loaded?.now).toBe(updated.now);
    expect(app.get).toHaveBeenCalledTimes(1);
  });

  it('does not reuse previous identity information when the current source is invalid', async () => {
    const app = await setup(); await app.store.load(app.code);
    app.evaluate.mockResolvedValueOnce(JSON.stringify({ room: JSON.stringify(app.bundle.room), history: JSON.stringify(app.bundle.history),
      value: app.bundle.sourceRaw, identities: [], now: app.bundle.now + 500 }));
    const loaded = await app.store.load(app.code);
    expect(loaded?.source).toBeNull(); expect(loaded?.sourceRaw).toBeNull();
    expect(loaded?.now).toBe(app.bundle.now + 500);
  });

  it('invalidates the routing hint when the current room or history has disappeared', async () => {
    const app = await setup(); await app.store.load(app.code);
    app.evaluate.mockResolvedValueOnce(JSON.stringify({ room: null }));
    expect(await app.store.load(app.code)).toBeNull();
    app.get.mockResolvedValueOnce(null);
    expect(await app.store.load(app.code)).toBeNull();
    expect(app.get).toHaveBeenCalledTimes(2);
  });

  it('rediscovers key locations if a room code now points to another session/source', async () => {
    const app = await setup(); await app.store.load(app.code);
    const replaced = structuredClone(app.bundle);
    replaced.room.draftSessionId = 'replacement-session'; replaced.room.source.sourceId = 'OTHER23456';
    replaced.history.draftSessionId = 'replacement-session';
    app.get.mockResolvedValueOnce(JSON.stringify(replaced.room));
    app.evaluate.mockResolvedValueOnce(JSON.stringify({ routeChanged: true })).mockResolvedValueOnce(app.reply(replaced));
    const loaded = await app.store.load(app.code);
    expect(loaded?.history.draftSessionId).toBe('replacement-session');
    expect(loaded?.source?.sourceId).toBe('OTHER23456');
    expect(app.evaluate.mock.calls.at(-1)?.[1]).toContain('draft:v1:session:replacement-session');
    expect(app.evaluate.mock.calls.at(-1)?.[1]).toContain('match-live:v1:OTHER23456');
  });

  it('fails closed when key locations keep changing', async () => {
    const app = await setup();
    app.evaluate.mockResolvedValue(JSON.stringify({ routeChanged: true }));
    await expect(app.store.load(app.code)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(app.evaluate).toHaveBeenCalledTimes(2);
  });

  it('bounds routing hints so expired rooms cannot accumulate in process memory', async () => {
    const app = await setup();
    app.get.mockImplementation(async (key: string) => JSON.stringify({ ...app.bundle.room, roomCode: key.split(':').at(-1) }));
    app.evaluate.mockImplementation(async (_script: string, keys: string[]) => {
      const copy = structuredClone(app.bundle); copy.room.roomCode = keys[0].split(':').at(-1)!;
      return app.reply(copy);
    });
    for (let index = 0; index < 11; index++) await app.store.load(`TESTAAAAA${String.fromCharCode(65 + index)}`);
    await app.store.load('TESTAAAAAA');
    expect(app.get).toHaveBeenCalledTimes(12);
  });
});
