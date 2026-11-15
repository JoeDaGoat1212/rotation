// Shared interface pieces: sheets (dialogs, drawers), confirm/prompt dialogs and toasts.
import { h, append, clear } from './util.js';
import { icon } from './icons.js';

const stack = [];

function topSheet() {
  return stack[stack.length - 1] || null;
}

/**
 * Opens a sheet.
 * variant: 'sheet' (bottom sheet on phones, centred on desktop) | 'wide' | 'drawer' | 'dialog'
 */
export function openSheet({ title = '', body = null, foot = null, variant = 'sheet', onClose = null, canClose = null, dismissable = true, className = '' } = {}) {
  const previouslyFocused = document.activeElement;
  const titleEl = h('h2', { class: 'sheet-title' }, title);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', html: icon('close', 20) });
  const bodyEl = h('div', { class: 'sheet-body' });
  const footEl = h('div', { class: 'sheet-foot' });
  const panel = h(
    'div',
    { class: 'sheet-panel', tabindex: '-1' },
    h('header', { class: 'sheet-head' }, titleEl, dismissable ? closeBtn : null),
    bodyEl,
    footEl
  );
  const scrim = h('div', { class: 'sheet-scrim' });
  const layer = h(
    'div',
    { class: `sheet-layer sheet-layer--${variant} ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    scrim,
    panel
  );

  let closed = false;
  const api = {
    el: layer,
    variant,
    panel,
    body: bodyEl,
    foot: footEl,
    get closed() {
      return closed;
    },
    setTitle(t) {
      titleEl.textContent = t;
      layer.setAttribute('aria-label', t || 'Dialog');
    },
    setBody(...kids) {
      clear(bodyEl);
      append(bodyEl, kids);
    },
    setFoot(...kids) {
      clear(footEl);
      append(footEl, kids);
      footEl.hidden = !footEl.childNodes.length;
    },
    close(reason) {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      layer.classList.add('is-closing');
      const done = () => {
        layer.remove();
        syncLock();
      };
      setTimeout(done, 190);
      if (onClose) {
        try {
          onClose(reason);
        } catch (err) {
          console.error(err);
        }
      }
      if (previouslyFocused && previouslyFocused.focus && document.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    },
  };

  // Asks the sheet to close the way a user would (close button, backdrop, Escape).
  let asking = false;
  api.requestClose = async () => {
    if (closed || asking) return;
    if (canClose) {
      asking = true;
      let ok = false;
      try {
        ok = await canClose();
      } catch (err) {
        console.error(err);
        ok = true;
      }
      asking = false;
      if (!ok) return;
    }
    api.close('dismiss');
  };

  api.setBody(body);
  api.setFoot(foot);
  if (dismissable) {
    closeBtn.addEventListener('click', () => api.requestClose());
    scrim.addEventListener('click', () => api.requestClose());
  }
  api.dismissable = dismissable;

  document.body.append(layer);
  stack.push(api);
  syncLock();
  requestAnimationFrame(() => {
    layer.classList.add('is-open');
    const auto = panel.querySelector('[data-autofocus]');
    try {
      (auto || panel).focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  });
  return api;
}

function syncLock() {
  document.documentElement.classList.toggle('has-sheet', stack.length > 0);
  document.documentElement.classList.toggle('has-drawer', stack.some((s) => s.variant === 'drawer'));
}

export function closeAllSheets() {
  for (const s of [...stack].reverse()) s.close('route');
}

export const sheetCount = () => stack.length;

document.addEventListener('keydown', (e) => {
  const top = topSheet();
  if (!top) return;
  if (e.key === 'Escape' && top.dismissable) {
    e.preventDefault();
    top.requestClose();
    return;
  }
  if (e.key === 'Tab') {
    const focusables = [...top.panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
    if (!focusables.length) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (!top.panel.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && (active === first || active === top.panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

/* ---------- buttons ---------- */

export function button(label, { kind = 'quiet', iconName = null, onClick = null, type = 'button', attrs = {} } = {}) {
  const btn = h('button', { class: `btn btn--${kind}`, type, ...attrs });
  if (iconName) btn.append(h('span', { class: 'ico', html: icon(iconName, 18) }));
  btn.append(h('span', { class: 'btn-label' }, label));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/* ---------- confirm / prompt ---------- */

export function confirmDialog({ title, message = '', confirm = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const ok = button(confirm, { kind: danger ? 'danger' : 'primary', attrs: { 'data-autofocus': true } });
    const no = button(cancel, { kind: 'quiet' });
    const sheet = openSheet({
      title,
      variant: 'dialog',
      body: message ? h('p', { class: 'dialog-text' }, message) : null,
      foot: [no, ok],
      onClose: () => resolve(answer),
    });
    ok.addEventListener('click', () => {
      answer = true;
      sheet.close();
    });
    no.addEventListener('click', () => sheet.close());
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirm = 'Save', maxLength = 60, suggestions = [] }) {
  return new Promise((resolve) => {
    let answer = null;
    const input = h('input', {
      class: 'field-input',
      type: 'text',
      value,
      placeholder,
      maxlength: String(maxLength),
      autocomplete: 'off',
      'data-autofocus': true,
      id: 'prompt-input',
    });
    const ok = button(confirm, { kind: 'primary', type: 'submit' });
    const no = button('Cancel', { kind: 'quiet' });
    const chips = suggestions.length
      ? h(
          'div',
          { class: 'chip-row chip-row--wrap' },
          suggestions.map((s) =>
            h(
              'button',
              {
                class: 'chip',
                type: 'button',
                onclick: () => {
                  input.value = s;
                  sync();
                  input.focus();
                },
              },
              s
            )
          )
        )
      : null;
    const form = h('form', { class: 'dialog-form' }, h('label', { class: 'field-label', for: 'prompt-input' }, label), input, chips);
    const sync = () => {
      ok.disabled = !input.value.trim();
    };
    input.addEventListener('input', sync);
    sync();
    const sheet = openSheet({ title, variant: 'dialog', body: form, foot: [no, ok], onClose: () => resolve(answer) });
    const submit = (e) => {
      if (e) e.preventDefault();
      const v = input.value.trim();
      if (!v) return;
      answer = v;
      sheet.close();
    };
    form.addEventListener('submit', submit);
    ok.addEventListener('click', submit);
    no.addEventListener('click', () => sheet.close());
    requestAnimationFrame(() => {
      try {
        input.select();
      } catch {
        /* ignore */
      }
    });
  });
}

/* ---------- toasts ---------- */

let toastHost = null;

export function toast(message, { action = null, tone = 'ok', duration = 3600 } = {}) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const el = h('div', { class: `toast toast--${tone}` }, h('span', { class: 'toast-text' }, message));
  let timer;
  const remove = () => {
    clearTimeout(timer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    el.append(
      h(
        'button',
        {
          class: 'toast-action',
          type: 'button',
          onclick: () => {
            remove();
            action.run();
          },
        },
        action.label
      )
    );
  }
  // One message at a time: a new toast replaces the one before it.
  while (toastHost.firstChild) toastHost.firstChild.remove();
  toastHost.append(el);
  timer = setTimeout(remove, action ? Math.max(duration, 5200) : duration);
  return { remove };
}

export function toastError(err, fallback = 'Something went wrong.') {
  if (!err || !err.expected) console.error(err);
  const quota = err && (err.name === 'QuotaExceededError' || /quota|space/i.test(String(err.message || '')));
  toast(quota ? 'This device is out of storage space for Rotation. Remove some items or free up space.' : (err && err.message) || fallback, {
    tone: 'error',
    duration: 6000,
  });
}
