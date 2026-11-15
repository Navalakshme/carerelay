import { html, esc, field, footer } from './components.mjs';
export function createPlanDialog({ getState, openModal, helperOptions, tz }) {
  function openPlan(id) {
    const { data } = getState();
    const previous = data.plans.find((p) => p.id === id);
    openModal(
      previous ? 'Propose a prescription change' : 'Propose an existing prescription plan',
      html`<p>
          Copy the existing clinician prescription. The elder must review before any occurrence is
          scheduled. Daily repetition preserves the circle's local time.
        </p>
        <form data-form="propose">
          <input
            type="hidden"
            name="replaces"
            value="${previous?.id || ''}"
          />${field('label', 'Prescription / medication label', `required maxlength="100" value="${esc(previous?.label || '')}"`)}${field('instructions', 'Existing prescription instructions', `maxlength="400" value="${esc(previous?.instructions || '')}"`)}${field('scheduled', 'First date and time on your device', 'type="datetime-local" required')}${field('days', 'Number of daily occurrences', 'type="number" required min="1" max="30" value="1"')}
          <p class="tiny">
            Device timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Circle
            timezone: ${esc(tz())}. Maximum 30 daily occurrences per approval.
          </p>
          <label for="assigned">Primary helper</label
          ><select id="assigned" name="assigned">
            ${helperOptions(previous?.assigned_to)}</select
          ><label for="backup">Backup after 15 minutes without acknowledgement</label
          ><select id="backup" name="backup">
            ${helperOptions(previous?.backup_to)}</select
          >${footer('Send for elder review')}
        </form>`,
    );
  }
  return openPlan;
}
