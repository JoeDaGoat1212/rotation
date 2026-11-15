// Thin promise wrapper around IndexedDB. Everything the app stores lives on this device.

const DB_NAME = 'rotation';
const DB_VERSION = 1;
export const STORES = ['items', 'outfits', 'plans', 'meta'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser has no storage available (IndexedDB is missing).'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outfits')) db.createObjectStore('outfits', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open storage.'));
    req.onblocked = () => reject(new Error('Storage is busy in another tab. Close other Rotation tabs and reload.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx(storeNames, mode, work) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        let result;
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || new Error('Storage write failed.'));
        t.onabort = () => reject(t.error || new Error('Storage write was cancelled. The device may be out of space.'));
        try {
          result = work(t);
        } catch (err) {
          try {
            t.abort();
          } catch {
            /* already finished */
          }
          reject(err);
        }
      })
  );
}

export function getAll(store) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      })
  );
}

export function put(store, value) {
  return tx(store, 'readwrite', (t) => {
    t.objectStore(store).put(value);
  });
}

export function putMany(store, values) {
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const v of values) os.put(v);
  });
}

export function del(store, key) {
  return tx(store, 'readwrite', (t) => {
    t.objectStore(store).delete(key);
  });
}

export function delMany(store, keys) {
  return tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    for (const k of keys) os.delete(k);
  });
}

export function clearAll() {
  return tx(STORES, 'readwrite', (t) => {
    for (const s of STORES) t.objectStore(s).clear();
  });
}

export function getMeta(key) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}
