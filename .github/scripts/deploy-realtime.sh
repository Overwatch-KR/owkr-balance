#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

DEPLOY_ROOT="${OWKR_DEPLOY_ROOT:-/opt/owkr-draft}"
ENV_ROOT="${OWKR_ENV_ROOT:-/etc/owkr-draft}"
NODE_BIN="${OWKR_NODE_BIN:-/opt/owkr-runtime/bin/node}"
LOCK_FILE="${OWKR_DEPLOY_LOCK:-/run/lock/owkr-draft-deploy.lock}"
STORAGE_ROOT="${OWKR_STORAGE_ROOT:-/opt/owkr-storage}"
STORAGE_ENV="${OWKR_STORAGE_ENV:-/etc/owkr-storage/gateway.env}"
PYTHON_BIN="${OWKR_PYTHON_BIN:-/usr/bin/python3}"
SERVICE=owkr-draft
PUBLIC_READY=https://civilwar.devbot.me/health/ready
LOCAL_READY=http://127.0.0.1:8787/health/ready
staging=
previous=
transitioning=0
storage_backup=
storage_changed=0

storage_ready() {
  "$PYTHON_BIN" - "$STORAGE_ENV" <<'PY'
import json, sys, urllib.request
from pathlib import Path
values = dict(line.split('=', 1) for line in Path(sys.argv[1]).read_text().splitlines() if '=' in line and not line.startswith('#'))
request = urllib.request.Request('http://127.0.0.1:8790/status', data=b'{}', headers={
    'Authorization': 'Bearer ' + values['STORAGE_TOKEN'].strip().strip('"').strip("'")})
with urllib.request.urlopen(request, timeout=5) as response:
    assert json.load(response)['backend'] in ('local', 'upstash')
PY
}

prepare_storage() {
  if [[ ! -d "$STORAGE_ROOT" ]]; then return 0; fi
  [[ -r "$STORAGE_ENV" && -x "$PYTHON_BIN" ]]
  local file
  for file in storage-sync.py storage-gateway.py; do
    [[ -f "$release/deploy/$file" && -f "$STORAGE_ROOT/$file" ]]
    "$PYTHON_BIN" -c 'import sys; from pathlib import Path; compile(Path(sys.argv[1]).read_text(), sys.argv[1], "exec")' "$release/deploy/$file"
  done
  if cmp -s "$release/deploy/storage-sync.py" "$STORAGE_ROOT/storage-sync.py" \
    && cmp -s "$release/deploy/storage-gateway.py" "$STORAGE_ROOT/storage-gateway.py"; then return 0; fi
  storage_backup="$(mktemp -d "$STORAGE_ROOT/.before-deploy-$commit.XXXXXX")"
  chmod 700 "$storage_backup"
  cp -p "$STORAGE_ROOT/storage-sync.py" "$STORAGE_ROOT/storage-gateway.py" "$storage_backup/"
}

deploy_storage() {
  if [[ -z "$storage_backup" ]]; then return 0; fi
  storage_changed=1
  systemctl stop owkr-storage-gateway
  install -m 0644 "$release/deploy/storage-sync.py" "$release/deploy/storage-gateway.py" "$STORAGE_ROOT/"
  systemctl start owkr-storage-gateway
  local attempt
  for attempt in {1..30}; do
    if systemctl is-active --quiet owkr-storage-gateway && storage_ready; then return 0; fi
    sleep 1
  done
  return 1
}

ready() {
  local url="$1" body
  body="$(curl --fail --silent --show-error --connect-timeout 3 --max-time 5 "$url" 2>/dev/null)" || return 1
  [[ "$body" == *'"status":"ready"'* && "$body" == *'"mode":"redis"'* ]]
}

