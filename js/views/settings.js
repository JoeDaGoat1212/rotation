// Settings: backdrop color, background removal, backups and housekeeping.
import { h, clear, plural, formatBytes } from '../util.js';
import { button, toast, toastError, confirmDialog } from '../ui.js';
import { BACKDROPS, state, setSettings, wipeEverything, itemsIn } from '../store.js';
import { exportBackup, readBackup, restoreBackup } from '../backup.js';
import { hasSamples, loadSamples, removeSamples } from '../samples.js';
import { cutImg } from '../flatlay.js';

export function mount(root) {
  const body = h('div', { class: 'settings' });
  const view = h(
    'section',
    { class: 'view view--settings' },
    h('header', { class: 'view-head' }, h('div', { class: 'view-titles' }, h('h1', { class: 'view-title' }, 'Settings'), h('p', { class: 'view-sub' }, 'Make it yours and keep it safe'))),
    body
  );
  root.append(view);

  const importInput = h('input', { type: 'file', accept: '.rotation,application/octet-stream', class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  view.append(importInput);
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = '';
    if (!file) return;
    try {
      const data = await readBackup(file);
      const ok = await confirmDialog({
        title: 'Restore this backup?',
        message: `It holds ${plural(data.items.length, 'item')} and ${plural(data.outfits.length, 'outfit')}. Restoring replaces everything that is on this device now.`,
        confirm: 'Restore backup',
        danger: true,
      });
      if (!ok) return;
      await restoreBackup(data);
      toast('Backup restored');
    } catch (err) {
      toastError(err, 'The backup couldn’t be restored.');
    }
  });

  function section(title, text, ...kids) {
    return h('section', { class: 'set' }, h('div', { class: 'set-head' }, h('h2', { class: 'set-title' }, title), text ? h('p', { class: 'set-text' }, text) : null), h('div', { class: 'set-body' }, kids));
  }

  let renderSeq = 0;
  async function render() {
    const my = ++renderSeq;
    let usage = '';
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est && est.usage != null) usage = `Using ${formatBytes(est.usage)} on this device.`;
      }
    } catch {
      /* not available */
    }
    if (my !== renderSeq) return;
    clear(body);

    /* backdrop */
    const preview = itemsIn('top')[0] || state.items[0] || null;
    const swatches = h(
      'div',
      { class: 'swatches', role: 'radiogroup', 'aria-label': 'Backdrop color' },
      BACKDROPS.map((b) =>
        h(
          'button',
          {
            class: `swatch ${state.settings.backdrop === b.id ? 'is-on' : ''}`.trim(),
            type: 'button',
            role: 'radio',
            'aria-checked': String(state.settings.backdrop === b.id),
            onclick: () => setSettings({ backdrop: b.id }),
          },
          h('span', { class: 'swatch-chip', style: { background: b.color } }, preview ? cutImg(preview, 'thumb') : null),
          h('span', { class: 'swatch-name' }, b.label)
        )
      )
    );
    body.append(section('Backdrop', 'The color behind every piece. Bone is a soft off-white. Sand and Tan are warmer, so white clothes stand out.', swatches));

    /* background removal */
    const seg = h(
      'div',
      { class: 'seg seg--wide', role: 'radiogroup', 'aria-label': 'Background removal' },
      [
        ['ai', 'Smart'],
        ['quick', 'Quick'],
      ].map(([id, label]) =>
        h(
          'button',
          {
            class: `seg-btn ${state.settings.cutout === id ? 'is-on' : ''}`.trim(),
            type: 'button',
            role: 'radio',
            'aria-checked': String(state.settings.cutout === id),
            onclick: () => setSettings({ cutout: id }),
          },
          label
        )
      )
    );
    body.append(
      section(
        'Background removal',
        'Smart finds the item on its own and handles busy backgrounds. It downloads a 45 MB tool the first time, then runs on this device. Quick needs no download and works best on a plain floor, wall or bed. You can switch for any single photo while adding it.',
        seg
      )
    );

    /* backup */
    body.append(
      section(
        'Backup',
        `Your closet is saved in this browser, on this device only. Download a backup now and then, and use it to move your closet to another phone or computer. ${usage}`.trim(),
        h(
          'div',
          { class: 'btn-row' },
          button('Download a backup', {
            kind: 'primary',
            iconName: 'download',
            onClick: () => {
              try {
                const size = exportBackup();
                toast(`Backup downloaded (${formatBytes(size)})`);
              } catch (err) {
                toastError(err, 'The backup couldn’t be made.');
              }
            },
          }),
          button('Restore from a backup', { kind: 'onpanel', iconName: 'upload', onClick: () => importInput.click() })
        )
      )
    );

    /* samples */
    const samplesOn = hasSamples();
    const sampleBtn = button(samplesOn ? 'Remove the sample closet' : 'Add the sample closet', {
      kind: 'onpanel',
      onClick: async () => {
        sampleBtn.disabled = true;
        try {
          if (hasSamples()) {
            const n = await removeSamples();
            toast(`Removed ${plural(n, 'sample item')}`);
          } else {
            await loadSamples();
            toast('Sample closet added');
          }
        } catch (err) {
          sampleBtn.disabled = false;
          toastError(err, 'That didn’t work.');
        }
      },
    });
    body.append(section('Sample closet', 'Eighteen drawn pieces for trying things out. Removing them also takes them out of any outfits.', sampleBtn));

    /* danger */
    body.append(
      section(
        'Start fresh',
        'Deletes every item, outfit and plan on this device.',
        button('Delete everything', {
          kind: 'danger',
          iconName: 'trash',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Delete everything?',
              message: `This removes ${plural(state.items.length, 'item')}, ${plural(state.outfits.length, 'outfit')} and all calendar plans from this device. It can’t be undone.`,
              confirm: 'Delete everything',
              danger: true,
            });
            if (!ok) return;
            try {
              await wipeEverything();
              toast('Everything was deleted');
            } catch (err) {
              toastError(err, 'Nothing was deleted.');
            }
          },
        })
      )
    );
  }
  render();

  return {
    update(type) {
      if (type === 'items' || type === 'reset' || type === 'settings' || type === 'outfits') render();
    },
    unmount() {},
  };
}
