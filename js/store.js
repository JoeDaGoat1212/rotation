// App state: closet items, saved outfits, calendar plans, settings and the outfit being built.
import * as db from './db.js';
import { uid, debounce } from './util.js';

/** Closet categories. `multi` categories can hold several pieces in one outfit. */
export const CATS = [
  { id: 'top', label: 'Tops', one: 'top', hint: 'Tees, shirts, polos, jerseys' },
  { id: 'layer', label: 'Layers', one: 'layer', hint: 'Hoodies, jackets, flannels' },
  { id: 'bottom', label: 'Bottoms', one: 'pair of bottoms', hint: 'Jeans, pants, shorts' },
  { id: 'socks', label: 'Socks', one: 'pair of socks', hint: 'Any socks' },
  { id: 'shoes', label: 'Shoes', one: 'pair of shoes', hint: 'Sneakers, boots, slides' },
  { id: 'fragrance', label: 'Cologne', one: 'cologne', hint: 'Cologne and body sprays' },
  { id: 'jewelry', label: 'Jewelry', one: 'piece of jewelry', multi: true, hint: 'Chains, rings, bracelets' },
  { id: 'accessory', label: 'Accessories', one: 'accessory', multi: true, hint: 'Hats, watches, belts, bags' },
];
export const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
export const MULTI_MAX = 4;

export const BACKDROPS = [
  { id: 'bone', label: 'Bone', color: '#E9E4D9', deep: '#D9D2C3' },
  { id: 'sand', label: 'Sand', color: '#E2D6C1', deep: '#D1C2A8' },
  { id: 'tan', label: 'Tan', color: '#D7C5A5', deep: '#C4AF8A' },
  { id: 'stone', label: 'Stone', color: '#D6D3CC', deep: '#C3BFB6' },
];

export const emptySlots = () => ({
  top: null,
  layer: null,
  bottom: null,
  socks: null,
  shoes: null,
  fragrance: null,
  jewelry: [],
  accessory: [],
});

const emptyDraft = () => ({ outfitId: null, name: '', slots: emptySlots(), planDate: null });

export const state = {
  items: [],
  outfits: [],
  plans: {}, // date key -> { date, outfitId, note }
  settings: { backdrop: 'sand', cutout: 'ai', lastCat: 'top', samplesDismissed: false },
  draft: emptyDraft(),
};

/* ---------- events ---------- */

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(type, detail) {
  for (const fn of [...listeners]) {
    try {
      fn(type, detail);
    } catch (err) {
      console.error(err);
    }
  }
}

/* ---------- loading ---------- */

export async function init() {
  const [items, outfits, plans, settings, draft] = await Promise.all([
    db.getAll('items'),
    db.getAll('outfits'),
    db.getAll('plans'),
    db.getMeta('settings'),
    db.getMeta('draft'),
  ]);
  state.items = items.sort(byNewest);
  state.outfits = outfits.map((o) => ({ ...o, slots: cleanSlots(o.slots) })).sort(byNewest);
  state.plans = {};
  const outfitIds = new Set(state.outfits.map((o) => o.id));
  for (const p of plans) if (p && p.date && outfitIds.has(p.outfitId)) state.plans[p.date] = p;
  if (settings && typeof settings === 'object') Object.assign(state.settings, settings);
  if (!BACKDROPS.some((b) => b.id === state.settings.backdrop)) state.settings.backdrop = 'sand';
  if (!CAT[state.settings.lastCat]) state.settings.lastCat = 'top';
  state.draft = emptyDraft();
  if (draft && typeof draft === 'object') {
    state.draft.slots = cleanSlots(draft.slots);
    if (draft.outfitId && outfitIds.has(draft.outfitId)) {
      state.draft.outfitId = draft.outfitId;
      state.draft.name = String(draft.name || '');
    }
  }
  applyBackdrop();
}

const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

/* ---------- lookups ---------- */

export const itemById = (id) => (id ? state.items.find((i) => i.id === id) || null : null);
export const itemsIn = (cat) => state.items.filter((i) => i.cat === cat);
export const outfitById = (id) => (id ? state.outfits.find((o) => o.id === id) || null : null);

/** Returns a copy of `slots` with missing items and wrong-category references removed. */
export function cleanSlots(slots) {
  const out = emptySlots();
  if (!slots || typeof slots !== 'object') return out;
  for (const c of CATS) {
    const v = slots[c.id];
    if (c.multi) {
      const ids = Array.isArray(v) ? v : v ? [v] : [];
      const seen = new Set();
      for (const id of ids) {
        const it = itemById(id);
        if (it && it.cat === c.id && !seen.has(id) && seen.size < MULTI_MAX) seen.add(id);
      }
      out[c.id] = [...seen];
    } else {
      const it = itemById(Array.isArray(v) ? v[0] : v);
      out[c.id] = it && it.cat === c.id ? it.id : null;
    }
  }
  return out;
}

