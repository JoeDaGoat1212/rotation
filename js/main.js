// Boot, navigation and routing.
import { h, clear } from './util.js';
import { icon } from './icons.js';
import { init, subscribe, state } from './store.js';
import { closeAllSheets, sheetCount, toastError } from './ui.js';
import { startAdd } from './add.js';
import * as today from './views/today.js';
import * as closet from './views/closet.js';
import * as build from './views/build.js';
import * as outfits from './views/outfits.js';
import * as calendar from './views/calendar.js';
import * as settings from './views/settings.js';

const ROUTES = {
  today: { label: 'Today', icon: 'sun', view: today },
  closet: { label: 'Closet', icon: 'hanger', view: closet },
  build: { label: 'Build', icon: 'tee', view: build },
  outfits: { label: 'Outfits', icon: 'bookmark', view: outfits },
  calendar: { label: 'Calendar', icon: 'calendar', view: calendar },
  settings: { label: 'Settings', icon: 'sliders', view: settings },
};
const PRIMARY = ['today', 'closet', 'build', 'outfits', 'calendar'];

const root = document.getElementById('view');
let current = null;
let currentName = '';

function routeName() {
  const name = (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES[name] ? name : 'today';
}

function navLink(name, extraClass = '') {
  const r = ROUTES[name];
  return h(
    'a',
    { class: `nav-link ${extraClass}`.trim(), href: `#/${name}`, dataset: { route: name } },
    h('span', { class: 'ico', html: icon(r.icon, 22) }),
    h('span', { class: 'nav-label' }, r.label)
  );
}

function buildChrome() {
  const rail = document.getElementById('rail-nav');
  clear(rail);
  for (const name of PRIMARY) rail.append(navLink(name));
  const railFoot = document.getElementById('rail-foot');
  clear(railFoot);
  railFoot.append(navLink('settings'));

  const tabs = document.getElementById('tabbar');
  clear(tabs);
  for (const name of PRIMARY) tabs.append(navLink(name, 'nav-link--tab'));

  const topSettings = document.getElementById('top-settings');
  topSettings.innerHTML = icon('sliders', 22);
}

function syncNav() {
  for (const a of document.querySelectorAll('.nav-link, #top-settings')) {
    const on = (a.dataset.route || 'settings') === currentName;
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function render() {
  const name = routeName();
  if (sheetCount()) closeAllSheets();
  if (current && current.unmount) {
    try {
      current.unmount();
    } catch (err) {
      console.error(err);
    }
  }
  clear(root);
  currentName = name;
  document.title = `${ROUTES[name].label} | Rotation`;
  document.body.dataset.route = name;
  try {
    current = ROUTES[name].view.mount(root);
  } catch (err) {
    current = null;
    console.error(err);
    root.append(h('div', { class: 'empty' }, h('h2', { class: 'empty-title' }, 'This page couldn’t be shown'), h('p', { class: 'empty-text' }, 'Reload the page to try again.')));
  }
  syncNav();
  window.scrollTo(0, 0);
}

/* ---------- drag photos onto the page ---------- */
function setupDrop() {
  const overlay = document.getElementById('drop');
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) overlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = [...e.dataTransfer.files];
    if (files.length && !document.querySelector('.studio-sheet')) startAdd(files, {});
  });
}

async function boot() {
  buildChrome();
  try {
    await init();
  } catch (err) {
    console.error(err);
    document.getElementById('boot').hidden = true;
    const box = document.getElementById('boot-error');
    box.hidden = false;
    box.querySelector('[data-detail]').textContent =
      (err && err.message) || 'Storage is not available. Private browsing windows often block it. Open Rotation in a normal window.';
    return;
  }
  document.getElementById('boot').hidden = true;
  document.getElementById('app').hidden = false;

  subscribe((type, detail) => {
    if (current && current.update) {
      try {
        current.update(type, detail);
      } catch (err) {
        toastError(err);
      }
    }
  });
  window.addEventListener('hashchange', render);
  setupDrop();
  render();
  // Expose a tiny handle for debugging from the console.
  window.rotation = { state };
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
});

boot();
