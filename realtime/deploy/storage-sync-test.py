"""Isolated integration tests; launches two disposable Unix-socket Redis instances."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import urllib.request
import base64
import time
import unittest
from unittest.mock import patch

import redis

spec = importlib.util.spec_from_file_location('storage_sync', Path(__file__).with_name('storage-sync.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class Remote:
    def __init__(self, client):
        self.client, self.failed, self.ambiguous, self.calls = client, False, False, 0

    def execute_command(self, *command):
        self.calls += 1
        if self.failed:
            raise TimeoutError('simulated outage')
        result = self.client.execute_command(*command)
        if self.ambiguous and command[0] == 'EVAL' and command[1] == m.RESTORE:
            self.ambiguous = False
            raise TimeoutError('reply lost after commit')
        return result


class SyncTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='owkr-storage-test-')
        cls.processes, cls.clients = [], []
        for name in ('a', 'b'):
            socket = str(Path(cls.tmp.name) / (name + '.sock'))
            process = subprocess.Popen(['redis-server', '--port', '0', '--unixsocket', socket,
                                        '--save', '', '--appendonly', 'no', '--maxmemory', '16mb'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            cls.processes.append(process)
            client = redis.Redis(unix_socket_path=socket)
            client.response_callbacks.clear()
            for _ in range(100):
                if not Path(socket).exists():
                    time.sleep(.02)
                    continue
                try:
                    client.ping()
                    break
                except redis.RedisError:
                    client.connection_pool.disconnect()
                    time.sleep(.02)
            cls.clients.append(client)

    @classmethod
    def tearDownClass(cls):
        for client in cls.clients:
            client.connection_pool.disconnect()
        for process in cls.processes:
            process.terminate()
            process.wait(timeout=5)
        cls.tmp.cleanup()

    def setUp(self):
        self.local, self.remote = self.clients
        for client in self.clients:
            client.flushdb()
        self.path = str(Path(self.tmp.name) / (self.id().split('.')[-1] + '.sqlite3'))
        self.upstream = Remote(self.remote)
        self.sync = m.StorageSync(self.local, self.upstream, self.path)

    def tearDown(self):
        self.sync.db.close()

    def write(self, *command):
        return self.sync.execute([list(command)])[0]

    def test_missing_both_directions_and_remote_preferred_reads(self):
        self.local.set('scrims:local', 'local')
        self.remote.set('scrims:remote', 'remote')
        self.sync.cycle()
        self.assertEqual(self.remote.get('scrims:local'), b'local')
        self.assertEqual(self.local.get('scrims:remote'), b'remote')
        self.remote.set('scrims:remote', 'read upstream')
        self.assertEqual(self.write('GET', 'scrims:remote'), b'read upstream')

    def test_local_writes_and_reads_continue_during_outage(self):
        self.sync.cycle()
        self.upstream.failed = True
        self.assertEqual(self.write('PING'), b'PONG')
        self.write('SET', 'scrims:new', 'new')
        calls = self.upstream.calls
        self.assertEqual(self.write('GET', 'scrims:new'), b'new')
        self.assertEqual(self.upstream.calls, calls)
        self.upstream.failed = False
        self.sync.cycle()
        self.assertEqual(self.remote.get('scrims:new'), b'new')
        self.assertTrue(self.sync.ready)

    def test_latest_write_wins_and_tie_favors_upstash(self):
        key = 'player-note:test'
        self.local.set(key, m.dumps({'content': 'local', 'updatedAt': 2000}))
        self.remote.set(key, m.dumps({'content': 'remote', 'updatedAt': 1000}))
        self.sync.cycle()
        self.assertIn(b'local', self.remote.get(key))
        key = 'player-note:tie'
        self.local.set(key, m.dumps({'content': 'local', 'updatedAt': 2000}))
        self.remote.set(key, m.dumps({'content': 'remote', 'updatedAt': 2000}))
        self.sync.cycle()
        self.assertIn(b'remote', self.local.get(key))

    def test_deleted_key_and_hash_field_do_not_resurrect(self):
        self.write('SET', 'scrims:delete', 'old')
        self.write('HSET', 'user-sheet:test', 'a', 'old', 'b', 'keep')
        self.sync.cycle()
        self.write('DEL', 'scrims:delete')
        self.write('HDEL', 'user-sheet:test', 'a')
        self.sync.cycle()
        self.assertIsNone(self.remote.get('scrims:delete'))
        self.assertIsNone(self.remote.hget('user-sheet:test', 'a'))
        self.assertEqual(self.remote.hget('user-sheet:test', 'b'), b'keep')
        self.sync.cycle()
        self.assertIsNone(self.local.get('scrims:delete'))

    def test_collection_missing_records_merge_and_deletion_is_preserved(self):
        key = 'scrims:v1:records'
        self.local.set(key, m.dumps([{'id': '1', 'createdAt': 1000}]))
        self.remote.set(key, m.dumps([{'id': '2', 'createdAt': 1000}]))
        self.sync.cycle()
        self.assertEqual(len(json.loads(self.local.get(key))), 2)
        self.write('SET', key, m.dumps([{'id': '2', 'createdAt': 1000, 'review': 'new'}]))
        self.sync.cycle()
        result = json.loads(self.remote.get(key))
        self.assertEqual(result, [{'id': '2', 'createdAt': 1000, 'review': 'new'}])

    def test_expiry_not_renewed_by_recovery(self):
        self.write('SET', 'draft:v1:auth:test', 'secret', 'PX', 80)
        self.sync.cycle()
        time.sleep(.12)
        self.sync.cycle()
        self.assertIsNone(self.local.get('draft:v1:auth:test'))
        self.assertIsNone(self.remote.get('draft:v1:auth:test'))

    def test_renewed_lease_uses_latest_expiry(self):
        key = 'draft:v1:lease:test'
        self.write('SET', key, 'owner', 'PX', 300)
        self.sync.cycle()
        self.write('PEXPIRE', key, 5000)
        self.sync.cycle()
        self.assertGreater(self.remote.pttl(key), 4000)

    def test_ambiguous_reply_does_not_replay_incr_or_getdel(self):
        self.write('INCR', 'scrims:counter')
        self.upstream.ambiguous = True
        with self.assertRaises(TimeoutError):
            self.sync.cycle()
        self.sync.cycle()
        self.assertEqual(self.remote.get('scrims:counter'), b'1')
        self.write('SET', 'draft:v1:auth:once', 'token')
        self.sync.cycle()
        self.assertEqual(self.write('GETDEL', 'draft:v1:auth:once'), b'token')
        self.upstream.ambiguous = True
        with self.assertRaises(TimeoutError):
            self.sync.cycle()
        self.sync.cycle()
        self.assertIsNone(self.write('GETDEL', 'draft:v1:auth:once'))
        self.assertIsNone(self.remote.get('draft:v1:auth:once'))

    def test_restart_retains_dirty_writes_and_tombstones(self):
        self.write('SET', 'scrims:old', 'old')
        self.sync.cycle()
        self.write('DEL', 'scrims:old')
        self.write('SET', 'scrims:new', 'new')
        self.sync.db.close()
        self.sync = m.StorageSync(self.local, self.upstream, self.path)
        self.sync.cycle()
        self.assertIsNone(self.remote.get('scrims:old'))
        self.assertEqual(self.remote.get('scrims:new'), b'new')

    def test_same_millisecond_delete_does_not_lose_to_remote_copy(self):
        with patch.object(m, 'now', return_value=1_800_000_000_000):
            self.write('SET', 'scrims:same-ms', 'old')
            self.sync.cycle()
            self.write('DEL', 'scrims:same-ms')
            self.sync.cycle()
            self.assertIsNone(self.remote.get('scrims:same-ms'))
            self.assertIsNone(self.local.get('scrims:same-ms'))

    def test_crash_between_journal_and_redis_restore(self):
        key = 'scrims:crash'
        state = {'kind': 'string', 'value': 'committed merge', 'expires': 0}
        meta = m.versions(key, state, observed=m.now())
        self.sync.save(key, state, meta, True)
        self.sync.db.close()
        self.sync = m.StorageSync(self.local, self.upstream, self.path)
        self.sync.cycle()
        self.assertEqual(self.remote.get(key), b'committed merge')

    def test_pending_command_recovery_never_reexecutes(self):
        key = 'scrims:pending'
        self.sync.db.execute('INSERT INTO pending VALUES (?,?,?)', (key, m.dumps(m.empty()), m.now()))
        self.sync.db.commit()
        self.local.incr(key)
        self.sync.db.close()
        self.sync = m.StorageSync(self.local, self.upstream, self.path)
        self.sync.cycle()
        self.assertEqual(self.remote.get(key), b'1')

    def test_atomic_lua_and_transaction_preserved(self):
        self.assertEqual(self.write('EVAL', "return redis.call('INCR', KEYS[1])", 1, 'scrims:lua'), 1)
        self.sync.execute([['INCR', 'scrims:lua'], ['INCR', 'scrims:lua']], batch=True, transaction=True)
        self.sync.cycle()
        self.assertEqual(self.remote.get('scrims:lua'), b'3')

    def test_user_identity_dedup_and_index_rebuild(self):
        a = {'id': 'a', 'battleTag': 'Old#123', 'discordUserId': '42', 'updatedAt': 1000}
        b = dict(a, id='b', battleTag='New#123', updatedAt=2000)
        self.local.hset('user-sheet:v2:entries', 'a', m.dumps(a))
        self.remote.hset('user-sheet:v2:entries', 'b', m.dumps(b))
        self.local.hset('user-sheet:v2:battle-tags', 'old#123', 'a')
        self.remote.hset('user-sheet:v2:battle-tags', 'new#123', 'b')
        self.sync.cycle()
        self.assertEqual(self.local.hlen('user-sheet:v2:entries'), 1)
        self.assertEqual(self.local.hget('user-sheet:v2:battle-tags', 'new#123'), b'b')
        self.assertIsNone(self.remote.hget('user-sheet:v2:battle-tags', 'old#123'))

    def test_unrelated_keys_are_not_imported(self):
        self.remote.set('unrelated:private', 'secret')
        self.sync.cycle()
        self.assertIsNone(self.local.get('unrelated:private'))

    def test_scan_traverses_once_and_filters_unmanaged_keys(self):
        self.remote.set('scrims:managed', 'data')
        self.remote.set('unrelated:private', 'secret')
        self.remote.set('draft:v1:writer', 'lease')
        self.remote.set('draft:v1:deploytest:probe', 'probe')
        calls = self.upstream.calls
        self.assertEqual(self.sync.scan(self.upstream), {'scrims:managed'})
        self.assertEqual(self.upstream.calls - calls, 1)

    def test_active_room_housekeeping_stays_local_after_recovery(self):
        self.write('ZADD', 'draft:v1:active', 2000, 'local-room')
        self.sync.cycle()
        self.remote.zadd('draft:v1:active', {'remote-only': 3000})
        calls = self.upstream.calls
        for _ in range(10):
            self.assertEqual(self.write('ZRANGE', 'draft:v1:active', 0, -1), [b'local-room'])
        self.assertEqual(self.upstream.calls, calls)
        self.assertTrue(self.sync.ready)

    def test_mixed_active_index_and_data_reads_keep_upstream_semantics(self):
        self.write('SET', 'scrims:remote-read', 'local')
        self.sync.cycle()
        self.remote.set('scrims:remote-read', 'remote')
        result = self.sync.execute([['ZRANGE', 'draft:v1:active', 0, -1], ['GET', 'scrims:remote-read']], batch=True)
        self.assertEqual(result, [[], b'remote'])

    def test_quota_cooldown_cannot_be_bypassed_by_writes(self):
        self.sync.cycle()
        with patch.object(self.upstream, 'execute_command', side_effect=RuntimeError('ERR max requests limit exceeded')) as remote:
            self.assertEqual(self.write('GET', 'scrims:missing'), None)
            self.assertEqual(self.sync.last_error, 'upstream_quota')
            self.assertGreater(self.sync.status()['nextRetryAt'], m.now() + 3_500_000)
            self.sync.start()
            try:
                self.write('SET', 'scrims:during-quota', 'local')
                time.sleep(.1)
                self.assertEqual(remote.call_count, 1)
                self.assertEqual(self.write('GET', 'scrims:during-quota'), b'local')
            finally:
                self.sync.stopped.set()
                self.sync.wake.set()
                self.sync.thread.join(timeout=2)
            self.assertFalse(self.sync.thread.is_alive())

    def test_background_quota_failure_uses_hourly_retry(self):
        with patch.object(self.upstream, 'execute_command', side_effect=RuntimeError('ERR quota exceeded')) as remote:
            self.sync.start()
            try:
                deadline = time.monotonic() + 2
                while self.sync.last_error is None and time.monotonic() < deadline:
                    time.sleep(.01)
                self.write('SET', 'scrims:quota-write', 'local')
                time.sleep(.1)
                self.assertEqual(self.sync.last_error, 'upstream_quota')
                self.assertEqual(remote.call_count, 1)
                self.assertGreater(self.sync.status()['nextRetryAt'], m.now() + 3_500_000)
            finally:
                self.sync.stopped.set()
                self.sync.wake.set()
                self.sync.thread.join(timeout=2)

    def adapter(self, sync):
        spec = importlib.util.spec_from_file_location('storage_gateway', Path(__file__).with_name('storage-gateway.py'))
        gateway = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gateway)
        gateway.sync_module.from_environment = lambda _client: sync
        server = gateway.create_server('t' * 64, self.local.connection_pool.connection_kwargs['path'], 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return 'http://127.0.0.1:' + str(server.server_address[1])

    def test_rest_base64_with_upstash_reads_and_authenticated_status(self):
        self.write('SET', 'scrims:unicode', '한글')
        self.sync.cycle()
        url = self.adapter(self.sync)
        request = urllib.request.Request(url, data=m.dumps(['GET', 'scrims:unicode']).encode(), headers={
            'Authorization': 'Bearer ' + 't' * 64, 'Upstash-Encoding': 'base64'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(base64.b64decode(json.load(response)['result']).decode(), '한글')
        request = urllib.request.Request(url + '/status', data=b'{}', headers={'Authorization': 'Bearer ' + 't' * 64})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(json.load(response)['backend'], 'upstash')
        with self.assertRaises(urllib.error.HTTPError):
            urllib.request.urlopen(urllib.request.Request(url + '/status', data=b'{}'))

    def test_real_http_upstream_transport_and_error(self):
        upstream = m.Upstream(self.adapter(None), 't' * 64)
        self.assertEqual(upstream.execute_command('SET', 'scrims:http', '한글'), 'OK')
        self.assertEqual(upstream.execute_command('GET', 'scrims:http'), '한글')
        self.local.hset('scrims:hash', 'a', 'b')
        with self.assertRaises(RuntimeError):
            upstream.execute_command('GET', 'scrims:hash')

    def test_legacy_sheet_migrates_before_v2_guard(self):
        old = {'id': 'old', 'battleTag': 'Old#123', 'updatedAt': 1000}
        new = {'id': 'new', 'battleTag': 'New#123', 'updatedAt': 2000}
        self.remote.set('user-sheet:v1', m.dumps([old]))
        self.local.hset('user-sheet:v2:entries', 'new', m.dumps(new))
        self.sync.cycle()
        self.assertEqual(self.remote.hlen('user-sheet:v2:entries'), 2)
        self.assertGreater(int(self.local.get('user-sheet:v2:version')), 0)
        self.assertEqual(self.remote.hget('user-sheet:v2:battle-tags', 'old#123'), b'old')

    def test_remote_deletion_propagates(self):
        self.write('SET', 'scrims:remote-delete', 'old')
        self.sync.cycle()
        self.remote.delete('scrims:remote-delete')
        self.sync.cycle()
        self.assertIsNone(self.local.get('scrims:remote-delete'))

    def test_unmanaged_smoke_keys_stay_local_even_when_ready(self):
        self.sync.cycle()
        self.write('SET', 'storage-smoke:test', 'local')
        self.assertEqual(self.write('GET', 'storage-smoke:test'), b'local')
        self.assertIsNone(self.remote.get('storage-smoke:test'))

    def test_event_participants_merge_per_id(self):
        key = 'events:test:participants:v1'
        self.local.set(key, m.dumps({'participants': [{'id': 'a', 'name': 'A'}], 'updatedAt': 1000}))
        self.remote.set(key, m.dumps({'participants': [{'id': 'b', 'name': 'B'}], 'updatedAt': 2000}))
        self.sync.cycle()
        self.assertEqual(len(json.loads(self.local.get(key))['participants']), 2)

    def test_background_worker_automatically_recovers_after_outage(self):
        self.upstream.failed = True
        self.write('SET', 'scrims:automatic', 'durable')
        self.sync.start()
        try:
            deadline = time.monotonic() + 2
            while self.sync.last_error is None and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertFalse(self.sync.ready)
            self.upstream.failed = False
            deadline = time.monotonic() + 5
            while not self.sync.ready and time.monotonic() < deadline:
                time.sleep(.02)
            self.assertTrue(self.sync.ready)
            self.assertEqual(self.remote.get('scrims:automatic'), b'durable')
        finally:
            self.sync.stopped.set()
            self.sync.wake.set()
            self.sync.thread.join(timeout=2)

    def test_sheet_index_is_consistent_when_upstream_reply_is_lost(self):
        entry = {'id': 'new', 'battleTag': 'New#123', 'updatedAt': 2000}
        self.remote.hset('user-sheet:v2:entries', 'new', m.dumps(entry))
        self.upstream.ambiguous = True
        with self.assertRaises(TimeoutError):
            self.sync.cycle()
        self.assertEqual(self.local.hget('user-sheet:v2:battle-tags', 'new#123'), b'new')
        self.assertGreater(int(self.local.get('user-sheet:v2:version')), 0)
        self.sync.cycle()
        self.assertTrue(self.sync.ready)


if __name__ == '__main__':
    unittest.main(verbosity=2)
