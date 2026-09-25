"use client";

// Browser-side storage for offline POS: a cached product catalog and a queue of
// sales rung up while the connection was down. Everything lives in IndexedDB.

const DB_NAME = "nebtech-offline";
const DB_VERSION = 1;
export const QUEUE_EVENT = "nebtech:offline-queue";
export const CATALOG_EVENT = "nebtech:offline-catalog";

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
    let result;
    let failure;
    const fail = (error) => {
      failure = error;
      try { t.abort(); } catch { db.close(); reject(error); }
    };
    t.oncomplete = () => { db.close(); resolve(result); };
    t.onabort = t.onerror = () => { db.close(); reject(failure || t.error || new Error("Could not save data on this device.")); };
    try {
      Promise.resolve(fn(Array.isArray(store) ? t : t.objectStore(store))).then((r) => (result = r), fail);
    } catch (error) { fail(error); }
  });
}

const reqToPromise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// ---- Catalog ---------------------------------------------------------------

export async function saveCatalog(products) {
  const saved = await tx(["catalog", "sales", "meta"], "readwrite", async (t) => {
    // Never replace locally deducted stock while an upload is unresolved.
    if (await reqToPromise(t.objectStore("sales").count())) return false;
    const s = t.objectStore("catalog");
    s.clear();
    products.forEach((p) => s.put(p));
    t.objectStore("meta").put(Date.now(), "catalogSavedAt");
    return true;
  });
  if (saved) window.dispatchEvent(new Event(CATALOG_EVENT));
  return saved;
}

export async function getCatalog() {
  return tx("catalog", "readonly", (s) => reqToPromise(s.getAll()));
}

export async function getCatalogSavedAt() {
  return tx("meta", "readonly", (s) => reqToPromise(s.get("catalogSavedAt")));
}

export function searchCatalog(products, q, categoryId = "all") {
  if (categoryId && categoryId !== "all") products = products.filter((p) => p.categoryId === categoryId);
  const needle = q.trim().toLowerCase();
  const list = !needle
    ? products
    : products.filter(
        (p) =>
          p.name?.toLowerCase().includes(needle) ||
          p.sku?.toLowerCase().includes(needle) ||
          p.genericName?.toLowerCase().includes(needle) ||
          p.brandName?.toLowerCase().includes(needle) ||
          p.barcode === q.trim()
      );
  return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
}

// ---- Sales queue -----------------------------------------------------------

function notify() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export async function queueSale(body) {
  if (!["cash", "card"].includes(body.primaryPaymentMethod)) {
    throw new Error("M-Pesa and credit sales require an internet connection.");
  }
  if (!Array.isArray(body.items) || !body.items.length) throw new Error("Add an item before completing the sale.");
  const clientId = body.clientId || crypto.randomUUID();
  const entry = {
    clientId,
    body: { ...body, clientId, offlineCreatedAt: new Date().toISOString() },
    status: "pending", // pending | failed
    error: null,
    createdAt: Date.now(),
  };
  const saved = await tx(["sales", "catalog"], "readwrite", async (t) => {
    const sales = t.objectStore("sales");
    const existing = await reqToPromise(sales.get(clientId));
    if (existing) return existing;
    const catalog = t.objectStore("catalog");
    for (const item of body.items) {
      const p = await reqToPromise(catalog.get(item.productId));
      if (!Number.isInteger(item.quantity) || item.quantity <= 0 || !p || p.stock < item.quantity) {
        throw new Error(`Not enough cached stock for ${item.name || p?.name || "this item"}. Reconnect to refresh stock.`);
      }
      catalog.put({ ...p, stock: p.stock - item.quantity });
    }
    sales.add(entry);
    return entry;
  });
  notify();
  window.dispatchEvent(new Event(CATALOG_EVENT));
  return saved;
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
  await tx("meta", "readwrite", (s) => s.clear());
  notify();
}

let syncing = null;

// Push queued sales to the server one at a time, oldest first.
// Returns { synced, failed, authRequired }.
export function syncQueuedSales() {
  if (syncing) return syncing;
  const run = async () => {
    const result = { synced: 0, failed: 0, authRequired: false };
    const queue = await getQueuedSales();
    for (const entry of queue) {
      if (entry.status === "failed") continue;
      let res;
      try {
        res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry.body),
          signal: AbortSignal.timeout(15000),
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
  };
  // Serialize upload loops across POS tabs as well as within this module.
  syncing = (navigator.locks ? navigator.locks.request("nebtech-sales-sync", run) : run())
    .finally(() => { syncing = null; });
  return syncing;
}

// True for errors thrown by fetch() itself (no network), not HTTP errors.
export function isNetworkError(e) {
  return e instanceof TypeError || e?.name === "TimeoutError" || e?.name === "AbortError";
}
