// Backup files: one file that holds the whole closet, photos included.
// Layout: "ROTN1\n" + 4-byte header length + JSON header + every photo, back to back.
import * as db from './db.js';
import { state, CAT, reloadFromStorage } from './store.js';
import { dateKey, downloadBlob, userError } from './util.js';

const MAGIC = 'ROTN1\n';
const BLOB_KEYS = ['image', 'thumb', 'source'];

export function buildBackup() {
  const parts = [];
  let offset = 0;
  const items = state.items.map((item) => {
    const meta = { ...item };
    const blobs = {};
    for (const key of BLOB_KEYS) {
      delete meta[key];
      const blob = item[key];
      if (blob && blob.size) {
        blobs[key] = { o: offset, l: blob.size, t: blob.type || 'application/octet-stream' };
        parts.push(blob);
        offset += blob.size;
      }
    }
    return { meta, blobs };
  });
  const header = JSON.stringify({
    app: 'rotation',
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    outfits: state.outfits,
    plans: Object.values(state.plans),
    settings: state.settings,
  });
  const headerBytes = new TextEncoder().encode(header);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, headerBytes.length, true);
  return new Blob([MAGIC, len, headerBytes, ...parts], { type: 'application/octet-stream' });
}

export function exportBackup() {
  const blob = buildBackup();
  downloadBlob(blob, `rotation-backup-${dateKey()}.rotation`);
  return blob.size;
}

/** Reads a backup file and returns its contents without changing anything. */
export async function readBackup(file) {
  const bad = userError('This isn’t a Rotation backup file.');
  if (!file || file.size < MAGIC.length + 4) throw bad;
  const magic = await file.slice(0, MAGIC.length).text();
  if (magic !== MAGIC) throw bad;
  const lenBuf = await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer();
  const headerLen = new DataView(lenBuf).getUint32(0, true);
  const dataStart = MAGIC.length + 4 + headerLen;
  if (!headerLen || dataStart > file.size) throw bad;
  let header;
  try {
    header = JSON.parse(await file.slice(MAGIC.length + 4, dataStart).text());
  } catch {
    throw bad;
  }
  if (!header || header.app !== 'rotation' || !Array.isArray(header.items)) throw bad;

  const items = [];
  for (const entry of header.items) {
    const meta = entry && entry.meta;
    if (!meta || !meta.id || !CAT[meta.cat]) continue;
    const item = { ...meta };
    for (const key of BLOB_KEYS) {
      const ref = entry.blobs && entry.blobs[key];
      if (ref && Number.isFinite(ref.o) && Number.isFinite(ref.l) && dataStart + ref.o + ref.l <= file.size) {
        // Copy the bytes so the stored photo no longer depends on the backup file.
        const bytes = await file.slice(dataStart + ref.o, dataStart + ref.o + ref.l).arrayBuffer();
        item[key] = new Blob([bytes], { type: ref.t });
      } else item[key] = null;
    }
    if (!item.image) continue;
    if (!item.thumb) item.thumb = item.image;
    items.push(item);
  }
  return {
    items,
    outfits: Array.isArray(header.outfits) ? header.outfits.filter((o) => o && o.id && o.slots) : [],
    plans: Array.isArray(header.plans) ? header.plans.filter((p) => p && p.date && p.outfitId) : [],
    settings: header.settings && typeof header.settings === 'object' ? header.settings : null,
    exportedAt: header.exportedAt || null,
  };
}

/** Replaces everything on this device with the contents of a backup. */
export async function restoreBackup(data) {
  await db.clearAll();
  for (let i = 0; i < data.items.length; i += 8) await db.putMany('items', data.items.slice(i, i + 8));
  if (data.outfits.length) await db.putMany('outfits', data.outfits);
  if (data.plans.length) await db.putMany('plans', data.plans);
  if (data.settings) await db.setMeta('settings', { ...state.settings, ...data.settings });
  else await db.setMeta('settings', { ...state.settings });
  await reloadFromStorage();
}
