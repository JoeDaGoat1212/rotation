// Background removal.
//
// Two engines produce an alpha mask for a photo:
//   1. "AI"    – a segmentation model that runs in a Web Worker, fully on this device.
//   2. "Quick" – a built-in colour/edge method with no downloads. It is also the automatic
//                fallback whenever the AI engine is unavailable.
// The mask lives on its own canvas so it can be touched up with a brush before saving.

import { userError } from './util.js';

const WORK_MAX = 1280; // longest side of the working image
const SAVE_MAX = 1100; // longest side of the saved cutout
const THUMB_MAX = 360;
const SMALL_MAX = 384; // analysis resolution for the Quick engine
const AI_SIZE = 1024;
const L_WEIGHT = 0.5;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function ctx2d(canvas, readback = false) {
  return canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined);
}

/* ------------------------------------------------------------------ */
/* Loading a photo                                                     */
/* ------------------------------------------------------------------ */

async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* try the next way */
    }
    try {
      return await createImageBitmap(blob);
    } catch {
      /* try the next way */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/** Decodes a photo and returns a working canvas no larger than WORK_MAX on its longest side. */
export async function loadSource(blob) {
  let bitmap;
  try {
    bitmap = await decode(blob);
  } catch {
    const name = (blob && blob.name) || '';
    const heic = /\.(heic|heif)$/i.test(name) || /heic|heif/i.test((blob && blob.type) || '');
    throw userError(
      heic
        ? 'This browser can’t open HEIC photos. Share the photo as a JPEG, or add it from your phone.'
        : 'This file isn’t a picture the browser can open. Try a JPEG or PNG.'
    );
  }
  const bw = bitmap.width || bitmap.naturalWidth;
  const bh = bitmap.height || bitmap.naturalHeight;
  if (!bw || !bh) throw userError('This picture is empty.');
  const scale = Math.min(1, WORK_MAX / Math.max(bw, bh));
  const canvas = makeCanvas(bw * scale, bh * scale);
  const ctx = ctx2d(canvas, true);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function rgbToLab(r, g, b, out, o) {
  const R = LIN[r];
  const G = LIN[g];
  const B = LIN[b];
  const x = fLab((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const y = fLab(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const z = fLab((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  out[o] = 116 * y - 16;
  out[o + 1] = 500 * (x - y);
  out[o + 2] = 200 * (y - z);
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ */
/* Quick engine                                                        */
/* ------------------------------------------------------------------ */

/**
 * Analyses the photo once: converts a small copy to Lab, learns the background colours from the
 * border of the frame and measures how far every pixel is from them.
 */
export function quickPrepare(src) {
  const scale = Math.min(1, SMALL_MAX / Math.max(src.width, src.height));
  const w = Math.max(8, Math.round(src.width * scale));
  const h = Math.max(8, Math.round(src.height * scale));
  const small = makeCanvas(w, h);
  const sctx = ctx2d(small, true);
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, w, h);
  const px = sctx.getImageData(0, 0, w, h).data;
  const N = w * h;

  // Photos that already have a transparent background keep it.
  let clearCount = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 200) clearCount++;
  const hasAlpha = clearCount > N * 0.03;

  const lab = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) rgbToLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2], lab, i * 3);

  // Border samples
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const all = [];
  for (let y = 0; y < h; y++) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 0; x < w; x++) {
      if (edgeRow || x < band || x >= w - band) all.push(y * w + x);
    }
  }
  const step = Math.max(1, Math.floor(all.length / 3000));
  const samples = [];
  for (let i = 0; i < all.length; i += step) samples.push(all[i]);

  const clusters = learnBackground(lab, samples);

  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = nearest(clusters, lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);

  const spread = clusters[0] ? clusters[0].spread : 6;
  const suggested = Math.round(Math.min(70, Math.max(28, ((11 + 1.6 * spread - 5) / 35) * 100)));

  return { w, h, lab, dist, clusters, hasAlpha, suggested };
}

function nearest(clusters, L, a, b) {
  let best = Infinity;
  for (let c = 0; c < clusters.length; c++) {
    const k = clusters[c];
    const dL = L - k.L;
    const da = a - k.a;
    const db = b - k.b;
    const d = L_WEIGHT * dL * dL + da * da + db * db;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function learnBackground(lab, samples) {
  const K = Math.min(5, samples.length);
  const centers = [];
  // Farthest-point start so the centres cover the range of border colours.
  centers.push(pick(lab, samples[0]));
  while (centers.length < K) {
    let far = -1;
    let farIdx = samples[0];
    for (const s of samples) {
      let d = Infinity;
      for (const c of centers) d = Math.min(d, d2(lab, s, c));
      if (d > far) {
        far = d;
        farIdx = s;
      }
    }
    if (far < 4) break; // border is one flat colour
    centers.push(pick(lab, farIdx));
  }
  const assign = new Int16Array(samples.length);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = d2(lab, samples[i], centers[c]);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
      const o = samples[i] * 3;
      sums[best][0] += lab[o];
      sums[best][1] += lab[o + 1];
      sums[best][2] += lab[o + 2];
      sums[best][3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c].L = sums[c][0] / sums[c][3];
        centers[c].a = sums[c][1] / sums[c][3];
        centers[c].b = sums[c][2] / sums[c][3];
        centers[c].n = sums[c][3];
      } else centers[c].n = 0;
    }
  }
  // Spread of each cluster (how noisy / textured that part of the background is)
  const spreadSum = centers.map(() => 0);
  for (let i = 0; i < samples.length; i++) spreadSum[assign[i]] += Math.sqrt(d2(lab, samples[i], centers[assign[i]]));
  centers.forEach((c, i) => {
    c.spread = c.n ? spreadSum[i] / c.n : 0;
  });

  const live = centers.filter((c) => c.n > 0).sort((p, q) => q.n - p.n);
  if (!live.length) return [{ L: 100, a: 0, b: 0, n: 1, spread: 4 }];
  // A colour that only shows up on a small part of the border and looks nothing like the main
  // background is most likely the item itself touching the edge of the frame – leave it out.
  const total = samples.length;
  const kept = [live[0]];
  for (let i = 1; i < live.length; i++) {
    const c = live[i];
    const share = c.n / total;
    let nearKept = Infinity;
    for (const k of kept) {
      const dL = c.L - k.L;
      nearKept = Math.min(nearKept, Math.sqrt(L_WEIGHT * dL * dL + (c.a - k.a) ** 2 + (c.b - k.b) ** 2));
    }
    if (share >= 0.14 || nearKept < 13) kept.push(c);
  }
  return kept;
}

