import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const script = fileURLToPath(new URL('../../.github/scripts/deploy-realtime.sh', import.meta.url));
const commit = 'a'.repeat(40);

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'owkr-deploy-test-'))); directories.push(directory);
  const root = join(directory, 'app'); const bin = join(directory, 'bin'); const config = join(directory, 'config');
  const previous = join(root, 'releases', 'previous'); const payload = join(directory, 'payload');
  for (const path of [previous, bin, config, join(payload, 'realtime/src'), join(payload, 'node_modules')]) mkdirSync(path, { recursive: true });
  symlinkSync(previous, join(root, 'current'));
  writeFileSync(join(config, 'server.env'), ''); writeFileSync(join(config, 'participant-oauth.env'), '');
  writeFileSync(join(payload, '.release-sha'), `${commit}\n`);
  writeFileSync(join(payload, 'realtime/src/index.js'), 'export {};\n');
  const archive = join(directory, 'release.tar.gz');
  expect(spawnSync('tar', ['-czf', archive, '-C', payload, '.']).status).toBe(0);
  const checksum = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const shell = (name: string, source: string) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${source}\n`, { mode: 0o755 });
  const node = (name: string, source: string) => writeFileSync(join(bin, name), `#!${process.execPath}\n${source}\n`, { mode: 0o755 });
  shell('id', 'echo 0'); shell('uname', 'echo "Linux x86_64"');
  shell('runtime', 'if [[ "$1" == --version ]]; then echo v24.22.0; fi');
  shell('flock', 'exit 0'); shell('chown', 'exit 0'); shell('sleep', 'exit 0');
  shell('systemctl', 'printf "%s\\n" "$*" >> "$TEST_LOG"');
  shell('curl', `if [[ "$TEST_FAIL_NEW" == 1 && "$(readlink -f "$OWKR_DEPLOY_ROOT/current")" == "$OWKR_DEPLOY_ROOT/releases/$TEST_COMMIT" ]]; then exit 22; fi
printf '%s' '{"status":"ready","mode":"redis"}'`);
  node('readlink', 'console.log(require("node:fs").realpathSync(process.argv.at(-1)));');
  node('mv', 'require("node:fs").renameSync(process.argv.at(-2), process.argv.at(-1));');
  node('sha256sum', `const fs = require('node:fs'); const crypto = require('node:crypto');
const [hash, path] = fs.readFileSync(0, 'utf8').trimEnd().split('  ');
process.exit(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex') === hash ? 0 : 1);`);
  const log = join(directory, 'commands.log');
  const run = (options: { checksum?: string; failNew?: boolean } = {}) => spawnSync('bash', [script, archive, commit, options.checksum ?? checksum], {
    encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OWKR_DEPLOY_ROOT: root, OWKR_ENV_ROOT: config,
      OWKR_NODE_BIN: join(bin, 'runtime'), OWKR_DEPLOY_LOCK: join(directory, 'deploy.lock'), TEST_LOG: log,
      TEST_COMMIT: commit, TEST_FAIL_NEW: options.failNew ? '1' : '' },
  });
  return { root, previous, log, run };
}

describe('realtime release deployment', () => {
  it('stops the previous writer before starting the new release and skips a healthy rerun', () => {
    const app = fixture(); const result = app.run();
    expect(result.status, result.stderr).toBe(0);
    expect(realpathSync(join(app.root, 'current'))).toBe(join(app.root, 'releases', commit));
    const commands = readFileSync(app.log, 'utf8');
    expect(commands.indexOf('stop owkr-draft')).toBeLessThan(commands.indexOf('start owkr-draft'));
    const rerun = app.run(); expect(rerun.status, rerun.stderr).toBe(0);
    expect(rerun.stdout).toContain('Already deployed and healthy');
    expect(readFileSync(app.log, 'utf8').match(/stop owkr-draft/g)).toHaveLength(1);
  });

  it('restores and starts the previous release when the new release never becomes ready', () => {
    const app = fixture(); const result = app.run({ failNew: true });
    expect(result.status, readFileSync(app.log, 'utf8')).not.toBe(0);
    expect(result.stderr).toContain('Previous release restored and healthy');
    expect(realpathSync(join(app.root, 'current'))).toBe(app.previous);
    const transitions = readFileSync(app.log, 'utf8').split('\n').filter(line => /^(stop|start) /.test(line));
    expect(transitions).toEqual(['stop owkr-draft', 'start owkr-draft', 'stop owkr-draft', 'start owkr-draft']);
  });

  it('rejects a damaged archive before stopping the running service', () => {
    const app = fixture(); const result = app.run({ checksum: '0'.repeat(64) });
    expect(result.status).not.toBe(0);
    expect(realpathSync(join(app.root, 'current'))).toBe(app.previous);
    expect(readFileSync(app.log, 'utf8')).not.toContain('stop owkr-draft');
  });
});
