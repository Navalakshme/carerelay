import { art } from '../artwork.mjs';
import { briefText as snapshotText } from '../lib/brief.mjs';
import { html, esc, btn, empty } from './components.mjs';

export function createCareViews(context) {
  const { getState, member, elder, writer, name, fmt, tz, today } = context;
  function doseCard(d) {
    const { user, connected } = getState();
    const terminal = !!d.cancelled_at || ['taken', 'skipped'].includes(d.status),
      overdue = !terminal && Date.parse(d.scheduled_at) < Date.now();
    const status = {
      pending: overdue ? 'Needs a check-in' : 'Scheduled',
      uncertain: "I'm unsure",
      taken: 'Reported taken',
      skipped: 'Reported skipped',
    }[d.status];
    const latest = d.latest_report_id;
    return html`<article class="dose">
      <div class="time">
        ${fmt(d.scheduled_at, { hour: '2-digit', minute: '2-digit', hour12: false })}
        <div class="tiny">${fmt(d.scheduled_at, { day: 'numeric', month: 'short' })}</div>
      </div>
      <div class="dose-body">
        <div class="dose-top">
          <h3>${esc(d.label)}</h3>
          <span class="badge ${overdue ? 'attention' : esc(d.status)}"
            >${d.cancelled_at ? 'Cancelled by approved plan change' : status}</span
          >
        </div>
        <p>${esc(d.instructions || 'Follow the existing prescription.')}</p>
        ${d.status === 'uncertain' ? '<div class="note">The outcome is uncertain. Check with the helper or clinician. CareRelay does not suggest another dose.</div>' : ''}${d.owner_id ? html`<p class="tiny">Check-in owned by ${esc(name(d.owner_id))}</p>` : d.assigned_to ? html`<p class="tiny">Assigned to ${esc(name(d.assigned_to))}</p>` : ''}
        <div class="actions">
          ${!terminal && writer() ? `${btn('report', 'Report taken', `data-dose="${d.id}" data-outcome="taken" aria-label="Report taken: ${esc(d.label)} at ${fmt(d.scheduled_at, { hour: '2-digit', minute: '2-digit' })}"`, 'small soft')}${btn('report', "I'm unsure", `data-dose="${d.id}" data-outcome="uncertain" aria-label="Report unsure: ${esc(d.label)}" ${d.status === 'uncertain' ? 'disabled' : ''}`)}${btn('report', 'Report skipped', `data-dose="${d.id}" data-outcome="skipped" aria-label="Report skipped: ${esc(d.label)}"`, 'small quiet')}` : ''}${!terminal && !d.owner_id && member()?.role === 'caregiver' && (!d.assigned_to || d.assigned_to === user.id) ? btn('claim', 'Take check-in ownership', `data-dose="${d.id}" ${!connected ? 'disabled' : ''}`) : ''}
        </div>
        ${latest && writer() && !d.cancelled_at ? btn('correct', 'Correct recorded outcome', `data-dose="${d.id}" data-previous="${latest}" aria-label="Correct outcome: ${esc(d.label)}"`) : ''}${terminal ? '<div class="tiny">Recorded in care history. A report is not proof of ingestion.</div>' : ''}
      </div>
    </article>`;
  }

  function historyMarkup(limit = 200) {
    const { data, olderEvents } = getState();
    return (
      [...data.events, ...olderEvents]
        .slice(0, limit)
        .map(
          (e) =>
            html`<article class="event" id="event-${e.id}">
              <div>${esc(e.detail)}</div>
              <div class="tiny">
                ${esc(name(e.actor_id))} -
                ${fmt(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${e.occurred_at ? ' - Reported time ' + fmt(e.occurred_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}${e.corrects ? ' - Corrects #' + esc(e.corrects) : ''}
                - Record #${esc(e.id)}
              </div>
            </article>`,
        )
        .join('') || empty('Your shared care history will appear here.')
    );
  }

  function overview() {
    const { data } = getState();
    const doses = today(),
      complete = doses.filter((d) => ['taken', 'skipped'].includes(d.status)).length;
    return html`<div class="hero">
        <div>
          <div class="eyebrow">A little care, shared</div>
          <h2>Hello, ${esc(member().display_name)}.<br />One shared day, together.</h2>
          <p>A calm place to keep everyone on the same page.</p>
          <span class="pill"
            >${esc(data.circle.name)} - ${data.members.filter((m) => m.active).length} people</span
          >
        </div>
        ${art()}
      </div>
      <div class="stats">
        <div class="stat">
          <div class="stat-icon">&#10010;</div>
          <div>
            <strong>${complete}<span> / ${doses.length}</span></strong
            ><span>Today's outcomes recorded</span>
          </div>
        </div>
        <div class="stat">
          <div class="stat-icon">&#9719;</div>
          <div><strong>${doses.length - complete}</strong><span>Today's open check-ins</span></div>
        </div>
        <div class="stat">
          <div class="stat-icon">&#9825;</div>
          <div>
            <strong>${data.members.filter((m) => m.active).length}</strong
            ><span>People in your circle</span>
          </div>
        </div>
      </div>
      <div class="columns">
        <section class="card">
          <div class="card-head">
            <h2>Today's medication plan</h2>
            ${elder() ? btn('add-dose', 'Add scheduled dose', '', 'small primary') : ''}
          </div>
          ${doses.length ? doses.map(doseCard).join('') : empty('No doses scheduled today. The elder owner can add an occurrence from an existing prescription.')}
          <p class="section-note">
            Schedule timezone: ${esc(tz())}. CareRelay records reports; it does not prescribe,
            diagnose, or verify ingestion.
          </p>
        </section>
        <div class="stack">
          <section class="card">
            <h2>The latest from your circle</h2>
            <div class="spaced">${historyMarkup(4)}</div>
          </section>
          <section class="card relay">
            <h2>Clear responsibility</h2>
            <p class="tiny">
              Caregivers can acknowledge an open check-in. One helper owns it at a time.
            </p>
            <div class="note">
              Due check-ins enter the assigned helper's in-app inbox. If nobody acknowledges within
              15 minutes, the designated backup receives the handoff. Inbox delivery is not proof of
              care.
            </div>
          </section>
        </div>
      </div>`;
  }

  function medications() {
    const { data } = getState();
    return (
      `${plansScreen()}` +
      html`<section class="card">
        <div class="card-head">
          <h2>Scheduled occurrences</h2>
          ${elder() ? btn('add-dose', 'Add scheduled dose', '', 'small primary') : ''}
        </div>
        <p class="tiny">
          Add each occurrence from an existing approved prescription. Daily plans and proposed
          changes require explicit elder approval below.
        </p>
        ${data.doses.length ? data.doses.map(doseCard).join('') : empty('No scheduled doses yet.')}
      </section>`
    );
  }

  function circleScreen() {
    const { data, user } = getState();
    return html`<section class="card">
      <div class="card-head">
        <h2>People around you</h2>
        ${elder() ? btn('invite', 'Invite a person', '', 'small primary') : ''}
      </div>
      <p class="subtitle">The elder controls who participates and what they can do.</p>
      ${data.members
        .map(
          (m) =>
            html`<div class="member-row">
              <span class="avatar">${esc(m.display_name.slice(0, 1))}</span>
              <div class="member-info">
                <strong>${esc(m.display_name)}${m.user_id === user.id ? ' (you)' : ''}</strong>
                <p>${esc(m.role)}${m.role === 'viewer' ? ' - read only' : ''}</p>
              </div>
              <span class="badge ${m.active ? 'taken' : 'skipped'}"
                >${m.active ? 'In circle' : 'Removed'}</span
              >${elder() && m.active && m.role !== 'elder' ? btn('revoke-member', 'Remove access', `data-member="${m.user_id}"`) : ''}
            </div>`,
        )
        .join('')}${
        elder()
          ? html`<h3 class="spaced">Unused invitations</h3>
              ${
                data.invitations
                  .filter(
                    (i) => !i.redeemed_at && !i.revoked_at && Date.parse(i.expires_at) > Date.now(),
                  )
                  .map(
                    (i) =>
                      html`<div class="member-row">
                        <div class="member-info">
                          <strong
                            >${esc(i.role)} invitation for
                            ${esc(i.recipient_email || 'recipient')}</strong
                          >
                          <p>
                            Expires
                            ${fmt(i.expires_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        ${btn('revoke-invitation', 'Revoke code', `data-invitation="${i.id}"`)}
                      </div>`,
                  )
                  .join('') || empty('No unused invitations. Codes are shown once when created.')
              }`
          : ''
      }
      <div class="note">
        Removal blocks the member's next database request. Each account signs in independently.
      </div>
    </section>`;
  }

  function briefText() {
    const { data } = getState();
    return snapshotText(data);
  }

  function brief() {
    const { data, connected } = getState();
    const approved =
      data.circle.approved_revision !== null &&
      data.circle.approved_revision === data.circle.revision;
    return html`<section class="card">
      <div class="card-head">
        <h2>Your visit brief</h2>
        <span class="badge ${approved ? 'taken' : 'attention'}"
          >${approved ? 'Approved by elder' : 'Awaiting elder approval'}</span
        >
      </div>
      <p class="tiny">
        New care events invalidate approval. Downloads come from the server-stored snapshot,
        including its approving elder, time and revision.
      </p>
      <pre>${esc(briefText())}</pre>
      ${data.approval ? html`<p>Approved by ${esc(name(data.approval.approved_by))} at ${fmt(data.approval.approved_at, { dateStyle: 'medium', timeStyle: 'short' })}.</p>` : ''}
      <div class="actions">
        ${writer() ? btn('question', 'Add a question') : ''}${elder() ? btn('approve-brief', 'Approve current brief', !connected ? 'disabled' : '', 'small primary') : ''}${btn('export', 'Download approved brief', !approved || !connected ? 'disabled' : '')}
      </div>
    </section>`;
  }

  function viewerScreen() {
    const { data } = getState();
    return html`<section class="card">
        <h2>Shared daily summary</h2>
        <p>The elder has shared daily counts and circle participants with your viewer role.</p>
        <div class="stats">
          <div class="stat">
            <strong>${data.summary.open}</strong><span>Open check-ins today</span>
          </div>
          <div class="stat">
            <strong>${data.summary.completed}</strong><span>Outcomes recorded today</span>
          </div>
        </div>
        <p>Medication details, questions and the visit brief are private to the care team.</p>
      </section>
      ${circleScreen()}`;
  }

  function inbox() {
    const { data } = getState();
    const notifications = data.notifications.filter((n) => !n.read_at);
    return notifications.length
      ? html`<section class="card inbox">
          <h2>Your check-in inbox</h2>
          ${notifications
            .map(
              (n) =>
                html`<article class="event">
                  <p>${esc(n.reason)}</p>
                  <p class="tiny">
                    ${fmt(n.created_at, { dateStyle: 'medium', timeStyle: 'short' })} -
                    ${esc(data.doses.find((d) => d.id === n.dose_id)?.label || 'Scheduled check-in')}
                  </p>
                  ${btn('read-notification', 'Mark as read', `data-notification="${n.id}" aria-label="Mark reminder ${esc(n.id)} as read"`)}
                </article>`,
            )
            .join('')}
        </section>`
      : '';
  }

  function helperOptions(chosen) {
    const { data } = getState();
    return (
      html`<option value="">No designated helper</option>` +
      data.members
        .filter((m) => m.active && m.role === 'caregiver')
        .map(
          (m) =>
            html`<option value="${m.user_id}" ${chosen === m.user_id ? 'selected' : ''}>
              ${esc(m.display_name)}
            </option>`,
        )
        .join('')
    );
  }

  function plansScreen() {
    const { data } = getState();
    return html`<section class="card plan-list">
      <div class="card-head">
        <h2>Prescription proposals and approvals</h2>
        ${writer() ? btn('propose', 'Propose a plan', '', 'small primary') : ''}
      </div>
      <p>
        Pending proposals never change the active schedule. Approved replacements cancel only
        future, unreported occurrences from the previous plan.
      </p>
      ${
        data.plans
          .map((p) => {
            const before = data.plans.find((old) => old.id === p.replaces);
            return html`<article class="event">
              <h3>${esc(p.label)} <span class="badge">${esc(p.status)}</span></h3>
              ${before ? html`<p>Previous: ${esc(before.label)} - ${esc(before.instructions)} - ${fmt(before.first_at, { dateStyle: 'medium', timeStyle: 'short' })}, ${before.days} days.</p>` : ''}
              <p>
                Proposed: ${esc(p.instructions)} - starts
                ${fmt(p.first_at, { dateStyle: 'medium', timeStyle: 'short' })}, ${p.days} daily
                occurrence(s).
              </p>
              <p class="tiny">
                Proposed by ${esc(name(p.proposed_by))} at
                ${fmt(p.proposed_at, { dateStyle: 'medium', timeStyle: 'short' })}${p.decided_at ? ' - ' + esc(p.status) + ' by ' + esc(name(p.decided_by)) + ' at ' + fmt(p.decided_at, { dateStyle: 'medium', timeStyle: 'short' }) : ''}.
                Primary: ${p.assigned_to ? esc(name(p.assigned_to)) : 'none'}. Backup:
                ${p.backup_to ? esc(name(p.backup_to)) : 'none'}.
              </p>
              <div class="actions">
                ${elder() && p.status === 'pending' ? btn('decide-plan', 'Approve', `data-plan="${p.id}" data-approve="true" aria-label="Approve proposal ${esc(p.label)}"`) + btn('decide-plan', 'Reject', `data-plan="${p.id}" data-approve="false" aria-label="Reject proposal ${esc(p.label)}"`) : ''}${p.status === 'approved' && writer() ? btn('propose', 'Propose change', `data-plan="${p.id}"`) : ''}
              </div>
            </article>`;
          })
          .join('') || empty('No proposals yet. Add a plan using an existing prescription.')
      }
    </section>`;
  }

  return {
    doseCard,
    historyMarkup,
    overview,
    medications,
    circleScreen,
    briefText,
    brief,
    viewerScreen,
    inbox,
    helperOptions,
    plansScreen,
  };
}
