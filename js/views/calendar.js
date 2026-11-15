// Calendar: plan what to wear, a month at a time.
import { h, clear, dateKey, parseKey, addDays, fmtDate, relativeDay, plural } from '../util.js';
import { button } from '../ui.js';
import { icon } from '../icons.js';
import { state, outfitById } from '../store.js';
import { miniFigure } from '../flatlay.js';
import { openDaySheet } from '../plan.js';

let cursor = null; // first day of the month on screen

export function mount(root) {
  if (!cursor) {
    const now = new Date();
    cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const title = h('h1', { class: 'view-title' });
  const sub = h('p', { class: 'view-sub' });
  const grid = h('div', { class: 'cal-grid' });
  const upcoming = h('div', { class: 'upcoming' });

  const move = (n) => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
    render();
  };
  const prevBtn = h('button', { class: 'icon-btn icon-btn--panel', type: 'button', 'aria-label': 'Previous month', html: icon('left', 20), onclick: () => move(-1) });
  const nextBtn = h('button', { class: 'icon-btn icon-btn--panel', type: 'button', 'aria-label': 'Next month', html: icon('right', 20), onclick: () => move(1) });
  const todayBtn = button('This month', {
    kind: 'onpanel',
    onClick: () => {
      const now = new Date();
      cursor = new Date(now.getFullYear(), now.getMonth(), 1);
      render();
    },
  });

  const dows = h(
    'div',
    { class: 'cal-dows', 'aria-hidden': 'true' },
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => h('span', null, d))
  );

  const view = h(
    'section',
    { class: 'view view--calendar' },
    h('header', { class: 'view-head' }, h('div', { class: 'view-titles' }, title, sub), h('div', { class: 'view-actions' }, prevBtn, todayBtn, nextBtn)),
    h('div', { class: 'cal' }, dows, grid),
    upcoming
  );
  root.append(view);

  function render() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const now = new Date();
    const today = dateKey(now);
    title.textContent = fmtDate.month(cursor);
    todayBtn.disabled = year === now.getFullYear() && month === now.getMonth();

    clear(grid);
    const first = new Date(year, month, 1);
    const start = addDays(first, -first.getDay());
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
    let plannedThisMonth = 0;
    for (let i = 0; i < weeks * 7; i++) {
      const d = addDays(start, i);
      const key = dateKey(d);
      const inMonth = d.getMonth() === month;
      const plan = state.plans[key];
      const outfit = plan ? outfitById(plan.outfitId) : null;
      if (outfit && inMonth) plannedThisMonth++;
      const classes = ['cal-cell'];
      if (!inMonth) classes.push('is-out');
      if (key === today) classes.push('is-today');
      if (key < today) classes.push('is-past');
      if (outfit) classes.push('has-plan');
      const label = `${fmtDate.long(d)}${outfit ? `, ${outfit.name}${plan.note ? `, ${plan.note}` : ''}` : ', nothing planned'}`;
      grid.append(
        h(
          'button',
          { class: classes.join(' '), type: 'button', 'aria-label': label, onclick: () => openDaySheet(key) },
          h('span', { class: 'cal-num' }, String(d.getDate())),
          outfit ? h('span', { class: 'cal-plan' }, miniFigure(outfit.slots)) : null,
          outfit ? h('span', { class: 'cal-name' }, plan.note || outfit.name) : null
        )
      );
    }
    sub.textContent = `${year}, ${plannedThisMonth ? plural(plannedThisMonth, 'day') + ' planned' : 'nothing planned yet'}`;

    // Coming up
    clear(upcoming);
    const next = Object.values(state.plans)
      .filter((p) => p.date >= today && outfitById(p.outfitId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    if (next.length) {
      upcoming.append(
        h('h2', { class: 'section-title' }, 'Coming up'),
        h(
          'div',
          { class: 'upcoming-list' },
          next.map((p) => {
            const o = outfitById(p.outfitId);
            return h(
              'button',
              { class: 'upcoming-row', type: 'button', onclick: () => openDaySheet(p.date) },
              h('span', { class: 'upcoming-pic' }, miniFigure(o.slots)),
              h('span', { class: 'upcoming-text' }, h('span', { class: 'upcoming-day' }, relativeDay(p.date)), h('span', { class: 'upcoming-name' }, p.note ? `${o.name}, ${p.note}` : o.name))
            );
          })
        )
      );
    } else if (!state.outfits.length) {
      upcoming.append(
        h(
          'div',
          { class: 'empty empty--inline' },
          h('h2', { class: 'empty-title' }, 'Save an outfit to start planning'),
          h('p', { class: 'empty-text' }, 'Tap any day to plan what you’ll wear. Saved outfits show up there to pick from.'),
          h('div', { class: 'btn-row btn-row--center' }, button('Build an outfit', { kind: 'primary', iconName: 'plus', onClick: () => (location.hash = '#/build') }))
        )
      );
    } else {
      upcoming.append(h('p', { class: 'hint hint--center' }, 'Tap any day to plan an outfit for it.'));
    }
  }
  render();

  return {
    update(type) {
      if (type === 'plans' || type === 'outfits' || type === 'items' || type === 'reset') render();
    },
    unmount() {},
  };
}

export function showMonthOf(key) {
  const d = parseKey(key);
  cursor = new Date(d.getFullYear(), d.getMonth(), 1);
}
