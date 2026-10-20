import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { encodeWebp } from './encode-webp.mjs';

const root = fileURLToPath(new URL('../public/', import.meta.url));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat();
}
const manifestPath = path.join(root, 'draft-assets/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sources = (await files(root)).filter(file => /\.(png|jpe?g)$/i.test(file));
if (!sources.length) { process.stdout.write('All local images already use WebP.\n'); process.exit(0); }
let before = 0;
let after = 0;
for (const file of sources) {
  const source = await readFile(file);
  before += source.length;
  const relative = path.relative(root, file);
  const target = file.replace(/\.(png|jpe?g)$/i, '.webp');
  // Existing role portraits are authoritative; duplicate downloaded portraits are removed below.
  if (!relative.startsWith('draft-assets/heroes/')) {
    const { data } = await encodeWebp(source, relative);
    await writeFile(target, data);
    after += data.length;
  }
}
for (const asset of manifest.assets) {
  const original = path.join(root, asset.localPath.slice(1));
  const heroPath = asset.kind === 'heroes' ? `/hero/${asset.role}/${asset.id}.webp` : null;
  const localPath = heroPath ?? asset.localPath.replace(/\.(png|jpe?g)$/i, '.webp');
  const target = path.join(root, localPath.slice(1));
  if (heroPath) {
    try { await stat(target); }
    catch {
      const { data } = await encodeWebp(await readFile(original), heroPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data); after += data.length;
    }
  }
  const output = await readFile(target);
  asset.sourceMime ??= asset.mime;
  asset.sourceBytes ??= asset.bytes;
  asset.sourceSha256 ??= asset.sha256;
  if (heroPath) asset.localAssetPolicy = 'Existing role portrait when present; indexed download only for missing portraits.';
  Object.assign(asset, { localPath, mime: 'image/webp', bytes: output.length,
    sha256: createHash('sha256').update(output).digest('hex') });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
for (const file of sources) await unlink(file);
process.stdout.write(`${sources.length} source images: ${before} -> ${after} bytes (${((1-after/before)*100).toFixed(1)}% smaller, duplicates removed).\n`);