const pick = (lab, i) => ({ L: lab[i * 3], a: lab[i * 3 + 1], b: lab[i * 3 + 2], n: 0, spread: 0 });
function d2(lab, i, c) {
  const o = i * 3;
  const dL = lab[o] - c.L;
  const da = lab[o + 1] - c.a;
  const db = lab[o + 2] - c.b;
  return L_WEIGHT * dL * dL + da * da + db * db;
}

export const sensitivityToThreshold = (s) => 5 + (Math.min(100, Math.max(0, s)) / 100) * 35;

/**
 * Builds the full-size mask canvas for a given sensitivity (0–100).
 * Returns { mask, coverage } where coverage is the share of the photo kept (0–1).
 */
export function quickMask(src, prep, sensitivity, { clearGaps = false } = {}) {
  const { w, h, lab, dist } = prep;
  const N = w * h;
  const T = sensitivityToThreshold(sensitivity);
  const reach = T * 1.7;
  const gentle = Math.max(1.5, T * 0.15);

  // 1. Flood the background in from the edges of the frame.
  const bg = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  const seed = (i) => {
    if (!bg[i] && dist[i] < T) {
      bg[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  const visit = (i, n) => {
    if (bg[n]) return;
    const dn = dist[n];
    let ok = dn < T;
    if (!ok && dn < reach) {
      // Follow slow changes (soft shadows, lighting fall-off) but stop at real edges.
      const a = i * 3;
      const b = n * 3;
      const dL = lab[a] - lab[b];
      const da = lab[a + 1] - lab[b + 1];
      const db = lab[a + 2] - lab[b + 2];
      ok = Math.sqrt(L_WEIGHT * dL * dL + da * da + db * db) < gentle;
    }
    if (ok) {
      bg[n] = 1;
      queue[tail++] = n;
    }
  };
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    if (x > 0) visit(i, i - 1);
    if (x < w - 1) visit(i, i + 1);
    if (i >= w) visit(i, i - w);
    if (i < N - w) visit(i, i + w);
  }

  // 2. Optionally clear enclosed gaps that match the background (inside a chain, between straps).
  if (clearGaps) {
    const seen = new Uint8Array(N);
    const minArea = Math.max(24, Math.round(N * 0.0012));
    const strict = T * 0.7;
    for (let s = 0; s < N; s++) {
      if (bg[s] || seen[s] || dist[s] >= strict) continue;
      head = 0;
      tail = 0;
      queue[tail++] = s;
      seen[s] = 1;
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const tryN = (n) => {
          if (!bg[n] && !seen[n] && dist[n] < strict) {
            seen[n] = 1;
            queue[tail++] = n;
          }
        };
        if (x > 0) tryN(i - 1);
        if (x < w - 1) tryN(i + 1);
        if (i >= w) tryN(i - w);
        if (i < N - w) tryN(i + w);
      }
      if (tail >= minArea) for (let q = 0; q < tail; q++) bg[queue[q]] = 1;
    }
  }

  // 3. Drop specks: keep only reasonably large foreground pieces.
  const label = new Int32Array(N);
  const areas = [0];
  let current = 0;
  for (let s = 0; s < N; s++) {
    if (bg[s] || label[s]) continue;
    current++;
    head = 0;
    tail = 0;
    queue[tail++] = s;
    label[s] = current;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const tryN = (n) => {
        if (!bg[n] && !label[n]) {
          label[n] = current;
          queue[tail++] = n;
        }
      };
      if (x > 0) tryN(i - 1);
      if (x < w - 1) tryN(i + 1);
      if (i >= w) tryN(i - w);
      if (i < N - w) tryN(i + w);
    }
    areas.push(tail);
  }
  let largest = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > largest) largest = areas[i];
  const keepArea = Math.max(N * 0.0015, largest * 0.035);
  let kept = 0;
  const alphaSmall = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (label[i] && areas[label[i]] >= keepArea) {
      alphaSmall[i] = 1;
      kept++;
    }
  }

  // 4. Soften the small mask, scale it up, then re-cut the edge band against the full-size pixels.
  boxBlur(alphaSmall, w, h);
  boxBlur(alphaSmall, w, h);
  const smallMask = makeCanvas(w, h);
  const smctx = ctx2d(smallMask);
  const smData = smctx.createImageData(w, h);
  for (let i = 0; i < N; i++) smData.data[i * 4 + 3] = Math.round(alphaSmall[i] * 255);
  smctx.putImageData(smData, 0, 0);

  const W = src.width;
  const H = src.height;
  const mask = makeCanvas(W, H);
  const mctx = ctx2d(mask, true);
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(smallMask, 0, 0, W, H);
  const mData = mctx.getImageData(0, 0, W, H);
  const m = mData.data;
  const sp = ctx2d(src, true).getImageData(0, 0, W, H).data;
  const tmp = new Float32Array(3);
  const lo = T * 0.8;
  const hi = T * 1.45;
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const a = m[p + 3];
    let out;
    if (a <= 12) out = 0;
    else if (a >= 243) out = 255;
    else {
      rgbToLab(sp[p], sp[p + 1], sp[p + 2], tmp, 0);
      const byColour = smoothstep(lo, hi, nearest(prep.clusters, tmp[0], tmp[1], tmp[2]));
      const t = a / 255;
      const mixed = t < 0.5 ? byColour * (t * 2) : byColour + (1 - byColour) * ((t - 0.5) * 2);
      out = Math.round(mixed * 255);
    }
    // Respect transparency the photo already had.
    if (sp[p + 3] < 255) out = Math.round((out * sp[p + 3]) / 255);
    m[p] = 0;
    m[p + 1] = 0;
    m[p + 2] = 0;
    m[p + 3] = out;
  }
  mctx.putImageData(mData, 0, 0);
  return { mask, coverage: kept / N };
}

