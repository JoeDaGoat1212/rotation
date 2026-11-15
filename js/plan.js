// Planning: put an outfit on a day, or change what a day holds.
import { h, clear, dateKey, parseKey, addDays, fmtDate, relativeDay, plural } from './util.js';
import { openSheet, button, toast, toastError } from './ui.js';
import { state, outfitById, pieceCount, setPlan, clearPlan, resetDraft, setDraft, loadOutfitIntoDraft } from './store.js';
import { flatlay, outfitCard } from './flatlay.js';

/** Everything about one day: what is planned, a note, and choosing a different outfit. */
export function openDaySheet(date) {
  const day = parseKey(date);
  const body = h('div', { class: 'day' });
  let flushNote = null;

  const draw = () => {
    clear(body);
    const plan = state.plans[date];
    const outfit = plan ? outfitById(plan.outfitId) : null;
    flushNote = null;

    if (outfit) {
      const note = h('input', {
        class: 'field-input',
        type: 'text',
        id: 'day-note',
        maxlength: '80',
        autocomplete: 'off',
        placeholder: 'Game day, dinner, photos…',
        value: plan.note || '',
      });
      const saveNote = async () => {
        if ((state.plans[date]?.note || '') === note.value.trim()) return;
        try {
          await setPlan(date, { note: note.value });
        } catch (err) {
          toastError(err, 'The note couldn’t be saved.');
        }
      };
      flushNote = saveNote;
      note.addEventListener('change', saveNote);
      note.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          note.blur();
        }
      });
      body.append(
        h(
          'div',
          { class: 'day-planned' },
          h('div', { class: 'day-pic' }, flatlay(outfit.slots, { kind: 'image' })),
          h(
            'div',
            { class: 'day-info' },
            h('h3', { class: 'day-name' }, outfit.name),
            h('p', { class: 'hint' }, plural(pieceCount(outfit.slots), 'piece')),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'day-note' }, 'Note for this day'), note),
            h(
              'div',
              { class: 'btn-row' },
              button('Open in Build', {
                kind: 'onpanel',
                iconName: 'tee',
                onClick: () => {
                  loadOutfitIntoDraft(outfit);
                  sheet.close();
                  location.hash = '#/build';
                },
              }),
              button('Take it off this day', {
                kind: 'danger-quiet',
                onClick: async () => {
                  try {
                    await clearPlan(date);
                    draw();
                  } catch (err) {
                    toastError(err, 'The plan couldn’t be removed.');
                  }
                },
              })
            )
          )
        )
      );
    }

    const others = state.outfits.filter((o) => !outfit || o.id !== outfit.id);
    const buildBtn = button('Build a new outfit for this day', {
      kind: outfit ? 'onpanel' : 'primary',
      iconName: 'plus',
      onClick: () => {
        resetDraft();
        setDraft({ planDate: date });
        sheet.close();
        location.hash = '#/build';
      },
    });

    if (others.length) {
      body.append(
        h('h3', { class: 'section-title' }, outfit ? 'Wear something else' : 'Pick an outfit'),
        h(
          'div',
          { class: 'ocard-grid ocard-grid--small' },
          others.map((o) =>
            outfitCard(o, {
              onClick: async () => {
                try {
                  await setPlan(date, { outfitId: o.id });
                  draw();
                  body.scrollTop = 0;
                  sheet.body.scrollTop = 0;
                } catch (err) {
                  toastError(err, 'The outfit couldn’t be planned.');
                }
              },
            })
          )
        )
      );
    } else if (!outfit) {
      body.append(
        h(
          'div',
          { class: 'empty empty--inline' },
          h('h3', { class: 'empty-title' }, 'No saved outfits yet'),
          h('p', { class: 'empty-text' }, 'Build an outfit and it will be planned for this day when you save it.')
        )
      );
    }
    body.append(h('div', { class: 'btn-row btn-row--center' }, buildBtn));
  };

  draw();
  const rel = relativeDay(date);
  const sheet = openSheet({
    title: rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday' ? `${rel}, ${fmtDate.monthDay(day)}` : fmtDate.long(day),
    variant: 'sheet',
    className: 'day-sheet',
    body,
    onClose: () => {
      if (flushNote) flushNote();
    },
  });
  return sheet;
}

function relLower(key) {
  const rel = relativeDay(key);
  return rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday' ? rel.toLowerCase() : rel;
}

/** Choose a day for one outfit. */
export function openPlanSheet({ outfitId }) {
  const outfit = outfitById(outfitId);
  if (!outfit) return null;
  let chosen = dateKey();
  const today = new Date();

  const dateInput = h('input', { class: 'field-input', type: 'date', id: 'plan-date', value: chosen, min: dateKey(addDays(today, -365)) });
  const dayBtns = [];
  const dayRow = h(
    'div',
    { class: 'day-strip', role: 'group', 'aria-label': 'Pick a day' },
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      const key = dateKey(d);
      const b = h(
        'button',
        { class: 'day-chip', type: 'button', onclick: () => choose(key) },
        h('span', { class: 'day-chip-dow' }, i === 0 ? 'Today' : fmtDate.weekdayShort(d)),
        h('span', { class: 'day-chip-num' }, String(d.getDate()))
      );
      dayBtns.push({ key, b });
      return b;
    })
  );
  const hint = h('p', { class: 'hint' });
  const ok = button('Plan it', { kind: 'primary', onClick: () => confirm() });

  function choose(key) {
    if (!key) return;
    chosen = key;
    if (dateInput.value !== key) dateInput.value = key;
    for (const { key: k, b } of dayBtns) {
      const on = k === key;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const existing = state.plans[key];
    const other = existing && existing.outfitId !== outfit.id ? outfitById(existing.outfitId) : null;
    hint.textContent = other
      ? `${relativeDay(key)} already has “${other.name}”. Planning this replaces it.`
      : existing
      ? `Already planned for ${relLower(key)}.`
      : '';
  }
  dateInput.addEventListener('change', () => choose(dateInput.value));
  choose(chosen);

  async function confirm() {
    try {
      await setPlan(chosen, { outfitId: outfit.id });
      sheet.close();
      toast(`Planned “${outfit.name}” for ${relLower(chosen)}`, {
        action: { label: 'See calendar', run: () => (location.hash = '#/calendar') },
      });
    } catch (err) {
      toastError(err, 'The outfit couldn’t be planned.');
    }
  }

  const sheet = openSheet({
    title: `Plan “${outfit.name}”`,
    variant: 'dialog',
    body: h('div', { class: 'plan-form' }, dayRow, h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'plan-date' }, 'Or pick any date'), dateInput), hint),
    foot: [button('Cancel', { kind: 'quiet', onClick: () => sheet.close() }), ok],
  });
  return sheet;
}
