#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$(id -u)" == 0 ]]
source_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
command -v redis-server >/dev/null
python3 -c 'import redis'
id owkr-storage >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin owkr-storage
install -d -m 0750 -o root -g redis /etc/owkr-storage
install -d -m 0755 /opt/owkr-storage
install -d -m 0750 -o redis -g redis /var/lib/owkr-storage
install -m 0644 "$source_dir/storage-gateway.py" /opt/owkr-storage/storage-gateway.py
install -m 0644 "$source_dir/storage-sync.py" /opt/owkr-storage/storage-sync.py
install -m 0644 "$source_dir/storage-backup.py" /opt/owkr-storage/storage-backup.py
install -m 0640 -o root -g redis "$source_dir/storage-redis.conf" /etc/owkr-storage/redis.conf
install -m 0644 "$source_dir/owkr-storage-redis.service" "$source_dir/owkr-storage-gateway.service" /etc/systemd/system/
python3 - <<'PY'
import hashlib, hmac, os
from pathlib import Path
values = {}
path = Path('/etc/owkr-storage/gateway.env')
existing = path.read_text() if path.exists() else ''
for line in Path('/etc/owkr-draft/server.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        values[key] = value.strip().strip('"').strip("'")
secret = values['DRAFT_BRIDGE_SECRET']
assert len(secret) >= 32
token = hmac.new(secret.encode(), b'owkr-local-storage-v1', hashlib.sha256).hexdigest()
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(descriptor, 'w') as output:
    output.write('STORAGE_TOKEN=' + token + '\n')
    upstream = {}
    backup = Path('/etc/owkr-draft/server.env.before-local-storage')
    if backup.exists():
        for line in backup.read_text().splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                upstream[key] = value.strip().strip(chr(34)).strip(chr(39))
    if 'STORAGE_UPSTREAM_URL=' not in existing and upstream.get('UPSTASH_REDIS_REST_URL', '').startswith('https://'):
        output.write('STORAGE_UPSTREAM_URL=' + upstream['UPSTASH_REDIS_REST_URL'] + '\n')
        output.write('STORAGE_UPSTREAM_TOKEN=' + upstream['UPSTASH_REDIS_REST_TOKEN'] + '\n')
    for line in existing.splitlines():
        if line.startswith(('STORAGE_UPSTREAM_URL=', 'STORAGE_UPSTREAM_TOKEN=', 'STORAGE_SYNC_DB=', 'STORAGE_BACKUP_DB=')):
            output.write(line + '\n')
PY
systemctl daemon-reload
systemctl enable owkr-storage-redis owkr-storage-gateway
systemctl start owkr-storage-redis
systemctl restart owkr-storage-gateway
python3 - <<'PYTHON'
import json, time, urllib.request
from pathlib import Path
env = dict(line.split('=', 1) for line in Path('/etc/owkr-storage/gateway.env').read_text().splitlines() if '=' in line)
for attempt in range(30):
    try:
        request = urllib.request.Request('http://127.0.0.1:8790', data=b'["PING"]', headers={'Authorization': 'Bearer ' + env['STORAGE_TOKEN']})
        with urllib.request.urlopen(request, timeout=2) as response:
            assert json.load(response)['result'] == 'PONG'
        break
    except Exception:
        if attempt == 29:
            raise
        time.sleep(.1)
PYTHON
printf '%s\n' 'Storage installed on a Unix socket and loopback REST port 8790. No production endpoints have been switched.'