function boxBlur(a, w, h) {
  const tmp = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const l = a[row + (x > 0 ? x - 1 : x)];
      const r = a[row + (x < w - 1 ? x + 1 : x)];
      tmp[row + x] = (l + a[row + x] + r) / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) a[row + x] = (tmp[up + x] + tmp[row + x] + tmp[dn + x]) / 3;
  }
}

/** A mask that keeps the whole photo (or the photo's own transparency). */
export function fullMask(src) {
  const W = src.width;
  const H = src.height;
  const mask = makeCanvas(W, H);
  const mctx = ctx2d(mask, true);
  const sp = ctx2d(src, true).getImageData(0, 0, W, H).data;
  const data = mctx.createImageData(W, H);
  for (let p = 0; p < data.data.length; p += 4) data.data[p + 3] = sp[p + 3];
  mctx.putImageData(data, 0, 0);
  return mask;
}

/* ------------------------------------------------------------------ */
/* AI engine (runs in a worker)                                        */
/* ------------------------------------------------------------------ */

let worker = null;
let jobSeq = 0;
const jobs = new Map(); // id -> { resolve, reject, onProgress, timer }

function getWorker() {
  if (worker) return worker;
  if (typeof Worker !== 'function') throw new Error('Workers are not supported in this browser.');
  worker = new Worker(new URL('./cutout-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === 'progress') {
      for (const job of jobs.values()) job.onProgress && job.onProgress(msg);
      return;
    }
    const job = jobs.get(msg.id);
    if (!job) return;
    if (msg.type === 'stage') {
      job.onProgress && job.onProgress(msg);
      armTimer(msg.id, job, 150000);
    } else if (msg.type === 'result') {
      finish(msg.id);
      job.resolve(msg);
    } else if (msg.type === 'error') {
      finish(msg.id);
      job.reject(new Error(msg.message || 'The AI cutout failed.'));
    }
  };
  const crash = (e) => {
    const err = new Error((e && e.message) || 'The AI cutout could not start.');
    resetWorker();
    for (const [id, job] of [...jobs]) {
      finish(id);
      job.reject(err);
    }
  };
  worker.onerror = crash;
  worker.onmessageerror = crash;
  return worker;
}

function resetWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
  }
  worker = null;
}

function armTimer(id, job, ms) {
  clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    if (!jobs.has(id)) return;
    finish(id);
    resetWorker();
    job.reject(new Error('The AI cutout took too long.'));
  }, ms);
}

function finish(id) {
  const job = jobs.get(id);
  if (job) clearTimeout(job.timer);
  jobs.delete(id);
}

/** Starts downloading the AI model in the background so the first cutout is quicker. */
export function warmAI() {
  try {
    getWorker().postMessage({ type: 'warm' });
  } catch {
    /* the Quick engine will be used instead */
  }
}

/**
 * Runs the AI engine. Resolves with { mask, coverage }.
 * onProgress receives { type:'progress', percent } while the model downloads (first use only)
 * and { type:'stage', stage:'run' } when the cutout itself starts.
 */
export async function aiMask(src, onProgress) {
  const W = src.width;
  const H = src.height;
  const input = makeCanvas(AI_SIZE, AI_SIZE);
  const ictx = ctx2d(input, true);
  ictx.imageSmoothingQuality = 'high';
  // Transparent pixels are flattened onto white so the model sees a normal photo.
  ictx.fillStyle = '#ffffff';
  ictx.fillRect(0, 0, AI_SIZE, AI_SIZE);
  ictx.drawImage(src, 0, 0, AI_SIZE, AI_SIZE);
  const pixels = ictx.getImageData(0, 0, AI_SIZE, AI_SIZE).data;

  const w = getWorker();
  const id = ++jobSeq;
  const result = await new Promise((resolve, reject) => {
    const job = { resolve, reject, onProgress, timer: null };
    jobs.set(id, job);
    // The model download can be slow on a phone connection; the cutout itself gets its own limit.
    armTimer(id, job, 300000);
    try {
      w.postMessage({ type: 'run', id, size: AI_SIZE, buffer: pixels.buffer }, [pixels.buffer]);
    } catch (err) {
      finish(id);
      reject(err);
    }
  });

  const raw = new Uint8ClampedArray(result.mask);
  if (raw.length !== AI_SIZE * AI_SIZE) throw new Error('The AI cutout returned an unexpected result.');
  const small = makeCanvas(AI_SIZE, AI_SIZE);
  const sctx = ctx2d(small);
  const data = sctx.createImageData(AI_SIZE, AI_SIZE);
  let kept = 0;
  for (let i = 0; i < raw.length; i++) {
    // Firm up the mask: solid inside, clean outside, soft only right at the edge.
    const a = smoothstep(0.1, 0.62, raw[i] / 255);
    if (a > 0.5) kept++;
    data.data[i * 4 + 3] = Math.round(a * 255);
  }
  sctx.putImageData(data, 0, 0);
  const coverage = kept / raw.length;
  if (coverage < 0.004) throw new Error('The AI cutout could not find the item in this photo.');

  const mask = makeCanvas(W, H);
  const mctx = ctx2d(mask, true);
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(small, 0, 0, W, H);
  // Respect transparency the photo already had.
  mctx.globalCompositeOperation = 'destination-in';
  mctx.drawImage(src, 0, 0);
  mctx.globalCompositeOperation = 'source-over';
  return { mask, coverage };
}

