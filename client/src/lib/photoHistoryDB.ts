const DB_NAME = 'spottheshot';
const STORE = 'photo_history';
const DB_VERSION = 1;
const MAX_UNPINNED = 4;

export interface HistoryEntry {
  id: string;
  filename: string;
  thumbnail: string;  // data URL for display
  blob: Blob;         // resized JPEG for re-upload
  lat: number | null;
  lon: number | null;
  captureDate: string | null;
  pinned: boolean;
  savedAt: number;
  serverPhotoId?: string;
  contentHash?: string; // SHA-256 hex of the resized blob
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function makeThumbnail(blob: Blob): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
    img.src = url;
  });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(
        (req.result as HistoryEntry[]).sort((a, b) => b.savedAt - a.savedAt)
      );
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

async function _patchEntryLocation(entry: HistoryEntry, lat: number, lon: number): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...entry, lat, lon });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateEntryLocation(serverPhotoId: string, lat: number, lon: number): Promise<void> {
  try {
    const all = await getHistory();
    const entry = all.find(e => e.serverPhotoId === serverPhotoId);
    if (!entry) return;
    await _patchEntryLocation(entry, lat, lon);
  } catch { /* silently fail */ }
}

export async function updateEntryLocationById(id: string, lat: number, lon: number): Promise<void> {
  try {
    const all = await getHistory();
    const entry = all.find(e => e.id === id);
    if (!entry) return;
    await _patchEntryLocation(entry, lat, lon);
  } catch { /* silently fail */ }
}

export async function addToHistory(
  entry: Omit<HistoryEntry, 'id' | 'savedAt' | 'thumbnail'>
): Promise<void> {
  try {
    const db = await openDB();
    const thumbnail = await makeThumbnail(entry.blob);
    const newEntry: HistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      thumbnail,
      savedAt: Date.now(),
    };

    // Evict oldest unpinned entries if at limit
    const all = await getHistory();
    const unpinned = all.filter(e => !e.pinned).sort((a, b) => a.savedAt - b.savedAt);
    if (unpinned.length >= MAX_UNPINNED) {
      const toEvict = unpinned.slice(0, unpinned.length - MAX_UNPINNED + 1);
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const e of toEvict) store.delete(e.id);
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(newEntry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail — IndexedDB may be unavailable */ }
}

export async function togglePin(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as HistoryEntry;
        if (entry) store.put({ ...entry, pinned: !entry.pinned });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }
}

export async function updateEntryServerPhotoId(id: string, serverPhotoId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as HistoryEntry;
        if (entry) store.put({ ...entry, serverPhotoId });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }
}

export async function removeFromHistory(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }
}
