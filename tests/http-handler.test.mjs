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
  auth = {},
  rpcData,
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
      signUp: async () => ({ data: { user: account, session: null } }),
      ...auth,
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return {
        data:
          rpcData === undefined ? (name === 'care_bootstrap' ? [] : { circle: { id } }) : rpcData,
        error: rpcError,
      };
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

test('sign-in and sign-up validate input and expose only public account fields', async () => {
  const body = {
    action: 'sign-up',
    email: 'reviewer@example.invalid',
    password: 'long imaginary password',
    name: 'Reviewer',
  };
  for (const changes of [
    { email: 'invalid' },
    { password: 'short' },
    { password: 'x'.repeat(129) },
    { name: '' },
  ])
    assert.equal(
      (await request({ method: 'POST', body: { ...body, ...changes } })).statusCode,
      400,
    );
  const pending = await request({ method: 'POST', body });
  assert.equal(pending.body.user, null);
  assert.match(pending.body.message, /confirmation email/);
  const active = await request({
    method: 'POST',
    body,
    auth: {
      signUp: async () => ({ data: { user: account, session: { access_token: 'PRIVATE_TOKEN' } } }),
    },
  });
  assert.deepEqual(active.body.user, { id, name: 'Care owner' });
  assert.doesNotMatch(JSON.stringify(active), /PRIVATE_TOKEN/);
  assert.equal(
    (await request({ method: 'POST', body: { ...body, action: 'sign-in' } })).statusCode,
    200,
  );
  for (const action of ['sign-in', 'sign-up'])
    for (const status of [400, 429]) {
      const method = action === 'sign-in' ? 'signInWithPassword' : 'signUp';
      assert.equal(
        (
          await request({
            method: 'POST',
            body: { ...body, action },
            auth: { [method]: async () => ({ error: { status } }) },
          })
        ).statusCode,
        status === 429 ? 429 : action === 'sign-in' ? 401 : 400,
      );
    }
});
test('confirmation and recovery callbacks have fixed local redirects', async () => {
  assert.equal((await request({ url: '/api/care?code=valid' })).headers.location, '/');
  assert.equal(
    (await request({ url: '/api/care?code=valid&flow=recovery&next=https://evil.example' })).headers
      .location,
    '/?recovery=1',
  );
  assert.equal(
    (
      await request({
        url: '/api/care?code=invalid',
        auth: { exchangeCodeForSession: async () => ({ error: { status: 400 } }) },
      })
    ).headers.location,
    '/?confirmation=failed',
  );
  assert.equal((await request({ url: '/api/care?code=' + 'x'.repeat(2049) })).statusCode, 400);
  assert.equal((await request({ headers: { 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
});
test('recovery provider failures, sign-out and password updates have safe errors', async () => {
  for (const status of [429, 503])
    assert.equal(
      (
        await request({
          method: 'POST',
          body: { action: 'recover', email: 'care@example.invalid' },
          auth: { resetPasswordForEmail: async () => ({ error: { status } }) },
        })
      ).statusCode,
      status,
    );
  assert.equal((await request({ method: 'POST', body: { action: 'sign-out' } })).statusCode, 200);
  assert.equal(
    (
      await request({
        method: 'POST',
        body: { action: 'sign-out' },
        auth: { signOut: async () => ({ error: { status: 500 } }) },
      })
    ).statusCode,
    500,
  );
  assert.equal(
    (
      await request({
        method: 'POST',
        body: { action: 'update-password', password: 'long imaginary password' },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request({
        method: 'POST',
        body: { action: 'update-password', password: 'long imaginary password' },
        auth: { updateUser: async () => ({ error: { status: 400 } }) },
      })
    ).statusCode,
    400,
  );
});
test('unhandled provider failures and domain errors stay inside the response boundary', async () => {
  const r = await request({
    auth: {
      getUser: async () => {
        throw Error('PRIVATE_PROVIDER_DETAIL');
      },
    },
  });
  assert.equal(r.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_PROVIDER_DETAIL/);
  const invalid = await request({
    method: 'POST',
    body: { action: 'question', circle: id, requestId: id, body: 'Question' },
    rpcData: { error: 'Invitation invalid or expired.' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal((await request({ url: `/api/care?circle=${id}&view=unknown` })).statusCode, 400);
  assert.equal((await request({ url: `/api/care?circle=${id}&revision=9` })).statusCode, 200);
});
