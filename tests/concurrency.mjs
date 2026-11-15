import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { sql, literal, testDatabase } from './database-runner.mjs';
const run = promisify(execFile);
const ids = [
  '00000000-0000-4000-8000-000000000041',
  '00000000-0000-4000-8000-000000000042',
  '00000000-0000-4000-8000-000000000043',
];
sql(
  `insert into auth.users(id,email) values ${ids.map((id, i) => `('${id}','race-${i}@example.invalid')`).join(',')};`,
);
const circle = sql(
  `insert into care_private.circles(name) values('Concurrency check') returning id;`,
);
sql(
  `insert into care_private.members(circle_id,user_id,display_name,role) values ${ids.map((id, i) => `('${circle}','${id}','Race ${i}','${i === 0 ? 'elder' : 'caregiver'}')`).join(',')};`,
);
const dose = sql(
  `insert into care_private.doses(circle_id,label,scheduled_at,created_by) values('${circle}','Concurrent claim',now(),'${ids[0]}') returning id;`,
);
const claim = (actor) =>
  run('psql', [
    testDatabase(),
    '-X',
    '-q',
    '-t',
    '-A',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
    '-c',
    `begin;set local role authenticated;select set_config('request.jwt.claims',${literal(JSON.stringify({ sub: actor }))},true);select public.care_mutate(gen_random_uuid(),'claim',${literal({ circle, dose })});select pg_sleep(0.1);commit;`,
  ]);
const result = await Promise.allSettled(ids.slice(1).map(claim));
assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
assert.match(result.find((r) => r.status === 'rejected').reason.stderr, /23505/);
assert.equal(
  sql(`select count(*) from care_private.events where circle_id='${circle}' and kind='relay';`),
  '1',
);
assert.ok(
  ids.slice(1).includes(sql(`select owner_id from care_private.doses where id='${dose}';`)),
);
console.log(
  'PASS: simultaneous database clients produce exactly one owner and one acknowledgement event.',
);
