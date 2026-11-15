// Read-only outfit pictures: the flat lay used on cards, sheets and the calendar.
import { h } from './util.js';
import { CATS, itemById, imageURL } from './store.js';

const MAIN = ['top', 'bottom', 'socks', 'shoes'];
const SIDE = ['layer', 'fragrance', 'accessory', 'jewelry'];

export function cutImg(item, kind = 'thumb', extraClass = '') {
  return h('img', {
    class: `cut ${extraClass}`.trim(),
    src: imageURL(item, kind),
    alt: item.name || '',
    loading: 'lazy',
    decoding: 'async',
    draggable: 'false',
  });
}

/**
 * The full flat lay: outfit stacked top to shoes, with layer, cologne, accessories and jewelry beside it.
 * kind: 'thumb' for small cards, 'image' for large views.
 */
export function flatlay(slots, { kind = 'thumb', className = '' } = {}) {
  const main = h('div', { class: 'lay-main' });
  for (const cat of MAIN) {
    const item = itemById(slots[cat]);
    if (item) main.append(h('div', { class: `lay-piece lay-piece--${cat}` }, cutImg(item, kind)));
  }
  const side = h('div', { class: 'lay-side' });
  for (const cat of SIDE) {
    const ids = Array.isArray(slots[cat]) ? slots[cat] : slots[cat] ? [slots[cat]] : [];
    for (const id of ids) {
      const item = itemById(id);
      if (item) side.append(h('div', { class: `lay-piece lay-piece--${cat}` }, cutImg(item, kind)));
    }
  }
  const hasMain = main.childNodes.length > 0;
  const hasSide = side.childNodes.length > 0;
  const el = h('div', {
    class: `lay ${!hasSide ? 'lay--main-only' : ''} ${!hasMain ? 'lay--side-only' : ''} ${className}`.replace(/\s+/g, ' ').trim(),
    role: 'img',
    'aria-label': describe(slots),
  });
  if (hasMain) el.append(main);
  if (hasSide) el.append(side);
  if (!hasMain && !hasSide) el.append(h('p', { class: 'lay-empty' }, 'No pieces left in this outfit'));
  return el;
}

/** A tiny stacked figure for calendar cells: the three most recognisable pieces. */
export function miniFigure(slots) {
  const order = ['top', 'bottom', 'shoes', 'layer', 'socks', 'fragrance', 'accessory', 'jewelry'];
  const picked = [];
  for (const cat of order) {
    const v = slots[cat];
    const id = Array.isArray(v) ? v[0] : v;
    const item = itemById(id);
    if (item) picked.push({ cat, item });
    if (picked.length === 3) break;
  }
  const rank = { top: 0, layer: 0, bottom: 1, socks: 2, shoes: 3, fragrance: 4, accessory: 4, jewelry: 4 };
  picked.sort((a, b) => rank[a.cat] - rank[b.cat]);
  return h(
    'div',
    { class: 'mini', 'aria-hidden': 'true' },
    picked.map(({ cat, item }) => h('div', { class: `mini-piece mini-piece--${cat}` }, cutImg(item, 'thumb')))
  );
}

export function describe(slots) {
  const names = [];
  for (const c of CATS) {
    const v = slots[c.id];
    const ids = Array.isArray(v) ? v : v ? [v] : [];
    for (const id of ids) {
      const item = itemById(id);
      if (item) names.push(item.name);
    }
  }
  return names.length ? `Outfit: ${names.join(', ')}` : 'Empty outfit';
}

/** A saved outfit as a card: flat lay on the backdrop with its name underneath. */
export function outfitCard(outfit, { onClick = null, meta = '', selected = false } = {}) {
  return h(
    'button',
    { class: `ocard ${selected ? 'is-on' : ''}`.trim(), type: 'button', onclick: onClick, 'aria-pressed': selected ? 'true' : null },
    h('span', { class: 'ocard-pic' }, flatlay(outfit.slots, { kind: 'thumb' })),
    h('span', { class: 'ocard-name' }, outfit.name),
    meta ? h('span', { class: 'ocard-meta' }, meta) : null
  );
}
