"""Backup and recovery tests using isolated Redis instances, without external services."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fixtures = load('sync_fixtures', 'storage-sync-test.py')
backup = load('storage_backup', 'storage-backup.py')
m = fixtures.m


class BackupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.SyncTest.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        fixtures.SyncTest.tearDownClass.__func__(cls)

    def setUp(self):
        fixtures.SyncTest.setUp(self)
        self.archive_path = self.path + '.archive'
        self.archive = backup.StorageBackup(self.local, self.sync.lock, self.archive_path, m)

    def tearDown(self):
        self.archive.stopped.set()
        if self.archive.thread:
            self.archive.thread.join(timeout=2)
        self.archive.db.close()
        fixtures.SyncTest.tearDown(self)

    def seed_sheet(self, name='한글#1234'):
        entry = m.dumps({'id': 'user-1', 'battleTag': name, 'discordUserId': '123', 'updatedAt': 1000})
        self.sync.execute([['HSET', 'user-sheet:v2:entries', 'user-1', entry],
                           ['HSET', 'user-sheet:v2:battle-tags', name.lower(), 'user-1'],
                           ['SET', 'user-sheet:v2:version', '7']], batch=True, transaction=True)

    def test_history_survives_deletion_and_empty_backups_and_deduplicates(self):
        self.seed_sheet()
        first = self.archive.capture()
        self.archive.capture()
        self.assertEqual(self.archive.db.execute('SELECT COUNT(*) FROM blobs').fetchone()[0], 3)
        self.local.flushdb()
        self.archive.capture()
        self.assertEqual(self.archive.status()['snapshotCount'], 3)
        self.assertEqual(self.archive.status()['keyCount'], 0)
        old = backup.read_snapshot(self.archive.db, first, m)
        self.assertEqual(len(old), 3)
        self.assertIn('한글', old[1][1]['value'][1])

    def test_upstash_failure_does_not_prevent_capture_or_restore_of_user_sheet(self):
        self.seed_sheet()
        self.upstream.failed = True
        calls = self.upstream.calls
        snapshot_id = self.archive.capture()
        self.local.flushdb()
        summary = backup.restore(self.archive.db, snapshot_id, self.local, m, ['user-sheet:'], self.sync, True)
        self.assertTrue(summary['applied'])
        self.assertEqual(self.local.hget('user-sheet:v2:battle-tags', '한글#1234'), b'user-1')
        self.assertEqual(self.local.get('user-sheet:v2:version'), b'7')
        self.assertEqual(self.upstream.calls, calls)
        self.upstream.failed = False
        self.sync.cycle()
        self.assertIn('한글', self.remote.hget('user-sheet:v2:entries', 'user-1').decode())

    def test_retention_keeps_only_fifteen_days_and_removes_unreferenced_content(self):
        self.seed_sheet()
        base = m.now()
        ids = []
        for day in range(20):
            self.local.set('player-note:daily', 'note-' + str(day))
            with patch.object(m, 'now', return_value=base + day * 86_400_000):
                ids.append(self.archive.capture())
        rows = self.archive.db.execute('SELECT id FROM snapshots ORDER BY id').fetchall()
        self.assertEqual([row[0] for row in rows], ids[-15:])
        self.assertEqual(self.archive.status()['retentionDays'], 15)
        self.assertEqual(self.archive.status()['snapshotCount'], 15)
        # Three shared user-sheet blobs remain, alongside fifteen daily note values.
        self.assertEqual(self.archive.db.execute('SELECT COUNT(*) FROM blobs').fetchone()[0], 18)
        self.assertEqual(len(backup.read_snapshot(self.archive.db, ids[-15], m)), 4)
        with self.assertRaisesRegex(ValueError, 'does not exist'):
            backup.read_snapshot(self.archive.db, ids[0], m)
        self.assertEqual(self.archive.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_startup_prunes_expired_history_and_reclaims_large_unused_pages(self):
        base = m.now()
        self.local.set('player-note:large', 'x' * 1_000_000)
        with patch.object(m, 'now', return_value=base):
            self.archive.capture()
        self.archive.db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        before = Path(self.archive_path).stat().st_size
        self.archive.db.close()
        with patch.object(m, 'now', return_value=base + backup.RETENTION_MS):
            self.archive = backup.StorageBackup(self.local, self.sync.lock, self.archive_path, m)
        self.assertEqual(self.archive.status()['snapshotCount'], 0)
        self.assertEqual(self.archive.db.execute('SELECT COUNT(*) FROM blobs').fetchone()[0], 0)
        self.assertLess(Path(self.archive_path).stat().st_size, before / 2)

    def test_unsupported_type_rolls_back_the_entire_snapshot(self):
        self.seed_sheet()
        first = self.archive.capture()
        self.local.lpush('events:unsupported', 'unexpected list')
        with self.assertRaises(Exception):
            self.archive.capture()
        self.assertEqual(self.archive.status()['snapshotCount'], 1)
        self.assertEqual(self.archive.status()['lastSnapshotId'], first)

    def test_authentication_material_and_unrelated_keys_are_excluded(self):
        for key in ('draft:v1:writer', 'draft:v1:auth:token', 'draft:v1:nonce:once', 'draft:v1:create:request',
                    'draft:v1:deploytest:test', 'unrelated:private'):
            self.local.set(key, 'secret')
        self.local.set('events:test:participants:v1', '[]')
        snapshot_id = self.archive.capture()
        self.assertEqual([key for key, _state in backup.read_snapshot(self.archive.db, snapshot_id, m)], ['events:test:participants:v1'])

    def test_scrim_records_and_sequence_are_excluded_while_other_data_is_preserved(self):
        self.seed_sheet()
        self.local.set('scrims:v1:records', '[{"id":"1"}]')
        self.local.set('scrims:v1:sequence', '1')
        others = ['events:test:participants:v1', 'player-note:test', 'match-live:v1:test',
                  'match-shares:v1:test', 'draft:v1:session:test']
        for key in others:
            self.local.set(key, '{}')
        snapshot_id = self.archive.capture()
        keys = {key for key, _state in backup.read_snapshot(self.archive.db, snapshot_id, m)}
        self.assertEqual(keys, set(others) | {'user-sheet:v2:entries', 'user-sheet:v2:battle-tags', 'user-sheet:v2:version'})
        self.assertEqual(self.local.get('scrims:v1:sequence'), b'1')
        with self.assertRaisesRegex(ValueError, 'Select complete application prefixes'):
            backup.restore(self.archive.db, snapshot_id, self.local, m, ['scrims:'])

    def test_recovery_skips_expired_sessions_and_preserves_absolute_expiry(self):
        self.local.set('match-live:v1:expired', '{}', px=80)
        self.local.set('match-shares:v1:active', '{}', px=5000)
        snapshot_id = self.archive.capture()
        time.sleep(.12)
        self.local.flushdb()
        summary = backup.restore(self.archive.db, snapshot_id, self.local, m, ['match-live:', 'match-shares:'], self.sync, True)
        self.assertEqual(summary['expiredKeys'], 1)
        self.assertIsNone(self.local.get('match-live:v1:expired'))
        self.assertLess(self.local.pttl('match-shares:v1:active'), 4900)
        self.assertGreater(self.local.pttl('match-shares:v1:active'), 3000)

    def test_dry_run_and_existing_data_protection(self):
        self.seed_sheet()
        snapshot_id = self.archive.capture()
        with self.assertRaisesRegex(ValueError, 'must be empty'):
            backup.restore(self.archive.db, snapshot_id, self.local, m, ['user-sheet:'], self.sync, True)
        self.local.flushdb()
        summary = backup.restore(self.archive.db, snapshot_id, self.local, m, ['user-sheet:'])
        self.assertFalse(summary['applied'])
        self.assertEqual(summary['restoreKeys'], 3)
        self.assertEqual(self.local.dbsize(), 0)

    def test_corrupt_payload_or_missing_manifest_entry_is_rejected_before_recovery(self):
        self.seed_sheet()
        snapshot_id = self.archive.capture()
        self.local.flushdb()
        fingerprint, payload = self.archive.db.execute('SELECT hash,payload FROM blobs LIMIT 1').fetchone()
        with self.archive.db:
            self.archive.db.execute('UPDATE blobs SET payload=? WHERE hash=?', ('{}', fingerprint))
        with self.assertRaisesRegex(ValueError, 'content validation'):
            backup.restore(self.archive.db, snapshot_id, self.local, m, ['user-sheet:'], self.sync, True)
        self.assertEqual(self.local.dbsize(), 0)
        with self.archive.db:
            self.archive.db.execute('UPDATE blobs SET payload=? WHERE hash=?', (payload, fingerprint))
            self.archive.db.execute('DELETE FROM entries WHERE snapshot_id=? AND key=?', (snapshot_id, 'user-sheet:v2:version'))
        with self.assertRaisesRegex(ValueError, 'manifest validation'):
            backup.read_snapshot(self.archive.db, snapshot_id, m)

    def test_capture_holds_the_same_lock_as_user_sheet_mutations(self):
        self.seed_sheet('Old#123')
        original_snapshot = m.snapshot
        attempted, finished = threading.Event(), threading.Event()
        writer = None

        def snapshot(client, key):
            nonlocal writer
            if writer is None:
                def mutate():
                    attempted.set()
                    self.seed_sheet('New#123')
                    finished.set()
                writer = threading.Thread(target=mutate)
                writer.start()
                self.assertTrue(attempted.wait(1))
                self.assertFalse(finished.wait(.02))
            return original_snapshot(client, key)

        with patch.object(m, 'snapshot', side_effect=snapshot):
            snapshot_id = self.archive.capture()
        writer.join(timeout=2)
        self.assertTrue(finished.is_set())
        entries = dict(backup.read_snapshot(self.archive.db, snapshot_id, m))
        self.assertIn('Old#123', entries['user-sheet:v2:entries']['value'][1])

    def test_daily_worker_is_independent_of_sync_and_runs_at_three_am(self):
        clock = [int(m.datetime.fromisoformat('2026-10-26T02:59:59+09:00').timestamp() * 1000)]
        runs = []
        def capture():
            runs.append(clock[0])
            if len(runs) == 2:
                self.archive.stopped.set()
        def wait(seconds):
            clock[0] += int(seconds * 1000)
            return False
        with patch.object(m, 'now', side_effect=lambda: clock[0]), \
                patch.object(self.archive.stopped, 'wait', side_effect=wait), \
                patch.object(self.archive, 'capture', side_effect=capture):
            self.archive.run()
        self.assertEqual(runs[1] - runs[0], 1000)

    def test_backup_failure_retries_in_five_minutes(self):
        clock = [m.now()]
        runs = []
        def capture():
            runs.append(clock[0])
            if len(runs) == 1:
                raise OSError('disk full')
            self.archive.stopped.set()
        def wait(seconds):
            clock[0] += int(seconds * 1000)
            return False
        with patch.object(m, 'now', side_effect=lambda: clock[0]), \
                patch.object(self.archive.stopped, 'wait', side_effect=wait), \
                patch.object(self.archive, 'capture', side_effect=capture):
            self.archive.run()
        self.assertEqual(runs[1] - runs[0], 300_000)
        self.assertEqual(self.archive.last_error, 'OSError')

    def test_backup_database_open_failure_is_reported_and_can_recover(self):
        directory = Path(self.archive_path + '.missing')
        archive = backup.StorageBackup(self.local, self.sync.lock, str(directory / 'backup.sqlite3'), m)
        self.assertIsNotNone(archive.status()['lastError'])
        self.assertIsNone(archive.db)
        directory.mkdir()
        try:
            archive.capture()
            self.assertIsNone(archive.status()['lastError'])
        finally:
            if archive.db:
                archive.db.close()

    def test_live_sqlite_export_includes_committed_wal_and_does_not_overwrite(self):
        self.seed_sheet()
        self.archive.capture()
        output = self.archive_path + '.export'
        command = [sys.executable, str(Path(__file__).with_name('storage-backup.py')), '--db', self.archive_path,
                   'export', '--output', output]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        with sqlite3.connect(output) as db:
            self.assertEqual(len(backup.read_snapshot(db, 1, m)), 3)
        self.assertEqual(Path(output).stat().st_mode & 0o777, 0o600)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)

    def test_offline_restore_cli_previews_then_recovers_and_journals_a_selected_snapshot(self):
        self.seed_sheet()
        snapshot_id = self.archive.capture()
        self.local.flushdb()
        command = [sys.executable, str(Path(__file__).with_name('storage-backup.py')), '--db', self.archive_path,
                   'restore', '--snapshot', str(snapshot_id), '--prefix', 'user-sheet:',
                   '--socket', self.local.connection_pool.connection_kwargs['path'], '--journal', self.path]
        preview = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertFalse(json.loads(preview.stdout)['applied'])
        self.assertEqual(self.local.dbsize(), 0)
        result = subprocess.run(command + ['--apply'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['restoreKeys'], 3)
        self.assertEqual(self.sync.db.execute('SELECT COUNT(*) FROM states WHERE dirty=1').fetchone()[0], 3)
        self.assertEqual(self.local.hget('user-sheet:v2:battle-tags', '한글#1234'), b'user-1')


if __name__ == '__main__':
    unittest.main(verbosity=2)
