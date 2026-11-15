// The cutout studio: add photos to the closet (one or many) or re-cut an existing item.
import { h, clear, plural, debounce } from './util.js';
import { openSheet, button, toast, toastError, confirmDialog } from './ui.js';
import { icon, catIcon } from './icons.js';
import { CATS, CAT, state, addItem, updateItem, setSettings } from './store.js';
import { loadSource, quickPrepare, quickMask, fullMask, aiMask, compose, exportCutout, makeCanvas } from './cutout.js';

let aiFailedThisSession = false;
let aiFallbackAnnounced = false;

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function makeMask(src, prep, mode, sens, clearGaps, onProgress) {
  if (mode === 'ai') {
    try {
      const r = await aiMask(src, onProgress);
      aiFailedThisSession = false;
      return { mask: r.mask, coverage: r.coverage, mode: 'ai' };
    } catch (err) {
      console.warn('Smart cutout unavailable, using Quick cutout:', err);
      aiFailedThisSession = true;
      const r = quickMask(src, prep, sens, { clearGaps });
      return { mask: r.mask, coverage: r.coverage, mode: 'quick', fellBack: true };
    }
  }
  if (mode === 'quick') {
    const r = quickMask(src, prep, sens, { clearGaps });
    return { mask: r.mask, coverage: r.coverage, mode: 'quick' };
  }
  return { mask: fullMask(src), coverage: 1, mode: 'none' };
}

function defaultMode(prep) {
  if (prep.hasAlpha) return 'none';
  if (state.settings.cutout === 'quick' || aiFailedThisSession) return 'quick';
  return 'ai';
}

/** Add one or more photos to the closet. */
export function startAdd(files, { presetCat = null, onSaved = null } = {}) {
  const list = [...files].filter((f) => f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || '')));
  if (!list.length) {
    toast('Those files aren’t pictures. Choose photos of your clothes.', { tone: 'error' });
    return null;
  }
  return openStudio({ queue: list.map((file) => ({ blob: file })), presetCat, onSaved });
}

let fileInput = null;

/** Opens the photo picker (camera or library on phones), then the studio. */
export function pickPhotos(opts = {}) {
  if (!fileInput) {
    fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden', tabindex: '-1', 'aria-hidden': 'true' });
    document.body.append(fileInput);
  }
  fileInput.onchange = () => {
    const files = [...(fileInput.files || [])];
    fileInput.value = '';
    if (files.length) startAdd(files, opts);
  };
  fileInput.click();
}

/** Re-cut the background of an item that is already in the closet. */
export function recutItem(item) {
  const blob = item.source || item.image;
  return openStudio({ queue: [{ blob }], item });
}

