// NebTech Store service worker — keeps the app shell available offline.
// Bump VERSION to force clients onto fresh caches after a deploy that changes this file.
const VERSION = "v1";
const PAGES = `nebtech-pages-${VERSION}`;
const ASSETS = `nebtech-assets-${VERSION}`;
const DATA = `nebtech-data-${VERSION}`;
const OFFLINE_FALLBACK = "/pos";

// Read-only API calls that are safe to answer from cache when offline.
// (POS products are deliberately absent: the page searches its IndexedDB catalog
// offline, which also reflects stock sold since the connection dropped.)
const CACHEABLE_API = ["/api/shifts/active", "/api/auth/me"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [PAGES, ASSETS, DATA];
      for (const key of await caches.keys()) if (!keep.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  // Sent on sign-out so the next person on this device can't see cached pages.
  if (event.data === "clear-caches") {
    event.waitUntil(Promise.all([PAGES, DATA].map((k) => caches.delete(k))));
  }
  // Sent after sign-in: make sure the POS page is cached even if it wasn't visited yet.
  if (event.data === "warm") {
    event.waitUntil(
      caches.open(PAGES).then(async (cache) => {
        try {
          const res = await fetch(OFFLINE_FALLBACK, { credentials: "same-origin" });
          if (res.ok && !res.redirected) await cache.put(OFFLINE_FALLBACK, res);
        } catch {}
      })
    );
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    // Don't cache redirects to /login or error pages
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl, { ignoreVary: true });
      if (fb) return fb;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets never change — serve from cache.
  if (url.pathname.startsWith("/_next/static/") || /\.(svg|png|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (CACHEABLE_API.some((p) => url.pathname.startsWith(p))) {
      event.respondWith(networkFirst(request, DATA));
    }
    return;
  }

  // Full page loads: network first, then the cached copy, then the cached POS page.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, OFFLINE_FALLBACK));
    return;
  }

  // Next.js client-side navigation payloads (RSC). If one isn't cached, the fetch
  // fails and Next falls back to a full page load, which the branch above handles.
  if (request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request, PAGES));
  }
});
