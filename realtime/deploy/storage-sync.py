"""Durable, single-writer Redis reconciliation. Application traffic stays on the gateway."""
import hashlib
import json
import os
import sqlite3
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

PREFIXES = ('user-sheet:', 'scrims:', 'events:', 'match-live:', 'match-shares:', 'player-note:', 'draft:v1:')
META = 'owkr:storage-sync:v1'
READS = frozenset('GET EXISTS TTL PTTL HGET HGETALL HVALS HLEN HMGET MGET ZRANGE ZRANGEBYSCORE ZCARD PING TIME'.split())
QUOTA_RETRY_SECONDS = 3600
KST = timezone(timedelta(hours=9))


def next_daily_sync(stamp):
    current = datetime.fromtimestamp(stamp / 1000, KST)
    scheduled = current.replace(hour=3, minute=0, second=0, microsecond=0)
    if scheduled <= current:
        scheduled += timedelta(days=1)
    return int(scheduled.timestamp() * 1000)


def is_quota_error(error):
    message = str(error).lower()
    return any(marker in message for marker in ('max requests', 'request limit', 'quota exceeded', 'command limit'))


def managed_key(key):
    # The single-writer lease is local coordination, not shared application data.
    return key.startswith(PREFIXES) and key != 'draft:v1:writer' and not key.startswith('draft:v1:deploytest:')


def equivalent(a, b):
    def value(state):
        raw = state['value']
        return dict(zip(raw[::2], raw[1::2])) if state['kind'] in ('hash', 'zset') else raw
    return a['kind'] == b['kind'] and value(a) == value(b) and abs(a['expires'] - b['expires']) <= 3


SNAPSHOT = """
local t = redis.call('TYPE', KEYS[1]).ok
local v = false
if t == 'string' then v = redis.call('GET', KEYS[1])
elseif t == 'hash' then v = redis.call('HGETALL', KEYS[1])
elseif t == 'zset' then v = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
elseif t ~= 'none' then return redis.error_reply('Unsupported storage type') end
local ttl = redis.call('PTTL', KEYS[1])
local clock = redis.call('TIME')
local expires = 0
if ttl >= 0 then expires = clock[1]*1000 + math.floor(clock[2]/1000) + ttl end
return cjson.encode({kind=t, value=v, expires=expires, meta=redis.call('HGET', KEYS[2], KEYS[1])})
"""
RESTORE = """
local s = cjson.decode(ARGV[1])
redis.call('DEL', KEYS[1])
if s.kind == 'string' then redis.call('SET', KEYS[1], s.value)
elseif s.kind == 'hash' then for i=1,#s.value,2 do redis.call('HSET', KEYS[1], s.value[i], s.value[i+1]) end
elseif s.kind == 'zset' then for i=1,#s.value,2 do redis.call('ZADD', KEYS[1], s.value[i+1], s.value[i]) end end
if s.expires > 0 then redis.call('PEXPIREAT', KEYS[1], s.expires) end
redis.call('HSET', KEYS[2], KEYS[1], ARGV[2])
return 'OK'
"""


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def now():
    return time.time_ns() // 1000000


