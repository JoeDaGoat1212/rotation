// The sheet for one closet item: look at it, rename it, move it, re-cut it, delete it.
import { h, plural } from './util.js';
import { openSheet, button, toast, toastError, confirmDialog } from './ui.js';
import { catIcon } from './icons.js';
import { CATS, CAT, MULTI_MAX, state, itemById, imageURL, updateItem, deleteItem, outfitsUsing, setDraft } from './store.js';
import { recutItem } from './add.js';

export function openItem(id) {
  const item = itemById(id);
  if (!item) return null;
  let cat = item.cat;

  const pic = h('img', { class: 'cut', src: imageURL(item, 'image'), alt: item.name, draggable: 'false' });
  const stage = h('div', { class: 'item-stage' }, pic);

  const nameInput = h('input', { class: 'field-input', type: 'text', id: 'item-name', maxlength: '60', autocomplete: 'off', value: item.name });
  const brandInput = h('input', { class: 'field-input', type: 'text', id: 'item-brand', maxlength: '40', autocomplete: 'off', value: item.brand || '' });
  const colorInput = h('input', { class: 'field-input', type: 'text', id: 'item-color', maxlength: '30', autocomplete: 'off', value: item.color || '' });
  const notesInput = h('textarea', { class: 'field-input', id: 'item-notes', rows: '2', maxlength: '300' }, item.notes || '');

  const catBtns = {};
  const catRow = h(
    'div',
    { class: 'cat-grid', role: 'radiogroup', 'aria-label': 'Category' },
    CATS.map((c) => {
      const b = h(
        'button',
        { class: 'cat-btn', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: () => setCat(c.id) },
        h('span', { class: 'ico', html: catIcon(c.id, 26) }),
        h('span', null, c.label)
      );
      catBtns[c.id] = b;
      return b;
    })
  );
  function setCat(next) {
    cat = next;
    for (const [cid, b] of Object.entries(catBtns)) {
      const on = cid === next;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
    }
  }
  setCat(cat);

  const used = outfitsUsing(item.id);
  const usedLine = h('p', { class: 'hint' }, used.length ? `In ${plural(used.length, 'saved outfit')}` : 'Not in any saved outfit yet');

  const tryBtn = button('Try it on the board', {
    kind: 'onpanel',
    iconName: 'tee',
    onClick: () => {
      const slots = { ...state.draft.slots };
      const current = itemById(item.id);
      if (!current) return;
      if (CAT[current.cat].multi) {
        const list = (slots[current.cat] || []).filter((x) => x !== current.id);
        slots[current.cat] = [current.id, ...list].slice(0, MULTI_MAX);
      } else slots[current.cat] = current.id;
      setDraft({ slots });
      sheet.close();
      location.hash = '#/build';
    },
  });
  const recutBtn = button('Re-cut background', {
    kind: 'onpanel',
    iconName: 'eraser',
    onClick: () => {
      sheet.close();
      recutItem(itemById(item.id));
    },
  });

  const form = h(
    'form',
    { class: 'item-form' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'item-name' }, 'Name'), nameInput),
    h('div', { class: 'field' }, h('p', { class: 'field-label' }, 'Category'), catRow),
    h(
      'div',
      { class: 'field-pair' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'item-brand' }, 'Brand'), brandInput),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'item-color' }, 'Color'), colorInput)
    ),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'item-notes' }, 'Notes'), notesInput),
    usedLine,
    h('div', { class: 'btn-row' }, tryBtn, recutBtn)
  );

  const saveBtn = button('Save changes', { kind: 'primary', onClick: () => save() });
  const deleteBtn = button('Delete item', { kind: 'danger-quiet', iconName: 'trash', onClick: () => remove() });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save();
  });

  const sheet = openSheet({
    title: item.name,
    variant: 'wide',
    className: 'item-sheet',
    body: h('div', { class: 'item-layout' }, stage, form),
    foot: [deleteBtn, h('span', { class: 'spacer' }), saveBtn],
  });

  async function save() {
    const current = itemById(item.id);
    if (!current) return sheet.close();
    const patch = { name: nameInput.value, brand: brandInput.value, color: colorInput.value, notes: notesInput.value, cat };
    const moving = cat !== current.cat;
    const inOutfits = outfitsUsing(current.id).length;
    if (moving && inOutfits) {
      const ok = await confirmDialog({
        title: `Move to ${CAT[cat].label}?`,
        message: `“${current.name}” is in ${plural(inOutfits, 'saved outfit')}. Moving it to another category takes it out of ${inOutfits === 1 ? 'that outfit' : 'those outfits'}.`,
        confirm: 'Move it',
      });
      if (!ok) return;
    }
    saveBtn.disabled = true;
    try {
      await updateItem(current.id, patch);
      sheet.close();
      toast('Saved');
    } catch (err) {
      saveBtn.disabled = false;
      toastError(err, 'The changes couldn’t be saved.');
    }
  }

  async function remove() {
    const current = itemById(item.id);
    if (!current) return sheet.close();
    const inOutfits = outfitsUsing(current.id).length;
    const ok = await confirmDialog({
      title: `Delete “${current.name}”?`,
      message: inOutfits
        ? `It will also be taken out of ${plural(inOutfits, 'saved outfit')}. This can’t be undone.`
        : 'This can’t be undone.',
      confirm: 'Delete item',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteItem(current.id);
      sheet.close();
      toast('Deleted');
    } catch (err) {
      toastError(err, 'The item couldn’t be deleted.');
    }
  }

  return sheet;
}
