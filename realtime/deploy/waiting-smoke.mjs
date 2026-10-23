import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { RedisRealtimeStore } from '../realtime/src/store.js';
import { DraftEngine } from '../realtime/src/engine.js';
import { DraftParticipantAuth } from '../realtime/src/participant-auth.js';
import { createLocalDraftFixtures } from '../realtime/src/local-fixtures.js';
import { SOURCE_POSITIONS } from '../realtime/src/source.js';
import { verifyDraftTicket } from '../realtime/src/tickets.js';
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN, automaticDeserialization: false });
const prefix = `draft:v1:deploytest:${randomUUID()}:`;
const touched = new Set();
const key = k => { const value = prefix + k; touched.add(value); return value; };
const scoped = new Proxy(redis, { get(target, name) {
  if (name === 'eval') return (script, keys, args) => target.eval(script, keys.map(key), args);
  if (['get','set','getdel','zrange'].includes(name)) return (k, ...args) => target[name](key(k), ...args);
  throw new Error('unscoped command refused');
} });
const fixture = createLocalDraftFixtures(Date.now(), { syntheticCatalogs: true });
const store = new RedisRealtimeStore(scoped);
const engine = new DraftEngine(store, fixture.catalogs);
const expiresAt = Date.now() + 1_800_000;
const source = participants => JSON.stringify({ revision: revision++, expiresAt, participants });
let revision = 1;
const outsider = '999999999999999999';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
try {
  await redis.set(key('match-live:v1:LOCAL23456'), source([]), { pxat: expiresAt });
  await redis.hset(key('user-sheet:v2:entries'), Object.fromEntries(fixture.identities.map(p => [p.id,JSON.stringify(p)])));
  await redis.expire(key('user-sheet:v2:entries'), 1800);
  await store.acquireLease();
  const now = Math.floor(Date.now()/1000);
  const roomCode = await engine.createRoom({ iss:'owkr-vercel', aud:'owkr-draft', purpose:'admin-entry', sub:fixture.identities[0].discordUserId, displayName:'synthetic operator', roomCode:null, scope:'create', jti:randomUUID(), iat:now, exp:now+60 }, 'LOCAL23456', randomUUID());
  assert.deepEqual((await store.readSource('LOCAL23456')).source.participants, []);
  console.log('empty roster Lua round trip and room creation passed');
  const auth = new DraftParticipantAuth({ engine, appOrigin:'https://test.invalid', publicOrigin:'https://test.invalid', clientId:'synthetic', clientSecret:'synthetic', privateKey:keys.privateKey,
    fetch: async url => new Response(JSON.stringify(String(url).endsWith('/token') ? { access_token:'synthetic', token_type:'Bearer', scope:'identify' } : { id:outsider, username:'synthetic waiting user' })) });
  const authorize = new URL(await auth.begin(roomCode,'c'.repeat(64)));
  const callback = new URL(await auth.callback('synthetic', authorize.searchParams.get('state'), 'https://discord.com'));
  const session = await auth.exchange(callback.searchParams.get('draft_code'),'c'.repeat(64));
  assert.equal(session.admission.status,'WAITING'); assert.equal(session.ticket,undefined);
  for (const count of [4,10]) {
    await redis.set(key('match-live:v1:LOCAL23456'),source(fixture.identities.slice(0,count).map(p=>({discordUserId:p.discordUserId,position:null}))),{pxat:expiresAt});
    const entry = await auth.refresh(session.handle,roomCode);
    assert.equal(entry.admission.status,count===10?'EXCLUDED':'WAITING'); assert.equal(entry.admission.participantCount,count); assert.equal(entry.ticket,undefined);
  }
  console.log('waiting and excluded session states passed without a voting ticket');
  const newUser={id:'new-sheet',discordUserId:outsider,battleTag:'synthetic#1234'};
  await redis.hset(key('user-sheet:v2:entries'),{[newUser.id]:JSON.stringify(newUser)});
  await redis.set(key('match-live:v1:LOCAL23456'),source(fixture.identities.map((p,i)=>({discordUserId:i===1?outsider:p.discordUserId,position:SOURCE_POSITIONS[i]}))),{pxat:expiresAt});
  await engine.tick(roomCode);
  const joined=await auth.refresh(session.handle,roomCode);
  await engine.connect(verifyDraftTicket(joined.ticket,keys.publicKey,'realtime-entry',Date.now()),'waiting-client');
  assert.equal((await engine.snapshot('waiting-client')).selfReady,true);
  assert.equal((await engine.requireRoom(roomCode)).room.expiresAt,expiresAt);
  console.log('existing waiting session upgraded to assigned participant with unchanged expiry');
} finally {
  await store.releaseLease().catch(()=>{});
  if (touched.size) await redis.del(...touched);
  console.log('isolated test data cleaned');
}
