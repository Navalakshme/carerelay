import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
async function check(directory = '.') {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        'dist',
        '.npm-cache',
        'coverage',
        'test-results',
        'playwright-report',
      ].includes(item.name)
    )
      continue;
    const path = directory + '/' + item.name;
    if (item.isDirectory()) await check(path);
    else if (path.endsWith('.mjs'))
      execFileSync(
        process.execPath,
        ['--preserve-symlinks', '--preserve-symlinks-main', '--check', path],
        { stdio: 'inherit' },
      );
  }
}
await check();
console.log('JavaScript module syntax passed.');