function openStudio({ queue, presetCat = null, onSaved = null, item = null }) {
  const adding = !item;
  let index = 0;
  let token = 0;
  let saving = false;
  const saved = [];

  const ed = {
    src: null,
    prep: null,
    mask: null,
    mode: 'ai',
    sens: 40,
    clearGaps: false,
    tool: null, // 'erase' | 'restore'
    brush: 34,
    undo: [],
    busy: true,
    failed: false,
  };
  const form = {
    cat: CAT[presetCat] ? presetCat : state.settings.lastCat || 'top',
    name: '',
    brand: '',
    color: '',
    notes: '',
  };

  /* ----- stage ----- */
  const view = h('canvas', { class: 'studio-canvas', width: 4, height: 4, 'aria-label': 'Cutout preview' });
  const scratch = makeCanvas(4, 4);
  const cursor = h('div', { class: 'brush-cursor', hidden: true });
  const statusText = h('p', { class: 'studio-status-text' }, 'Opening photo…');
  const statusBar = h('div', { class: 'progress', hidden: true }, h('div', { class: 'progress-fill' }));
  const useQuickBtn = button('Use Quick cutout instead', { kind: 'onlight', onClick: () => skipToQuick() });
  useQuickBtn.hidden = true;
  const status = h('div', { class: 'studio-status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), statusText, statusBar, useQuickBtn);
  const errorBox = h('div', { class: 'studio-error', hidden: true });
  const stage = h('div', { class: 'studio-stage' }, view, cursor, status, errorBox);

  /* ----- background controls ----- */
  const modeBtns = {};
  const modeRow = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Background removal' },
    [
      ['ai', 'Smart'],
      ['quick', 'Quick'],
      ['none', 'Off'],
    ].map(([id, label]) => {
      const b = h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': 'false', onclick: () => chooseMode(id) }, label);
      modeBtns[id] = b;
      return b;
    })
  );
  const modeHint = h('p', { class: 'hint' });

  const sensInput = h('input', { class: 'range', type: 'range', min: '0', max: '100', step: '1', value: '40', id: 'studio-sens' });
  const gapsInput = h('input', { type: 'checkbox', id: 'studio-gaps' });
  const quickBox = h(
    'div',
    { class: 'studio-quick', hidden: true },
    h('label', { class: 'field-label', for: 'studio-sens' }, 'How much to remove'),
    h('div', { class: 'range-row' }, h('span', { class: 'range-end' }, 'Less'), sensInput, h('span', { class: 'range-end' }, 'More')),
    h('label', { class: 'check', for: 'studio-gaps' }, gapsInput, h('span', null, 'Also clear gaps inside the item (chains, straps)'))
  );

  const requick = debounce(() => {
    if (ed.busy || ed.mode !== 'quick' || !ed.src) return;
    const r = quickMask(ed.src, ed.prep, ed.sens, { clearGaps: ed.clearGaps });
    ed.mask = r.mask;
    ed.undo = [];
    syncTools();
    showCoverageHint(r.coverage);
    redraw();
  }, 80);
  sensInput.addEventListener('input', () => {
    ed.sens = Number(sensInput.value);
    requick();
  });
  gapsInput.addEventListener('change', () => {
    ed.clearGaps = gapsInput.checked;
    requick();
  });

  /* ----- touch up ----- */
  const eraseBtn = h('button', { class: 'tool-btn', type: 'button', 'aria-pressed': 'false', onclick: () => setTool('erase') }, h('span', { class: 'ico', html: icon('eraser', 18) }), 'Erase');
  const restoreBtn = h('button', { class: 'tool-btn', type: 'button', 'aria-pressed': 'false', onclick: () => setTool('restore') }, h('span', { class: 'ico', html: icon('brush', 18) }), 'Restore');
  const undoBtn = h('button', { class: 'tool-btn', type: 'button', disabled: true, onclick: () => undo() }, h('span', { class: 'ico', html: icon('undo', 18) }), 'Undo');
  const brushInput = h('input', { class: 'range', type: 'range', min: '8', max: '110', step: '1', value: String(ed.brush), id: 'studio-brush' });
  brushInput.addEventListener('input', () => {
    ed.brush = Number(brushInput.value);
  });
  const brushRow = h('div', { class: 'range-row', hidden: true }, h('label', { class: 'range-end', for: 'studio-brush' }, 'Brush size'), brushInput);
  const touchBox = h(
    'div',
    { class: 'studio-touch' },
    h('p', { class: 'field-label' }, 'Touch up'),
    h('div', { class: 'tool-row' }, eraseBtn, restoreBtn, undoBtn),
    brushRow
  );

  /* ----- item details (adding only) ----- */
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
  const nameInput = h('input', { class: 'field-input', type: 'text', id: 'studio-name', maxlength: '60', autocomplete: 'off', placeholder: 'Name it, or leave it blank' });
  const brandInput = h('input', { class: 'field-input', type: 'text', id: 'studio-brand', maxlength: '40', autocomplete: 'off' });
  const colorInput = h('input', { class: 'field-input', type: 'text', id: 'studio-color', maxlength: '30', autocomplete: 'off' });
  const notesInput = h('textarea', { class: 'field-input', id: 'studio-notes', rows: '2', maxlength: '300' });
  const detailsBox = h(
    'details',
    { class: 'more' },
    h('summary', null, 'Brand, color and notes'),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'studio-brand' }, 'Brand'), brandInput),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'studio-color' }, 'Color'), colorInput),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'studio-notes' }, 'Notes'), notesInput)
  );
  const formBox = adding
    ? h(
        'div',
        { class: 'studio-form' },
        h('p', { class: 'field-label' }, 'What is it?'),
        catRow,
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'studio-name' }, 'Name'), nameInput),
        detailsBox
      )
    : null;

  const side = h(
    'div',
    { class: 'studio-side' },
    formBox ? h('div', { class: 'studio-block' }, formBox) : null,
    h('div', { class: 'studio-block' }, h('p', { class: 'field-label' }, 'Background removal'), modeRow, modeHint, quickBox),
    h('div', { class: 'studio-block' }, touchBox)
  );

  const saveBtn = button(adding ? 'Save to closet' : 'Save cutout', { kind: 'primary', onClick: () => save() });
  const skipBtn = adding && queue.length > 1 ? button('Skip this photo', { kind: 'quiet', onClick: () => next() }) : null;
  const cancelBtn = !adding ? button('Cancel', { kind: 'quiet', onClick: () => sheet.close() }) : null;

  const sheet = openSheet({
    title: titleText(),
    variant: 'wide',
    className: 'studio-sheet',
    body: h('div', { class: 'studio' }, stage, side),
    foot: [skipBtn, cancelBtn, saveBtn],
    canClose: async () => {
      if (!adding) return true;
      const left = queue.length - index;
      if (left <= 0 || (left === 1 && !ed.src && !ed.failed)) return true;
      return confirmDialog({
        title: 'Stop adding photos?',
        message: left === 1 ? 'This photo hasn’t been saved yet.' : `${left} photos haven’t been saved yet.`,
        confirm: 'Stop adding',
        cancel: 'Keep going',
        danger: true,
      });
    },
    onClose: () => {
      token++;
      for (const entry of queue) {
        entry.base = null;
        entry.cut = null;
        entry.onProgress = null;
      }
      if (adding && saved.length) toast(`Added ${plural(saved.length, 'item')} to your closet`);
    },
  });

  function titleText() {
    if (!adding) return 'Re-cut background';
    return queue.length > 1 ? `Add to closet, photo ${Math.min(index + 1, queue.length)} of ${queue.length}` : 'Add to closet';
  }

  /* ----- form wiring ----- */
  function setCat(id) {
    form.cat = id;
    for (const [cid, b] of Object.entries(catBtns)) {
      const on = cid === id;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('is-on', on);
    }
  }
  if (adding) {
    setCat(form.cat);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
  }

  /* ----- queue preparation (the next photo is cut out while you finish this one) ----- */
  function ensure(i) {
    const entry = queue[i];
    if (!entry || entry.base) return entry;
    entry.base = (async () => {
      const src = await loadSource(entry.blob);
      await tick(10);
      const prep = quickPrepare(src);
      return { src, prep };
    })();
    entry.cut = entry.base.then(({ src, prep }) => {
      const mode = !adding && !item.source ? 'none' : defaultMode(prep);
      return makeMask(src, prep, mode, prep.suggested, false, (m) => entry.onProgress && entry.onProgress(m));
    });
    entry.base.catch(() => {});
    entry.cut.catch(() => {});
    return entry;
  }

  async function show(i) {
    const my = ++token;
    index = i;
    sheet.setTitle(titleText());
    ed.src = null;
    ed.prep = null;
    ed.mask = null;
    ed.undo = [];
    ed.failed = false;
    setTool(null);
    errorBox.hidden = true;
    view.hidden = false;
    view.width = 4;
    view.height = 4;
    setBusy('Opening photo…');
    const entry = ensure(i);

    let base;
    try {
      base = await entry.base;
    } catch (err) {
      if (my !== token) return;
      showError(err);
      return;
    }
    if (my !== token) return;
    ed.src = base.src;
    ed.prep = base.prep;
    ed.sens = base.prep.suggested;
    ed.clearGaps = false;
    sensInput.value = String(ed.sens);
    gapsInput.checked = false;
    view.width = ed.src.width;
    view.height = ed.src.height;
    scratch.width = ed.src.width;
    scratch.height = ed.src.height;
    drawGhost();

    const wantsAI = (!adding && !item.source ? 'none' : defaultMode(base.prep)) === 'ai';
    setBusy('Cutting out the background…', { ai: wantsAI });
    entry.onProgress = (m) => {
      if (my === token) onProgress(m);
    };
    let cut;
    try {
      cut = await entry.cut;
    } catch (err) {
      if (my !== token) return;
      showError(err);
      return;
    }
    if (my !== token) return;
    applyCut(cut);
    if (adding) ensure(i + 1);
  }

  function onProgress(m) {
    if (m.type === 'progress') {
      statusText.textContent = `Getting Smart cutout ready. One-time download, ${m.percent}%`;
      statusBar.hidden = false;
      statusBar.firstChild.style.width = `${m.percent}%`;
    } else if (m.type === 'stage') {
      statusText.textContent = 'Cutting out the background…';
      statusBar.hidden = true;
    }
  }

  function setBusy(text, { ai = false } = {}) {
    ed.busy = true;
    status.hidden = false;
    statusText.textContent = text;
    statusBar.hidden = true;
    statusBar.firstChild.style.width = '0%';
    useQuickBtn.hidden = !ai;
    saveBtn.disabled = true;
    stage.classList.add('is-busy');
    syncTools();
  }

  function clearBusy() {
    ed.busy = false;
    status.hidden = true;
    saveBtn.disabled = false;
    stage.classList.remove('is-busy');
    syncTools();
  }

  function showError(err) {
    ed.busy = false;
    ed.failed = true;
    status.hidden = true;
    stage.classList.remove('is-busy');
    view.hidden = true;
    clear(errorBox);
    errorBox.append(
      h('p', { class: 'studio-error-title' }, 'This photo couldn’t be opened'),
      h('p', null, (err && err.message) || 'Try a different picture.'),
      adding && queue.length > 1 && index < queue.length - 1 ? button('Go to the next photo', { kind: 'onlight', onClick: () => next() }) : null
    );
    errorBox.hidden = false;
    saveBtn.disabled = true;
    syncTools();
  }

  function applyCut(cut) {
    ed.mask = cut.mask;
    ed.mode = cut.mode;
    ed.undo = [];
    for (const [id, b] of Object.entries(modeBtns)) {
      const on = id === ed.mode;
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
    }
    quickBox.hidden = ed.mode !== 'quick';
    modeHint.textContent =
      ed.mode === 'ai'
        ? 'Finds the item on its own. Works on busy backgrounds.'
        : ed.mode === 'quick'
        ? 'Removes the color around the edges of the photo. Best on a plain floor, wall or bed.'
        : 'The photo is kept as it is.';
    if (cut.fellBack && !aiFallbackAnnounced) {
      aiFallbackAnnounced = true;
      toast('Smart cutout isn’t available right now, so Quick cutout was used. You can try Smart again any time.', { duration: 6500 });
    }
    if (ed.mode === 'quick') showCoverageHint(cut.coverage);
    clearBusy();
    redraw();
  }

  function showCoverageHint(coverage) {
    if (ed.mode !== 'quick') return;
    if (coverage < 0.02) modeHint.textContent = 'Almost everything was removed. Move the slider toward Less, or try Smart.';
    else if (coverage > 0.93) modeHint.textContent = 'Barely anything was removed. Move the slider toward More, or try Smart.';
    else modeHint.textContent = 'Removes the color around the edges of the photo. Best on a plain floor, wall or bed.';
  }

  async function chooseMode(mode) {
    if (!ed.src || saving) return;
    const my = ++token;
    setTool(null);
    setBusy('Cutting out the background…', { ai: mode === 'ai' });
    await tick();
    if (my !== token) return;
    const cut = await makeMask(ed.src, ed.prep, mode, ed.sens, ed.clearGaps, (m) => {
      if (my === token) onProgress(m);
    });
    if (my !== token) return;
    applyCut(cut);
    if (adding) ensure(index + 1);
  }

  async function skipToQuick() {
    if (!ed.src) return;
    const my = ++token;
    setBusy('Cutting out the background…');
    await tick();
    if (my !== token) return;
    const cut = await makeMask(ed.src, ed.prep, 'quick', ed.sens, ed.clearGaps, null);
    if (my !== token) return;
    applyCut(cut);
    if (adding) ensure(index + 1);
  }

  /* ----- drawing ----- */
  function drawGhost() {
    const ctx = view.getContext('2d');
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(ed.src, 0, 0);
    ctx.globalAlpha = 1;
  }

  let raf = 0;
  function redraw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!ed.src || !ed.mask) return;
      const ctx = view.getContext('2d');
      ctx.clearRect(0, 0, view.width, view.height);
      if (ed.tool) {
        ctx.globalAlpha = 0.28;
        ctx.drawImage(ed.src, 0, 0);
        ctx.globalAlpha = 1;
      }
      compose(ed.src, ed.mask, scratch);
      ctx.drawImage(scratch, 0, 0);
    });
  }

  /* ----- brushes ----- */
  function setTool(tool) {
    ed.tool = ed.tool === tool ? null : tool;
    eraseBtn.setAttribute('aria-pressed', String(ed.tool === 'erase'));
    eraseBtn.classList.toggle('is-on', ed.tool === 'erase');
    restoreBtn.setAttribute('aria-pressed', String(ed.tool === 'restore'));
    restoreBtn.classList.toggle('is-on', ed.tool === 'restore');
    brushRow.hidden = !ed.tool;
    stage.classList.toggle('is-brushing', !!ed.tool);
    if (!ed.tool) cursor.hidden = true;
    redraw();
  }

  function syncTools() {
    const off = ed.busy || !ed.mask;
    eraseBtn.disabled = off;
    restoreBtn.disabled = off;
    undoBtn.disabled = off || !ed.undo.length;
    for (const b of Object.values(modeBtns)) b.disabled = !ed.src || ed.failed;
    sensInput.disabled = off;
    gapsInput.disabled = off;
  }

  function pushUndo() {
    const copy = makeCanvas(ed.mask.width, ed.mask.height);
    copy.getContext('2d').drawImage(ed.mask, 0, 0);
    ed.undo.push(copy);
    if (ed.undo.length > 8) ed.undo.shift();
    undoBtn.disabled = false;
  }

  function undo() {
    const prev = ed.undo.pop();
    if (!prev || !ed.mask) return;
    const mctx = ed.mask.getContext('2d');
    mctx.globalCompositeOperation = 'copy';
    mctx.drawImage(prev, 0, 0);
    mctx.globalCompositeOperation = 'source-over';
    undoBtn.disabled = !ed.undo.length;
    redraw();
  }

  function point(e) {
    const r = view.getBoundingClientRect();
    const sx = view.width / r.width;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * (view.height / r.height), scale: sx };
  }

  function stroke(a, b) {
    const mctx = ed.mask.getContext('2d');
    mctx.save();
    mctx.globalCompositeOperation = ed.tool === 'erase' ? 'destination-out' : 'source-over';
    mctx.strokeStyle = '#000';
    mctx.fillStyle = '#000';
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    mctx.lineWidth = ed.brush * b.scale;
    mctx.beginPath();
    mctx.moveTo(a.x, a.y);
    mctx.lineTo(b.x, b.y);
    mctx.stroke();
    mctx.beginPath();
    mctx.arc(b.x, b.y, (ed.brush * b.scale) / 2, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
    redraw();
  }

  let drawing = false;
  let last = null;
  function moveCursor(e) {
    if (!ed.tool || e.pointerType === 'touch') {
      cursor.hidden = true;
      return;
    }
    const s = stage.getBoundingClientRect();
    cursor.hidden = false;
    cursor.style.width = `${ed.brush}px`;
    cursor.style.height = `${ed.brush}px`;
    cursor.style.transform = `translate(${e.clientX - s.left - ed.brush / 2}px, ${e.clientY - s.top - ed.brush / 2}px)`;
  }
  view.addEventListener('pointerdown', (e) => {
    if (!ed.tool || ed.busy || !ed.mask) return;
    e.preventDefault();
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pushUndo();
    drawing = true;
    last = point(e);
    stroke(last, last);
  });
  view.addEventListener('pointermove', (e) => {
    moveCursor(e);
    if (!drawing) return;
    e.preventDefault();
    const p = point(e);
    stroke(last, p);
    last = p;
  });
  const endStroke = () => {
    drawing = false;
    last = null;
  };
  view.addEventListener('pointerup', endStroke);
  view.addEventListener('pointercancel', endStroke);
  view.addEventListener('pointerleave', () => {
    cursor.hidden = true;
  });

  /* ----- saving ----- */
  async function save() {
    if (saving || ed.busy || !ed.mask || !ed.src) return;
    saving = true;
    saveBtn.disabled = true;
    const label = saveBtn.querySelector('.btn-label');
    const labelText = label.textContent;
    label.textContent = 'Saving…';
    try {
      const out = await exportCutout(ed.src, ed.mask, { keepSource: adding });
      if (adding) {
        const created = await addItem({
          cat: form.cat,
          name: nameInput.value,
          brand: brandInput.value,
          color: colorInput.value,
          notes: notesInput.value,
          ...out,
        });
        saved.push(created);
        setSettings({ lastCat: form.cat });
        if (onSaved) onSaved(created);
        label.textContent = labelText;
        saving = false;
        next();
      } else {
        await updateItem(item.id, { image: out.image, thumb: out.thumb, ar: out.ar });
        label.textContent = labelText;
        saving = false;
        sheet.close();
        toast('Cutout saved');
      }
    } catch (err) {
      label.textContent = labelText;
      saving = false;
      saveBtn.disabled = false;
      toastError(err, 'The item couldn’t be saved.');
    }
  }

  function next() {
    const entry = queue[index];
    if (entry) {
      entry.base = null;
      entry.cut = null;
      entry.onProgress = null;
      entry.done = true;
    }
    if (index + 1 >= queue.length) {
      index = queue.length;
      sheet.close();
      return;
    }
    nameInput.value = '';
    brandInput.value = '';
    colorInput.value = '';
    notesInput.value = '';
    detailsBox.open = false;
    show(index + 1);
  }

  show(0);
  return sheet;
}
