import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/http-handler.mjs';
const origin = 'https://carerelay-sand.vercel.app';
const id = '11111111-1111-4111-8111-111111111111';
const account = { id, user_metadata: { name: 'Care owner' } };
async function request({
  method = 'GET',
  url = '/api/care',
  body,
  user = account,
  rpcError = null,
  authError = null,
  headers = {},
} = {}) {
  const calls = [],
    logs = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user }, error: authError }),
      signOut: async () => ({}),
      exchangeCodeForSession: async () => ({}),
      resetPasswordForEmail: async () => ({}),
      updateUser: async () => ({}),
      signInWithPassword: async () => ({ data: { user: account } }),
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === 'care_bootstrap' ? [] : { circle: { id } }, error: rpcError };
    },
  };
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value) {
      this.body = value
        ? JSON.parse(this.headers['content-type']?.includes('json') ? value : 'null')
        : null;
    },
  };
  await createHandler(
    () => client,
    { APP_ORIGIN: origin },
    (entry) => logs.push(entry),
  )(
    { method, url, headers: { origin, 'content-type': 'application/json', ...headers }, body },
    response,
  );
  return { ...response, calls, logs };
}
test('anonymous bootstrap is public, all circle data requires authenticated identity', async () => {
  assert.deepEqual((await request({ user: null })).body, { user: null, circles: [] });
  const r = await request({ user: null, url: `/api/care?circle=${id}` });
  assert.equal(r.statusCode, 401);
  assert.equal(r.calls.length, 0);
});
test('HTTP boundary rejects unsupported methods and CSRF before reading the provider', async () => {
  assert.equal((await request({ method: 'DELETE' })).statusCode, 405);
  const r = await request({
    method: 'POST',
    body: { action: 'question' },
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(r.statusCode, 403);
  assert.equal(r.calls.length, 0);
});
test('GET views validate IDs, revision and pagination independently', async () => {
  assert.equal((await request({ url: '/api/care?circle=bad' })).statusCode, 400);
  assert.equal((await request({ url: `/api/care?circle=${id}&revision=-1` })).statusCode, 400);
  const r = await request({ url: `/api/care?circle=${id}&view=history&before=50` });
  assert.equal(r.calls[0].name, 'care_history');
  assert.equal(r.calls[0].args.p_before, 50);
  assert.equal(
    (await request({ url: `/api/care?circle=${id}&view=export` })).calls[0].name,
    'care_export',
  );
});
test('POST forwards the validated idempotency key and strips spoofed identity', async () => {
  const r = await request({
    method: 'POST',
    body: {
      action: 'question',
      circle: id,
      requestId: id,
      body: 'Ask the clinician',
      actor: 'elder',
      role: 'elder',
    },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.calls[0].name, 'care_mutate');
  assert.equal(r.calls[0].args.p_request, id);
  assert.equal(r.calls[0].args.p_body.actor, undefined);
});
test('revoked access and stale export are propagated without private provider details', async () => {
  for (const [code, status] of [
    ['42501', 403],
    ['23505', 409],
    ['XX000', 500],
  ]) {
    const r = await request({
      url: `/api/care?circle=${id}`,
      rpcError: { code, message: 'PRIVATE_HEALTH_DATA' },
    });
    assert.equal(r.statusCode, status);
    assert.doesNotMatch(JSON.stringify(r), /PRIVATE_HEALTH_DATA/);
  }
});
test('provider outage is distinguished from expired sign-in and responses are never cached', async () => {
  const r = await request({ authError: { status: 503 } });
  assert.equal(r.statusCode, 503);
  assert.match(r.headers['cache-control'], /no-store/);
  assert.equal(r.logs.length, 1);
  assert.deepEqual(JSON.parse(r.logs[0]), { event: 'care_request_failed', status: 503 });
});
test('password recovery requests give a generic response and reset requires sign-in', async () => {
  assert.equal(
    (
      await request({
        method: 'POST',
        user: null,
        body: { action: 'recover', email: 'care@example.invalid' },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request({
        method: 'POST',
        user: null,
        body: { action: 'update-password', password: 'a secure new password' },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (await request({ method: 'POST', body: { action: 'update-password', password: 'short' } }))
      .statusCode,
    400,
  );
});
