import { cp, writeFile, readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const output = new URL('../realtime-dist/', import.meta.url);
await cp(new URL('./package.json', import.meta.url), new URL('package.json', output));
await cp(new URL('./pnpm-lock.yaml', import.meta.url), new URL('pnpm-lock.yaml', output));
await cp(new URL('./deploy/', import.meta.url), new URL('deploy/', output), { recursive: true });
await writeFile(new URL('README.md', output), await readFile(new URL('./README.md', import.meta.url)));
process.stdout.write('realtime-dist/ contains compiled code, runtime dependency lock and deployment templates. No images or credentials are included.\n');
