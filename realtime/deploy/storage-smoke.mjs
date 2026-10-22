import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
assert.ok(url && token);
const redis = new Redis({ url, token, retry: { retries: 0 } });
const prefix = `storage-smoke:${randomUUID()}:`;
const keys = ['json', 'hash', 'counter', 'sorted', 'atomic'].map(name => prefix + name);
try {
  const denied = await fetch(url, { method: 'POST', body: '["PING"]' });
  assert.equal(denied.status, 401);
  const forbidden = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '["CONFIG","GET","*"]' });
  assert.equal(forbidden.status, 400);
  const browser = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://attacker.invalid' }, body: '["PING"]' });
  assert.equal(browser.status, 401);
  const value = { name: '임시 저장소 #테스트', selection: ['아나', 'D.Va'], enabled: true };
  assert.equal(await redis.set(keys[0], value, { nx: true, ex: 60 }), 'OK');
  assert.equal(await redis.set(keys[0], 'overwrite', { nx: true }), null);
  assert.deepEqual(await redis.get(keys[0]), value);
  assert.ok(await redis.pttl(keys[0]) > 0);
  assert.deepEqual(await redis.pipeline().hset(keys[1], { player: '테스트' }).hgetall(keys[1]).incr(keys[2]).exec(),
    [1, { player: '테스트' }, 1]);
  assert.deepEqual(await redis.multi().set(keys[4], 'first').get(keys[4]).exec(), ['OK', 'first']);
  assert.deepEqual(await redis.eval("redis.call('SET',KEYS[1],ARGV[1]); return {redis.call('GET',KEYS[1]), 7}", [keys[4]], ['루아 확인']), ['루아 확인', 7]);
  await redis.zadd(keys[3], { score: 1, member: 'A' }, { score: 2, member: 'B' });
  assert.deepEqual(await redis.zrange(keys[3], 0, '+inf', { byScore: true }), ['A', 'B']);
  assert.equal(await redis.getdel(keys[4]), '루아 확인');
  assert.equal(await redis.get(keys[4]), null);
  console.log('Storage smoke passed: authentication, browser rejection, JSON/UTF-8, NX/TTL, pipeline, transaction, hashes, sorted sets, Lua and getdel.');
} finally {
  await redis.del(...keys);
}
