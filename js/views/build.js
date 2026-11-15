// Build: the flat-lay board. Swap any piece and see the whole outfit together.
import { h, clear, plural, prefersReducedMotion, isDesktop, parseKey, fmtDate } from '../util.js';
import { openSheet, button, toast, toastError, promptDialog } from '../ui.js';
import { icon, catIcon } from '../icons.js';
import {
  CAT,
  MULTI_MAX,
  state,
  itemById,
  itemsIn,
  outfitById,
  pieceCount,
  setDraft,
  resetDraft,
  draftIsDirty,
  saveOutfit,
  setPlan,
  subscribe,
} from '../store.js';
import { cutImg } from '../flatlay.js';
import { pickPhotos } from '../add.js';
import { loadSamples } from '../samples.js';
import { openPlanSheet } from '../plan.js';
import { showMonthOf } from './calendar.js';

const MAIN = ['top', 'bottom', 'socks', 'shoes'];
const SIDE_SINGLE = ['layer', 'fragrance'];
const SIDE_MULTI = ['accessory', 'jewelry'];
const SHUFFLED = ['top', 'bottom', 'socks', 'shoes', 'fragrance'];
const SIDE_LABEL = { layer: 'Layer', fragrance: 'Cologne', accessory: 'Accessories', jewelry: 'Jewelry' };
const ONE = { top: 'top', layer: 'layer', bottom: 'bottoms', socks: 'socks', shoes: 'shoes', fragrance: 'cologne', accessory: 'accessory', jewelry: 'jewelry' };

