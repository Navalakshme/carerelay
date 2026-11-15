import { html, esc, btn } from './components.mjs';
export const nav = [
  ['overview', 'Overview'],
  ['medications', 'Medication plan'],
  ['circle', 'Care circle'],
  ['history', 'Care history'],
  ['brief', 'Visit brief'],
];
export function shell({ circles, selected, page, historyEnd }, context, views) {
  const { member, elder, fmt, tz, syncLabel } = context;
  const { overview, inbox, medications, circleScreen, historyMarkup, brief, viewerScreen } = views;
  const pages = {
    overview: () => inbox() + overview(),
    medications,
    circle: circleScreen,
    brief,
    history: () =>
      html`<section class="card">
        <h2>Care history</h2>
        <p class="tiny">
          Events appear 50 at a time. Reported time and server receipt time are kept separately.
        </p>
        ${historyMarkup(2000)}${historyEnd ? '' : btn('older-history', 'Load older events')}
      </section>`,
  };
  const pageMarkup =
    member().role === 'viewer' ? viewerScreen() : (pages[page] || pages.overview)();
  const title = {
    overview: 'Today, together',
    medications: 'A clear plan for the day',
    circle: 'Care is better, together',
    history: 'Every update, accounted for',
    brief: 'Ready for your next conversation',
  }[page];
  return html`<div class="shell ${elder() ? 'elder-mode' : ''}">
    <aside class="sidebar">
      <div>
        <div class="brand">Care<b>Relay</b></div>
        <p class="tagline">Connected by care</p>
      </div>
      <nav aria-label="Main navigation">
        ${nav
          .filter(([id]) => member().role !== 'viewer' || ['overview', 'circle'].includes(id))
          .map(
            ([id, label]) =>
              html`<button
                class="navbtn ${page === id ? 'active' : ''}"
                data-page="${id}"
                ${page === id ? 'aria-current="page"' : ''}
              >
                ${label}
              </button>`,
          )
          .join('')}
      </nav>
      <div class="sidebar-foot">
        <strong>A circle of support.</strong>Small updates. Shared responsibility. More peace of
        mind.
        <p class="tiny">Private circle - saved records</p>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <label class="sr-only" for="circle-switcher">Selected care circle</label
        ><select id="circle-switcher">
          ${circles.map((c) => html`<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <div class="account">
          <span class="tiny">${esc(member().display_name)} - ${esc(member().role)}</span
          >${btn('sign-out', 'Sign out', '', 'small quiet')}
        </div>
      </header>
      <div class="demo-strip">
        <span id="sync-indicator" aria-live="off">${syncLabel()}</span
        ><span
          >${fmt(Date.now(), { weekday: 'long', day: 'numeric', month: 'short' })} -
          ${esc(tz())}</span
        >
      </div>
      <main id="main" tabindex="-1">
        <div class="page-title">
          <div>
            <h1>${title}</h1>
            <p class="subtitle">Your care, your choices. Everyone on the same page.</p>
          </div>
          ${btn('refresh', 'Refresh', '', 'small quiet')}
        </div>
        <p id="page-error" class="form-error" role="alert"></p>
        ${pageMarkup}
      </main>
      <footer class="footer">
        <p>
          Updates checked every 30 seconds while active. In-app reminders use the server clock. No
          external email or emergency monitoring.
        </p>
        <div class="actions footer-actions">
          ${btn('new-circle', 'Create another circle', '', 'small quiet')}${btn('join-circle', 'Join another circle', '', 'small quiet')}<a
            href="/demo.html"
            >Fictional demo</a
          >
        </div>
      </footer>
    </div>
  </div>`;
}
