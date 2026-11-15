// Hand-drawn line icons. `icon(name)` returns an SVG string; `iconEl(name)` returns an element.

const UI = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  hanger: '<path d="M12 9V7.9c0-.6.3-1 .8-1.4a2.3 2.3 0 1 0-3.1-2.1"/><path d="M12 9 3.4 15.2c-1.1.8-.5 2.5.8 2.5h15.6c1.3 0 1.9-1.7.8-2.5L12 9z"/>',
  tee: '<path d="M8.6 3.5c.8 1.6 6 1.6 6.800 0l4.300 1.900 2.500 4.400-3 1.900-1.500-1.500v10.300H6.300V10.200L4.800 11.700l-3-1.900L4.300 5.400z"/>',
  bookmark: '<path d="M6.500 3.500h11a1 1 0 0 1 1 1v16l-6.500-4.300-6.500 4.300v-16a1 1 0 0 1 1-1z"/>',
  calendar: '<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="M14.500 5.500 8 12l6.500 6.500"/>',
  right: '<path d="M9.500 5.500 16 12l-6.500 6.500"/>',
  shuffle: '<path d="M3 7h3.500c2 0 3.300.9 4.300 2.500l2.400 5c1 1.600 2.300 2.500 4.300 2.500H21"/><path d="M3 17h3.500c1.200 0 2.100-.3 2.900-.9M21 7h-3.500c-1.200 0-2.100.3-2.900.9"/><path d="m18.500 4.500 2.500 2.500-2.500 2.500M18.500 14.500 21 17l-2.500 2.500"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-12M10 11v5.500M14 11v5.500"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m15.500 15.500 4.500 4.500"/>',
  camera: '<path d="M4.500 8h3l1.500-2.500h6L16.500 8h3a1.500 1.500 0 0 1 1.500 1.500v8a1.500 1.500 0 0 1-1.500 1.500h-15A1.500 1.500 0 0 1 3 17.500v-8A1.500 1.500 0 0 1 4.500 8z"/><circle cx="12" cy="13.200" r="3.300"/>',
  pencil: '<path d="M4 20l1-4.500L16.500 4a1.800 1.800 0 0 1 2.500 0l1 1a1.800 1.800 0 0 1 0 2.500L8.500 19 4 20z"/><path d="m14.500 6 3.500 3.500"/>',
  undo: '<path d="M8 5 4 9l4 4"/><path d="M4 9h10a5.500 5.500 0 0 1 0 11H9"/>',
  eraser: '<path d="m4.500 14.500 9-9a2 2 0 0 1 2.800 0l3.200 3.200a2 2 0 0 1 0 2.800l-7.500 7.500H7.500l-3-3a1.100 1.100 0 0 1 0-1.500z"/><path d="m9.500 9.500 6 6M12 19h8"/>',
  brush: '<path d="M14 4.500 19.500 10 11 18.500c-1.500 1.500-3.800 1.800-6.500 1.500-.3-2.700 0-5 1.500-6.500L14 4.500z"/><path d="m11.500 7 5.500 5.500"/>',
  download: '<path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 19.500h14"/>',
  upload: '<path d="M12 15V4M7.500 8.500 12 4l4.500 4.500M5 19.500h14"/>',
  spark: '<path d="M12 3.500l1.900 5.100 5.100 1.900-5.100 1.900L12 17.500l-1.900-5.100L5 10.500l5.100-1.900L12 3.500z"/><path d="M18.500 16v4M16.500 18h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  dots: '<circle cx="5.500" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18.500" cy="12" r="1.300"/>',
};

// Category silhouettes, drawn on a 48 box.
const CAT_ICONS = {
  top: '<path d="M17 6.500c1.600 3.200 12.400 3.200 14 0l9 4 5.500 9.500-6.500 4-3-3v21.500H12V21l-3 3-6.500-4L8 10.500z"/>',
  layer: '<path d="M18 6c1.500 3 10.500 3 12 0l8.500 3.500 6 28.500-6.500 1.500L35 24v18.500H13V24l-3 15.500L3.500 38l6-28.500z"/><path d="M24 8.500v34M17 33h-4M35 33h-4"/>',
  bottom: '<path d="M13 5h22l3.500 38.500H28L24 16.500l-4 27H9.500z"/><path d="M13.500 10.500h21M24 10.500v6"/>',
  socks: '<path d="M17 5h11.500v18.500c0 2 .9 3.300 2.500 4.400l5 3.400c2.600 1.800 3.100 5.200 1.100 7.600-2 2.300-5.400 2.600-7.800.7L18.600 31c-1-.8-1.600-2-1.600-3.300V5z"/><path d="M17 11.500h11.500"/>',
  shoes: '<path d="M4 30.500c0-3.500 1-6.500 3-9.500l4.500-2c2 3.500 5 5.800 9 6.800l12.500 3c6 1.500 11 3.200 11 7.200v2.500H4z"/><path d="M4 34.500h40M16 24.500l-2 3M20.500 26l-2 3"/>',
  fragrance: '<path d="M19 5h10v7H19zM21.500 12v4M26.500 12v4M13 16h22a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3z"/><path d="M17 26h14v9H17z"/>',
  jewelry: '<path d="M8 6c0 14 7 22.500 16 22.500S40 20 40 6" stroke-dasharray="2.200 3.400"/><path d="m24 28.500 5.500 7-5.500 7-5.500-7z"/>',
  accessory: '<circle cx="24" cy="24" r="11"/><path d="M18 14l1.500-9.500h9L30 14M18 34l1.500 9.500h9L30 34M24 18v6.500l4 2.500"/>',
};

export function icon(name, size = 22) {
  const body = UI[name];
  if (!body) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function catIcon(cat, size = 28) {
  const body = CAT_ICONS[cat] || CAT_ICONS.top;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function iconEl(name, size) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = icon(name, size);
  return span;
}

export function catIconEl(cat, size) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = catIcon(cat, size);
  return span;
}
