"use client";

// Browser-side storage for offline POS: a cached product catalog and a queue of
// sales rung up while the connection was down. Everything lives in IndexedDB.

const DB_NAME = "nebtech-offline";
const DB_VERSION = 1;
export const QUEUE_EVENT = "nebtech:offline-queue";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("catalog")) db.createObjectStore("catalog", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "clientId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => (result = r));
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const reqToPromise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---- Catalog ---------------------------------------------------------------

export async function saveCatalog(products) {
  await tx("catalog", "readwrite", (s) => {
    s.clear();
    products.forEach((p) => s.put(p));
  });
  await tx("meta", "readwrite", (s) => s.put(Date.now(), "catalogSavedAt"));
}

export async function getCatalog() {
  return tx("catalog", "readonly", (s) => reqToPromise(s.getAll()));
}

export async function getCatalogSavedAt() {
  return tx("meta", "readonly", (s) => reqToPromise(s.get("catalogSavedAt")));
}

export function searchCatalog(products, q) {
  const needle = q.trim().toLowerCase();
  const list = !needle
    ? products
    : products.filter(
        (p) =>
          p.name?.toLowerCase().includes(needle) ||
          p.sku?.toLowerCase().includes(needle) ||
          p.barcode === q.trim()
      );
  return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
}

// Reflect an offline sale in the cached stock so the cashier can't oversell what's on the shelf.
async function deductCachedStock(items) {
  await tx("catalog", "readwrite", async (s) => {
    for (const i of items) {
      const p = await reqToPromise(s.get(i.productId));
      if (p) s.put({ ...p, stock: Math.max(0, p.stock - i.quantity) });
    }
  });
}

// ---- Sales queue -----------------------------------------------------------

function notify() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function queueSale(body) {
  const clientId = body.clientId || crypto.randomUUID();
  const entry = {
    clientId,
    body: { ...body, clientId, offlineCreatedAt: new Date().toISOString() },
    status: "pending", // pending | failed
    error: null,
    createdAt: Date.now(),
  };
  await tx("sales", "readwrite", (s) => s.put(entry));
  await deductCachedStock(body.items);
  notify();
  return entry;
}

export async function getQueuedSales() {
  const all = await tx("sales", "readonly", (s) => reqToPromise(s.getAll()));
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueuedSale(clientId) {
  await tx("sales", "readwrite", (s) => s.delete(clientId));
  notify();
}

export async function clearOfflineData() {
  await tx("sales", "readwrite", (s) => s.clear());
  await tx("catalog", "readwrite", (s) => s.clear());
  notify();
}

let syncing = null;

// Push queued sales to the server one at a time, oldest first.
// Returns { synced, failed, authRequired }.
export function syncQueuedSales() {
  if (syncing) return syncing;
  syncing = (async () => {
    const result = { synced: 0, failed: 0, authRequired: false };
    const queue = await getQueuedSales();
    for (const entry of queue) {
      let res;
      try {
        res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.body),
        });
      } catch {
        break; // still offline — try again later
      }
      if (res.ok) {
        await tx("sales", "readwrite", (s) => s.delete(entry.clientId));
        result.synced++;
      } else if (res.status === 401) {
        result.authRequired = true; // session expired — keep everything queued until they sign in
        break;
      } else if (res.status >= 500) {
        break; // server trouble — retry later without marking the sale bad
      } else {
        const data = await res.json().catch(() => ({}));
        await tx("sales", "readwrite", (s) =>
          s.put({ ...entry, status: "failed", error: data.message || `Rejected (${res.status})` })
        );
        result.failed++;
      }
    }
    notify();
    return result;
  })().finally(() => { syncing = null; });
  return syncing;
}

// True for errors thrown by fetch() itself (no network), not HTTP errors.
export function isNetworkError(e) {
  return e instanceof TypeError;
}