export function slotIds(slots) {
  const ids = [];
  for (const c of CATS) {
    const v = slots[c.id];
    if (c.multi) ids.push(...(v || []));
    else if (v) ids.push(v);
  }
  return ids;
}

export const pieceCount = (slots) => slotIds(slots).length;

export function sameSlots(a, b) {
  return JSON.stringify(cleanSlots(a)) === JSON.stringify(cleanSlots(b));
}

export function outfitsUsing(itemId) {
  return state.outfits.filter((o) => slotIds(o.slots).includes(itemId));
}

/* ---------- image URLs ---------- */

const urlCache = new Map(); // item id -> { stamp, thumb, image }

export function imageURL(item, kind = 'image') {
  if (!item) return '';
  let entry = urlCache.get(item.id);
  if (!entry || entry.stamp !== item.updatedAt) {
    revoke(item.id);
    entry = { stamp: item.updatedAt };
    urlCache.set(item.id, entry);
  }
  if (!entry[kind]) {
    const blob = item[kind] || item.image;
    entry[kind] = blob ? URL.createObjectURL(blob) : '';
  }
  return entry[kind];
}

function revoke(id) {
  const entry = urlCache.get(id);
  if (!entry) return;
  // Give any <img> still on screen a moment before the URL goes away.
  const urls = [entry.thumb, entry.image].filter(Boolean);
  setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 4000);
  urlCache.delete(id);
}

/* ---------- items ---------- */

let persistAsked = false;
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch {
    /* not supported */
  }
}

