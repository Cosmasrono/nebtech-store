"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thin teal bar pinned to the top of the viewport.
// Shows during (a) any in-flight fetch() (patched below) and (b) route transitions.
// Bar is intentionally simple: 0% -> 80% while pending, then 100% -> fade.
export default function TopProgress() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();
  const search = useSearchParams();

  // Patch window.fetch once. Any component fetching data participates automatically.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.__nbtFetchPatched) return;
    window.__nbtFetchPatched = true;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      window.dispatchEvent(new Event("nbt:fetch-start"));
      try { return await original(...args); }
      finally { window.dispatchEvent(new Event("nbt:fetch-end")); }
    };
  }, []);

  useEffect(() => {
    const onStart = () => setActive((n) => n + 1);
    const onEnd = () => setActive((n) => Math.max(0, n - 1));
    window.addEventListener("nbt:fetch-start", onStart);
    window.addEventListener("nbt:fetch-end", onEnd);
    return () => {
      window.removeEventListener("nbt:fetch-start", onStart);
      window.removeEventListener("nbt:fetch-end", onEnd);
    };
  }, []);

  // Bump on client-side route change too — Next doesn't emit an event we can hook,
  // so we use pathname/search as a proxy. The bar auto-clears after ~600ms.
  useEffect(() => {
    setActive((n) => n + 1);
    const t = setTimeout(() => setActive((n) => Math.max(0, n - 1)), 600);
    return () => clearTimeout(t);
  }, [pathname, search]);

  // Animate: creep toward 80% while active, snap to 100% and fade when done.
  useEffect(() => {
    if (active > 0) {
      setProgress((p) => (p < 5 ? 15 : p));
      const id = setInterval(() => {
        setProgress((p) => (p < 80 ? p + (80 - p) * 0.08 : p));
      }, 200);
      return () => clearInterval(id);
    }
    if (progress > 0) {
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 300);
      return () => clearTimeout(t);
    }
  }, [active]); // eslint-disable-line

  const visible = progress > 0;
  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] h-0.5 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 250ms" }}
    >
      <div
        className="h-full bg-teal-600"
        style={{ width: `${progress}%`, transition: "width 200ms ease-out" }}
      />
    </div>
  );
}
