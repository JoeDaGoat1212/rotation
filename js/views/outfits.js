// Outfits: everything you've saved.
import { h, clear, plural, dateKey, relativeDay } from '../util.js';
import { openSheet, button, toast, toastError, confirmDialog } from '../ui.js';
import { state, outfitById, pieceCount, plansFor, renameOutfit, deleteOutfit, saveOutfit, setPlan, loadOutfitIntoDraft, subscribe } from '../store.js';
import { flatlay, outfitCard } from '../flatlay.js';
import { openPlanSheet } from '../plan.js';

export function mount(root) {
  const sub = h('p', { class: 'view-sub' });
  const grid = h('div', { class: 'ocard-grid' });
  const emptyBox = h('div', { class: 'empty', hidden: true });
  const view = h(
    'section',
    { class: 'view view--outfits' },
    h(
      'header',
      { class: 'view-head' },
      h('div', { class: 'view-titles' }, h('h1', { class: 'view-title' }, 'Outfits'), sub),
      h('div', { class: 'view-actions' }, button('Build an outfit', { kind: 'primary', iconName: 'plus', onClick: () => (location.hash = '#/build') }))
    ),
    grid,
    emptyBox
  );
  root.append(view);

  function render() {
    clear(grid);
    clear(emptyBox);
    const list = state.outfits;
    sub.textContent = list.length ? plural(list.length, 'saved outfit') : 'Nothing saved yet';
    grid.hidden = !list.length;
    emptyBox.hidden = !!list.length;
    if (!list.length) {
      emptyBox.append(
        h('h2', { class: 'empty-title' }, 'No saved outfits yet'),
        h('p', { class: 'empty-text' }, 'Put an outfit together on the board, then save it with a name. It shows up here and can go on your calendar.'),
        h('div', { class: 'btn-row btn-row--center' }, button('Build an outfit', { kind: 'primary', iconName: 'plus', onClick: () => (location.hash = '#/build') }))
      );
      return;
    }
    const today = dateKey();
    for (const o of list) {
      const upcoming = plansFor(o.id).find((p) => p.date >= today);
      grid.append(
        outfitCard(o, {
          onClick: () => openOutfit(o.id),
          meta: upcoming ? `Planned for ${rel(upcoming.date)}` : plural(pieceCount(o.slots), 'piece'),
        })
      );
    }
  }
  render();

  return {
    update(type) {
      if (type === 'outfits' || type === 'items' || type === 'plans' || type === 'reset') render();
    },
    unmount() {},
  };
}

function rel(key) {
  const r = relativeDay(key);
  return r === 'Today' || r === 'Tomorrow' || r === 'Yesterday' ? r.toLowerCase() : r;
}

export function openOutfit(id) {
  const outfit = outfitById(id);
  if (!outfit) return null;

  const nameInput = h('input', { class: 'field-input field-input--title', type: 'text', id: 'outfit-name', maxlength: '60', autocomplete: 'off', value: outfit.name, 'aria-label': 'Outfit name' });
  const plansLine = h('p', { class: 'hint' });

  const rename = async () => {
    const current = outfitById(id);
    const next = nameInput.value.trim();
    if (!current) return;
    if (!next) {
      nameInput.value = current.name;
      return;
    }
    if (next === current.name) return;
    try {
      await renameOutfit(id, next);
      sheet.setTitle(next);
      toast('Renamed');
    } catch (err) {
      toastError(err, 'The name couldn’t be saved.');
    }
  };
  nameInput.addEventListener('change', rename);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.blur();
    }
  });

  const drawPlans = () => {
    const today = dateKey();
    const upcoming = plansFor(id).filter((p) => p.date >= today);
    plansLine.textContent = upcoming.length
      ? `Planned for ${upcoming
          .slice(0, 4)
          .map((p) => rel(p.date))
          .join(', ')}${upcoming.length > 4 ? ` and ${upcoming.length - 4} more` : ''}`
      : 'Not on your calendar yet';
  };
  drawPlans();
  const unsubscribe = subscribe((type) => {
    if (type === 'plans' && outfitById(id)) drawPlans();
  });

  const wearBtn = button('Wear it today', {
    kind: 'primary',
    iconName: 'sun',
    onClick: async () => {
      try {
        await setPlan(dateKey(), { outfitId: id });
        drawPlans();
        toast(`“${outfitById(id).name}” is today’s outfit`);
      } catch (err) {
        toastError(err, 'The outfit couldn’t be planned.');
      }
    },
  });
  const planBtn = button('Plan a day', { kind: 'onpanel', iconName: 'calendar', onClick: () => openPlanSheet({ outfitId: id }) });
  const editBtn = button('Open in Build', {
    kind: 'onpanel',
    iconName: 'tee',
    onClick: () => {
      loadOutfitIntoDraft(outfitById(id));
      sheet.close();
      location.hash = '#/build';
    },
  });
  const copyBtn = button('Duplicate', {
    kind: 'onpanel',
    iconName: 'copy',
    onClick: async () => {
      try {
        const current = outfitById(id);
        const copy = await saveOutfit({ name: `${current.name} copy`.slice(0, 60), slots: current.slots });
        sheet.close();
        toast(`Made “${copy.name}”`);
      } catch (err) {
        toastError(err, 'The outfit couldn’t be duplicated.');
      }
    },
  });
  const deleteBtn = button('Delete outfit', {
    kind: 'danger-quiet',
    iconName: 'trash',
    onClick: async () => {
      const current = outfitById(id);
      const planned = plansFor(id).length;
      const ok = await confirmDialog({
        title: `Delete “${current.name}”?`,
        message: planned
          ? `It will also come off ${plural(planned, 'calendar day')}. The pieces stay in your closet.`
          : 'The pieces stay in your closet.',
        confirm: 'Delete outfit',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteOutfit(id);
        sheet.close();
        toast('Deleted');
      } catch (err) {
        toastError(err, 'The outfit couldn’t be deleted.');
      }
    },
  });

  const sheet = openSheet({
    title: outfit.name,
    variant: 'wide',
    className: 'outfit-sheet',
    body: h(
      'div',
      { class: 'item-layout' },
      h('div', { class: 'item-stage item-stage--lay' }, flatlay(outfit.slots, { kind: 'image' })),
      h(
        'div',
        { class: 'item-form' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'outfit-name' }, 'Name'), nameInput),
        plansLine,
        h('div', { class: 'btn-col' }, wearBtn, planBtn, editBtn, copyBtn)
      )
    ),
    foot: [deleteBtn],
    onClose: () => {
      unsubscribe();
      const current = outfitById(id);
      const next = nameInput.value.trim();
      if (current && next && next !== current.name) renameOutfit(id, next).catch(() => {});
    },
  });

  return sheet;
}
