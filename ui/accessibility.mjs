/** Keep reading order and form values intact while preventing duplicate actions. */
export function setPending(root, pending) {
  root.setAttribute('aria-busy', String(pending));
  for (const control of root.querySelectorAll('button, select')) {
    if (control.dataset.action === 'close') continue;
    if (pending && !control.hasAttribute('data-pending-disabled')) {
      control.dataset.pendingDisabled = String(control.disabled);
      control.disabled = true;
    } else if (!pending && control.hasAttribute('data-pending-disabled')) {
      control.disabled = control.dataset.pendingDisabled === 'true';
      delete control.dataset.pendingDisabled;
    }
  }
}

export function focusMain(root = document) {
  const heading = root.querySelector('#main h1');
  const target = heading || root.querySelector('#main');
  if (target) {
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
}

export function focusError(node, message) {
  if (!node) return false;
  node.textContent = message;
  node.setAttribute('tabindex', '-1');
  node.focus({ preventScroll: false });
  return true;
}

export function prepareDialog(dialog) {
  const firstParagraph = dialog.querySelector('p:not([role="alert"])');
  if (firstParagraph) {
    firstParagraph.id = 'modal-description';
    dialog.setAttribute('aria-describedby', 'modal-description');
  } else dialog.removeAttribute('aria-describedby');
  const firstField = dialog.querySelector('input:not([type="hidden"]),textarea,select');
  firstField?.focus();
}

/** Capture semantic identity rather than an element that a render will detach. */
export function focusIdentity(element) {
  if (!element || element === document.body) return null;
  if (element.id) return '#' + CSS.escape(element.id);
  if (!element.matches('button')) return null;
  const attributes = [...element.attributes].filter((attribute) =>
    attribute.name.startsWith('data-'),
  );
  return attributes.length
    ? 'button' + attributes.map(({ name, value }) => `[${name}="${CSS.escape(value)}"]`).join('')
    : null;
}

export function restoreFocus(identity, root = document) {
  if (!identity) return;
  const target = root.querySelector(identity);
  if (target) target.focus({ preventScroll: true });
  else focusMain(root);
}