/* ------------------------------------------------------------------ */
/* Compositing and saving                                              */
/* ------------------------------------------------------------------ */

/** Draws the photo through the mask onto `target` (or a new canvas). */
export function compose(src, mask, target) {
  const out = target || makeCanvas(src.width, src.height);
  const ctx = ctx2d(out, true);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  return out;
}

function alphaBounds(canvas) {
  const { width: W, height: H } = canvas;
  const d = ctx2d(canvas, true).getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (d[row + x * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    const viaDataURL = () => {
      try {
        const url = canvas.toDataURL(type, quality);
        const [head, body] = url.split(',');
        const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
        const bin = atob(body);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: mime }));
      } catch (err) {
        reject(err);
      }
    };
    if (!canvas.toBlob) return viaDataURL();
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : viaDataURL()), type, quality);
    } catch {
      viaDataURL();
    }
  });
}

/** WebP keeps transparency at a fraction of PNG's size; browsers that can't write it give PNG. */
async function encodeCutout(canvas, quality) {
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp' && webp.size > 0) return webp;
  return canvasToBlob(canvas, 'image/png');
}

function scaled(canvas, box, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(box.w, box.h));
  const out = makeCanvas(box.w * scale, box.h * scale);
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  return out;
}

/**
 * Produces everything that gets stored for a closet item:
 * the trimmed cutout, a small thumbnail, and the original photo for later re-cuts.
 */
export async function exportCutout(src, mask, { keepSource = true } = {}) {
  const cut = compose(src, mask);
  const found = alphaBounds(cut);
  if (!found) throw userError('Nothing is left in this cutout. Use the Restore brush, or remove less of the photo.');
  const pad = Math.round(Math.max(found.w, found.h) * 0.015);
  const box = {
    x: Math.max(0, found.x - pad),
    y: Math.max(0, found.y - pad),
    w: 0,
    h: 0,
  };
  box.w = Math.min(cut.width, found.x + found.w + pad) - box.x;
  box.h = Math.min(cut.height, found.y + found.h + pad) - box.y;

  const full = scaled(cut, box, SAVE_MAX);
  const small = scaled(cut, box, THUMB_MAX);
  const [image, thumb] = await Promise.all([encodeCutout(full, 0.92), encodeCutout(small, 0.86)]);

  let source = null;
  if (keepSource) {
    const hasClear = sourceHasAlpha(src);
    source = hasClear ? await canvasToBlob(src, 'image/png') : await canvasToBlob(src, 'image/jpeg', 0.88);
  }
  return { image, thumb, source, ar: box.w / box.h };
}

function sourceHasAlpha(src) {
  const probe = makeCanvas(48, 48);
  const pctx = ctx2d(probe, true);
  pctx.drawImage(src, 0, 0, 48, 48);
  const d = pctx.getImageData(0, 0, 48, 48).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** Turns a ready-made drawing (already transparent) into stored blobs. Used for the sample closet. */
export async function exportReady(canvas) {
  const found = alphaBounds(canvas) || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const full = scaled(canvas, found, SAVE_MAX);
  const small = scaled(canvas, found, THUMB_MAX);
  const [image, thumb] = await Promise.all([encodeCutout(full, 0.92), encodeCutout(small, 0.86)]);
  return { image, thumb, source: null, ar: found.w / found.h };
}
