// Small shared helpers: DOM building, ids, dates.

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Build a DOM element.
 * h('button', { class: 'btn', onclick: fn, 'aria-label': 'Close' }, 'Text', childEl)
 */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === true) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isDesktop = () => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;

/* ---------- dates (always local time, keyed as YYYY-MM-DD) ---------- */

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

const fmtCache = new Map();
function fmt(opts) {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('en-US', opts));
  return fmtCache.get(k);
}

export const fmtDate = {
  weekday: (d) => fmt({ weekday: 'long' }).format(d),
  weekdayShort: (d) => fmt({ weekday: 'short' }).format(d),
  monthDay: (d) => fmt({ month: 'long', day: 'numeric' }).format(d),
  short: (d) => fmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(d),
  long: (d) => fmt({ weekday: 'long', month: 'long', day: 'numeric' }).format(d),
  monthYear: (d) => fmt({ month: 'long', year: 'numeric' }).format(d),
  month: (d) => fmt({ month: 'long' }).format(d),
};

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function relativeDay(key) {
  const today = dateKey();
  if (key === today) return 'Today';
  if (key === dateKey(addDays(new Date(), 1))) return 'Tomorrow';
  if (key === dateKey(addDays(new Date(), -1))) return 'Yesterday';
  return fmtDate.short(parseKey(key));
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** An error whose message is meant for the person using the app (a bad file, an empty cutout…). */
export function userError(message) {
  const err = new Error(message);
  err.expected = true;
  return err;
}