wait_ready() {
  local attempt
  for attempt in {1..30}; do
    if systemctl is-active --quiet "$SERVICE" && ready "$LOCAL_READY" && ready "$PUBLIC_READY"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

switch_current() {
  local target="$1" temporary="$DEPLOY_ROOT/.current-$$"
  ln -sfn "$target" "$temporary" && mv -Tf "$temporary" "$DEPLOY_ROOT/current"
}

cleanup() {
  if [[ -n "$staging" && -d "$staging" ]]; then rm -rf -- "$staging"; fi
}

rollback() {
  if (( transitioning )); then
    printf '%s\n' 'Deployment failed; restoring the previous release.' >&2
    systemctl stop "$SERVICE" || true
    if (( storage_changed )); then
      systemctl stop owkr-storage-gateway || true
      cp -p "$storage_backup/storage-sync.py" "$storage_backup/storage-gateway.py" "$STORAGE_ROOT/" || true
      systemctl start owkr-storage-gateway || true
      if ! storage_ready; then printf '%s\n' 'GATEWAY ROLLBACK FAILED: inspect owkr-storage-gateway.' >&2; fi
    fi
    if switch_current "$previous" && systemctl start "$SERVICE" && wait_ready; then
      printf '%s\n' 'Previous release restored and healthy.' >&2
    else
      printf '%s\n' 'ROLLBACK FAILED: inspect owkr-draft on the server.' >&2
    fi
  fi
  return 0
}

finish() {
  local status="$?"
  trap - EXIT INT TERM
  if (( status != 0 )); then rollback; fi
  cleanup
  exit "$status"
}

preflight() {
  [[ "$(id -u)" == 0 ]] || { printf '%s\n' 'Run with sudo.' >&2; return 1; }
  [[ "$(uname -sm)" == 'Linux x86_64' ]]
  [[ -x "$NODE_BIN" && "$("$NODE_BIN" --version)" == v24.* ]]
  [[ -r "$ENV_ROOT/server.env" && -r "$ENV_ROOT/participant-oauth.env" ]]
  [[ -d "$DEPLOY_ROOT/releases" && -L "$DEPLOY_ROOT/current" ]]
  previous="$(readlink -f "$DEPLOY_ROOT/current")"
  [[ "$previous" == "$DEPLOY_ROOT/releases/"* && -d "$previous" ]]
  id owkr >/dev/null
  systemctl is-active --quiet caddy
}

trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

preflight
if [[ "${1:-}" == --preflight && $# == 1 ]]; then
  systemctl is-active --quiet "$SERVICE"
  ready "$LOCAL_READY"
  ready "$PUBLIC_READY"
  printf '%s\n' 'Preflight passed: runtime, service paths, Caddy and Redis readiness.'
  exit 0
fi

[[ $# == 3 ]] || { printf '%s\n' 'Usage: deploy-realtime.sh ARCHIVE COMMIT_SHA SHA256' >&2; exit 2; }
archive="$1"
commit="$2"
checksum="$3"
[[ -f "$archive" && "$commit" =~ ^[0-9a-f]{40}$ && "$checksum" =~ ^[0-9a-f]{64}$ ]]
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
exec 9>"$LOCK_FILE"
flock --wait 120 9
# A concurrent deployment may have changed current while this process waited.
previous="$(readlink -f "$DEPLOY_ROOT/current")"
[[ "$previous" == "$DEPLOY_ROOT/releases/"* && -d "$previous" ]]
release="$DEPLOY_ROOT/releases/$commit"

if [[ ! -d "$release" ]]; then
  staging="$(mktemp -d "$DEPLOY_ROOT/releases/.staging-$commit.XXXXXX")"
  tar --extract --gzip --file "$archive" --directory "$staging" --no-same-owner --no-same-permissions
  [[ "$(cat "$staging/.release-sha")" == "$commit" ]]
  [[ -f "$staging/realtime/src/index.js" && -d "$staging/node_modules" ]]
  "$NODE_BIN" --check "$staging/realtime/src/index.js"
  (cd "$staging" && "$NODE_BIN" --input-type=module -e 'await import("ws"); await import("@upstash/redis");')
  chown -R root:owkr "$staging"
  chmod -R u=rwX,go=rX "$staging"
  mv "$staging" "$release"
  staging=
fi
[[ "$(cat "$release/.release-sha")" == "$commit" ]]

if [[ "$previous" == "$release" ]] && systemctl is-active --quiet "$SERVICE" && ready "$LOCAL_READY" && ready "$PUBLIC_READY"; then
  printf 'Already deployed and healthy: %s\n' "$commit"
  exit 0
fi

# Never overlap writers: stop the old process before switching the release.
prepare_storage
transitioning=1
systemctl stop "$SERVICE"
deploy_storage
switch_current "$release"
systemctl start "$SERVICE"
wait_ready
transitioning=0
printf 'Deployed and healthy: %s\n' "$commit"
