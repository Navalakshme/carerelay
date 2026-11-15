/** Markup tag for readable templates. Escape user values with esc before interpolation. */
export const html = (parts, ...values) =>
  parts.reduce((markup, part, index) => markup + part + (values[index] ?? ''), '');

export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export const btn = (action, label, attributes = '', className = 'small') => html`
  <button type="button" class="${className}" data-action="${action}" ${attributes}>${label}</button>
`;

export const field = (id, label, attributes = '') => html`
  <label for="${id}"> ${label} </label>
  <input id="${id}" name="${id}" ${attributes} />
`;

export const empty = (message) => html`<div class="empty">${message}</div>`;

export const footer = (label) => html`
  <div class="modal-footer">
    ${btn('close', 'Cancel', '', 'quiet')}
    <button class="primary" type="submit">${label}</button>
  </div>
`;

export function localInput(value = Date.now()) {
  const date = new Date(value);
  return new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
