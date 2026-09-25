"use client";

import { useCallback, useEffect, useState } from "react";
import {
  QUEUE_EVENT,
  getCatalogSavedAt,
  getQueuedSales,
  removeQueuedSale,
  saveCatalog,
  syncQueuedSales,
} from "@/lib/offline";

const fmt = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

// Registers the service worker, keeps the offline product catalog fresh, and pushes
// queued offline sales to the server whenever the connection comes back.
export default function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState("");
  const [showFailed, setShowFailed] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [shellReady, setShellReady] = useState(false);

  const refreshQueue = useCallback(() => {
    getQueuedSales().then(setQueue).catch(() => {});
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      if (!navigator.onLine || (await getQueuedSales()).length) return;
      const res = await fetch("/api/pos/products?all=1", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        await saveCatalog((await res.json()).data);
        setCatalogReady(Boolean(await getCatalogSavedAt()));
      }
    } catch {}
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    const r = await syncQueuedSales().catch(() => null);
    setSyncing(false);
    if (!r) return;
    if (r.authRequired) setNote("Sign in again to upload offline sales.");
    else if (r.synced) setNote(`${r.synced} offline sale${r.synced > 1 ? "s" : ""} uploaded.`);
    await refreshCatalog(); // refresh after uploads, never alongside them
  }, [refreshCatalog]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshQueue();
    getCatalogSavedAt().then((at) => setCatalogReady(Boolean(at))).catch(() => {});
    navigator.storage?.persist?.().catch(() => {});

    const onWorkerMessage = (event) => {
      if (event.data?.type === "offline-ready") setShellReady(event.data.ready);
    };
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          reg.active?.postMessage({ type: "offline-status" });
          if (!navigator.onLine) return;
          // Files this page loaded before the service worker took control aren't cached yet.
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => new URL(e.name).pathname)
            .filter((p) => p.startsWith("/_next/static/"));
          reg.active?.postMessage({ type: "warm", urls });
        })
        .catch(() => {});
    }

    sync();

    const goOnline = () => {
      setOnline(true);
      sync();
      navigator.serviceWorker?.controller?.postMessage({ type: "warm" });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener(QUEUE_EVENT, refreshQueue);
    // Retry periodically too — navigator.onLine can say "online" while the internet is actually down.
    const t = setInterval(() => { sync(); }, 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener(QUEUE_EVENT, refreshQueue);
      clearInterval(t);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [refreshQueue, refreshCatalog, sync]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const pending = queue.filter((q) => q.status === "pending");
  const failed = queue.filter((q) => q.status === "failed");

  return (
    <>
      <div
        className={`sticky top-0 z-20 px-6 py-2 text-sm flex flex-wrap items-center gap-x-4 gap-y-1 ${
          online ? "bg-teal-50 text-teal-800" : "bg-amber-100 text-amber-900"
        }`}
      >
        <span className="font-semibold">
          {online ? "● Online" : "● Offline — cash and card sales are saved on this device"}
        </span>
        <span>{catalogReady && shellReady ? "Ready for offline sales" : catalogReady ? "Products saved · offline page not ready yet" : "Open POS online to prepare offline sales"}</span>
        {process.env.NODE_ENV !== "production" && <span>Offline reload requires a production build.</span>}
        {pending.length > 0 && (
          <span>
            {pending.length} sale{pending.length > 1 ? "s" : ""} waiting to upload
            {syncing && " — uploading…"}
          </span>
        )}
        {failed.length > 0 && (
          <button className="text-rose-700 font-medium underline" onClick={() => setShowFailed(true)}>
            {failed.length} sale{failed.length > 1 ? "s" : ""} need attention
          </button>
        )}
        {note && <span>{note}</span>}
        {online && pending.length > 0 && !syncing && (
          <button className="ml-auto btn-secondary !py-1 !px-3 text-xs" onClick={sync}>Upload now</button>
        )}
      </div>

      {showFailed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="card w-full max-w-lg p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Offline sales the server rejected</h2>
              <button onClick={() => setShowFailed(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              These were rung up offline but could not be recorded (for example, stock ran out). The customer has
              already paid — sort each one out, then remove it here.
            </p>
            <div className="divide-y divide-slate-100">
              {failed.map((f) => (
                <div key={f.clientId} className="py-3 text-sm">
                  <div className="flex justify-between font-medium">
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                    <span>{fmt(f.body.totalAmount)} · {f.body.primaryPaymentMethod}</span>
                  </div>
                  <ul className="text-xs text-slate-500 mt-1">
                    {f.body.items.map((i) => (
                      <li key={i.productId}>{i.quantity} × {i.name || i.productId}</li>
                    ))}
                  </ul>
                  <div className="text-xs text-rose-600 mt-1">{f.error}</div>
                  <button
                    className="text-xs text-rose-700 underline mt-1"
                    onClick={() => {
                      if (confirm("Remove this offline sale from the device? It will not be recorded.")) {
                        removeQueuedSale(f.clientId);
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!failed.length && <div className="py-6 text-center text-slate-400 text-sm">Nothing left to review.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
