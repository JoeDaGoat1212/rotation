// A small illustrated closet so the app can be tried before any photos are added.
// Every sample item is marked `sample: true` and can be removed in one go from Settings.
import { state, addItems, deleteItems, pieceCount, setDraft } from './store.js';
import { makeCanvas, exportReady } from './cutout.js';

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}">` +
  `<defs><linearGradient id="fold" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".18" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>` +
  `<linearGradient id="drop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient></defs>${body}</svg>`;

function tee({ base, line }) {
  const body = 'M138 18 C160 46 240 46 262 18 L332 44 L392 122 L338 164 L310 134 L312 352 L88 352 L90 134 L62 164 L8 122 L68 44 Z';
  return svg(
    400,
    370,
    `<path d="${body}" fill="${base}"/><path d="${body}" fill="url(#fold)"/><path d="${body}" fill="url(#drop)" opacity=".6"/>` +
      `<path d="M138 18 C160 46 240 46 262 18" fill="none" stroke="${line}" stroke-width="11" stroke-linecap="round"/>` +
      `<path d="M90 134 L106 62 M310 134 L294 62" fill="none" stroke="${line}" stroke-width="2.500" opacity=".8"/>` +
      `<path d="M92 338 H308 M20 118 L64 152 M380 118 L336 152" fill="none" stroke="${line}" stroke-width="2.500" stroke-dasharray="7 5" opacity=".8"/>`
  );
}

function hoodie({ base, hood, line }) {
  const body = 'M150 44 C175 72 265 72 290 44 L352 64 L425 330 L372 348 L338 196 L338 396 L102 396 L102 196 L68 348 L15 330 L88 64 Z';
  return svg(
    440,
    410,
    `<path d="${body}" fill="${base}"/><path d="${body}" fill="url(#fold)"/><path d="${body}" fill="url(#drop)" opacity=".6"/>` +
      `<path d="M150 44 C146 2 294 2 290 44 C265 82 175 82 150 44 Z" fill="${hood}"/>` +
      `<path d="M172 46 C190 66 250 66 268 46" fill="none" stroke="${line}" stroke-width="4"/>` +
      `<path d="M201 68 L198 142 M239 68 L242 142" fill="none" stroke="#EDE9DF" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M152 300 H288 L308 366 H132 Z" fill="none" stroke="${line}" stroke-width="3"/>` +
      `<path d="M102 374 H338" fill="none" stroke="${line}" stroke-width="3"/>` +
      `<path d="M102 196 L112 96 M338 196 L328 96 M24 318 L76 334 M416 318 L364 334" fill="none" stroke="${line}" stroke-width="2.500" opacity=".85"/>`
  );
}

function pants({ base, line, cargo = false }) {
  const body = 'M40 10 H240 L262 428 H160 L140 132 L120 428 H18 Z';
  return svg(
    280,
    440,
    `<path d="${body}" fill="${base}"/><path d="${body}" fill="url(#fold)"/><path d="${body}" fill="url(#drop)" opacity=".7"/>` +
      `<path d="M40 34 H240" fill="none" stroke="${line}" stroke-width="3"/>` +
      `<path d="M70 10 V34 M140 10 V34 M210 10 V34" fill="none" stroke="${line}" stroke-width="6"/>` +
      `<path d="M140 34 V104 C140 118 132 124 122 124" fill="none" stroke="${line}" stroke-width="3"/>` +
      `<path d="M50 34 C54 68 76 84 100 84 M230 34 C226 68 204 84 180 84" fill="none" stroke="${line}" stroke-width="3"/>` +
      `<path d="M20 412 H118 M162 412 H260" fill="none" stroke="${line}" stroke-width="2.500" stroke-dasharray="7 5"/>` +
      (cargo
        ? `<path d="M30 190 H92 V268 H27 Z M188 190 H250 L253 268 H188 Z" fill="${base}" stroke="${line}" stroke-width="3"/><path d="M30 208 H92 M188 208 H251" fill="none" stroke="${line}" stroke-width="3"/>`
        : `<path d="M36 120 L24 400 M244 120 L256 400" fill="none" stroke="${line}" stroke-width="2" opacity=".6"/>`)
  );
}

function socks({ base, line, stripe }) {
  const one = 'M40 12 H98 L102 118 C104 138 118 150 140 162 L160 173 C178 183 182 205 168 218 C154 231 132 230 114 220 L66 190 C48 178 38 160 38 138 Z';
  const sock = (dx) =>
    `<g transform="translate(${dx} 0)"><path d="${one}" fill="${base}" stroke="${line}" stroke-width="2"/><path d="${one}" fill="url(#drop)" opacity=".7"/>` +
    `<path d="M40 40 H99" fill="none" stroke="${line}" stroke-width="3"/><path d="M40 54 H100 M40 66 H100" fill="none" stroke="${stripe}" stroke-width="6"/>` +
    `<path d="M136 160 C150 176 152 200 140 222" fill="none" stroke="${line}" stroke-width="2.500"/></g>`;
  return svg(340, 244, sock(138) + sock(0));
}

