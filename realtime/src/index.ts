import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { requireDraft, validateHeroCatalog, validateMapCatalog } from '../../domains/draft/shared/public.js';
import { DraftEngine } from './engine.js';
import { createLocalDraftFixtures } from './local-fixtures.js';
import { createRedisRealtimeStore } from './store.js';
import { createRealtimeServer } from './server.js';
import { DraftParticipantAuth } from './participant-auth.js';

const localOnly = process.argv.includes('--local-only');
const port = Number(process.env.DRAFT_PORT ?? 8787);
const host = process.env.DRAFT_HOST ?? '127.0.0.1';
requireDraft(Number.isInteger(port) && port > 0 && port < 65536, 'INVALID_PORT', '서버 포트를 확인해 주세요.');
requireDraft(!localOnly || host === '127.0.0.1', 'UNSAFE_LOCAL_BIND', '로컬 시험 서버는 127.0.0.1에서만 실행합니다.');

function required(name: string): string {
  const value = process.env[name];
  requireDraft(value, 'MISSING_CONFIG', `${name} 설정이 필요합니다.`);
  return value;
}

function readKey(name: string): string { return readFileSync(required(name), 'utf8'); }

const local = localOnly ? createLocalDraftFixtures() : null;
const keys = localOnly ? generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
}) : null;
const catalogs = local?.catalogs ?? JSON.parse(readFileSync(required('DRAFT_CATALOG_PATH'), 'utf8')) as ReturnType<typeof createLocalDraftFixtures>['catalogs'];
validateMapCatalog(catalogs.maps); validateHeroCatalog(catalogs.heroes);
if (!localOnly) requireDraft(!catalogs.maps.approval.version.startsWith('local-')
  && !catalogs.heroes.approval.version.startsWith('local-'), 'LOCAL_CATALOG_DENIED', '시험 카탈로그를 운영 서버에서 사용할 수 없습니다.');
const allowedOrigin = localOnly ? process.env.DRAFT_APP_ORIGIN ?? 'http://localhost:5173' : required('DRAFT_APP_ORIGIN');
requireDraft(localOnly || new URL(allowedOrigin).protocol === 'https:', 'INVALID_ORIGIN', '운영 사이트는 HTTPS 주소가 필요합니다.');
const store = local?.store ?? createRedisRealtimeStore(required('UPSTASH_REDIS_REST_URL'), required('UPSTASH_REDIS_REST_TOKEN'));
const engine = new DraftEngine(store, catalogs);
const realtimePrivateKey = keys?.privateKey ?? readKey('DRAFT_REALTIME_PRIVATE_KEY_PATH');
const participantAuth = localOnly ? undefined : new DraftParticipantAuth({ engine, appOrigin: allowedOrigin,
  publicOrigin: required('DRAFT_PUBLIC_ORIGIN'), clientId: required('DRAFT_DISCORD_CLIENT_ID'),
  clientSecret: required('DRAFT_DISCORD_CLIENT_SECRET'), privateKey: realtimePrivateKey });
const app = await createRealtimeServer({ engine, allowedOrigin, localOnly,
  adminPublicKey: keys?.publicKey ?? readKey('DRAFT_ADMIN_PUBLIC_KEY_PATH'),
  realtimePrivateKey,
  realtimePublicKey: keys?.publicKey ?? readKey('DRAFT_REALTIME_PUBLIC_KEY_PATH'),
  ...(local && keys ? { localTicketPrivateKey: keys.privateKey, localUserIds: local.identities.map(identity => identity.discordUserId) } : {}),
  ...(participantAuth ? { participantAuth, bridgeSecret: required('DRAFT_BRIDGE_SECRET') } : {}),
});
app.server.listen(port, host, () => {
  process.stdout.write(`OWKR draft backend: http://${host}:${port} (${localOnly ? 'local-only · synthetic data' : 'redis'})\n`);
  if (localOnly) process.stdout.write('Local source: LOCAL23456 / local identities: 1000000000000000000 ~ 1000000000000000009\n');
});
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10_000); timeout.unref();
  void app.close().then(() => { clearTimeout(timeout); process.exit(0); }).catch(() => process.exit(1));
});
