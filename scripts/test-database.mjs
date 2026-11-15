import { execFileSync } from 'node:child_process';
import { testDatabase } from '../tests/database-runner.mjs';
const files = [
  'tests/db-bootstrap.sql',
  'supabase/001_care_backend.sql',
  'supabase/002_security_tests.sql',
  'supabase/003_quality_upgrade.sql',
  'supabase/006_approval_revision.sql',
  'supabase/004_upgrade_tests.sql',
];
execFileSync(
  'psql',
  [testDatabase(), '-X', '-v', 'ON_ERROR_STOP=1', ...files.flatMap((file) => ['-f', file])],
  { stdio: 'inherit' },
);
await import('../tests/concurrency.mjs');