function sneakers({ base, sole, accent, line, lace }) {
  const shoe = (dx, dy) =>
    `<g transform="translate(${dx} ${dy})">` +
    `<path d="M14 132 C12 96 22 66 52 52 L96 44 C104 70 132 92 170 104 L250 124 C282 130 304 132 306 134 L306 140 H14 Z" fill="${base}" stroke="${line}" stroke-width="2"/>` +
    `<path d="M14 132 C13 110 18 90 28 72 L46 80 C38 96 36 114 38 132 Z" fill="${accent}"/>` +
    `<path d="M72 132 C92 104 122 98 152 112 L140 132 Z" fill="${accent}" opacity=".55"/>` +
    `<path d="M52 52 C60 28 86 24 96 44" fill="none" stroke="${line}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M112 68 L130 56 M130 80 L148 68 M148 91 L166 80 M166 101 L184 91" fill="none" stroke="${lace}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M236 121 C248 108 274 110 300 132" fill="none" stroke="${line}" stroke-width="2.500"/>` +
    `<path d="M10 134 H308 C316 134 320 142 316 152 C312 162 302 166 292 166 H28 C14 166 6 154 10 134 Z" fill="${sole}" stroke="${line}" stroke-width="2"/>` +
    `<path d="M16 150 H314" fill="none" stroke="${line}" stroke-width="1.500" opacity=".7"/></g>`;
  return svg(420, 236, shoe(92, 8) + shoe(4, 62));
}

function bottle({ glass, cap }) {
  return svg(
    220,
    316,
    `<rect x="78" y="8" width="64" height="64" rx="7" fill="${cap}"/><rect x="78" y="8" width="64" height="64" rx="7" fill="url(#fold)"/>` +
      `<rect x="90" y="72" width="40" height="20" fill="#C9B37A"/>` +
      `<rect x="30" y="92" width="160" height="214" rx="24" fill="${glass}"/><rect x="30" y="92" width="160" height="214" rx="24" fill="url(#fold)"/>` +
      `<rect x="46" y="110" width="16" height="178" rx="8" fill="#fff" opacity=".24"/>` +
      `<rect x="66" y="168" width="88" height="66" rx="4" fill="#F4EFE3"/>` +
      `<path d="M80 190 H140 M88 206 H132" fill="none" stroke="#3A3A3A" stroke-width="4" stroke-linecap="round"/>`
  );
}

function chain({ metal, dark }) {
  return svg(
    320,
    300,
    `<path d="M40 16 C40 236 280 236 280 16" fill="none" stroke="${dark}" stroke-width="3"/>` +
      `<path d="M40 16 C40 236 280 236 280 16" fill="none" stroke="${metal}" stroke-width="10" stroke-dasharray="2 11" stroke-linecap="round"/>` +
      `<rect x="150" y="186" width="20" height="56" rx="5" fill="${metal}" stroke="${dark}" stroke-width="2"/>` +
      `<circle cx="160" cy="184" r="7" fill="none" stroke="${dark}" stroke-width="3"/>`
  );
}

function watch({ strap, watchCase, dial }) {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const x1 = 100 + Math.sin(a) * 50;
    const y1 = 190 - Math.cos(a) * 50;
    const x2 = 100 + Math.sin(a) * 58;
    const y2 = 190 - Math.cos(a) * 58;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join(' ');
  return svg(
    200,
    380,
    `<rect x="64" y="6" width="72" height="368" rx="16" fill="${strap}"/><rect x="64" y="6" width="72" height="368" rx="16" fill="url(#fold)"/>` +
      `<path d="M74 60 H126 M74 320 H126" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="3"/>` +
      `<rect x="172" y="179" width="16" height="22" rx="4" fill="${watchCase}"/>` +
      `<circle cx="100" cy="190" r="78" fill="${watchCase}"/><circle cx="100" cy="190" r="78" fill="url(#drop)"/>` +
      `<circle cx="100" cy="190" r="63" fill="${dial}"/>` +
      `<path d="${ticks}" fill="none" stroke="#E9E6DE" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M100 190 V150 M100 190 L130 204" fill="none" stroke="#F3F0E8" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="190" r="5" fill="#E0A030"/>`
  );
}

function cap({ base, brim, line }) {
  return svg(
    380,
    240,
    `<path d="M70 172 C62 52 318 52 310 172 Z" fill="${base}"/><path d="M70 172 C62 52 318 52 310 172 Z" fill="url(#fold)"/>` +
      `<path d="M190 84 C185 118 185 150 190 172 M120 110 C140 132 150 154 152 172 M260 110 C240 132 230 154 228 172" fill="none" stroke="${line}" stroke-width="2.500"/>` +
      `<circle cx="190" cy="80" r="8" fill="${line}"/>` +
      `<path d="M44 168 C120 150 290 152 352 196 C286 220 130 212 46 192 C32 188 30 172 44 168 Z" fill="${brim}"/>` +
      `<path d="M70 184 C150 196 260 200 330 196" fill="none" stroke="${line}" stroke-width="2.500" stroke-dasharray="7 5"/>`
  );
}

