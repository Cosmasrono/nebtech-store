"use client";

import { useEffect, useState } from "react";

export default function AppError({ error, reset }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const chunkMissing = error?.name === "ChunkLoadError" || /Loading chunk .* failed/.test(error?.message || "");

  return (
    <div className="max-w-md mx-auto mt-24 card p-6 text-center space-y-3">
      <div className="text-4xl">{online ? "⚠️" : "📡"}</div>
      <h1 className="font-semibold text-lg">
        {!online ? "You're offline" : chunkMissing ? "The app was updated" : "Something went wrong"}
      </h1>
      <p className="text-sm text-slate-500">
        {!online
          ? "This page hasn't been saved for offline use yet. The Point of Sale works offline once it has been opened with a connection."
          : chunkMissing
            ? "A newer version is available. Reload to continue."
            : "Try again. If it keeps happening, reload the page."}
      </p>
      <div className="flex gap-2 justify-center pt-2">
        {online ? (
          <button className="btn-primary" onClick={() => (chunkMissing ? location.reload() : reset())}>
            {chunkMissing ? "Reload" : "Try again"}
          </button>
        ) : (
          <a className="btn-primary" href="/pos">Open Point of Sale</a>
        )}
      </div>
    </div>
  );
}
