import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMutation, readBody, rpcFor, databaseError } from '../lib/api-core.mjs';
const origin = 'https://carerelay-sand.vercel.app';
const id = '11111111-1111-4111-8111-111111111111';
test('mutations require the exact trusted origin and JSON', () => {
  assert.doesNotThrow(() =>
    validateMutation({ headers: { origin, 'content-type': 'application/json' } }, origin),
  );
  for (const foreign of [
    undefined,
    'https://attacker.example',
    'https://carerelay-sand.vercel.app.attacker.example',
  ])
    assert.throws(
      () =>
        validateMutation(
          { headers: { origin: foreign, 'content-type': 'application/json' } },
          origin,
        ),
      { status: 403 },
    );
  assert.throws(
    () =>
      validateMutation({ headers: { origin, 'content-type': 'application/json-evil' } }, origin),
    { status: 415 },
  );
});

test('streamed bodies enforce the byte limit before parsing', async () => {
  const stream = (parts) => ({
    async *[Symbol.asyncIterator]() {
      yield* parts;
    },
  });
  assert.deepEqual(await readBody(stream(['{"action":', '"join"}'])), { action: 'join' });
  await assert.rejects(() => readBody(stream(['a'.repeat(8193)])), { status: 413 });
  await assert.rejects(() => readBody({ body: Buffer.from('a'.repeat(8193)) }), { status: 413 });
  await assert.rejects(() => readBody({ body: 'null' }), { status: 400 });
});

test('every care action has one normalized, explicit payload contract', () => {
  const scheduled = new Date().toISOString();
  const cases = [
    { action: 'create-circle', name: ' Circle ', displayName: ' Owner ', timezone: 'UTC' },
    { action: 'join', token: 'a'.repeat(64), displayName: 'Member' },
    { action: 'invite', role: 'viewer', email: 'CARE@example.invalid' },
    { action: 'revoke-invitation', invitation: id },
    { action: 'revoke-member', member: id },
    { action: 'add-dose', label: ' Label ', scheduled },
    { action: 'claim', dose: id },
    { action: 'question', body: ' Question ' },
    { action: 'approve-brief', revision: 0 },
    {
      action: 'correct',
      dose: id,
      outcome: 'uncertain',
      reason: 'Earlier report uncertain',
      previous: 1,
      occurred: scheduled,
    },
    { action: 'propose', label: 'Plan', days: 2, scheduled },
    { action: 'decide-plan', plan: id, approve: false },
    { action: 'read-notification', notification: id },
  ];
  for (const entry of cases) {
    const [rpc, args] = rpcFor({
      ...entry,
      circle: id,
      requestId: id,
      actor: 'spoofed',
      role: entry.role || 'elder',
    });
    assert.equal(rpc, 'care_mutate');
    assert.equal(args.p_action, entry.action);
    assert.equal(args.p_body.actor, undefined);
    if (entry.action === 'question') assert.equal(args.p_body.body, 'Question');
    if (entry.action === 'create-circle') assert.equal(args.p_body.name, 'Circle');
    if (entry.action === 'invite') assert.equal(args.p_body.email, 'care@example.invalid');
  }
  for (const action of ['constructor', '__proto__', 'unknown'])
    assert.throws(() => rpcFor({ action, circle: id, requestId: id }), { status: 400 });
});

test('invalid enums, counts, timestamps and decision types fail closed', () => {
  const base = {
    circle: id,
    requestId: id,
    dose: id,
    plan: id,
    scheduled: new Date().toISOString(),
  };
  const invalid = [
    { action: 'invite', role: 'elder', email: 'care@example.invalid' },
    { action: 'invite', role: 'viewer', email: 'invalid' },
    { action: 'propose', label: 'Plan', days: 31 },
    { action: 'decide-plan', approve: 'true' },
    {
      action: 'correct',
      outcome: 'taken',
      previous: 0,
      reason: 'Valid reason',
      occurred: base.scheduled,
    },
    { action: 'report', outcome: 'unknown', occurred: base.scheduled },
    { action: 'report', outcome: 'taken', occurred: new Date(Date.now() + 86400000).toISOString() },
    { action: 'add-dose', label: 'Label', scheduled: 'invalid' },
    { action: 'approve-brief', revision: -1 },
  ];
  for (const entry of invalid) assert.throws(() => rpcFor({ ...base, ...entry }), { status: 400 });
});
test('body validation rejects arrays, malformed JSON and oversized requests', async () => {
  await assert.rejects(() => readBody({ body: 'not JSON' }), { status: 400 });
  await assert.rejects(() => readBody({ body: [] }), { status: 400 });
  await assert.rejects(() => readBody({ body: { x: 'a'.repeat(9000) } }), { status: 413 });
  assert.deepEqual(await readBody({ body: '{"action":"join"}' }), { action: 'join' });
});
test('report mapping ignores a spoofed actor and requires an idempotency key', () => {
  const [rpc, args] = rpcFor({
    action: 'report',
    circle: id,
    dose: id,
    outcome: 'uncertain',
    occurred: new Date().toISOString(),
    requestId: id,
    actor: 'elder',
  });
  assert.equal(rpc, 'care_mutate');
  assert.equal(args.p_body.outcome, 'uncertain');
  assert.equal('actor' in args.p_body, false);
  assert.throws(() => rpcFor({ action: 'report', circle: id, dose: id, outcome: 'taken' }), {
    status: 400,
  });
});
test('clients cannot select arbitrary RPCs or grant the elder role', () => {
  assert.throws(() => rpcFor({ action: 'care_private.log_event', circle: id }), { status: 400 });
  assert.throws(() => rpcFor({ action: 'invite', circle: id, role: 'elder' }), { status: 400 });
  assert.throws(
    () => rpcFor({ action: 'add-dose', circle: id, label: 'A', scheduled: 'not-a-date' }),
    { status: 400 },
  );
});
test('database errors expose safe access and conflict responses', () => {
  assert.equal(databaseError({ code: '42501', message: 'private information' }).status, 403);
  assert.doesNotMatch(
    databaseError({ code: '42501', message: 'private information' }).message,
    /private information/,
  );
  assert.equal(databaseError({ code: '23505' }).status, 409);
  assert.equal(databaseError({ code: 'XX000', message: 'secret' }).status, 500);
});
