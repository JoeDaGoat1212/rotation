// Closet: everything you own, by category.
import { h, clear, plural } from '../util.js';
import { button, toast, toastError } from '../ui.js';
import { icon, catIcon } from '../icons.js';
import { CATS, CAT, state, itemsIn } from '../store.js';
import { cutImg } from '../flatlay.js';
import { pickPhotos } from '../add.js';
import { openItem } from '../item.js';
import { loadSamples } from '../samples.js';

let filter = 'all';
let query = '';

export function mount(root) {
  const sub = h('p', { class: 'view-sub' });
  const addBtn = button('Add photos', { kind: 'primary', iconName: 'camera', onClick: () => pickPhotos({ presetCat: filter === 'all' ? null : filter }) });
  const chipRow = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by category' });
  const searchInput = h('input', { class: 'search-input', type: 'search', placeholder: 'Search your closet', 'aria-label': 'Search your closet', value: query, autocomplete: 'off' });
  const search = h('label', { class: 'search' }, h('span', { class: 'ico', html: icon('search', 18) }), searchInput);
  const grid = h('div', { class: 'grid' });
  const emptyBox = h('div', { class: 'empty', hidden: true });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderGrid();
  });

  const view = h(
    'section',
    { class: 'view view--closet' },
    h('header', { class: 'view-head' }, h('div', { class: 'view-titles' }, h('h1', { class: 'view-title' }, 'Closet'), sub), h('div', { class: 'view-actions' }, addBtn)),
    h('div', { class: 'toolbar' }, chipRow, search),
    grid,
    emptyBox
  );
  root.append(view);

  function renderChips() {
    clear(chipRow);
    const chip = (id, label, count) =>
      h(
        'button',
        {
          class: `chip ${filter === id ? 'is-on' : ''}`,
          type: 'button',
          'aria-pressed': String(filter === id),
          onclick: () => {
            filter = id;
            render();
          },
        },
        label,
        h('span', { class: 'chip-count' }, String(count))
      );
    chipRow.append(chip('all', 'All', state.items.length));
    for (const c of CATS) chipRow.append(chip(c.id, c.label, itemsIn(c.id).length));
  }

  function renderGrid() {
    clear(grid);
    clear(emptyBox);
    const q = query.trim().toLowerCase();
    let items = filter === 'all' ? state.items : itemsIn(filter);
    if (q) {
      items = items.filter((i) => [i.name, i.brand, i.color, i.notes, CAT[i.cat].label].some((v) => (v || '').toLowerCase().includes(q)));
    }
    for (const item of items) {
      grid.append(
        h(
          'button',
          { class: 'tile', type: 'button', onclick: () => openItem(item.id), 'aria-label': `${item.name}, ${CAT[item.cat].label}` },
          h('span', { class: 'tile-pic' }, cutImg(item, 'thumb')),
          h('span', { class: 'tile-name' }, item.name),
          h('span', { class: 'tile-meta' }, [item.brand, filter === 'all' ? CAT[item.cat].label : item.color].filter(Boolean).join(', '))
        )
      );
    }
    grid.hidden = items.length === 0;
    emptyBox.hidden = items.length > 0;
    if (items.length) return;

    if (!state.items.length) {
      const sampleBtn = button('Try it with a sample closet', {
        kind: 'onpanel',
        onClick: async () => {
          sampleBtn.disabled = true;
          try {
            await loadSamples();
            toast('Sample closet added. Remove it any time in Settings.');
          } catch (err) {
            sampleBtn.disabled = false;
            toastError(err, 'The sample closet couldn’t be added.');
          }
        },
      });
      emptyBox.append(
        h('span', { class: 'empty-art', html: catIcon('top', 64) }),
        h('h2', { class: 'empty-title' }, 'Your closet is empty'),
        h('p', { class: 'empty-text' }, 'Add photos of your clothes, shoes, jewelry and cologne. The background is cut out for you and each piece lands on a clean backdrop.'),
        h('div', { class: 'btn-row btn-row--center' }, button('Add photos', { kind: 'primary', iconName: 'camera', onClick: () => pickPhotos({}) }), sampleBtn)
      );
    } else if (q) {
      emptyBox.append(h('h2', { class: 'empty-title' }, `Nothing matches “${query.trim()}”`), h('p', { class: 'empty-text' }, 'Check the spelling or search for a brand, color or category.'));
    } else {
      const c = CAT[filter];
      emptyBox.append(
        h('span', { class: 'empty-art', html: catIcon(filter, 64) }),
        h('h2', { class: 'empty-title' }, `No ${c.label.toLowerCase()} yet`),
        h('p', { class: 'empty-text' }, c.hint),
        h('div', { class: 'btn-row btn-row--center' }, button(`Add ${c.label.toLowerCase()}`, { kind: 'primary', iconName: 'camera', onClick: () => pickPhotos({ presetCat: filter }) }))
      );
    }
  }

  function render() {
    sub.textContent = state.items.length ? plural(state.items.length, 'item') : 'Nothing here yet';
    renderChips();
    renderGrid();
  }
  render();

  return {
    update(type) {
      if (type === 'items' || type === 'reset' || type === 'settings') render();
    },
    unmount() {},
  };
}

export function setClosetFilter(cat) {
  filter = CAT[cat] ? cat : 'all';
}