export async function addItem(data) {
  const now = Date.now();
  const item = {
    id: uid(),
    name: (data.name || '').trim(),
    cat: CAT[data.cat] ? data.cat : 'top',
    brand: (data.brand || '').trim(),
    color: (data.color || '').trim(),
    notes: (data.notes || '').trim(),
    image: data.image,
    thumb: data.thumb,
    source: data.source || null,
    ar: data.ar || 1,
    sample: !!data.sample,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
  if (!item.name) item.name = defaultName(item);
  await db.put('items', item);
  state.items.unshift(item);
  state.items.sort(byNewest);
  askPersist();
  emit('items', { id: item.id });
  return item;
}

export async function addItems(list) {
  const now = Date.now();
  const items = list.map((data, i) => ({
    id: uid(),
    name: (data.name || '').trim() || defaultName(data),
    cat: CAT[data.cat] ? data.cat : 'top',
    brand: (data.brand || '').trim(),
    color: (data.color || '').trim(),
    notes: (data.notes || '').trim(),
    image: data.image,
    thumb: data.thumb,
    source: data.source || null,
    ar: data.ar || 1,
    sample: !!data.sample,
    createdAt: now - i,
    updatedAt: now,
  }));
  await db.putMany('items', items);
  state.items.push(...items);
  state.items.sort(byNewest);
  emit('items', {});
  return items;
}

export function defaultName(item) {
  const base = { top: 'Top', layer: 'Layer', bottom: 'Bottoms', socks: 'Socks', shoes: 'Shoes', fragrance: 'Cologne', jewelry: 'Jewelry', accessory: 'Accessory' }[item.cat] || 'Item';
  const color = (item.color || '').trim();
  return color ? `${color[0].toUpperCase()}${color.slice(1)} ${base.toLowerCase()}` : base;
}

export async function updateItem(id, patch) {
  const item = itemById(id);
  if (!item) return null;
  const catChanged = patch.cat && patch.cat !== item.cat;
  const next = { ...item, ...patch, updatedAt: Date.now() };
  for (const k of ['name', 'brand', 'color', 'notes']) next[k] = (next[k] || '').trim();
  if (!next.name) next.name = defaultName(next);
  await db.put('items', next);
  Object.assign(item, next);
  let detached = 0;
  if (catChanged) detached = await detachItem(id);
  emit('items', { id });
  return { item, detached };
}

/** Removes an item from every saved outfit and from the board. Returns how many outfits changed. */
async function detachItem(id) {
  const changed = [];
  for (const o of state.outfits) {
    if (slotIds(o.slots).includes(id)) {
      o.slots = stripId(o.slots, id);
      o.updatedAt = Date.now();
      changed.push(o);
    }
  }
  if (changed.length) await db.putMany('outfits', changed);
  if (slotIds(state.draft.slots).includes(id)) {
    state.draft.slots = stripId(state.draft.slots, id);
    persistDraft();
  }
  return changed.length;
}

function stripId(slots, id) {
  const out = emptySlots();
  for (const c of CATS) {
    const v = slots[c.id];
    if (c.multi) out[c.id] = (v || []).filter((x) => x !== id);
    else out[c.id] = v === id ? null : v || null;
  }
  return out;
}

export async function deleteItem(id) {
  const item = itemById(id);
  if (!item) return;
  await db.del('items', id);
  state.items = state.items.filter((i) => i.id !== id);
  await detachItem(id);
  revoke(id);
  emit('items', { id, deleted: true });
}

export async function deleteItems(ids) {
  if (!ids.length) return;
  await db.delMany('items', ids);
  const gone = new Set(ids);
  state.items = state.items.filter((i) => !gone.has(i.id));
  for (const id of ids) {
    await detachItem(id);
    revoke(id);
  }
  emit('items', {});
}

/* ---------- outfits ---------- */

export async function saveOutfit({ id, name, slots }) {
  const now = Date.now();
  const clean = cleanSlots(slots);
  let outfit = id ? outfitById(id) : null;
  if (outfit) {
    outfit.name = (name || '').trim() || outfit.name;
    outfit.slots = clean;
    outfit.updatedAt = now;
  } else {
    outfit = { id: uid(), name: (name || '').trim() || 'Untitled outfit', slots: clean, createdAt: now, updatedAt: now };
    state.outfits.unshift(outfit);
  }
  await db.put('outfits', outfit);
  emit('outfits', { id: outfit.id });
  return outfit;
}

export async function renameOutfit(id, name) {
  const outfit = outfitById(id);
  const clean = (name || '').trim();
  if (!outfit || !clean) return outfit;
  outfit.name = clean;
  outfit.updatedAt = Date.now();
  await db.put('outfits', outfit);
  if (state.draft.outfitId === id) {
    state.draft.name = clean;
    persistDraft();
  }
  emit('outfits', { id });
  return outfit;
}

export async function deleteOutfit(id) {
  const outfit = outfitById(id);
  if (!outfit) return;
  await db.del('outfits', id);
  state.outfits = state.outfits.filter((o) => o.id !== id);
  const dates = Object.values(state.plans)
    .filter((p) => p.outfitId === id)
    .map((p) => p.date);
  if (dates.length) {
    await db.delMany('plans', dates);
    for (const d of dates) delete state.plans[d];
  }
  if (state.draft.outfitId === id) {
    state.draft.outfitId = null;
    state.draft.name = '';
    persistDraft();
  }
  emit('outfits', { id, deleted: true });
}

export const plansFor = (outfitId) =>
  Object.values(state.plans)
    .filter((p) => p.outfitId === outfitId)
    .sort((a, b) => a.date.localeCompare(b.date));

/* ---------- calendar plans ---------- */

export async function setPlan(date, { outfitId, note }) {
  const prev = state.plans[date];
  const plan = {
    date,
    outfitId: outfitId || (prev && prev.outfitId),
    note: note !== undefined ? String(note).trim() : (prev && prev.note) || '',
  };
  if (!plan.outfitId || !outfitById(plan.outfitId)) return null;
  await db.put('plans', plan);
  state.plans[date] = plan;
  emit('plans', { date });
  return plan;
}

export async function clearPlan(date) {
  if (!state.plans[date]) return;
  await db.del('plans', date);
  delete state.plans[date];
  emit('plans', { date });
}

/* ---------- settings ---------- */

export async function setSettings(patch) {
  Object.assign(state.settings, patch);
  applyBackdrop();
  emit('settings', patch);
  try {
    await db.setMeta('settings', { ...state.settings });
  } catch (err) {
    console.error(err);
  }
}

export function backdrop() {
  return BACKDROPS.find((b) => b.id === state.settings.backdrop) || BACKDROPS[1];
}

function applyBackdrop() {
  if (typeof document === 'undefined') return;
  const b = backdrop();
  document.documentElement.style.setProperty('--backdrop', b.color);
  document.documentElement.style.setProperty('--backdrop-deep', b.deep);
}

/* ---------- the outfit on the board ---------- */

const persistDraft = debounce(() => {
  db.setMeta('draft', {
    outfitId: state.draft.outfitId,
    name: state.draft.name,
    slots: state.draft.slots,
  }).catch((err) => console.error(err));
}, 250);

export function setDraft(patch) {
  Object.assign(state.draft, patch);
  if (patch.slots) state.draft.slots = cleanSlots(patch.slots);
  persistDraft();
  emit('draft', {});
}

export function resetDraft() {
  state.draft = emptyDraft();
  persistDraft();
  emit('draft', {});
}

export function loadOutfitIntoDraft(outfit, { planDate = null } = {}) {
  state.draft = {
    outfitId: outfit.id,
    name: outfit.name,
    slots: cleanSlots(outfit.slots),
    planDate,
  };
  persistDraft();
  emit('draft', {});
}

export function draftIsDirty() {
  const d = state.draft;
  if (!d.outfitId) return pieceCount(d.slots) > 0;
  const saved = outfitById(d.outfitId);
  return !saved || !sameSlots(saved.slots, d.slots);
}

/* ---------- wipe / reload ---------- */

export async function wipeEverything() {
  await db.clearAll();
  for (const id of [...urlCache.keys()]) revoke(id);
  state.items = [];
  state.outfits = [];
  state.plans = {};
  state.draft = emptyDraft();
  await db.setMeta('settings', { ...state.settings });
  emit('reset', {});
}

export async function reloadFromStorage() {
  for (const id of [...urlCache.keys()]) revoke(id);
  await init();
  emit('reset', {});
}
