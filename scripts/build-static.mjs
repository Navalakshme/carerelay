import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.mjs', 'domain.mjs']) {
  await copyFile(new URL(file, root), new URL(file, output));
}
console.log('Static CareRelay site built in dist/');
