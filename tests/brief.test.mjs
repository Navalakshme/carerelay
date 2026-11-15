import test from 'node:test';
import assert from 'node:assert/strict';
import { briefText } from '../lib/brief.mjs';
test('brief is deterministic, scoped, evidence-only and keeps correction references', () => {
  const state = {
    circle: { name: 'Care circle', timezone: 'UTC', revision: 9 },
    doses: [
      {
        id: 'one',
        scheduled_at: '2026-11-15T08:00:00Z',
        label: 'Existing prescription',
        status: 'uncertain',
      },
    ],
    questions: [{ id: 'q', body: 'Please review the timing' }],
    events: [
      {
        id: 10,
        at: '2026-11-15T09:00:00Z',
        occurred_at: '2026-11-15T08:30:00Z',
        corrects: 7,
        detail: 'Outcome corrected to uncertain',
      },
    ],
  };
  const text = briefText(state);
  assert.equal(text, briefText(structuredClone(state)));
  assert.match(text, /corrects #7/);
  assert.match(text, /reported time/);
  assert.match(text, /Scope:/);
  assert.doesNotMatch(text, /diagnosis|take another dose/i);
});