export function mount(root) {
  let internal = false; // true while this view is the one changing the draft
  const slots = {}; // cat -> slot refs
  const groups = {}; // cat -> multi group refs

  const sub = h('p', { class: 'view-sub' });
  const shuffleBtn = button('Shuffle', { kind: 'onpanel', iconName: 'shuffle', onClick: () => shuffle(), attrs: { 'aria-label': 'Shuffle the outfit' } });
  const resetBtn = button('Start over', { kind: 'quiet', iconName: 'undo', onClick: () => startOver(), attrs: { 'aria-label': 'Start over with an empty board' } });
  const saveBtn = button('Save outfit', { kind: 'primary', iconName: 'bookmark', onClick: () => save(false) });
  const banner = h('div', { class: 'banner', hidden: true });
  const board = h('div', { class: 'board' });
  const emptyBox = h('div', { class: 'empty', hidden: true });

  const view = h(
    'section',
    { class: 'view view--build' },
    h(
      'header',
      { class: 'view-head' },
      h('div', { class: 'view-titles' }, h('h1', { class: 'view-title' }, 'Build'), sub),
      h('div', { class: 'view-actions view-actions--compact' }, shuffleBtn, resetBtn, saveBtn)
    ),
    banner,
    board,
    emptyBox
  );
  root.append(view);

  /* ---------- board skeleton ---------- */
  const mainCol = h('div', { class: 'board-main' });
  const sideCol = h('div', { class: 'board-side' });
  board.append(mainCol, sideCol);

  for (const cat of MAIN) {
    slots[cat] = makeSlot(cat);
    mainCol.append(slots[cat].el);
  }
  for (const cat of SIDE_SINGLE) {
    slots[cat] = makeSlot(cat);
    sideCol.append(h('div', { class: `side-group side-group--${cat}` }, h('p', { class: 'side-label' }, SIDE_LABEL[cat]), slots[cat].el));
  }
  for (const cat of SIDE_MULTI) {
    const tray = h('div', { class: 'multi' });
    groups[cat] = { tray, key: null };
    sideCol.append(h('div', { class: `side-group side-group--${cat}` }, h('p', { class: 'side-label' }, SIDE_LABEL[cat]), tray));
  }

  function makeSlot(cat) {
    const piece = h('button', { class: 'slot-piece', type: 'button' });
    const prev = h('button', { class: 'slot-arrow slot-arrow--prev', type: 'button', 'aria-label': `Previous ${ONE[cat]}`, html: icon('left', 20) });
    const next = h('button', { class: 'slot-arrow slot-arrow--next', type: 'button', 'aria-label': `Next ${ONE[cat]}`, html: icon('right', 20) });
    const caption = h('span', { class: 'slot-caption', 'aria-hidden': 'true' });
    const el = h('div', { class: `slot slot--${cat}` }, piece, prev, next, caption);
    const ref = { cat, el, piece, prev, next, caption, shown: undefined, captionTimer: 0 };

    prev.addEventListener('click', () => cycle(cat, -1));
    next.addEventListener('click', () => cycle(cat, 1));

    // Tap opens the picker; a sideways swipe flips to the next piece.
    let down = null;
    let swiped = false;
    piece.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      swiped = false;
    });
    piece.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3 && itemsIn(cat).length > 1) {
        swiped = true;
        cycle(cat, dx < 0 ? 1 : -1);
      }
    });
    piece.addEventListener('pointercancel', () => {
      down = null;
    });
    piece.addEventListener('click', (e) => {
      if (swiped) {
        swiped = false;
        e.preventDefault();
        return;
      }
      if (!itemsIn(cat).length) addNew(cat);
      else openPicker(cat);
    });
    piece.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cycle(cat, -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        cycle(cat, 1);
      }
    });
    return ref;
  }

  /* ---------- rendering ---------- */
  function emptyGlyph(cat) {
    const has = itemsIn(cat).length > 0;
    return h(
      'span',
      { class: 'slot-empty' },
      h('span', { class: 'ico', html: catIcon(cat, 44) }),
      h('span', { class: 'slot-empty-text' }, has ? `Pick ${ONE[cat]}` : `Add ${ONE[cat]}`)
    );
  }

  function swap(container, node, { dir = 0, deal = -1 } = {}) {
    const old = [...container.children];
    container.append(node);
    if (prefersReducedMotion() || (!dir && deal < 0) || typeof node.animate !== 'function') {
      old.forEach((o) => o.remove());
      return;
    }
    if (deal >= 0) {
      old.forEach((o) => o.remove());
      node.animate(
        [
          { transform: 'translateY(-22px) rotate(-3deg) scale(.93)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 460, delay: deal * 75, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' }
      );
      return;
    }
    for (const o of old) {
      const out = o.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translateX(${-dir * 42}%) rotate(${-dir * 4}deg)`, opacity: 0 },
        ],
        { duration: 200, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' }
      );
      out.onfinish = () => o.remove();
      out.oncancel = () => o.remove();
    }
    node.animate(
      [
        { transform: `translateX(${dir * 42}%) rotate(${dir * 4}deg)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 320, easing: 'cubic-bezier(.2,.85,.25,1)' }
    );
  }

  function renderSlot(cat, opts = {}) {
    const ref = slots[cat];
    const id = state.draft.slots[cat];
    const item = itemById(id);
    const list = itemsIn(cat);
    const key = item ? `${item.id}:${item.updatedAt}` : list.length ? 'choose' : 'add';
    ref.prev.hidden = ref.next.hidden = !item || list.length < 2;
    ref.el.classList.toggle('is-empty', !item);
    if (item) {
      const at = list.findIndex((i) => i.id === item.id) + 1;
      ref.piece.setAttribute('aria-label', `${SIDE_LABEL[cat] || cap(ONE[cat])}: ${item.name}. Tap to change.`);
      clear(ref.caption).append(h('span', { class: 'slot-caption-name' }, item.name), list.length > 1 ? h('span', { class: 'slot-caption-count' }, `${at} of ${list.length}`) : '');
    } else {
      ref.piece.setAttribute('aria-label', list.length ? `Pick ${ONE[cat]}` : `Add ${ONE[cat]}`);
      clear(ref.caption);
    }
    if (ref.shown === key && !opts.force) return;
    ref.shown = key;
    const node = item ? cutImg(item, 'image') : emptyGlyph(cat);
    if (item) node.loading = 'eager';
    swap(ref.piece, node, opts);
    if (item && opts.dir) flashCaption(ref);
  }

  function flashCaption(ref) {
    clearTimeout(ref.captionTimer);
    ref.caption.classList.add('is-shown');
    ref.captionTimer = setTimeout(() => ref.caption.classList.remove('is-shown'), 1500);
  }

  function renderGroup(cat, opts = {}) {
    const g = groups[cat];
    const ids = state.draft.slots[cat] || [];
    const items = ids.map(itemById).filter(Boolean);
    const total = itemsIn(cat).length;
    const key = items.map((i) => `${i.id}:${i.updatedAt}`).join('|') + `#${total > 0}`;
    if (g.key === key && !opts.force) return;
    g.key = key;
    clear(g.tray);
    g.tray.dataset.count = String(items.length);
    items.forEach((item, i) => {
      const b = h('button', { class: 'multi-piece', type: 'button', 'aria-label': `${item.name}. Tap to change ${SIDE_LABEL[cat].toLowerCase()}.`, onclick: () => openPicker(cat) }, cutImg(item, 'image'));
      g.tray.append(b);
      if (opts.deal >= 0 && !prefersReducedMotion() && b.animate) {
        b.animate(
          [
            { transform: 'translateY(-16px) scale(.9)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 420, delay: (opts.deal + i) * 75, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' }
        );
      }
    });
    if (items.length < MULTI_MAX) {
      const label = total ? (items.length ? `Add more ${SIDE_LABEL[cat].toLowerCase()}` : `Pick ${SIDE_LABEL[cat].toLowerCase()}`) : `Add ${SIDE_LABEL[cat].toLowerCase()}`;
      g.tray.append(
        h(
          'button',
          { class: `multi-add ${items.length ? '' : 'multi-add--solo'}`.trim(), type: 'button', 'aria-label': label, onclick: () => (total ? openPicker(cat) : addNew(cat)) },
          items.length ? h('span', { class: 'ico', html: icon('plus', 18) }) : [h('span', { class: 'ico', html: catIcon(cat, 34) }), h('span', { class: 'slot-empty-text' }, total ? 'Pick' : 'Add')]
        )
      );
    }
  }

  function renderHead() {
    const d = state.draft;
    const saved = outfitById(d.outfitId);
    const count = pieceCount(d.slots);
    const dirty = draftIsDirty();
    clear(sub);
    if (saved) {
      sub.append(`Editing “${saved.name}”`);
      if (dirty) {
        sub.append(
          h('span', { class: 'pill' }, 'Unsaved changes'),
          h('button', { class: 'link-btn', type: 'button', onclick: () => save(true) }, 'Save as a new outfit')
        );
      }
    } else {
      sub.append(count ? `New outfit, ${plural(count, 'piece')}` : 'Tap a spot to pick a piece, then use the arrows to flip through the rest');
    }
    saveBtn.querySelector('.btn-label').textContent = saved ? 'Save changes' : 'Save outfit';
    saveBtn.disabled = saved ? !dirty : count === 0;
    resetBtn.disabled = count === 0 && !saved;
    shuffleBtn.disabled = !SHUFFLED.some((c) => itemsIn(c).length > 0);

    banner.hidden = !d.planDate;
    if (d.planDate) {
      clear(banner).append(
        h('span', null, `This outfit is for ${fmtDate.long(parseKey(d.planDate))}. Save it and it goes on your calendar.`),
        h(
          'button',
          {
            class: 'link-btn',
            type: 'button',
            onclick: () => {
              change({ planDate: null });
              renderHead();
            },
          },
          'Don’t plan it'
        )
      );
    }
  }

  function renderAll(opts = {}) {
    const any = state.items.length > 0;
    board.hidden = !any;
    emptyBox.hidden = any;
    view.classList.toggle('is-blank', !any);
    if (!any) {
      renderBlank();
      renderHead();
      return;
    }
    let n = 0;
    for (const cat of [...MAIN, ...SIDE_SINGLE]) {
      renderSlot(cat, { force: opts.force, deal: opts.deal ? n : -1 });
      if (state.draft.slots[cat]) n++;
    }
    for (const cat of SIDE_MULTI) {
      renderGroup(cat, { force: opts.force, deal: opts.deal ? n : -1 });
      n += (state.draft.slots[cat] || []).length;
    }
    renderHead();
  }

  function renderBlank() {
    clear(emptyBox);
    const sampleBtn = button('Try it with a sample closet', {
      kind: 'onpanel',
      onClick: async () => {
        sampleBtn.disabled = true;
        try {
          await loadSamples();
        } catch (err) {
          sampleBtn.disabled = false;
          toastError(err, 'The sample closet couldn’t be added.');
        }
      },
    });
    emptyBox.append(
      h('span', { class: 'empty-art', html: catIcon('top', 64) }),
      h('h2', { class: 'empty-title' }, 'Nothing to build with yet'),
      h('p', { class: 'empty-text' }, 'Add a few pieces to your closet and they show up here, laid out as a full outfit you can swap piece by piece.'),
      h('div', { class: 'btn-row btn-row--center' }, button('Add photos', { kind: 'primary', iconName: 'camera', onClick: () => pickPhotos({}) }), sampleBtn)
    );
  }

  /* ---------- changing the outfit ---------- */
  function change(patch) {
    internal = true;
    try {
      setDraft(patch);
    } finally {
      internal = false;
    }
  }

  function setSlot(cat, value, dir = 0) {
    change({ slots: { ...state.draft.slots, [cat]: value } });
    if (CAT[cat].multi) renderGroup(cat);
    else renderSlot(cat, { dir });
    renderHead();
  }

  function cycle(cat, dir) {
    const list = itemsIn(cat);
    if (!list.length) return;
    const at = list.findIndex((i) => i.id === state.draft.slots[cat]);
    const nextIndex = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length;
    if (list[nextIndex].id === state.draft.slots[cat]) return;
    setSlot(cat, list[nextIndex].id, dir);
  }

  function shuffle(silent = false) {
    const next = { ...state.draft.slots };
    let changed = false;
    for (const cat of SHUFFLED) {
      const list = itemsIn(cat);
      if (!list.length) continue;
      const others = list.filter((i) => i.id !== next[cat]);
      const pool = others.length ? others : list;
      const pickId = pool[Math.floor(Math.random() * pool.length)].id;
      if (pickId !== next[cat]) changed = true;
      next[cat] = pickId;
    }
    change({ slots: next });
    for (const ref of Object.values(slots)) ref.shown = undefined;
    renderAll({ deal: true, force: true });
    if (!changed && !silent) toast('Add more pieces to get different shuffles');
  }

  function startOver() {
    const before = { ...state.draft, slots: { ...state.draft.slots } };
    internal = true;
    try {
      resetDraft();
    } finally {
      internal = false;
    }
    renderAll({ force: true });
    toast('Board cleared', {
      action: {
        label: 'Undo',
        run: () => {
          change(before);
          renderAll({ force: true, deal: true });
        },
      },
    });
  }

  function addNew(cat) {
    pickPhotos({
      presetCat: cat,
      onSaved: (item) => {
        if (item.cat !== cat) return;
        if (CAT[cat].multi) {
          const list = state.draft.slots[cat] || [];
          if (list.length < MULTI_MAX) setSlot(cat, [...list, item.id]);
        } else setSlot(cat, item.id, 1);
      },
    });
  }

  /* ---------- picker ---------- */
  function openPicker(cat) {
    const c = CAT[cat];
    const grid = h('div', { class: 'picker-grid' });
    const doneBtn = c.multi ? button('Done', { kind: 'primary', onClick: () => sheet.close() }) : null;
    const note = h('p', { class: 'hint' }, c.multi ? `Pick up to ${MULTI_MAX}. Tap again to take one off.` : 'Tap a piece to put it on the board.');

    const draw = () => {
      clear(grid);
      const current = state.draft.slots[cat];
      const isOn = (id) => (c.multi ? (current || []).includes(id) : current === id);
      if (!c.multi) {
        grid.append(
          h(
            'button',
            { class: `tile tile--none ${!current ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(!current), onclick: () => choose(null) },
            h('span', { class: 'tile-pic tile-pic--none' }, h('span', { class: 'ico', html: icon('close', 26) })),
            h('span', { class: 'tile-name' }, 'None')
          )
        );
      }
      for (const item of itemsIn(cat)) {
        grid.append(
          h(
            'button',
            { class: `tile ${isOn(item.id) ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(isOn(item.id)), onclick: () => choose(item.id) },
            h('span', { class: 'tile-pic' }, cutImg(item, 'thumb'), isOn(item.id) ? h('span', { class: 'tile-check', html: icon('check', 16) }) : null),
            h('span', { class: 'tile-name' }, item.name)
          )
        );
      }
      grid.append(
        h(
          'button',
          { class: 'tile tile--add', type: 'button', onclick: () => addNew(cat) },
          h('span', { class: 'tile-pic tile-pic--none' }, h('span', { class: 'ico', html: icon('camera', 26) })),
          h('span', { class: 'tile-name' }, 'Add a photo')
        )
      );
    };

    const choose = (id) => {
      if (c.multi) {
        const list = state.draft.slots[cat] || [];
        if (list.includes(id)) setSlot(cat, list.filter((x) => x !== id));
        else if (list.length >= MULTI_MAX) {
          toast(`An outfit holds up to ${MULTI_MAX} ${c.label.toLowerCase()}`);
          return;
        } else setSlot(cat, [...list, id]);
        draw();
      } else {
        const list = itemsIn(cat);
        const from = list.findIndex((i) => i.id === state.draft.slots[cat]);
        const to = list.findIndex((i) => i.id === id);
        setSlot(cat, id, to >= from ? 1 : -1);
        if (isDesktop()) draw();
        else sheet.close();
      }
    };

    draw();
    const unsubscribe = subscribe((type) => {
      if (type === 'items' || type === 'draft') draw();
    });
    const sheet = openSheet({
      title: c.label,
      variant: 'drawer',
      body: [note, grid],
      foot: doneBtn,
      onClose: () => unsubscribe(),
    });
  }

  /* ---------- saving ---------- */
  async function save(asNew) {
    const d = state.draft;
    if (!pieceCount(d.slots)) return;
    const existing = !asNew ? outfitById(d.outfitId) : null;
    try {
      let outfit;
      if (existing) {
        outfit = await saveOutfit({ id: existing.id, name: existing.name, slots: d.slots });
      } else {
        const name = await promptDialog({
          title: asNew ? 'Save as a new outfit' : 'Name this outfit',
          label: 'Outfit name',
          placeholder: 'Friday night',
          confirm: 'Save outfit',
          suggestions: ['Everyday', 'Night out', 'Game day', 'Dressed up'],
        });
        if (!name) return;
        outfit = await saveOutfit({ name, slots: d.slots });
      }
      const planDate = d.planDate;
      change({ outfitId: outfit.id, name: outfit.name, planDate: null });
      if (planDate) {
        await setPlan(planDate, { outfitId: outfit.id });
        toast(`Saved “${outfit.name}” and planned it for ${fmtDate.short(parseKey(planDate))}`);
        showMonthOf(planDate);
        location.hash = '#/calendar';
        return;
      }
      renderHead();
      toast(existing ? `Saved changes to “${outfit.name}”` : `Saved “${outfit.name}”`, {
        action: { label: 'Plan a day', run: () => openPlanSheet({ outfitId: outfit.id }) },
      });
    } catch (err) {
      toastError(err, 'The outfit couldn’t be saved.');
    }
  }

  renderAll({ deal: true, force: true });

  return {
    update(type) {
      if (type === 'draft' && internal) return;
      if (type === 'items' || type === 'reset' || type === 'draft' || type === 'outfits') {
        if (type === 'outfits') renderHead();
        else renderAll({ force: type !== 'items' });
      }
    },
    unmount() {
      for (const ref of Object.values(slots)) clearTimeout(ref.captionTimer);
    },
  };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
