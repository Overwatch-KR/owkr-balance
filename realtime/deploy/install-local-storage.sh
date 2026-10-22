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
install -m 0640 -o root -g redis "$source_dir/storage-redis.conf" /etc/owkr-storage/redis.conf
install -m 0644 "$source_dir/owkr-storage-redis.service" "$source_dir/owkr-storage-gateway.service" /etc/systemd/system/
python3 - <<'PY'
import hashlib, hmac, os
from pathlib import Path
values = {}
for line in Path('/etc/owkr-draft/server.env').read_text().splitlines():
    if '=' in line and not line.startswith('#'):
        key, value = line.split('=', 1)
        values[key] = value.strip().strip('"').strip("'")
secret = values['DRAFT_BRIDGE_SECRET']
assert len(secret) >= 32
token = hmac.new(secret.encode(), b'owkr-local-storage-v1', hashlib.sha256).hexdigest()
path = Path('/etc/owkr-storage/gateway.env')
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(descriptor, 'w') as output:
    output.write('STORAGE_TOKEN=' + token + '\n')
PY
systemctl daemon-reload
systemctl enable --now owkr-storage-redis owkr-storage-gateway
redis-cli -s /run/owkr-storage-redis/redis.sock ping
printf '%s\n' 'Storage installed on a Unix socket and loopback REST port 8790. No production endpoints have been switched.'
