import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRequest, selectionStore } from '../lib/sync.mjs';

test('a late response cannot replace the newly selected circle', async () => {
  const reads = latestRequest();
  const first = reads.begin();
  const second = reads.begin();
  let rendered = 'B';
  if (second.current()) rendered = 'B';
  if (first.current()) rendered = 'A';
  assert.equal(rendered, 'B');
  assert.equal(first.signal.aborted, true);
  reads.cancel();
  assert.equal(second.current(), false);
});

test('circle preferences are scoped by account and storage failure is harmless', () => {
  const map = new Map();
  const preferences = selectionStore({
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
  });
  preferences.write('one', 'circle-A');
  assert.equal(preferences.read('one'), 'circle-A');
  assert.equal(preferences.read('two'), undefined);
  const disabled = selectionStore({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  assert.equal(disabled.read('one'), null);
  assert.doesNotThrow(() => disabled.write('one', 'circle-A'));
});
