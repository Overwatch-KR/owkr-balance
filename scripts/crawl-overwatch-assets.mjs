import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { encodeWebp } from './encode-webp.mjs';

const root = fileURLToPath(new URL('../public/draft-assets/', import.meta.url));
const indexUrls = {
  heroes: 'https://overfast-api.tekrop.fr/heroes?locale=ko-kr',
  maps: 'https://overfast-api.tekrop.fr/maps?locale=ko-kr',
};
const imageHosts = new Set(['d15f34w2p8l1cc.cloudfront.net', 'overfast-api.tekrop.fr',
  'blz-contentstack-assets.akamaized.net', 'bnetcmsus-a.akamaihd.net', 'fservus20221227.blob.core.windows.net']);
const basicModes = new Set(['control', 'escort', 'hybrid', 'push', 'flashpoint']);
const overrides = JSON.parse(await readFile(new URL('./overwatch-asset-overrides.json', import.meta.url), 'utf8'));

async function request(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}

async function download(item) {
  if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error(`Invalid asset ID: ${item.id}`);
  let sourceUrl = item.sourceUrl;
  if (item.pressAsset) {
    if (item.sourcePage !== 'https://blizzard.gamespress.com/en-GB/Overwatch-2-Launch'
      || !/^[A-Za-z0-9_]+\.(png|jpg)$/.test(item.pressAsset)) throw new Error('Unapproved press asset');
    const html = await (await request(item.sourcePage)).text();
    const tag = [...html.matchAll(/<img[^>]+>/g)].find(match => match[0].includes(`alt="${item.pressAsset}"`))?.[0];
    sourceUrl = tag?.match(/data-preview="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    if (!sourceUrl) throw new Error('Press asset is unavailable');
  }
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || !imageHosts.has(url.hostname)) throw new Error(`Unapproved image origin: ${url.origin}`);
  const response = await request(url);
  let mime = response.headers.get('content-type')?.split(';')[0];
  const pressBinary = Boolean(item.pressAsset) && ['application/octet-stream', 'application/octet-strem'].includes(mime);
  if (!pressBinary && !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw new Error(`Unexpected image type: ${mime}`);
  if (Number(response.headers.get('content-length') ?? 0) > 20_000_000) throw new Error('Image exceeds size limit');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20_000_000) { await reader.cancel(); throw new Error('Image exceeds size limit'); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (pressBinary) mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : 'image/jpeg';
  const signature = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!signature) throw new Error(`Invalid image signature: ${item.id}`);
  if (item.kind === 'heroes' && !['tank', 'damage', 'support'].includes(item.role)) throw new Error('Invalid hero role');
  const localPath = item.kind === 'heroes' ? `/hero/${item.role}/${item.id}.webp` : `/draft-assets/maps/${item.id}.webp`;
  const target = fileURLToPath(new URL(`../public${localPath}`, import.meta.url));
  let output;
  if (item.kind === 'heroes') {
    try { output = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  output ??= (await encodeWebp(bytes, localPath)).data;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(`${target}.tmp`, output);
  await rename(`${target}.tmp`, target);
  return { ...item, localPath, mime: 'image/webp', bytes: output.length,
    sha256: createHash('sha256').update(output).digest('hex'), sourceMime: mime, sourceBytes: size,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    ...(item.kind === 'heroes' ? { localAssetPolicy: 'Existing role portrait when present; indexed download only for missing portraits.' } : {}) };

}

const heroes = await (await request(indexUrls.heroes)).json();
const maps = await (await request(indexUrls.maps)).json();
const items = [
  ...heroes.map(hero => ({ kind: 'heroes', id: hero.key, name: hero.name, role: hero.role,
    sourcePage: `https://overwatch.blizzard.com/ko-kr/heroes/${hero.key}/`, sourceUrl: hero.portrait })),
  ...maps.filter(map => map.uses.includes('standard') && map.gamemodes.some(mode => basicModes.has(mode)))
    .map(map => ({ kind: 'maps', id: map.key, name: map.name, modes: map.gamemodes,
      sourcePage: 'https://overwatch.blizzard.com/en-us/media/screenshots/', sourceUrl: map.screenshot })),
];
await mkdir(path.join(root, 'maps'), { recursive: true });
const assets = [];
const errors = [];
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < items.length) {
    const item = items[cursor++];
    try { assets.push(await download({ ...item, ...(overrides[item.id] ?? {}) })); }
    catch (error) { errors.push({ id: item.id, message: error.message }); }
  }
}));
if (errors.length) { process.stderr.write(`${JSON.stringify(errors, null, 2)}\n`); process.exitCode = 1; }
else {
  assets.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const manifest = {
    fetchedAt: new Date().toISOString(), provider: 'OverFast API (unofficial Blizzard-derived index)', indexUrls,
    officialPageAccess: 'Official HTML returned 403 or was unreachable in this environment; images fetched from the indexed CDN/mirror URLs.',
    copyright: 'Overwatch artwork and characters belong to Blizzard Entertainment. API software licensing does not transfer artwork ownership.',
    catalogueApproval: 'Image collection only. Names, roles, availability and competitive map pool require separate approval.',
    assets,
  };
  await writeFile(path.join(root, 'manifest.json.tmp'), `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(path.join(root, 'manifest.json.tmp'), path.join(root, 'manifest.json'));
  process.stdout.write(`Saved ${assets.filter(asset => asset.kind === 'heroes').length} hero portraits and ${assets.filter(asset => asset.kind === 'maps').length} standard map images (${assets.reduce((sum, asset) => sum + asset.bytes, 0)} bytes).\n`);
}
