import { execFileSync } from 'node:child_process';
import { stat, readFile } from 'node:fs/promises';
const paths = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
let bytes = 0;
for (const path of paths) {
  if (
    /(^|\/)(node_modules|dist|coverage|test-results|playwright-report)\//.test(path) ||
    (/(^|\/)\.env($|\.)/.test(path) && path !== '.env.example')
  )
    throw Error('Generated or secret file tracked: ' + path);
  const content = await readFile(path, 'utf8');
  bytes += (await stat(path)).size;
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sb_secret_[A-Za-z0-9]+/.test(content))
    throw Error('Credential-shaped content found: ' + path);
}
if (bytes >= 9000000) throw Error('Tracked source exceeds the 9 MB safety budget');
const branches = execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n');
if (branches.length !== 1 || branches[0] !== 'main')
  throw Error('Exactly one local main branch is required');
console.log(
  `Source checks passed: ${paths.length} files, ${bytes} bytes, one main branch. Pattern scan does not replace secret-history review.`,
);
