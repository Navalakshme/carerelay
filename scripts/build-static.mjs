import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(new URL('lib/', output), { recursive: true });
for (const file of [
  'index.html',
  'styles.css',
  'live.css',
  'live.mjs',
  'artwork.mjs',
  'demo.html',
  'demo.mjs',
  'domain.mjs',
  'lib/sync.mjs',
  'lib/brief.mjs',
]) {
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log('Static CareRelay site built in dist/');
