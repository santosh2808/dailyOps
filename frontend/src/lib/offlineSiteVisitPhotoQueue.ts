// Anti-fraud Site Visit photos (SiteVisitCameraCapture / SiteVisitOutcomeDialog)
// — user's own follow-up request: "what if they visited site today took
// pics. and uploaded pics tomorrow in other location?" and "what if no
// signal?". The fix for the first question is capturing photos live inside
// the app (see SiteVisitCameraCapture.tsx) instead of picking from a file
// input, so there's no gap between "taken" and "handed to the app" to begin
// with. This file is the fix for the second question: a photo captured
// with no network still can't be lost — it's written to IndexedDB
// immediately (durable across app restarts/crashes, unlike an in-memory
// queue), then OfflineSiteVisitPhotoQueueContext drains it to the server
// the moment connectivity returns.
//
// Deliberately hand-rolled rather than pulling in a library (e.g. "idb")
// — this app has a very small, deliberate dependency list (see
// package.json), and the actual IndexedDB surface needed here is tiny
// (put/getAll/delete on one object store).
//
// Note: this app's vite.config.ts VitePWA setup is explicitly
// installable+fast-load only, NOT general offline data caching (see its
// own comment) — this queue doesn't touch that config or Workbox at all,
// it's plain app-level IndexedDB + online/offline listeners, so it doesn't
// conflict with that prior decision.

const DB_NAME = "dailyops-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "siteVisitPhotos";

export interface QueuedSiteVisitPhoto {
  id: string;
  leadId: string;
  // The photo's raw bytes rather than the File itself: iOS Safari (WebKit,
  // so every iPhone browser) stores a Blob in IndexedDB fine but often
  // can't send one read back out of it — the request fails on the phone
  // ("Load failed" / WebKitBlobResource error) before reaching the server,
  // so the photo sat "waiting to upload" forever. An ArrayBuffer
  // round-trips on every browser; queuedPhotoFile() rebuilds the File.
  bytes?: ArrayBuffer;
  fileName?: string;
  mimeType?: string;
  // Only on photos queued by an older app version, before `bytes` existed.
  file?: File;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  // When the shutter was actually pressed — distinct from whenever the
  // upload eventually succeeds, which is the entire point of this queue.
  capturedAt: string;
  lastError?: string;
  lastAttemptAt?: string;
}

// For on-screen thumbnails (reading a stored Blob into an <img> works on
// iOS; only sending one fails).
export function queuedPhotoBlob(record: QueuedSiteVisitPhoto): Blob {
  if (record.bytes) return new Blob([record.bytes], { type: record.mimeType });
  return record.file ?? new Blob();
}

// A fresh in-memory File for the upload, never the Blob that came out of
// IndexedDB — see `bytes` above. Throws if an old-style record's stored
// file can no longer be read; the caller reports that rather than retrying.
export async function queuedPhotoFile(record: QueuedSiteVisitPhoto): Promise<File> {
  const name = record.fileName ?? record.file?.name ?? `site-visit-${record.id}.jpg`;
  const type = record.mimeType ?? record.file?.type ?? "image/jpeg";
  if (record.bytes) return new File([record.bytes], name, { type });
  if (record.file) return new File([await record.file.arrayBuffer()], name, { type });
  throw new Error("Queued photo has no image data.");
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser doesn't support offline storage."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
    tx.oncomplete = () => db.close();
  });
}

export async function enqueuePhoto(record: QueuedSiteVisitPhoto): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
}

export async function getAllQueuedPhotos(): Promise<QueuedSiteVisitPhoto[]> {
  try {
    return await withStore("readonly", (store) => store.getAll());
  } catch {
    // Offline storage being unavailable (private browsing, unsupported
    // browser) shouldn't crash the app — it just means nothing survives a
    // reload, same as before this feature existed.
    return [];
  }
}

export async function removeQueuedPhoto(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function updateQueuedPhotoError(id: string, error: string): Promise<void> {
  const all = await getAllQueuedPhotos();
  const record = all.find((r) => r.id === id);
  if (!record) return;
  await withStore("readwrite", (store) =>
    store.put({ ...record, lastError: error, lastAttemptAt: new Date().toISOString() }),
  );
}
