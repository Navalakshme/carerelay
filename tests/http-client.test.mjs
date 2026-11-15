import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError } from '../lib/http-client.mjs';

test('client uses same-origin cookies, no-store, JSON and encoded circle IDs', async () => {
  let received;
  const api = createApiClient({
    fetchImpl: async (...args) => {
      received = args;
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });
  assert.deepEqual(await api({ action: 'question' }, 'circle/value'), { ok: true });
  assert.equal(received[0], '/api/care?circle=circle%2Fvalue');
  assert.equal(received[1].credentials, 'same-origin');
  assert.equal(received[1].cache, 'no-store');
  assert.equal(received[1].headers['Content-Type'], 'application/json');
  await api(null, 'circle', { query: '&revision=1' });
  assert.match(received[0], /revision=1/);
  assert.equal(received[1].method, 'GET');
});
test('malformed responses and HTTP errors retain a safe, actionable message', async () => {
  const malformed = createApiClient({
    fetchImpl: async () => ({
      status: 502,
      json: async () => {
        throw Error('PRIVATE_BODY');
      },
    }),
  });
  await assert.rejects(
    () => malformed(),
    (error) =>
      error instanceof ApiError && error.status === 502 && !error.message.includes('PRIVATE_BODY'),
  );
  const failing = createApiClient({
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Records changed.' }),
    }),
  });
  await assert.rejects(() => failing(), { status: 409, message: 'Records changed.' });
});
test('only a current unauthorized response ends the session', async () => {
  let signouts = 0;
  const controller = new AbortController();
  const api = createApiClient({
    onUnauthorized: () => signouts++,
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  await assert.rejects(() => api());
  assert.equal(signouts, 1);
  controller.abort();
  await assert.rejects(() => api(null, null, { signal: controller.signal }));
  assert.equal(signouts, 1);
});