const SAMPLE_SET = [
  { name: 'White tee', cat: 'top', color: 'White', art: () => tee({ base: '#F5F3EC', line: '#CCC7BB' }) },
  { name: 'Black tee', cat: 'top', color: 'Black', art: () => tee({ base: '#26272D', line: '#474952' }) },
  { name: 'Slate tee', cat: 'top', color: 'Blue', art: () => tee({ base: '#6F87A8', line: '#566E8E' }) },
  { name: 'Grey hoodie', cat: 'layer', color: 'Grey', art: () => hoodie({ base: '#9C9FA7', hood: '#888B93', line: '#74777F' }) },
  { name: 'Black hoodie', cat: 'layer', color: 'Black', art: () => hoodie({ base: '#2A2B31', hood: '#222328', line: '#4A4C55' }) },
  { name: 'Indigo jeans', cat: 'bottom', color: 'Blue', art: () => pants({ base: '#2F4978', line: '#1F355C' }) },
  { name: 'Black jeans', cat: 'bottom', color: 'Black', art: () => pants({ base: '#27282D', line: '#45474F' }) },
  { name: 'Khaki cargos', cat: 'bottom', color: 'Khaki', art: () => pants({ base: '#B9A57F', line: '#98855F', cargo: true }) },
  { name: 'White crew socks', cat: 'socks', color: 'White', art: () => socks({ base: '#F4F2EC', line: '#C9C4B8', stripe: '#2F4978' }) },
  { name: 'Black socks', cat: 'socks', color: 'Black', art: () => socks({ base: '#232429', line: '#42444C', stripe: '#8C8F98' }) },
  { name: 'White sneakers', cat: 'shoes', color: 'White', art: () => sneakers({ base: '#F6F4EE', sole: '#FBFAF6', accent: '#CFCABE', line: '#B5B0A4', lace: '#DAD6CC' }) },
  { name: 'Black sneakers', cat: 'shoes', color: 'Black', art: () => sneakers({ base: '#232429', sole: '#F1EEE6', accent: '#C8402F', line: '#3F4149', lace: '#EDE9DF' }) },
  { name: 'Blue bottle', cat: 'fragrance', color: 'Blue', art: () => bottle({ glass: '#2F4F86', cap: '#1B1C20' }) },
  { name: 'Amber bottle', cat: 'fragrance', color: 'Amber', art: () => bottle({ glass: '#B5742A', cap: '#2A2118' }) },
  { name: 'Gold chain', cat: 'jewelry', color: 'Gold', art: () => chain({ metal: '#CDA549', dark: '#9A7A2E' }) },
  { name: 'Silver chain', cat: 'jewelry', color: 'Silver', art: () => chain({ metal: '#A9AEB6', dark: '#6C7179' }) },
  { name: 'Steel watch', cat: 'accessory', color: 'Black', art: () => watch({ strap: '#2A2A2E', watchCase: '#B9BDC4', dial: '#111318' }) },
  { name: 'Black cap', cat: 'accessory', color: 'Black', art: () => cap({ base: '#24252A', brim: '#1B1C20', line: '#484A53' }) },
];

async function draw(svgText) {
  const img = new Image();
  img.decoding = 'async';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('A sample drawing could not be loaded.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  });
  const w = img.naturalWidth || 800;
  const hgt = img.naturalHeight || 800;
  const canvas = makeCanvas(w, hgt);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, hgt);
  return canvas;
}

export const hasSamples = () => state.items.some((i) => i.sample);

export async function loadSamples() {
  const list = [];
  for (const s of SAMPLE_SET) {
    const canvas = await draw(s.art());
    const out = await exportReady(canvas);
    list.push({ name: s.name, cat: s.cat, color: s.color, sample: true, ...out });
  }
  const items = await addItems(list);
  // Put a first outfit on the board so there is something to play with straight away.
  if (!pieceCount(state.draft.slots) && !state.draft.outfitId) {
    const find = (name) => (items.find((i) => i.name === name) || {}).id || null;
    setDraft({
      slots: {
        ...state.draft.slots,
        top: find('White tee'),
        bottom: find('Indigo jeans'),
        socks: find('White crew socks'),
        shoes: find('White sneakers'),
        fragrance: find('Blue bottle'),
      },
    });
  }
  return items;
}

export async function removeSamples() {
  const ids = state.items.filter((i) => i.sample).map((i) => i.id);
  await deleteItems(ids);
  return ids.length;
}
