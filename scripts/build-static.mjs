import { mkdir, copyFile } from 'node:fs/promises';
import { publicAssets } from '../lib/public-assets.mjs';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
for (const file of publicAssets) {
  await mkdir(new URL('./', new URL(file, output)), { recursive: true });
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log('Static CareRelay site built in dist/');
