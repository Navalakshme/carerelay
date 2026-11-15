import { execFileSync } from 'node:child_process';

/** Guard against ever executing synthetic fixtures on a deployed database. */
export function testDatabase() {
  const value = process.env.DATABASE_URL;
  if (!value) throw Error('DATABASE_URL must identify a disposable local carerelay_test database.');
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/carerelay_test'
  )
    throw Error('Tests only accept a loopback database named carerelay_test.');
  return value;
}
export function sql(statement) {
  return execFileSync(
    'psql',
    [
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
      statement,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}
export const literal = (value) =>
  value === null
    ? 'null'
    : typeof value === 'boolean' || typeof value === 'number'
      ? String(value)
      : "'" +
        String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''") +
        "'";
export function rpc(name, args, actor) {
  if (!/^care_[a-z0-9_]+$/.test(name) || Object.keys(args).some((key) => !/^p_[a-z_]+$/.test(key)))
    throw Error('Invalid test RPC');
  const parameters = Object.entries(args)
    .map(([key, value]) => `${key} => ${literal(value)}`)
    .join(',');
  return JSON.parse(
    sql(
      `begin; set local role authenticated; select set_config('request.jwt.claims',${literal(JSON.stringify(actor))},true); select jsonb_build_object('data',public.${name}(${parameters})); commit;`,
    )
      .split('\n')
      .at(-1),
  );
}
