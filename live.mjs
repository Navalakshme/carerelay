import { html, esc, btn, field, footer, localInput } from './ui/components.mjs';
import { createAccountViews } from './ui/account-views.mjs';
import { createCareViews } from './ui/care-views.mjs';
import { createPlanDialog } from './ui/plan-dialog.mjs';
import { shell } from './ui/shell.mjs';
import {
  setPending,
  focusMain,
  focusError,
  prepareDialog,
  focusIdentity,
  restoreFocus,
} from './ui/accessibility.mjs';
import { createApiClient } from './lib/http-client.mjs';
import { latestRequest, selectionStore } from './lib/sync.mjs';
import { briefText as snapshotText } from './lib/brief.mjs';
const reads = latestRequest(),
  accountReads = latestRequest(),
  preferences = selectionStore(sessionStorage);
let modalOpener = null,
  olderEvents = [],
  historyEnd = false;
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
const getState = () => ({
  user,
  circles,
  selected,
  data,
  page,
  authMode,
  connected,
  onboarding,
  olderEvents,
  historyEnd,
});
const viewContext = {
  getState,
  member,
  elder,
  writer,
  name,
  fmt,
  tz,
  today,
  syncLabel: () => syncLabel(),
};
const careViews = createCareViews(viewContext);
const accountViews = createAccountViews(getState);
const openPlan = createPlanDialog({
  ...viewContext,
  openModal,
  helperOptions: careViews.helperOptions,
});
function notice(s) {
  document.querySelector('#notice').textContent = s;
  clearTimeout(timer);
  timer = setTimeout(() => (document.querySelector('#notice').textContent = ''), 9000);
}
function setBusy(value) {
  busy = value;
  setPending(app, value);
  setPending(modal, value);
  if (value) notice('Please wait while your request completes.');
  if (!value && document.activeElement === document.body && !modal.open) focusMain();
}
function showError(e) {
  const node = document.querySelector(modal.open ? '#modal-error' : '#page-error');
  if (node) focusError(node, e.message);
  else notice(e.message);
}
const api = createApiClient({
  onUnauthorized() {
    reads.cancel();
    accountReads.cancel();
    data = null;
    user = null;
    if (modal.open) modal.close();
    render();
  },
});
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
  modal.innerHTML = html`<div class="modal-head">
      <h2 id="modal-title">${title}</h2>
      ${btn('close', '&times;', 'aria-label="Close dialog"', 'quiet')}
    </div>
    <p id="modal-error" class="form-error" role="alert"></p>
    ${content}`;
  modal.showModal();
  prepareDialog(modal);
}
function render() {
  const identity = focusIdentity(document.activeElement),
    scroll = window.scrollY;
  renderContent();
  if (busy) setPending(app, true);
  restoreFocus(identity);
  window.scrollTo(0, scroll);
  const heading = app.querySelector('h1');
  if (heading) document.title = heading.textContent + ' | CareRelay';
}
function renderContent() {
  if (!user || authMode === 'recovery') {
    authScreen();
    return;
  }
  if (!data || !member()) {
    data = null;
    app.innerHTML = accountViews.onboardingScreen();
    return;
  }
  app.innerHTML = shell(getState(), viewContext, careViews);
}
function authScreen() {
  app.innerHTML = accountViews.authMarkup();
}
const actions = {
  close: async () => {
    modal.close();
    return;
  },
  'copy-invitation': async () => {
    const input = document.querySelector('#invitation-code');
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      notice('Invitation copied. Share it privately.');
    } catch {
      notice('Code selected. Use Copy to share it privately.');
    }
    return;
  },
  recover: async () => {
    authMode = 'recover';
    authScreen();
    return;
  },
  'older-history': async () => {
    const before = [...data.events, ...olderEvents].at(-1)?.id;
    const r = await api(null, selected, {
      query: '&view=history' + (before ? '&before=' + before : ''),
    });
    olderEvents.push(...r.result);
    historyEnd = r.result.length < 50;
    render();
    return;
  },
  'read-notification': async (b) => {
    await api({
      action: 'read-notification',
      circle: selected,
      notification: b.dataset.notification,
      requestId: crypto.randomUUID(),
    });
    await refresh();
    return;
  },
  propose: async (b) => {
    openPlan(b.dataset.plan);
    return;
  },
  'decide-plan': async (b) => {
    openModal(
      'Review prescription proposal',
      html`<p>
          Approval activates the proposed occurrences. Confirm these details match the existing
          clinician prescription.
        </p>
        <form data-form="decide-plan">
          <input type="hidden" name="plan" value="${b.dataset.plan}" /><input
            type="hidden"
            name="approve"
            value="${b.dataset.approve}"
          />${footer(b.dataset.approve === 'true' ? 'Approve plan' : 'Reject proposal')}
        </form>`,
    );
    return;
  },
  correct: async (b) => {
    openModal(
      'Correct a recorded outcome',
      html`<p>The previous report remains in the ledger. Explain what changed.</p>
        <form data-form="correct">
          <input type="hidden" name="dose" value="${b.dataset.dose}" /><input
            type="hidden"
            name="previous"
            value="${b.dataset.previous}"
          /><label for="outcome">Correct outcome</label
          ><select id="outcome" name="outcome">
            <option value="uncertain">Unsure</option>
            <option value="taken">Reported taken</option>
            <option value="skipped">Reported skipped</option></select
          >${field('occurred', 'When this outcome was observed', 'type="datetime-local" required value="' + localInput() + '"')}${field('reason', 'Reason for correction', 'required minlength="5" maxlength="400"')}${footer('Save correction')}
        </form>`,
    );
    return;
  },
  'auth-mode': async () => {
    authMode = authMode === 'sign-in' ? 'sign-up' : 'sign-in';
    authScreen();
    return;
  },
  'onboard-create': async () => {
    onboarding = 'create';
    render();
    return;
  },
  'onboard-join': async () => {
    onboarding = 'join';
    render();
    return;
  },
  'new-circle': async () => {
    reads.cancel();
    onboarding = 'create';
    data = null;
    render();
    return;
  },
  'join-circle': async () => {
    reads.cancel();
    onboarding = 'join';
    data = null;
    render();
    return;
  },
  'back-circle': async () => {
    await bootstrap();
    return;
  },
  refresh: async () => {
    await bootstrap();
    notice('Latest records loaded.');
    return;
  },
  'sign-out': async () => {
    reads.cancel();
    accountReads.cancel();
    await api({ action: 'sign-out' });
    user = null;
    data = null;
    circles = [];
    selected = null;
    render();
    return;
  },
  'add-dose': async () => {
    openModal(
      'Add a scheduled occurrence',
      html`<p>
          Copy details from an existing approved prescription. This adds one occurrence, not a
          recurring plan.
        </p>
        <form data-form="add-dose">
          ${field('label', 'Prescription / medication label', 'required maxlength="100"')}${field('instructions', 'Existing prescription instructions', 'maxlength="400"')}${field('scheduled', 'Scheduled date and time on your device', 'type="datetime-local" required')}
          <p class="tiny">
            Device timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Saved times
            display in ${esc(tz())}.
          </p>
          <label for="assigned">Assigned helper</label
          ><select id="assigned" name="assigned">
            <option value="">Any available caregiver</option>
            ${data.members
              .filter((m) => m.active && m.role === 'caregiver')
              .map((m) => html`<option value="${m.user_id}">${esc(m.display_name)}</option>`)
              .join('')}</select
          >${footer('Save scheduled occurrence')}
        </form>`,
    );
    return;
  },
  report: async (b) => {
    const d = data.doses.find((d) => d.id === b.dataset.dose);
    openModal(
      'Record a dose outcome',
      html`<p>
          ${esc(d.label)} - ${fmt(d.scheduled_at, { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
        <div class="note">
          ${b.dataset.outcome === 'uncertain' ? 'Uncertainty stays visible. Do not assume another dose is needed; check with the helper or clinician.' : 'This is a report, not proof of ingestion. Previous reports remain in care history.'}
        </div>
        <form data-form="report">
          <input type="hidden" name="dose" value="${d.id}" /><input
            type="hidden"
            name="outcome"
            value="${b.dataset.outcome}"
          /><input
            type="hidden"
            name="requestId"
            value="${crypto.randomUUID()}"
          />${field('occurred', 'When this outcome was observed', 'type="datetime-local" required value="' + localInput() + '"')}${footer('Confirm report')}
        </form>`,
    );
    return;
  },
  claim: async (b) => {
    await api({
      action: 'claim',
      circle: selected,
      dose: b.dataset.dose,
      requestId: crypto.randomUUID(),
    });
    await refresh();
    notice('Check-in ownership acknowledged.');
    return;
  },
  invite: async () => {
    openModal(
      'Invite someone you trust',
      html`<p>
          This code grants access when redeemed by a signed-in account. Share it privately with the
          intended person.
        </p>
        <form data-form="invite">
          ${field('email', 'Recipient sign-in email', 'type="email" required maxlength="254" autocomplete="off"')}<label
            for="role"
            >Permission</label
          ><select name="role" id="role">
            <option value="caregiver">Caregiver - report and acknowledge care</option>
            <option value="viewer">Viewer - read only</option></select
          >${footer('Create 24-hour invitation')}
        </form>`,
    );
    return;
  },
  'revoke-member': async (b) => {
    openModal(
      'Remove circle access?',
      html`<p>${esc(name(b.dataset.member))} will lose access. Past reports stay in the ledger.</p>
        <form data-form="revoke-member">
          <input
            type="hidden"
            name="member"
            value="${b.dataset.member}"
          />${footer('Remove access')}
        </form>`,
    );
    return;
  },
  'revoke-invitation': async (b) => {
    openModal(
      'Revoke this invitation?',
      html`<p>This unused code will stop working.</p>
        <form data-form="revoke-invitation">
          <input
            type="hidden"
            name="invitation"
            value="${b.dataset.invitation}"
          />${footer('Revoke code')}
        </form>`,
    );
    return;
  },
  question: async () => {
    openModal(
      'A question for your visit',
      html`<form data-form="question">
        <label for="body">Question</label
        ><textarea id="body" name="body" required maxlength="400"></textarea
        >${footer('Save question')}
      </form>`,
    );
    return;
  },
  'approve-brief': async () => {
    await api({
      action: 'approve-brief',
      circle: selected,
      revision: data.circle.revision,
      requestId: crypto.randomUUID(),
    });
    await refresh();
    notice('The elder approved the current recorded brief.');
    return;
  },
  export: async () => {
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
  },
};
async function act(action, button) {
  if (!Object.hasOwn(actions, action)) throw Error('Unknown action. Refresh and try again.');
  await actions[action](button);
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled || (busy && b.dataset.action !== 'close')) return;
  try {
    if (b.dataset.page) {
      page = b.dataset.page;
      render();
      focusMain();
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
  if (e.target.id === 'circle-switcher' && !busy) {
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
  const values = Object.fromEntries(new FormData(form));
  setBusy(true);
  const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  const errorNode = document.querySelector(modal.open ? '#modal-error' : '#page-error');
  if (errorNode) errorNode.textContent = '';
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
          html`<p>Share this code privately. It expires in 24 hours and is shown only now.</p>
            <label for="invitation-code">Invitation code</label
            ><textarea id="invitation-code" readonly spellcheck="false">
${esc(result.result.token)}</textarea>
            <p class="tiny">
              The recipient signs in to CareRelay and chooses Join a circle. Revoke unused codes
              from Care circle.
            </p>
            ${btn('copy-invitation', 'Copy invitation code', '', 'primary full')}${btn('close', 'Done', '', 'quiet full')}`,
        );
      else notice('Saved to your private care circle.');
    }
  } catch (error) {
    if (error.status === 409 && selected) {
      try {
        await refresh();
      } catch {
        // Refresh already marks records as stale; retain the original actionable error.
      }
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
  else focusMain();
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
  } catch {
    // Refresh already marks records as stale; retain the original actionable error.
  }
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
