"""Independent daily SQLite history and offline recovery of application Redis data."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import threading


DEFAULT_DB = '/var/lib/owkr-storage-gateway/backups.sqlite3'
RETENTION_DAYS = 15
RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000
EXCLUDED = ('scrims:', 'draft:v1:auth:', 'draft:v1:nonce:', 'draft:v1:create:')


def eligible(sync, key):
    return sync.managed_key(key) and not key.startswith(EXCLUDED)


def connect(path, readonly=False):
    if readonly:
        return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    os.close(descriptor)
    os.chmod(path, 0o600)
    db = sqlite3.connect(path, check_same_thread=False)
    if db.execute('PRAGMA auto_vacuum').fetchone()[0] != 1:
        db.execute('PRAGMA auto_vacuum=FULL')
        db.execute('VACUUM')
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA synchronous=FULL')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT, taken_at INTEGER NOT NULL,
            key_count INTEGER NOT NULL, manifest TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS blobs (hash TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS entries (
            snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
            key TEXT NOT NULL, blob_hash TEXT NOT NULL REFERENCES blobs(hash),
            PRIMARY KEY(snapshot_id, key));
        CREATE INDEX IF NOT EXISTS snapshots_taken_at ON snapshots(taken_at);
        CREATE INDEX IF NOT EXISTS entries_blob_hash ON entries(blob_hash);
    ''')
    return db


def checksum(value):
    return hashlib.sha256(value.encode()).hexdigest()


class StorageBackup:
    def __init__(self, client, lock, path, sync):
        self.client, self.storage_lock, self.path, self.sync = client, lock, path, sync
        self.db_lock = threading.RLock()
        self.stopped = threading.Event()
        self.last_error = None
        self.thread = None
        self.db = None
        self.latest = None
        self.snapshot_count = 0
        try:
            self.db = connect(path)
            with self.db:
                removed = self.prune(self.sync.now())
            if removed:
                self.db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            self.refresh_summary()
        except (OSError, sqlite3.Error) as error:
            if self.db is not None:
                self.db.close()
                self.db = None
            self.last_error = type(error).__name__

    def refresh_summary(self):
        self.latest = self.db.execute('SELECT id,taken_at,key_count FROM snapshots ORDER BY id DESC LIMIT 1').fetchone()
        self.snapshot_count = self.db.execute('SELECT COUNT(*) FROM snapshots').fetchone()[0]

    def prune(self, stamp):
        cutoff = stamp - RETENTION_MS
        self.db.execute('DELETE FROM entries WHERE snapshot_id IN (SELECT id FROM snapshots WHERE taken_at<=?)', (cutoff,))
        removed = self.db.execute('DELETE FROM snapshots WHERE taken_at<=?', (cutoff,)).rowcount
        self.db.execute('DELETE FROM blobs WHERE NOT EXISTS (SELECT 1 FROM entries WHERE entries.blob_hash=blobs.hash)')
        return removed

    def capture(self):
        with self.db_lock:
            if self.db is None:
                self.db = connect(self.path)
        # The same lock covers gateway writes and sync restores, including user-sheet indexes.
        with self.storage_lock, self.db_lock, self.db:
            taken_at = self.sync.now()
            cursor = self.db.execute('INSERT INTO snapshots(taken_at,key_count,manifest) VALUES (?,0,?)', (taken_at, ''))
            snapshot_id = cursor.lastrowid
            manifest = hashlib.sha256()
            count = 0
            for key in sorted(self.sync.StorageSync.scan(self.client)):
                if not eligible(self.sync, key):
                    continue
                state, metadata = self.sync.snapshot(self.client, key)
                if state['kind'] == 'none':
                    continue
                payload = self.sync.dumps({'state': state, 'metadata': metadata})
                fingerprint = checksum(payload)
                self.db.execute('INSERT OR IGNORE INTO blobs VALUES (?,?)', (fingerprint, payload))
                self.db.execute('INSERT INTO entries VALUES (?,?,?)', (snapshot_id, key, fingerprint))
                manifest.update(self.sync.dumps([key, fingerprint]).encode())
                count += 1
            self.db.execute('UPDATE snapshots SET key_count=?,manifest=? WHERE id=?', (count, manifest.hexdigest(), snapshot_id))
            removed = self.prune(taken_at)
            self.last_error = None
        with self.db_lock:
            if removed:
                self.db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            self.refresh_summary()
        return snapshot_id

    def run(self):
        scheduled_at = self.sync.now()
        while not self.stopped.is_set():
            delay = max(0, (scheduled_at - self.sync.now()) / 1000)
            if self.stopped.wait(min(delay, 30)):
                return
            if delay > 30:
                continue
            try:
                self.capture()
                scheduled_at = self.sync.next_daily_sync(self.sync.now())
            except Exception as error:
                self.last_error = type(error).__name__
                scheduled_at = self.sync.now() + 300_000

    def start(self):
        self.thread = threading.Thread(target=self.run, name='storage-backup', daemon=True)
        self.thread.start()

    def status(self):
        # Health probes must not wait on an archive write or query its growing history.
        latest = self.latest
        return {'schedule': '03:00 Asia/Seoul', 'retentionDays': RETENTION_DAYS, 'lastSnapshotId': latest[0] if latest else None,
                'lastBackupAt': latest[1] if latest else None, 'keyCount': latest[2] if latest else 0,
                'snapshotCount': self.snapshot_count, 'lastError': self.last_error}


def read_snapshot(db, snapshot_id, sync):
    if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
        raise ValueError('Backup database integrity check failed')
    header = db.execute('SELECT key_count,manifest FROM snapshots WHERE id=?', (snapshot_id,)).fetchone()
    if header is None:
        raise ValueError('Snapshot does not exist')
    rows = db.execute('SELECT e.key,e.blob_hash,b.payload FROM entries e JOIN blobs b ON b.hash=e.blob_hash '
                      'WHERE snapshot_id=? ORDER BY e.key', (snapshot_id,)).fetchall()
    manifest = hashlib.sha256()
    result = []
    for key, fingerprint, payload in rows:
        if checksum(payload) != fingerprint or not eligible(sync, key):
            raise ValueError('Backup content validation failed')
        manifest.update(sync.dumps([key, fingerprint]).encode())
        item = json.loads(payload)
        state = item['state']
        if state['kind'] not in ('string', 'hash', 'zset') or not isinstance(state['expires'], (int, float)):
            raise ValueError('Unsupported backup state')
        result.append((key, state))
    if len(rows) != header[0] or manifest.hexdigest() != header[1]:
        raise ValueError('Backup manifest validation failed')
    return result


def restore(db, snapshot_id, client, sync, prefixes, journal=None, apply=False):
    if not prefixes or any(prefix not in sync.PREFIXES or prefix in EXCLUDED for prefix in prefixes):
        raise ValueError('Select complete application prefixes')
    # Validate every archived key before changing either the journal or Redis.
    items = [(key, state) for key, state in read_snapshot(db, snapshot_id, sync) if key.startswith(tuple(prefixes))]
    active = [(key, state) for key, state in items if not state['expires'] or state['expires'] > sync.now()]
    summary = {'snapshotId': snapshot_id, 'restoreKeys': len(active), 'expiredKeys': len(items) - len(active), 'applied': False}
    if not apply:
        return summary
    if journal is None:
        raise ValueError('The sync journal is required for recovery')
    if any(key.startswith(tuple(prefixes)) for key in sync.StorageSync.scan(client)):
        raise ValueError('Target prefixes must be empty; stop services and recover to an empty target')
    stamp = sync.now()
    with client.pipeline(transaction=True) as pipeline:
        for key, state in active:
            metadata = sync.versions(key, state, observed=stamp)
            # An explicit historical recovery is a new write, including for timestamped user rows.
            metadata = {name: dict(value, time=stamp) for name, value in metadata.items()}
            metadata['\0key'] = {'time': stamp, 'hash': sync.digest(state), 'deleted': False, 'expires': state['expires']}
            journal.save(key, state, metadata, True)
            pipeline.execute_command('EVAL', sync.RESTORE, 2, key, sync.META, sync.dumps(state), sync.dumps(metadata))
        pipeline.execute()
    return dict(summary, applied=True)


def main():
    parser = argparse.ArgumentParser(description='Inspect, export or recover daily Redis backup history. Stop writers before recovery.')
    parser.add_argument('--db', default=os.environ.get('STORAGE_BACKUP_DB', DEFAULT_DB))
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list')
    export = sub.add_parser('export')
    export.add_argument('--output', required=True)
    recovery = sub.add_parser('restore')
    recovery.add_argument('--snapshot', type=int, required=True)
    recovery.add_argument('--prefix', action='append', required=True)
    recovery.add_argument('--socket', default=os.environ.get('STORAGE_SOCKET', '/run/owkr-storage-redis/redis.sock'))
    recovery.add_argument('--journal', default=os.environ.get('STORAGE_SYNC_DB', '/var/lib/owkr-storage-gateway/sync.sqlite3'))
    recovery.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with connect(args.db, readonly=True) as db:
        if args.command == 'list':
            print(json.dumps([{'id': row[0], 'takenAt': row[1], 'keyCount': row[2]} for row in
                              db.execute('SELECT id,taken_at,key_count FROM snapshots ORDER BY id DESC')]))
        elif args.command == 'export':
            descriptor = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(descriptor)
            try:
                with sqlite3.connect(args.output) as target:
                    db.backup(target)
                    if target.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                        raise ValueError('Export integrity check failed')
            except Exception:
                os.unlink(args.output)
                raise
            print(json.dumps({'exported': True}))
        else:
            import redis
            spec = importlib.util.spec_from_file_location('storage_sync', Path(__file__).with_name('storage-sync.py'))
            sync = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(sync)
            client = redis.Redis(unix_socket_path=args.socket, socket_timeout=30)
            client.response_callbacks.clear()
            journal = sync.StorageSync(client, None, args.journal) if args.apply else None
            try:
                print(json.dumps(restore(db, args.snapshot, client, sync, args.prefix, journal, args.apply)))
            finally:
                if journal:
                    journal.db.close()


if __name__ == '__main__':
    main()
