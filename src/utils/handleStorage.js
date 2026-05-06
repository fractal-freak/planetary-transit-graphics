// Tiny IndexedDB wrapper for stashing a single FileSystemDirectoryHandle
// across browser sessions. The handle is the only thing IDB can persist that
// localStorage can't — directory handles are structured-clone-friendly objects
// only, not strings.
//
// Scope: per-origin, not per-user. If two users share a browser they'll each
// see the other's handle, but the chart-import flow is gated on Firestore auth
// anyway, so a handle without a matching account is harmless.

const DB_NAME = 'transitwiz-handles';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'astroGoldFolder';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result?.then ? undefined : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveDirectoryHandle(handle) {
  if (!handle) return;
  await withStore('readwrite', store => {
    store.put(handle, HANDLE_KEY);
  });
}

export async function loadDirectoryHandle() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function clearDirectoryHandle() {
  await withStore('readwrite', store => {
    store.delete(HANDLE_KEY);
  });
}
