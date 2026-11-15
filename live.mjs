import { art } from './artwork.mjs';
import { latestRequest, selectionStore } from './lib/sync.mjs';
import { briefText as snapshotText } from './lib/brief.mjs';
const reads = latestRequest(),
  accountReads = latestRequest(),
  preferences = selectionStore(sessionStorage);
let modalOpener = null,
  olderEvents = [],
  historyEnd = false;
const localInput = (v = Date.now()) => {
  const date = new Date(v);
  return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const app = document.querySelector('#app'),
  modal = document.querySelector('#modal');
let user = null,
  circles = [],
  selected = null,
  data = null,
  page = 'overview',
  authMode = 'sign-in',
  busy = false,
  connected = true,
  lastSynced = null,
  timer,
  onboarding = 'create';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const member = () => data?.members.find((m) => m.user_id === user?.id && m.active);
const elder = () => member()?.role === 'elder';
const writer = () => connected && ['elder', 'caregiver'].includes(member()?.role);
const name = (id) => data?.members.find((m) => m.user_id === id)?.display_name || 'Circle member';
const tz = () => data?.circle.timezone || 'Asia/Kolkata';
const fmt = (v, options = {}) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: tz(), ...options }).format(new Date(v));
const day = (v) => fmt(v, { year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () =>
  data.doses.filter((d) => !d.cancelled_at && day(d.scheduled_at) === day(Date.now()));
const nav = [
  ['overview', 'Overview'],
  ['medications', 'Medication plan'],
  ['circle', 'Care circle'],
  ['history', 'Care history'],
  ['brief', 'Visit brief'],
];
const btn = (action, label, attrs = '', cls = 'small') =>
  `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const field = (id, label, attrs = '') =>
  `<label for="${id}">${label}</label><input id="${id}" name="${id}" ${attrs}>`;
const empty = (s) => `<div class="empty">${s}</div>`;
const footer = (label) =>
  `<div class="modal-footer">${btn('close', 'Cancel', '', 'quiet')}<button class="primary" type="submit">${label}</button></div>`;
function notice(s) {
  document.querySelector('#notice').textContent = s;
  clearTimeout(timer);
  timer = setTimeout(() => (document.querySelector('#notice').textContent = ''), 9000);
}
function setBusy(value) {
  busy = value;
  app.inert = value;
  app.setAttribute('aria-busy', String(value));
  if (!value && document.activeElement === document.body && !modal.open)
    document.querySelector('#main')?.focus({ preventScroll: true });
}
function showError(e) {
  const node = document.querySelector(modal.open ? '#modal-error' : '#page-error');
  if (node) node.textContent = e.message;
  else notice(e.message);
}
async function api(body, circle, options = {}) {
  const r = await fetch(
    '/api/care' + (circle ? '?circle=' + encodeURIComponent(circle) + (options.query || '') : ''),
    {
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  let value;
  try {
    value = await r.json();
  } catch {
    throw Error('The service did not respond. Try again.');
  }
  if (!r.ok) {
    const e = Error(value.error || 'Unable to complete that action.');
    e.status = r.status;
    if (r.status === 401) {
      reads.cancel();
      accountReads.cancel();
      data = null;
      if (r.status === 401) user = null;
      if (modal.open) modal.close();
      render();
    }
    throw e;
  }
  return value;
}
async function bootstrap() {
  const request = accountReads.begin(),
    r = await api(null, null, { signal: request.signal });
  if (!request.current()) return;
  user = r.user;
  circles = r.circles;
  if (!user) {
    reads.cancel();
    data = null;
    selected = null;
    render();
    return;
  }
  if (!circles.some((c) => c.id === selected))
    selected =
      circles.find((c) => c.id === preferences.read(user.id))?.id || circles[0]?.id || null;
  if (selected) {
    preferences.write(user.id, selected);
    await refresh();
  } else {
    data = null;
    render();
  }
}
const syncLabel = () =>
  connected
    ? 'Saved online' +
      (lastSynced ? ' - checked ' + fmt(lastSynced, { hour: '2-digit', minute: '2-digit' }) : '')
    : 'Connection lost - these records may be out of date';
async function refresh(quiet = false) {
  if (!selected || !user) return;
  const circle = selected,
    account = user.id,
    request = reads.begin();
  try {
    const r = await api(null, circle, {
      signal: request.signal,
      query: quiet && data ? '&revision=' + data.circle.revision : '',
    });
    if (!request.current() || circle !== selected || account !== user?.id) return;
    connected = true;
    lastSynced = Date.now();
    if (!r.state.unchanged) {
      data = r.state;
      olderEvents = [];
      historyEnd = false;
      render();
    } else {
      const n = document.querySelector('#sync-indicator');
      if (n) n.textContent = syncLabel();
    }
  } catch (e) {
    if (!request.current() || circle !== selected || account !== user?.id) return;
    connected = false;
    if (e.status === 403) {
      selected = null;
      data = null;
      await bootstrap();
      return;
    }
    if (!quiet || data) render();
    throw e;
  }
}
function openModal(title, content) {
  modalOpener = document.activeElement;
  modal.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2>${btn('close', '&times;', 'aria-label="Close dialog"', 'quiet')}</div><p id="modal-error" class="form-error" role="alert"></p>${content}`;
  modal.showModal();
}
function authScreen() {
  app.innerHTML = `<div class="auth-layout"><section class="auth-story"><div class="brand">Care<b>Relay</b></div><div><div class="eyebrow">A little care, shared</div><h2>Care feels lighter<br>when you carry it together.</h2><p>One private circle. A clear record.<br>A little more peace of mind.</p>${art()}</div><a href="/demo.html">Explore the fictional demo &rarr;</a></section><main class="auth-main" id="main"><div class="auth-box"><span class="pill">Your circle starts here</span><h1>${authMode === 'recovery' ? 'Set a new password' : authMode === 'recover' ? 'Reset your password' : authMode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h1><p class="subtitle">${authMode === 'sign-up' ? 'Create or join a private care circle.' : 'Sign in to see your shared care records.'}</p><p id="page-error" class="form-error" role="alert"></p><form data-form="auth">${authMode === 'sign-up' ? field('name', 'Your display name', 'required maxlength="80" autocomplete="name"') : ''}${authMode !== 'recovery' ? field('email', 'Email address', 'type="email" required maxlength="254" autocomplete="email"') : ''}${authMode !== 'recover' ? field('password', 'Password', `type="password" required ${authMode === 'sign-up' ? 'minlength="12"' : ''} maxlength="128" autocomplete="${['sign-up', 'recovery'].includes(authMode) ? 'new-password' : 'current-password'}"`) : ''}${authMode === 'sign-up' ? '<p class="tiny">Use at least 12 characters. Confirm your email before signing in.</p>' : ''}<button class="primary full auth-submit" type="submit">${authMode === 'recovery' ? 'Save new password' : authMode === 'recover' ? 'Send recovery link' : authMode === 'sign-up' ? 'Create account' : 'Sign in'}</button></form>${btn('recover', 'Forgot password?', '', 'small quiet')}<p class="auth-switch">${authMode === 'sign-up' ? 'Already have an account?' : 'New to CareRelay?'} ${btn('auth-mode', authMode === 'sign-up' ? 'Sign in' : 'Create account', '', 'small quiet')}</p><p class="tiny">Email confirmation stays enabled. Invitation codes work only after sign-in.</p><div class="note">Private circles, shared reports and elder-approved plans. Reminders appear in your in-app inbox; external email and emergency monitoring are not connected.</div></div></main></div>`;
}
function onboardingScreen() {
  return `<div class="onboarding"><div class="page-title"><div><div class="eyebrow">Welcome, ${esc(user.name)}</div><h1>A circle of your own</h1><p class="subtitle">Create your circle as its elder owner, or join with an invitation.</p></div>${btn('sign-out', 'Sign out')}</div><section class="card"><div class="actions">${btn('onboard-create', 'Create my care circle', '', onboarding === 'create' ? 'primary' : '')}${btn('onboard-join', 'Join a circle', '', onboarding === 'join' ? 'primary' : '')}</div><p id="page-error" class="form-error" role="alert"></p>${onboarding === 'create' ? `<form data-form="create-circle">${field('circleName', 'Circle name', 'required maxlength="80" placeholder="My care circle"')}${field('displayName', 'Your name as elder / circle owner', `required maxlength="80" value="${esc(user.name)}"`)}<label for="timezone">Care schedule timezone</label><select name="timezone" id="timezone"><option value="Asia/Kolkata">India - Asia/Kolkata</option><option value="UTC">UTC</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select><p class="tiny">You control membership and approvals. This circle starts empty, without example medication data.</p><button type="submit" class="primary">Create private circle</button></form>` : `<form data-form="join">${field('displayName', 'Your display name', `required maxlength="80" value="${esc(user.name)}"`)}${field('token', 'Invitation code', 'required minlength="64" maxlength="64" autocomplete="off" spellcheck="false"')}<p class="tiny">Ask the elder owner for a code privately. Each code expires in 24 hours and works once.</p><button type="submit" class="primary">Join circle</button></form>`}</section>${circles.length ? btn('back-circle', 'Back to my circle', '', 'quiet') : ''}</div>`;
}
function doseCard(d) {
  const terminal = !!d.cancelled_at || ['taken', 'skipped'].includes(d.status),
    overdue = !terminal && Date.parse(d.scheduled_at) < Date.now();
  const status = {
    pending: overdue ? 'Needs a check-in' : 'Scheduled',
    uncertain: "I'm unsure",
    taken: 'Reported taken',
    skipped: 'Reported skipped',
  }[d.status];
  const latest = d.latest_report_id;
  return `<article class="dose"><div class="time">${fmt(d.scheduled_at, { hour: '2-digit', minute: '2-digit', hour12: false })}<div class="tiny">${fmt(d.scheduled_at, { day: 'numeric', month: 'short' })}</div></div><div class="dose-body"><div class="dose-top"><h3>${esc(d.label)}</h3><span class="badge ${overdue ? 'attention' : esc(d.status)}">${d.cancelled_at ? 'Cancelled by approved plan change' : status}</span></div><p>${esc(d.instructions || 'Follow the existing prescription.')}</p>${d.status === 'uncertain' ? '<div class="note">The outcome is uncertain. Check with the helper or clinician. CareRelay does not suggest another dose.</div>' : ''}${d.owner_id ? `<p class="tiny">Check-in owned by ${esc(name(d.owner_id))}</p>` : d.assigned_to ? `<p class="tiny">Assigned to ${esc(name(d.assigned_to))}</p>` : ''}<div class="actions">${!terminal && writer() ? `${btn('report', 'Report taken', `data-dose="${d.id}" data-outcome="taken" aria-label="Report taken: ${esc(d.label)} at ${fmt(d.scheduled_at, { hour: '2-digit', minute: '2-digit' })}"`, 'small soft')}${btn('report', "I'm unsure", `data-dose="${d.id}" data-outcome="uncertain" aria-label="Report unsure: ${esc(d.label)}" ${d.status === 'uncertain' ? 'disabled' : ''}`)}${btn('report', 'Report skipped', `data-dose="${d.id}" data-outcome="skipped" aria-label="Report skipped: ${esc(d.label)}"`, 'small quiet')}` : ''}${!terminal && !d.owner_id && member()?.role === 'caregiver' && (!d.assigned_to || d.assigned_to === user.id) ? btn('claim', 'Take check-in ownership', `data-dose="${d.id}" ${!connected ? 'disabled' : ''}`) : ''}</div>${latest && writer() && !d.cancelled_at ? btn('correct', 'Correct recorded outcome', `data-dose="${d.id}" data-previous="${latest}" aria-label="Correct outcome: ${esc(d.label)}"`) : ''}${terminal ? '<div class="tiny">Recorded in care history. A report is not proof of ingestion.</div>' : ''}</div></article>`;
}
function historyMarkup(limit = 200) {
  return (
    [...data.events, ...olderEvents]
      .slice(0, limit)
      .map(
        (e) =>
          `<article class="event" id="event-${e.id}"><div>${esc(e.detail)}</div><div class="tiny">${esc(name(e.actor_id))} - ${fmt(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${e.occurred_at ? ' - Reported time ' + fmt(e.occurred_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${e.corrects ? ' - Corrects #' + esc(e.corrects) : ''} - Record #${esc(e.id)}</div></article>`,
      )
      .join('') || empty('Your shared care history will appear here.')
  );
}
function overview() {
  const doses = today(),
    complete = doses.filter((d) => ['taken', 'skipped'].includes(d.status)).length;
  return `<div class="hero"><div><div class="eyebrow">A little care, shared</div><h2>Hello, ${esc(member().display_name)}.<br>One shared day, together.</h2><p>A calm place to keep everyone on the same page.</p><span class="pill">${esc(data.circle.name)} - ${data.members.filter((m) => m.active).length} people</span></div>${art()}</div><div class="stats"><div class="stat"><div class="stat-icon">&#10010;</div><div><strong>${complete}<span> / ${doses.length}</span></strong><span>Today's outcomes recorded</span></div></div><div class="stat"><div class="stat-icon">&#9719;</div><div><strong>${doses.length - complete}</strong><span>Today's open check-ins</span></div></div><div class="stat"><div class="stat-icon">&#9825;</div><div><strong>${data.members.filter((m) => m.active).length}</strong><span>People in your circle</span></div></div></div><div class="columns"><section class="card"><div class="card-head"><h2>Today's medication plan</h2>${elder() ? btn('add-dose', 'Add scheduled dose', '', 'small primary') : ''}</div>${doses.length ? doses.map(doseCard).join('') : empty('No doses scheduled today. The elder owner can add an occurrence from an existing prescription.')}<p class="section-note">Schedule timezone: ${esc(tz())}. CareRelay records reports; it does not prescribe, diagnose, or verify ingestion.</p></section><div class="stack"><section class="card"><h2>The latest from your circle</h2><div class="spaced">${historyMarkup(4)}</div></section><section class="card relay"><h2>Clear responsibility</h2><p class="tiny">Caregivers can acknowledge an open check-in. One helper owns it at a time.</p><div class="note">Due check-ins enter the assigned helper's in-app inbox. If nobody acknowledges within 15 minutes, the designated backup receives the handoff. Inbox delivery is not proof of care.</div></section></div></div>`;
}
function medications() {
  return (
    `${plansScreen()}` +
    `<section class="card"><div class="card-head"><h2>Scheduled occurrences</h2>${elder() ? btn('add-dose', 'Add scheduled dose', '', 'small primary') : ''}</div><p class="tiny">Add each occurrence from an existing approved prescription. Daily plans and proposed changes require explicit elder approval below.</p>${data.doses.length ? data.doses.map(doseCard).join('') : empty('No scheduled doses yet.')}</section>`
  );
}
function circleScreen() {
  return `<section class="card"><div class="card-head"><h2>People around you</h2>${elder() ? btn('invite', 'Invite a person', '', 'small primary') : ''}</div><p class="subtitle">The elder controls who participates and what they can do.</p>${data.members.map((m) => `<div class="member-row"><span class="avatar">${esc(m.display_name.slice(0, 1))}</span><div class="member-info"><strong>${esc(m.display_name)}${m.user_id === user.id ? ' (you)' : ''}</strong><p>${esc(m.role)}${m.role === 'viewer' ? ' - read only' : ''}</p></div><span class="badge ${m.active ? 'taken' : 'skipped'}">${m.active ? 'In circle' : 'Removed'}</span>${elder() && m.active && m.role !== 'elder' ? btn('revoke-member', 'Remove access', `data-member="${m.user_id}"`) : ''}</div>`).join('')}${
    elder()
      ? `<h3 class="spaced">Unused invitations</h3>${
          data.invitations
            .filter((i) => !i.redeemed_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now())
            .map(
              (i) =>
                `<div class="member-row"><div class="member-info"><strong>${esc(i.role)} invitation for ${esc(i.recipient_email || 'recipient')}</strong><p>Expires ${fmt(i.expires_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div>${btn('revoke-invitation', 'Revoke code', `data-invitation="${i.id}"`)}</div>`,
            )
            .join('') || empty('No unused invitations. Codes are shown once when created.')
        }`
      : ''
  }<div class="note">Removal blocks the member's next database request. Each account signs in independently.</div></section>`;
}
function briefText() {
  return snapshotText(data);
}
function brief() {
  const approved =
    data.circle.approved_revision !== null &&
    data.circle.approved_revision === data.circle.revision;
  return `<section class="card"><div class="card-head"><h2>Your visit brief</h2><span class="badge ${approved ? 'taken' : 'attention'}">${approved ? 'Approved by elder' : 'Awaiting elder approval'}</span></div><p class="tiny">New care events invalidate approval. Downloads come from the server-stored snapshot, including its approving elder, time and revision.</p><pre>${esc(briefText())}</pre>${data.approval ? `<p>Approved by ${esc(name(data.approval.approved_by))} at ${fmt(data.approval.approved_at, { dateStyle: 'medium', timeStyle: 'short' })}.</p>` : ''}<div class="actions">${writer() ? btn('question', 'Add a question') : ''}${elder() ? btn('approve-brief', 'Approve current brief', !connected ? 'disabled' : '', 'small primary') : ''}${btn('export', 'Download approved brief', !approved || !connected ? 'disabled' : '')}</div></section>`;
}
function viewerScreen() {
  return `<section class="card"><h2>Shared daily summary</h2><p>The elder has shared daily counts and circle participants with your viewer role.</p><div class="stats"><div class="stat"><strong>${data.summary.open}</strong><span>Open check-ins today</span></div><div class="stat"><strong>${data.summary.completed}</strong><span>Outcomes recorded today</span></div></div><p>Medication details, questions and the visit brief are private to the care team.</p></section>${circleScreen()}`;
}
function inbox() {
  const notifications = data.notifications.filter((n) => !n.read_at);
  return notifications.length
    ? `<section class="card inbox"><h2>Your check-in inbox</h2>${notifications.map((n) => `<article class="event"><p>${esc(n.reason)}</p><p class="tiny">${fmt(n.created_at, { dateStyle: 'medium', timeStyle: 'short' })} - ${esc(data.doses.find((d) => d.id === n.dose_id)?.label || 'Scheduled check-in')}</p>${btn('read-notification', 'Mark as read', `data-notification="${n.id}" aria-label="Mark reminder ${esc(n.id)} as read"`)}</article>`).join('')}</section>`
    : '';
}
function helperOptions(chosen) {
  return (
    `<option value="">No designated helper</option>` +
    data.members
      .filter((m) => m.active && m.role === 'caregiver')
      .map(
        (m) =>
          `<option value="${m.user_id}" ${chosen === m.user_id ? 'selected' : ''}>${esc(m.display_name)}</option>`,
      )
      .join('')
  );
}
function openPlan(id) {
  const previous = data.plans.find((p) => p.id === id);
  openModal(
    previous ? 'Propose a prescription change' : 'Propose an existing prescription plan',
    `<p>Copy the existing clinician prescription. The elder must review before any occurrence is scheduled. Daily repetition preserves the circle's local time.</p><form data-form="propose"><input type="hidden" name="replaces" value="${previous?.id || ''}">${field('label', 'Prescription / medication label', `required maxlength="100" value="${esc(previous?.label || '')}"`)}${field('instructions', 'Existing prescription instructions', `maxlength="400" value="${esc(previous?.instructions || '')}"`)}${field('scheduled', 'First date and time on your device', 'type="datetime-local" required')}${field('days', 'Number of daily occurrences', 'type="number" required min="1" max="30" value="1"')}<p class="tiny">Device timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Circle timezone: ${esc(tz())}. Maximum 30 daily occurrences per approval.</p><label for="assigned">Primary helper</label><select id="assigned" name="assigned">${helperOptions(previous?.assigned_to)}</select><label for="backup">Backup after 15 minutes without acknowledgement</label><select id="backup" name="backup">${helperOptions(previous?.backup_to)}</select>${footer('Send for elder review')}</form>`,
  );
}
function plansScreen() {
  return `<section class="card plan-list"><div class="card-head"><h2>Prescription proposals and approvals</h2>${writer() ? btn('propose', 'Propose a plan', '', 'small primary') : ''}</div><p>Pending proposals never change the active schedule. Approved replacements cancel only future, unreported occurrences from the previous plan.</p>${
    data.plans
      .map((p) => {
        const before = data.plans.find((old) => old.id === p.replaces);
        return `<article class="event"><h3>${esc(p.label)} <span class="badge">${esc(p.status)}</span></h3>${before ? `<p>Previous: ${esc(before.label)} - ${esc(before.instructions)} - ${fmt(before.first_at, { dateStyle: 'medium', timeStyle: 'short' })}, ${before.days} days.</p>` : ''}<p>Proposed: ${esc(p.instructions)} - starts ${fmt(p.first_at, { dateStyle: 'medium', timeStyle: 'short' })}, ${p.days} daily occurrence(s).</p><p class="tiny">Proposed by ${esc(name(p.proposed_by))} at ${fmt(p.proposed_at, { dateStyle: 'medium', timeStyle: 'short' })}${p.decided_at ? ' - ' + esc(p.status) + ' by ' + esc(name(p.decided_by)) + ' at ' + fmt(p.decided_at, { dateStyle: 'medium', timeStyle: 'short' }) : ''}. Primary: ${p.assigned_to ? esc(name(p.assigned_to)) : 'none'}. Backup: ${p.backup_to ? esc(name(p.backup_to)) : 'none'}.</p><div class="actions">${elder() && p.status === 'pending' ? btn('decide-plan', 'Approve', `data-plan="${p.id}" data-approve="true" aria-label="Approve proposal ${esc(p.label)}"`) + btn('decide-plan', 'Reject', `data-plan="${p.id}" data-approve="false" aria-label="Reject proposal ${esc(p.label)}"`) : ''}${p.status === 'approved' && writer() ? btn('propose', 'Propose change', `data-plan="${p.id}"`) : ''}</div></article>`;
      })
      .join('') || empty('No proposals yet. Add a plan using an existing prescription.')
  }</section>`;
}
function render() {
  const active = document.activeElement;
  const identity = active?.id
    ? { id: active.id }
    : active?.matches('button')
      ? {
          attributes: [...active.attributes]
            .filter((a) => a.name.startsWith('data-'))
            .map((a) => [a.name, a.value]),
        }
      : null;
  const scroll = window.scrollY;
  renderContent();
  if (identity) {
    const selector = identity.id
      ? '#' + CSS.escape(identity.id)
      : identity.attributes.length
        ? 'button' + identity.attributes.map(([k, v]) => `[${k}="${CSS.escape(v)}"]`).join('')
        : null;
    const replacement = selector && document.querySelector(selector);
    if (replacement) replacement.focus({ preventScroll: true });
    else if (active !== document.body)
      document.querySelector('#main')?.focus({ preventScroll: true });
  }
  window.scrollTo(0, scroll);
}
function renderContent() {
  if (!user || authMode === 'recovery') {
    authScreen();
    return;
  }
  if (!data || !member()) {
    data = null;
    app.innerHTML = onboardingScreen();
    return;
  }
  const title = {
    overview: 'Today, together',
    medications: 'A clear plan for the day',
    circle: 'Care is better, together',
    history: 'Every update, accounted for',
    brief: 'Ready for your next conversation',
  }[page];
  app.innerHTML = `<div class="shell ${elder() ? 'elder-mode' : ''}"><aside class="sidebar"><div><div class="brand">Care<b>Relay</b></div><p class="tagline">Connected by care</p></div><nav aria-label="Main navigation">${nav
    .filter(([id]) => member().role !== 'viewer' || ['overview', 'circle'].includes(id))
    .map(
      ([id, label]) =>
        `<button class="navbtn ${page === id ? 'active' : ''}" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>${label}</button>`,
    )
    .join(
      '',
    )}</nav><div class="sidebar-foot"><strong>A circle of support.</strong>Small updates. Shared responsibility. More peace of mind.<p class="tiny">Private circle - saved records</p></div></aside><div class="workspace"><header class="topbar"><label class="sr-only" for="circle-switcher">Selected care circle</label><select id="circle-switcher">${circles.map((c) => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><div class="account"><span class="tiny">${esc(member().display_name)} - ${esc(member().role)}</span>${btn('sign-out', 'Sign out', '', 'small quiet')}</div></header><div class="demo-strip"><span id="sync-indicator" role="status">${syncLabel()}</span><span>${fmt(Date.now(), { weekday: 'long', day: 'numeric', month: 'short' })} - ${esc(tz())}</span></div><main id="main" tabindex="-1"><div class="page-title"><div><h1>${title}</h1><p class="subtitle">Your care, your choices. Everyone on the same page.</p></div>${btn('refresh', 'Refresh', '', 'small quiet')}</div><p id="page-error" class="form-error" role="alert"></p>${member().role === 'viewer' ? viewerScreen() : page === 'overview' ? inbox() + overview() : page === 'medications' ? medications() : page === 'circle' ? circleScreen() : page === 'history' ? `<section class="card"><h2>Care history</h2><p class="tiny">Events appear 50 at a time. Reported time and server receipt time are kept separately.</p>${historyMarkup(2000)}${historyEnd ? '' : btn('older-history', 'Load older events')}</section>` : brief()}</main><footer class="footer"><p>Updates checked every 30 seconds while active. In-app reminders use the server clock. No external email or emergency monitoring.</p><div class="actions footer-actions">${btn('new-circle', 'Create another circle', '', 'small quiet')}${btn('join-circle', 'Join another circle', '', 'small quiet')}<a href="/demo.html">Fictional demo</a></div></footer></div></div>`;
}
async function act(action, b) {
  switch (action) {
    case 'close':
      modal.close();
      return;
    case 'copy-invitation': {
      const input = document.querySelector('#invitation-code');
      input.select();
      try {
        await navigator.clipboard.writeText(input.value);
        notice('Invitation copied. Share it privately.');
      } catch {
        notice('Code selected. Use Copy to share it privately.');
      }
      return;
    }
    case 'recover':
      authMode = 'recover';
      authScreen();
      return;
    case 'older-history': {
      const before = [...data.events, ...olderEvents].at(-1)?.id;
      const r = await api(null, selected, {
        query: '&view=history' + (before ? '&before=' + before : ''),
      });
      olderEvents.push(...r.result);
      historyEnd = r.result.length < 50;
      render();
      return;
    }
    case 'read-notification':
      await api({
        action: 'read-notification',
        circle: selected,
        notification: b.dataset.notification,
        requestId: crypto.randomUUID(),
      });
      await refresh();
      return;
    case 'propose':
      openPlan(b.dataset.plan);
      return;
    case 'decide-plan':
      openModal(
        'Review prescription proposal',
        `<p>Approval activates the proposed occurrences. Confirm these details match the existing clinician prescription.</p><form data-form="decide-plan"><input type="hidden" name="plan" value="${b.dataset.plan}"><input type="hidden" name="approve" value="${b.dataset.approve}">${footer(b.dataset.approve === 'true' ? 'Approve plan' : 'Reject proposal')}</form>`,
      );
      return;
    case 'correct':
      openModal(
        'Correct a recorded outcome',
        `<p>The previous report remains in the ledger. Explain what changed.</p><form data-form="correct"><input type="hidden" name="dose" value="${b.dataset.dose}"><input type="hidden" name="previous" value="${b.dataset.previous}"><label for="outcome">Correct outcome</label><select id="outcome" name="outcome"><option value="uncertain">Unsure</option><option value="taken">Reported taken</option><option value="skipped">Reported skipped</option></select>${field('occurred', 'When this outcome was observed', 'type="datetime-local" required value="' + localInput() + '"')}${field('reason', 'Reason for correction', 'required minlength="5" maxlength="400"')}${footer('Save correction')}</form>`,
      );
      return;
    case 'auth-mode':
      authMode = authMode === 'sign-in' ? 'sign-up' : 'sign-in';
      authScreen();
      return;
    case 'onboard-create':
      onboarding = 'create';
      render();
      return;
    case 'onboard-join':
      onboarding = 'join';
      render();
      return;
    case 'new-circle':
      reads.cancel();
      onboarding = 'create';
      data = null;
      render();
      return;
    case 'join-circle':
      reads.cancel();
      onboarding = 'join';
      data = null;
      render();
      return;
    case 'back-circle':
      await bootstrap();
      return;
    case 'refresh':
      await bootstrap();
      notice('Latest records loaded.');
      return;
    case 'sign-out':
      reads.cancel();
      accountReads.cancel();
      await api({ action: 'sign-out' });
      user = null;
      data = null;
      circles = [];
      selected = null;
      render();
      return;
    case 'add-dose':
      openModal(
        'Add a scheduled occurrence',
        `<p>Copy details from an existing approved prescription. This adds one occurrence, not a recurring plan.</p><form data-form="add-dose">${field('label', 'Prescription / medication label', 'required maxlength="100"')}${field('instructions', 'Existing prescription instructions', 'maxlength="400"')}${field('scheduled', 'Scheduled date and time on your device', 'type="datetime-local" required')}<p class="tiny">Device timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Saved times display in ${esc(tz())}.</p><label for="assigned">Assigned helper</label><select id="assigned" name="assigned"><option value="">Any available caregiver</option>${data.members
          .filter((m) => m.active && m.role === 'caregiver')
          .map((m) => `<option value="${m.user_id}">${esc(m.display_name)}</option>`)
          .join('')}</select>${footer('Save scheduled occurrence')}</form>`,
      );
      return;
    case 'report': {
      const d = data.doses.find((d) => d.id === b.dataset.dose);
      openModal(
        'Record a dose outcome',
        `<p>${esc(d.label)} - ${fmt(d.scheduled_at, { dateStyle: 'medium', timeStyle: 'short' })}</p><div class="note">${b.dataset.outcome === 'uncertain' ? 'Uncertainty stays visible. Do not assume another dose is needed; check with the helper or clinician.' : 'This is a report, not proof of ingestion. Previous reports remain in care history.'}</div><form data-form="report"><input type="hidden" name="dose" value="${d.id}"><input type="hidden" name="outcome" value="${b.dataset.outcome}"><input type="hidden" name="requestId" value="${crypto.randomUUID()}">${field('occurred', 'When this outcome was observed', 'type="datetime-local" required value="' + localInput() + '"')}${footer('Confirm report')}</form>`,
      );
      return;
    }
    case 'claim':
      await api({
        action: 'claim',
        circle: selected,
        dose: b.dataset.dose,
        requestId: crypto.randomUUID(),
      });
      await refresh();
      notice('Check-in ownership acknowledged.');
      return;
    case 'invite':
      openModal(
        'Invite someone you trust',
        `<p>This code grants access when redeemed by a signed-in account. Share it privately with the intended person.</p><form data-form="invite">${field('email', 'Recipient sign-in email', 'type="email" required maxlength="254" autocomplete="off"')}<label for="role">Permission</label><select name="role" id="role"><option value="caregiver">Caregiver - report and acknowledge care</option><option value="viewer">Viewer - read only</option></select>${footer('Create 24-hour invitation')}</form>`,
      );
      return;
    case 'revoke-member':
      openModal(
        'Remove circle access?',
        `<p>${esc(name(b.dataset.member))} will lose access. Past reports stay in the ledger.</p><form data-form="revoke-member"><input type="hidden" name="member" value="${b.dataset.member}">${footer('Remove access')}</form>`,
      );
      return;
    case 'revoke-invitation':
      openModal(
        'Revoke this invitation?',
        `<p>This unused code will stop working.</p><form data-form="revoke-invitation"><input type="hidden" name="invitation" value="${b.dataset.invitation}">${footer('Revoke code')}</form>`,
      );
      return;
    case 'question':
      openModal(
        'A question for your visit',
        `<form data-form="question"><label for="body">Question</label><textarea id="body" name="body" required maxlength="400"></textarea>${footer('Save question')}</form>`,
      );
      return;
    case 'approve-brief':
      await api({
        action: 'approve-brief',
        circle: selected,
        revision: data.circle.revision,
        requestId: crypto.randomUUID(),
      });
      await refresh();
      notice('The elder approved the current recorded brief.');
      return;
    case 'export': {
      const r = await api(null, selected, { query: '&view=export' });
      const record = r.result;
      const text =
        `Approved by ${name(record.approved_by)} at ${record.approved_at}\nApproval ${record.id}, revision ${record.revision}\n\n` +
        snapshotText(record.snapshot);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' })),
        a = document.createElement('a');
      a.href = url;
      a.download = 'CareRelay-visit-brief.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
  }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || (busy && b.dataset.action !== 'close')) return;
  try {
    if (b.dataset.page) {
      page = b.dataset.page;
      render();
      document.querySelector('#main').focus();
    } else if (b.dataset.action) {
      const writes = [
        'claim',
        'approve-brief',
        'sign-out',
        'read-notification',
        'refresh',
        'export',
        'older-history',
      ];
      if (writes.includes(b.dataset.action)) {
        if (busy) return;
        setBusy(true);
        b.disabled = true;
        try {
          await act(b.dataset.action, b);
        } finally {
          setBusy(false);
          if (b.isConnected) b.disabled = false;
        }
      } else await act(b.dataset.action, b);
    }
  } catch (error) {
    showError(error);
  }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'circle-switcher') {
    reads.cancel();
    selected = e.target.value;
    preferences.write(user.id, selected);
    data = null;
    olderEvents = [];
    app.innerHTML = '<main class="loading" id="main">Loading private care circle...</main>';
    try {
      await refresh();
    } catch (error) {
      render();
      showError(error);
    }
  }
});
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.dataset.form) return;
  e.preventDefault();
  if (busy) return;
  setBusy(true);
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  const errorNode = document.querySelector(modal.open ? '#modal-error' : '#page-error');
  if (errorNode) errorNode.textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const formCircle = selected;
  form.dataset.requestId ||= crypto.randomUUID();
  try {
    if (form.dataset.form === 'auth') {
      const mode = authMode;
      const result = await api({
        action: mode === 'recovery' ? 'update-password' : mode,
        ...values,
      });
      form.reset();
      if (mode === 'recovery') {
        authMode = 'sign-in';
        window.history.replaceState(null, '', '/');
        await bootstrap();
        notice('Password updated.');
      } else if (result.user) await bootstrap();
      else {
        authMode = 'sign-in';
        authScreen();
        notice(result.message);
      }
    } else {
      const action = form.dataset.form,
        body = {
          action,
          ...values,
          requestId: form.dataset.requestId,
          ...(formCircle ? { circle: formCircle } : {}),
        };
      if (action === 'create-circle') body.name = values.circleName;
      if (['add-dose', 'propose'].includes(action))
        body.scheduled = new Date(values.scheduled).toISOString();
      if (['report', 'correct'].includes(action))
        body.occurred = new Date(values.occurred).toISOString();
      if (action === 'correct') body.previous = Number(values.previous);
      if (action === 'propose') body.days = Number(values.days);
      if (action === 'decide-plan') body.approve = values.approve === 'true';
      const result = await api(body);
      if (modal.open) modal.close();
      if (action === 'create-circle') selected = result.result;
      if (action === 'join') selected = result.result.circle_id;
      await bootstrap();
      if (action === 'invite')
        openModal(
          'Your single-use invitation',
          `<p>Share this code privately. It expires in 24 hours and is shown only now.</p><label for="invitation-code">Invitation code</label><textarea id="invitation-code" readonly spellcheck="false">${esc(result.result.token)}</textarea><p class="tiny">The recipient signs in to CareRelay and chooses Join a circle. Revoke unused codes from Care circle.</p>${btn('copy-invitation', 'Copy invitation code', '', 'primary full')}${btn('close', 'Done', '', 'quiet full')}`,
        );
      else notice('Saved to your private care circle.');
    }
  } catch (error) {
    if (error.status === 409 && selected) {
      try {
        await refresh();
      } catch {}
    }
    showError(error);
  } finally {
    setBusy(false);
    if (submit?.isConnected) submit.disabled = false;
  }
});
modal.addEventListener('close', () => {
  modal.innerHTML = '';
  if (modalOpener?.isConnected) modalOpener.focus();
});
setInterval(async () => {
  if (
    !user ||
    !selected ||
    !data ||
    busy ||
    modal.open ||
    page === 'history' ||
    document.visibilityState !== 'visible'
  )
    return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  try {
    await refresh(true);
  } catch {}
}, 30000);
app.innerHTML = '<main class="loading" id="main">Opening your private care workspace...</main>';
bootstrap()
  .then(() => {
    if (new URLSearchParams(location.search).get('recovery') === '1') {
      authMode = 'recovery';
      authScreen();
    }
    if (new URLSearchParams(location.search).get('confirmation') === 'failed')
      showError(
        Error(
          'Confirmation link expired or was opened in another browser. Try signing in after confirming your email.',
        ),
      );
  })
  .catch((error) => {
    user = null;
    authScreen();
    showError(error);
  });
