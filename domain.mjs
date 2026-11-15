// Pure domain rules for a fictional, single-session demonstration. No authentication.
export function initialState() {
  return {
    clock: Date.parse('2026-11-15T09:30:00+05:30'), elder: 'Meera',
    members: [
      { id: 'elder', name: 'Meera', role: 'elder', active: true },
      { id: 'daughter', name: 'Anya', role: 'caregiver', active: true },
      { id: 'helper', name: 'Ravi', role: 'caregiver', active: true },
      { id: 'viewer', name: 'Leela', role: 'viewer', active: true }
    ],
    doses: [
      { id: 'morning', label: 'Morning prescription', time: '08:00', note: 'Follow the existing prescription', status: 'pending' },
      { id: 'midday', label: 'Midday prescription', time: '13:00', note: 'Follow the existing prescription', status: 'pending' },
      { id: 'evening', label: 'Evening prescription', time: '20:00', note: 'Follow the existing prescription', status: 'pending' }
    ],
    relay: { doseId: 'morning', primary: 'daughter', backup: 'helper', assigned: 'daughter', owner: null, deadline: Date.parse('2026-11-15T10:00:00+05:30'), escalated: false },
    events: [], proposals: [], questions: [], briefApproval: null, revision: 0
  };
}
export function member(state, id) {
  const m = state.members.find(x => x.id === id && x.active);
  if (!m) throw new Error('This person no longer has access to the demo circle.');
  return m;
}
function canWrite(state, actor) {
  const m = member(state, actor);
  if (m.role === 'viewer') throw new Error('Family viewers cannot change care records.');
  return m;
}
function event(state, actor, type, detail, doseId = null) {
  state.revision++;
  state.briefApproval = null;
  state.events.push({ id: state.events.length + 1, at: state.clock, actor, type, detail, doseId });
}
export function reportDose(state, actor, doseId, outcome) {
  canWrite(state, actor);
  if (!['taken', 'skipped', 'uncertain'].includes(outcome)) throw new Error('Choose a valid report.');
  const dose = state.doses.find(d => d.id === doseId);
  if (!dose) throw new Error('Dose not found.');
  if (['taken', 'skipped'].includes(dose.status)) throw new Error('An outcome is already recorded. Duplicate or conflicting completion was blocked.');
  if (dose.status === outcome) throw new Error('This report is already recorded.');
  dose.status = outcome;
  event(state, actor, 'dose', `${dose.label}: reported ${outcome}`, doseId);
}
export function claimRelay(state, actor) {
  const m = canWrite(state, actor);
  if (m.role !== 'caregiver' || actor !== state.relay.assigned) throw new Error('Only the currently assigned helper can acknowledge this relay.');
  if (['taken','skipped'].includes(state.doses.find(d=>d.id===state.relay.doseId).status)) throw new Error('This care task already has a recorded outcome.');
  if (state.relay.owner) throw new Error('This relay already has an accountable owner.');
  state.relay.owner = actor;
  event(state, actor, 'relay', `${m.name} acknowledged ownership of the morning check-in.`);
}
export function advanceClock(state, actor) {
  canWrite(state, actor);
  state.clock += 30 * 60000;
  const r = state.relay;
  const dose = state.doses.find(d => d.id === r.doseId);
  if (!r.owner && !r.escalated && state.clock >= r.deadline && !['taken','skipped'].includes(dose.status)) {
    const backup = state.members.find(m => m.id === r.backup && m.active);
    r.escalated = true;
    r.assigned = backup ? backup.id : null;
    event(state, actor, 'relay', backup ? `Primary did not acknowledge by the deadline. ${backup.name} is now assigned as backup.` : 'Backup unavailable. Elder review required.');
  }
}
export function proposeChange(state, actor, doseId, time, reason) {
  canWrite(state, actor);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !reason.trim() || reason.length > 400) throw new Error('Enter a valid time and a reason of up to 400 characters.');
  const dose = state.doses.find(d => d.id === doseId);
  if (!dose || dose.time === time) throw new Error('Choose an existing plan item and a different time.');
  if (state.proposals.some(p=>p.doseId===doseId && p.status==='pending')) throw new Error('This plan item already has a pending change.');
  const p = { id: state.proposals.length + 1, doseId, before: dose.time, after: time, reason: reason.trim(), author: actor, status: 'pending', at: state.clock, effective: 'Next demonstration day' };
  state.proposals.push(p);
  event(state, actor, 'change', `Proposed ${dose.label}: ${p.before} → ${p.after}. Pending elder approval.`);
}
export function decideChange(state, actor, proposalId, approve) {
  if (member(state, actor).role !== 'elder') throw new Error('Only Meera can decide plan changes in this demo.');
  const p = state.proposals.find(x => x.id === proposalId && x.status === 'pending');
  if (!p) throw new Error('This change is no longer pending.');
  p.status = approve ? 'approved' : 'rejected';
  // Today's occurrences remain immutable. Approved time is for future occurrences only.
  if (approve) state.doses.find(x => x.id === p.doseId).nextTime = p.after;
  event(state, actor, 'change', `Meera ${p.status} change #${p.id}; effective ${p.effective.toLowerCase()}.`);
}
export function revokeMember(state, actor, target) {
  if (member(state, actor).role !== 'elder') throw new Error('Only the elder can manage the care circle.');
  if (target === 'elder') throw new Error('The elder cannot be removed.');
  const m = member(state, target);
  m.active = false;
  if (state.relay.owner === target) state.relay.owner = null;
  if (state.relay.assigned === target) {
    const replacement = state.members.find(x => x.id === state.relay.backup && x.id !== target && x.active);
    state.relay.assigned = replacement?.id ?? null;
  }
  event(state, actor, 'consent', `Meera removed ${m.name} from this demo circle.`);
}
export function addQuestion(state, actor, text) {
  canWrite(state, actor);
  if (!text.trim() || text.length > 400) throw new Error('Enter a question of up to 400 characters.');
  state.questions.push(text.trim());
  event(state, actor, 'question', text.trim());
}
export function approveBrief(state, actor) {
  if (member(state, actor).role !== 'elder') throw new Error('Meera must approve the brief before export.');
  state.briefApproval = state.revision;
}
export function briefText(state) {
  return ['CARERELAY · FICTIONAL DEMONSTRATION BRIEF', 'Meera · 15 November 2026 · Asia/Kolkata', 'Self-reported records; no clinical conclusions.', '', 'TODAY’S OCCURRENCES', ...state.doses.map(d=>`${d.time} — ${d.label}: ${d.status}`), '', 'PLAN CHANGES', ...state.proposals.map(p=>`#${p.id}: ${p.before} → ${p.after}; ${p.status}; ${p.effective}. Reason: ${p.reason}`), '', 'QUESTIONS', ...state.questions, '', 'EVENT SOURCES', ...state.events.map(e=>`#${e.id} | ${new Date(e.at).toISOString()} | ${state.members.find(m=>m.id===e.actor)?.name} | ${e.detail}`)].join('\n');
}
