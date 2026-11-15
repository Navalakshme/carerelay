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

test('brief labels cancelled occurrences and handles an empty source window', () => {
  const state = {
    circle: { name: 'Care circle', timezone: 'UTC', revision: 1 },
    doses: [],
    questions: [],
    events: [],
  };
  assert.match(briefText(state), /Scope:/);
  state.doses.push({
    id: 'cancelled',
    label: 'Previous plan',
    scheduled_at: '2026-11-15T08:00:00Z',
    status: 'pending',
    cancelled_at: '2026-11-15T07:00:00Z',
  });
  state.events.push({ id: 1, at: '2026-11-15T07:00:00Z', detail: 'Plan changed' });
  const result = briefText(state);
  assert.match(result, /cancelled by an approved plan change/);
  assert.doesNotMatch(result, /reported time|corrects #/);
});
