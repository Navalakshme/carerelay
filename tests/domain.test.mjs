import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  reportDose,
  claimRelay,
  advanceClock,
  proposeChange,
  decideChange,
  revokeMember,
  addQuestion,
  approveBrief,
  briefText,
} from '../domain.mjs';

test('a second helper cannot duplicate or contradict a completed occurrence', () => {
  const s = initialState();
  reportDose(s, 'elder', 'morning', 'taken');
  assert.throws(() => reportDose(s, 'daughter', 'morning', 'taken'), /already recorded/);
  assert.throws(() => reportDose(s, 'helper', 'morning', 'skipped'), /already recorded/);
  assert.equal(s.events.length, 1);
});
test('uncertainty is preserved even after a later resolved report', () => {
  const s = initialState();
  reportDose(s, 'elder', 'morning', 'uncertain');
  assert.equal(s.doses[0].status, 'uncertain');
  reportDose(s, 'daughter', 'morning', 'taken');
  assert.equal(s.events.length, 2);
  assert.match(s.events[0].detail, /uncertain/);
});
test('unacknowledged relay escalates once and only the assigned helper claims it', () => {
  const s = initialState();
  assert.throws(() => claimRelay(s, 'helper'), /currently assigned/);
  advanceClock(s, 'daughter');
  advanceClock(s, 'daughter');
  assert.equal(s.relay.assigned, 'helper');
  assert.equal(s.events.length, 1);
  assert.throws(() => claimRelay(s, 'daughter'), /currently assigned/);
  claimRelay(s, 'helper');
  assert.equal(s.relay.owner, 'helper');
  assert.throws(() => claimRelay(s, 'helper'), /already/);
});
test('acknowledged and completed tasks do not escalate', () => {
  const s = initialState();
  claimRelay(s, 'daughter');
  advanceClock(s, 'daughter');
  assert.equal(s.relay.escalated, false);
  const t = initialState();
  reportDose(t, 'elder', 'morning', 'taken');
  advanceClock(t, 'daughter');
  assert.equal(t.relay.escalated, false);
  assert.throws(() => claimRelay(t, 'daughter'), /already/);
});
test('plan changes require elder approval and affect only future occurrences', () => {
  const s = initialState();
  proposeChange(s, 'daughter', 'morning', '09:00', 'Updated fictional prescription');
  assert.equal(s.doses[0].time, '08:00');
  assert.equal(s.doses[0].nextTime, undefined);
  assert.throws(() => decideChange(s, 'daughter', 1, true), /Only Meera/);
  decideChange(s, 'elder', 1, true);
  assert.equal(s.doses[0].time, '08:00');
  assert.equal(s.doses[0].nextTime, '09:00');
  assert.throws(() => decideChange(s, 'elder', 1, false), /no longer pending/);
});
test('viewer and revoked member mutations are rejected by the demo domain', () => {
  const s = initialState();
  assert.throws(() => reportDose(s, 'viewer', 'morning', 'taken'), /viewers/);
  assert.throws(() => revokeMember(s, 'daughter', 'viewer'), /Only the elder/);
  revokeMember(s, 'elder', 'helper');
  assert.throws(() => reportDose(s, 'helper', 'morning', 'taken'), /no longer has access/);
  assert.throws(() => revokeMember(s, 'elder', 'elder'), /cannot be removed/);
});
test('revoking relay owner clears ownership and assigns available backup', () => {
  const s = initialState();
  claimRelay(s, 'daughter');
  revokeMember(s, 'elder', 'daughter');
  assert.equal(s.relay.owner, null);
  assert.equal(s.relay.assigned, 'helper');
});
test('a new care event invalidates elder approval of the brief', () => {
  const s = initialState();
  assert.throws(() => approveBrief(s, 'daughter'), /Meera/);
  approveBrief(s, 'elder');
  assert.equal(s.briefApproval, s.revision);
  addQuestion(s, 'daughter', 'What should we clarify at the review?');
  assert.equal(s.briefApproval, null);
  assert.match(briefText(s), /#1/);
  assert.match(briefText(s), /What should we clarify/);
});
test('invalid proposals and duplicate pending proposals do not change the plan', () => {
  const s = initialState();
  assert.throws(() => proposeChange(s, 'daughter', 'morning', '25:00', 'reason'), /valid time/);
  assert.throws(() => proposeChange(s, 'daughter', 'missing', '09:00', 'reason'), /existing/);
  proposeChange(s, 'daughter', 'morning', '09:00', 'reason');
  assert.throws(() => proposeChange(s, 'daughter', 'morning', '10:00', 'reason'), /pending/);
});
