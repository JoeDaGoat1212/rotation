// Today: what you're wearing, and the week ahead.
import { h, clear, dateKey, addDays, fmtDate, plural } from '../util.js';
import { button, toast, toastError } from '../ui.js';
import { icon, catIcon } from '../icons.js';
import { CATS, state, outfitById, itemsIn, pieceCount, loadOutfitIntoDraft } from '../store.js';
import { flatlay, miniFigure } from '../flatlay.js';
import { openDaySheet } from '../plan.js';
import { pickPhotos } from '../add.js';
import { loadSamples } from '../samples.js';
import { setClosetFilter } from './closet.js';

export function mount(root) {
  const now = new Date();
  const view = h('section', { class: 'view view--today' });
  const body = h('div', { class: 'today-body' });
  view.append(
    h(
      'header',
      { class: 'view-head' },
      h('div', { class: 'view-titles' }, h('h1', { class: 'view-title' }, fmtDate.weekday(now)), h('p', { class: 'view-sub' }, fmtDate.monthDay(now)))
    ),
    body
  );
  root.append(view);

  function render() {
    clear(body);
    const today = dateKey();

    if (!state.items.length) {
      const sampleBtn = button('Try it with a sample closet', {
        kind: 'onpanel',
        onClick: async () => {
          sampleBtn.disabled = true;
          try {
            await loadSamples();
            toast('Sample closet added. Remove it any time in Settings.');
            location.hash = '#/build';
          } catch (err) {
            sampleBtn.disabled = false;
            toastError(err, 'The sample closet couldn’t be added.');
          }
        },
      });
      body.append(
        h(
          'div',
          { class: 'welcome' },
          h('h2', { class: 'welcome-title' }, 'Start with your closet'),
          h(
            'ol',
            { class: 'welcome-steps' },
            h('li', null, h('strong', null, 'Add photos.'), ' Snap or upload each piece. The background is cut out for you.'),
            h('li', null, h('strong', null, 'Build outfits.'), ' Lay out a full look and swap one piece at a time.'),
            h('li', null, h('strong', null, 'Plan your week.'), ' Save the ones you like and put them on the calendar.')
          ),
          h('div', { class: 'btn-row' }, button('Add photos', { kind: 'primary', iconName: 'camera', onClick: () => pickPhotos({}) }), sampleBtn)
        )
      );
      return;
    }

    /* today's outfit */
    const plan = state.plans[today];
    const outfit = plan ? outfitById(plan.outfitId) : null;
    if (outfit) {
      body.append(
        h(
          'div',
          { class: 'hero' },
          h('button', { class: 'hero-pic', type: 'button', 'aria-label': `Today’s outfit: ${outfit.name}. Tap to change.`, onclick: () => openDaySheet(today) }, flatlay(outfit.slots, { kind: 'image' })),
          h(
            'div',
            { class: 'hero-info' },
            h('p', { class: 'hero-kicker' }, 'Today you’re wearing'),
            h('h2', { class: 'hero-name' }, outfit.name),
            plan.note ? h('p', { class: 'hero-note' }, plan.note) : null,
            h('p', { class: 'hint' }, plural(pieceCount(outfit.slots), 'piece')),
            h(
              'div',
              { class: 'btn-row' },
              button('Change', { kind: 'primary', onClick: () => openDaySheet(today) }),
              button('Open in Build', {
                kind: 'onpanel',
                iconName: 'tee',
                onClick: () => {
                  loadOutfitIntoDraft(outfit);
                  location.hash = '#/build';
                },
              })
            )
          )
        )
      );
    } else {
      body.append(
        h(
          'div',
          { class: 'hero hero--empty' },
          h(
            'button',
            { class: 'hero-pic hero-pic--empty', type: 'button', 'aria-label': 'Pick today’s outfit', onclick: () => openDaySheet(today) },
            h('span', { class: 'slot-empty slot-empty--static' }, h('span', { class: 'ico', html: catIcon('top', 56) }), h('span', { class: 'slot-empty-text' }, 'Pick today’s outfit'))
          ),
          h(
            'div',
            { class: 'hero-info' },
            h('h2', { class: 'hero-name' }, 'Nothing planned for today'),
            h('p', { class: 'hero-note' }, state.outfits.length ? 'Pick one of your saved outfits, or build something new.' : 'Build an outfit on the board and save it to wear today.'),
            h(
              'div',
              { class: 'btn-row' },
              state.outfits.length ? button('Pick today’s outfit', { kind: 'primary', onClick: () => openDaySheet(today) }) : null,
              button('Build an outfit', { kind: state.outfits.length ? 'onpanel' : 'primary', iconName: 'plus', onClick: () => (location.hash = '#/build') })
            )
          )
        )
      );
    }

    /* the week ahead */
    const week = h('div', { class: 'week', role: 'group', 'aria-label': 'The next seven days' });
    for (let i = 0; i < 7; i++) {
      const d = addDays(new Date(), i);
      const key = dateKey(d);
      const p = state.plans[key];
      const o = p ? outfitById(p.outfitId) : null;
      week.append(
        h(
          'button',
          {
            class: `week-day ${i === 0 ? 'is-today' : ''} ${o ? 'has-plan' : ''}`.replace(/\s+/g, ' ').trim(),
            type: 'button',
            'aria-label': `${fmtDate.long(d)}: ${o ? o.name : 'nothing planned'}`,
            onclick: () => openDaySheet(key),
          },
          h('span', { class: 'week-dow' }, i === 0 ? 'Today' : fmtDate.weekdayShort(d)),
          h('span', { class: 'week-num' }, String(d.getDate())),
          h('span', { class: 'week-pic' }, o ? miniFigure(o.slots) : h('span', { class: 'ico', html: icon('plus', 18) })),
          h('span', { class: 'week-name' }, o ? p.note || o.name : 'Plan')
        )
      );
    }
    body.append(h('h2', { class: 'section-title' }, 'The week ahead'), week);

    /* closet at a glance */
    body.append(
      h('h2', { class: 'section-title' }, 'Your closet'),
      h(
        'div',
        { class: 'glance' },
        CATS.map((c) =>
          h(
            'button',
            {
              class: 'glance-item',
              type: 'button',
              onclick: () => {
                setClosetFilter(c.id);
                location.hash = '#/closet';
              },
            },
            h('span', { class: 'ico', html: catIcon(c.id, 28) }),
            h('span', { class: 'glance-count' }, String(itemsIn(c.id).length)),
            h('span', { class: 'glance-label' }, c.label)
          )
        )
      )
    );
  }
  render();

  return {
    update(type) {
      if (type === 'plans' || type === 'outfits' || type === 'items' || type === 'reset') render();
    },
    unmount() {},
  };
}