def digest(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def timestamp(value, modified_only=False):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return 0
    if not isinstance(value, dict):
        return 0
    for name in (('updatedAt', 'lastActivityAt') if modified_only else ('updatedAt', 'lastActivityAt', 'createdAt')):
        stamp = value.get(name)
        if isinstance(stamp, (int, float)):
            return int(stamp)
        if isinstance(stamp, str):
            try:
                from datetime import datetime
                return int(datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() * 1000)
            except ValueError:
                pass
    return 0


def empty():
    return {'kind': 'none', 'value': False, 'expires': 0}


def split(key, state):
    kind, value = state['kind'], state['value']
    if kind in ('hash', 'zset'):
        return dict(zip(value[::2], value[1::2])), kind, None
    if kind == 'none':
        return {}, 'none', None
    if kind == 'string':
        try:
            parsed = json.loads(value)
            if key in ('scrims:v1:records', 'user-sheet:v1') and isinstance(parsed, list):
                return {str(item['id']): item for item in parsed}, 'array', None
            if key.startswith('events:') and isinstance(parsed, dict) and isinstance(parsed.get('participants'), list):
                return {str(item['id']): item for item in parsed['participants']}, 'participants', parsed
        except (ValueError, TypeError, KeyError):
            pass
    return {'': value}, kind, None


def versions(key, state, recorded=None, observed=0):
    parts, _, envelope = split(key, state)
    result = dict(recorded or {})
    for name, value in parts.items():
        fingerprint = digest(value)
        previous = result.get(name)
        if not previous or previous['hash'] != fingerprint or previous['deleted']:
            stamp = timestamp(value, modified_only=True) or timestamp(envelope) or (observed if previous and observed else timestamp(value) or observed)
            result[name] = {'time': stamp, 'hash': fingerprint, 'deleted': False}
    for name, previous in list(result.items()):
        if name == '\0key':
            continue
        if name not in parts and not previous['deleted']:
            result[name] = {'time': observed or state.get('expiredAt', 0) or previous['time'], 'hash': '', 'deleted': True}
    return result


def snapshot(client, key):
    raw = client.execute_command('EVAL', SNAPSHOT, 2, key, META)
    state = json.loads(raw)
    metadata = json.loads(state.pop('meta') or '{}')
    # Expiry is absolute; an offline mirror must never renew an old session.
    if state['expires'] and state['expires'] <= now():
        state = dict(empty(), expiredAt=state['expires'])
    return state, metadata


def merge(key, left, lv, right, rv):
    lp, lk, le = split(key, left)
    rp, rk, re = split(key, right)
    merged, history = {}, {}
    for name in set(lv) | set(rv) | set(lp) | set(rp):
        a, b = lv.get(name), rv.get(name)
        use_remote = b is not None and (a is None or b['time'] >= a['time'])
        winner = b if use_remote else a
        if winner is None:
            continue
        history[name] = winner
        source = rp if use_remote else lp
        if not winner['deleted'] and name in source:
            merged[name] = source[name]
    if not merged:
        return empty(), history
    kind = rk if rk != 'none' else lk
    if lk not in ('none', rk) and rk != 'none':
        # Type conflicts use the newest entity, ties favor Upstash.
        kind = rk if max((x['time'] for x in rv.values()), default=0) >= max((x['time'] for x in lv.values()), default=0) else lk
    if key == 'user-sheet:v2:entries':
        identities = {}
        rank = lambda item: (history[item]['time'], item in rp, item)
        for entry_id in sorted(merged, key=rank, reverse=True):
            value = merged[entry_id]
            try:
                entry = json.loads(value)
                names = ['tag:' + entry['battleTag'].strip().lower()]
                if entry.get('discordUserId'):
                    names.append('discord:' + entry['discordUserId'])
            except (ValueError, KeyError, TypeError):
                continue
            previous = next((identities[name] for name in names if name in identities), None)
            if previous:
                merged.pop(entry_id, None)
                history[entry_id] = {'time': history[previous]['time'], 'hash': '', 'deleted': True}
            else:
                for name in names:
                    identities[name] = entry_id
    if kind in ('hash', 'zset'):
        value = [part for pair in sorted(merged.items()) for part in pair]
        storage_kind = kind
    elif kind in ('array', 'participants'):
        items = [merged[name] for name in sorted(merged)]
        if kind == 'participants':
            envelope = dict(re or le or {})
            envelope['participants'] = items
            envelope['updatedAt'] = max(timestamp(le), timestamp(re), max((x['time'] for x in history.values()), default=0))
            value = dumps(envelope)
        else:
            value = dumps(items)
        storage_kind = 'string'
    else:
        value, storage_kind = merged.get('', left['value']), kind
        if key in ('user-sheet:v2:version', 'scrims:v1:sequence'):
            value = str(max(int(lp.get('', 0)), int(rp.get('', 0))))
            history[''] = {'time': max((x['time'] for x in history.values()), default=0), 'hash': digest(value), 'deleted': False}
    # A conflict must not extend an expiring room or one-time credential.
    left_time = lv.get('\0key', {}).get('time', max((x['time'] for x in lv.values()), default=0))
    right_time = rv.get('\0key', {}).get('time', max((x['time'] for x in rv.values()), default=0))
    expiry = (right if right['kind'] != 'none' and right_time >= left_time else left)['expires']
    if expiry and expiry <= now():
        return empty(), {name: dict(item, time=max(item['time'], expiry), deleted=True, hash='') for name, item in history.items()}
    return {'kind': storage_kind, 'value': value, 'expires': expiry}, history


class Upstream:
    def __init__(self, url, token, timeout=0.7):
        self.url, self.token, self.timeout = url.rstrip('/'), token, timeout

    def execute_command(self, *command):
        request = urllib.request.Request(self.url, data=dumps(command).encode(), headers={
            'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'}, method='POST')
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            with error:
                try:
                    result = json.load(error)
                except ValueError:
                    raise RuntimeError('Upstream HTTP failure') from None
            if not isinstance(result, dict) or 'error' not in result:
                raise RuntimeError('Upstream HTTP failure') from None
        if 'error' in result:
            raise RuntimeError(result['error'])
        return result['result']


class StorageSync:
    def __init__(self, client, upstream, path):
        self.client, self.upstream = client, upstream
        self.lock = threading.RLock()
        self.wake = threading.Event()
        self.stopped = threading.Event()
        self.ready = False
        self.last_error = None
        self.last_sync = None
        self.retry_at = 0
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS states (key TEXT PRIMARY KEY, state TEXT, versions TEXT, dirty INTEGER)')
        self.db.execute('CREATE TABLE IF NOT EXISTS pending (key TEXT PRIMARY KEY, state TEXT, stamp INTEGER)')
        self.db.execute('CREATE TABLE IF NOT EXISTS conflicts (id INTEGER PRIMARY KEY, key TEXT, stamp INTEGER, local TEXT, remote TEXT)')
        self.db.commit()
        for key, before, stamp in self.db.execute('SELECT key,state,stamp FROM pending').fetchall():
            after, _ = snapshot(client, key)
            self.record(key, json.loads(before), after, stamp)
        for key in self.scan(client):
            if not self.db.execute('SELECT 1 FROM states WHERE key=?', (key,)).fetchone():
                state, _ = snapshot(client, key)
                self.save(key, state, versions(key, state), True)
        self.thread = None

    def save(self, key, state, metadata, dirty):
        self.db.execute('INSERT OR REPLACE INTO states VALUES (?,?,?,?)', (key, dumps(state), dumps(metadata), int(dirty)))
        self.db.execute('DELETE FROM pending WHERE key=?', (key,))
        self.db.commit()

    def record(self, key, before, after, stamp):
        row = self.db.execute('SELECT versions FROM states WHERE key=?', (key,)).fetchone()
        meta = versions(key, before, json.loads(row[0]) if row else {}, 0)
        # Sequential changes in the same millisecond must beat the mirrored old value.
        stamp = max(stamp, max((item['time'] for item in meta.values()), default=0) + 1)
        meta = versions(key, after, meta, stamp)
        meta['\0key'] = {'time': stamp, 'hash': digest(after), 'deleted': after['kind'] == 'none', 'expires': after['expires']}
        self.save(key, after, meta, True)

    def keys_for(self, commands, managed=True):
        keys = set()
        for command in commands:
            name = command[0].upper()
            if name in ('EVAL', 'EVALSHA'):
                values = command[3:3 + int(command[2])]
            elif name in ('MGET', 'DEL', 'EXISTS'):
                values = command[1:]
            elif name == 'MSET':
                values = command[1::2]
            elif name in ('PING', 'TIME', 'SCAN'):
                values = []
            else:
                values = command[1:2]
            keys.update(str(key) for key in values if not managed or managed_key(str(key)))
        return keys

    def execute(self, commands, batch=False, transaction=False):
        with self.lock:
            readonly = all(c[0].upper() in READS for c in commands)
            keys = self.keys_for(commands) if not readonly else set()
            before = {key: snapshot(self.client, key)[0] for key in keys}
            stamp = now()
            for key in keys:
                self.db.execute('INSERT OR REPLACE INTO pending VALUES (?,?,?)', (key, dumps(before[key]), stamp))
            self.db.commit()
            try:
                if batch:
                    with self.client.pipeline(transaction=transaction) as pipeline:
                        for command in commands:
                            pipeline.execute_command(*command)
                        return pipeline.execute(raise_on_error=False)
                return [self.client.execute_command(*commands[0])]
            finally:
                changed = False
                for key in keys:
                    after, _ = snapshot(self.client, key)
                    if after != before[key]:
                        self.record(key, before[key], after, stamp)
                        changed = True
                    else:
                        self.db.execute('DELETE FROM pending WHERE key=?', (key,))
                self.db.commit()
                if changed:
                    self.ready = False

    def scan(self, client):
        keys = set()
        cursor = '0'
        while True:
            cursor, found = client.execute_command('SCAN', cursor, 'COUNT', 200)
            keys.update(value for k in found if managed_key(value := k.decode() if isinstance(k, bytes) else k))
            if str(cursor) in ('0', "b'0'"):
                break
        return keys

    def reconcile(self, key):
        with self.lock:
            left, local_metadata = snapshot(self.client, key)
            original_left = left
            row = self.db.execute('SELECT state,versions,dirty FROM states WHERE key=?', (key,)).fetchone()
            previous = json.loads(row[0]) if row else left
            recorded = json.loads(row[1]) if row else {}
            if row and row[2] and previous != left:
                # A crash can occur after journaling the merge but before restoring Redis.
                left = previous if not previous['expires'] or previous['expires'] > now() else dict(empty(), expiredAt=previous['expires'])
            # Detect TTL expiry or a Redis-side change since the durable journal.
            lv = versions(key, left, recorded, previous.get('expires', 0) if left['kind'] == 'none' else 0)
            right, remote_metadata = snapshot(self.upstream, key)
            remote_expiry = remote_metadata.get('\0key', {}).get('expires', 0)
            rv = versions(key, right, remote_metadata,
                          (remote_expiry or now()) if remote_metadata and right['kind'] == 'none' else now() if remote_metadata else 0)
            if key == 'user-sheet:v2:entries':
                # Legacy rows must enter v2 before the application's migration guard
                # sees a v2 version and removes the old array.
                for client in (self.client, self.upstream):
                    legacy, _ = snapshot(client, 'user-sheet:v1')
                    if legacy['kind'] != 'string':
                        continue
                    rows = json.loads(legacy['value'])
                    values = {}
                    for entry in rows:
                        entry = dict(entry)
                        entry.setdefault('battleTagHistory', [entry['battleTag']])
                        values[str(entry['id'])] = dumps(entry)
                    candidate = {'kind': 'hash', 'value': [part for pair in values.items() for part in pair], 'expires': 0}
                    left, lv = merge(key, left, lv, candidate, versions(key, candidate))
            result, metadata = merge(key, left, lv, right, rv)
            if key == 'user-sheet:v2:battle-tags':
                entries, _ = snapshot(self.client, 'user-sheet:v2:entries')
                if entries['kind'] == 'hash':
                    tags = {}
                    for entry_id, encoded in zip(entries['value'][::2], entries['value'][1::2]):
                        entry = json.loads(encoded)
                        tags[entry['battleTag'].strip().lower()] = entry_id
                    result = {'kind': 'hash' if tags else 'none', 'value': [part for pair in sorted(tags.items()) for part in pair] if tags else False, 'expires': 0}
                    metadata = versions(key, result, metadata, now())
            if left['kind'] != 'none' and right['kind'] != 'none' and left['value'] != right['value']:
                self.db.execute('INSERT INTO conflicts(key,stamp,local,remote) VALUES (?,?,?,?)', (key, now(), dumps(left), dumps(right)))
                self.db.execute('DELETE FROM conflicts WHERE id <= (SELECT COALESCE(MAX(id),0)-1000 FROM conflicts)')
            derived = []
            if key == 'user-sheet:v2:entries':
                tags = []
                if result['kind'] == 'hash':
                    for entry_id, encoded in zip(result['value'][::2], result['value'][1::2]):
                        tags.extend((json.loads(encoded)['battleTag'].strip().lower(), entry_id))
                current_index, _ = snapshot(self.client, 'user-sheet:v2:battle-tags')
                current_tags = dict(zip(current_index['value'][::2], current_index['value'][1::2])) if current_index['kind'] == 'hash' else {}
                if not equivalent(result, original_left) or dict(zip(tags[::2], tags[1::2])) != current_tags:
                    local_version = int(self.client.execute_command('GET', 'user-sheet:v2:version') or 0)
                    remote_version = int(self.upstream.execute_command('GET', 'user-sheet:v2:version') or 0)
                    derived = [['DEL', 'user-sheet:v2:battle-tags']]
                    if tags:
                        derived.append(['HSET', 'user-sheet:v2:battle-tags', *tags])
                    derived.append(['SET', 'user-sheet:v2:version', max(local_version, remote_version) + 1])
            # Persist the merged result as dirty BEFORE either target is touched.
            # Recovery retries state images, never INCR/GETDEL/Lua commands.
            self.save(key, result, metadata, True)
            if not equivalent(original_left, result) or local_metadata != metadata:
                self.client.execute_command('EVAL', RESTORE, 2, key, META, dumps(result), dumps(metadata))
            if derived:
                # Keep local index/version consistent before allowing any app command,
                # even if the subsequent upstream restore times out.
                self.execute(derived, batch=True, transaction=True)
            if not equivalent(right, result) or remote_metadata != metadata:
                self.upstream.execute_command('EVAL', RESTORE, 2, key, META, dumps(result), dumps(metadata))
            self.save(key, result, metadata, False)

    def cycle(self, full=True):
        keys = self.scan(self.upstream) | self.scan(self.client) if full else set()
        with self.lock:
            keys.update(row[0] for row in self.db.execute('SELECT key FROM states WHERE dirty=1'))
        if any(key.startswith('user-sheet:') for key in keys):
            keys.update(('user-sheet:v2:entries', 'user-sheet:v2:battle-tags', 'user-sheet:v2:version'))
        # Entries precede their derived index and optimistic version counter.
        for key in sorted(keys, key=lambda key: (key != 'user-sheet:v2:entries', key)):
            self.reconcile(key)
        with self.lock:
            dirty = self.db.execute('SELECT COUNT(*) FROM states WHERE dirty=1').fetchone()[0]
            self.ready = dirty == 0
            self.last_sync = now()
            self.last_error = None

    def run(self):
        failures = 0
        scheduled_at = now()
        while not self.stopped.is_set():
            self.wake.clear()
            delay = max(0, self.retry_at - time.monotonic(), (scheduled_at - now()) / 1000)
            if self.stopped.wait(min(delay, 30)):
                break
            if delay > 30:
                continue
            if self.stopped.is_set():
                break
            try:
                self.cycle()
                failures = 0
                self.retry_at = 0
                scheduled_at = next_daily_sync(now())
            except Exception as error:
                with self.lock:
                    self.ready = False
                    self.last_error = 'upstream_quota' if is_quota_error(error) else 'upstream_unavailable'
                    self.db.rollback()
                failures += 1
                # Writes cannot bypass backoff and spend the failed provider's quota.
                delay = QUOTA_RETRY_SECONDS if is_quota_error(error) else min(300, 2 ** min(failures, 8))
                self.retry_at = time.monotonic() + delay
                scheduled_at = now()

    def start(self):
        self.thread = threading.Thread(target=self.run, name='storage-sync', daemon=True)
        self.thread.start()

    def status(self):
        with self.lock:
            return {'backend': 'local', 'syncSchedule': '03:00 Asia/Seoul', 'nextSyncAt': next_daily_sync(now()), 'pendingKeys': self.db.execute('SELECT COUNT(*) FROM states WHERE dirty=1').fetchone()[0],
                    'lastSyncAt': self.last_sync, 'upstream': self.last_error or ('ready' if self.ready else 'recovering'),
                    'nextRetryAt': now() + int((self.retry_at - time.monotonic()) * 1000) if self.retry_at > time.monotonic() else None}


def from_environment(client):
    url, token = os.environ.get('STORAGE_UPSTREAM_URL'), os.environ.get('STORAGE_UPSTREAM_TOKEN')
    if not url or not token:
        return None
    if not url.startswith('https://'):
        raise ValueError('Storage upstream requires HTTPS')
    sync = StorageSync(client, Upstream(url, token), os.environ.get('STORAGE_SYNC_DB', '/var/lib/owkr-storage-gateway/sync.sqlite3'))
    sync.start()
    return sync
