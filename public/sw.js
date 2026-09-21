// NebTech Store service worker — keeps the app shell available offline.
// Bump VERSION to force clients onto fresh caches after a deploy that changes this file.
const VERSION = "v2";
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

// Every JS/CSS file a page needs. A cached page without its chunks crashes with
// ChunkLoadError offline, so pages and their assets must always be cached together.
function assetUrlsIn(html) {
  const urls = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+?\.(?:js|css)/g)) urls.add(m[0]);
  // Chunk paths also appear inside the RSC payload as "static/chunks/…" strings
  for (const m of html.matchAll(/(?<![\w/])static\/(?:chunks|css)\/[^"'\s\\]+?\.(?:js|css)/g)) urls.add(`/_next/${m[0]}`);
  return [...urls];
}

async function cacheAssets(urls) {
  const cache = await caches.open(ASSETS);
  await Promise.all(
    urls.map(async (u) => {
      try {
        if (await cache.match(u)) return; // hashed filenames never change
        const res = await fetch(u);
        if (res.ok) await cache.put(u, res);
      } catch {}
    })
  );
}

// Cache the POS page plus everything it loads, so it can open with no connection.
async function warm(clientAssetUrls = []) {
  await cacheAssets(clientAssetUrls);
  try {
    const res = await fetch(OFFLINE_FALLBACK, { credentials: "same-origin" });
    if (!res.ok || res.redirected) return;
    const html = await res.clone().text();
    await cacheAssets(assetUrlsIn(html));
    // Store the page only after its assets are in, so a cached page never lacks its code.
    await (await caches.open(PAGES)).put(OFFLINE_FALLBACK, res);
  } catch {}
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  // Sent on sign-out so the next person on this device can't see cached pages.
  if (msg === "clear-caches" || msg.type === "clear-caches") {
    event.waitUntil(Promise.all([PAGES, DATA].map((k) => caches.delete(k))));
  }
  // Sent on every app load while online.
  if (msg === "warm" || msg.type === "warm") {
    const urls = (msg.urls || []).filter((u) => typeof u === "string" && u.startsWith("/_next/static/"));
    event.waitUntil(warm(urls));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    // Don't cache redirects to /login or error pages
    if (res.ok && !res.redirected) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function navigate(request) {
  try {
    return await networkFirst(request, PAGES);
  } catch (err) {
    // Page never cached: send the cashier to the POS, which always is (redirect keeps
    // the URL and the page content in agreement, unlike serving /pos HTML at /dashboard).
    const url = new URL(request.url);
    if (url.pathname !== OFFLINE_FALLBACK && (await (await caches.open(PAGES)).match(OFFLINE_FALLBACK))) {
      return Response.redirect(OFFLINE_FALLBACK, 302);
    }
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Offline — NebTech Store</title>
      <div style="font-family:system-ui,sans-serif;max-width:28rem;margin:20vh auto;padding:0 1rem;text-align:center;color:#334155">
        <h1 style="font-size:1.25rem">You're offline</h1>
        <p>This page hasn't been saved on this device yet. Reconnect and open the Point of Sale once so it can work offline next time.</p>
        <button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.2rem;border:0;border-radius:.5rem;background:#0f766e;color:#fff;font-size:1rem">Try again</button>
      </div>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
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

  // Full page loads: network first, then the cached copy, then the POS page.
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }

  // Next.js client-side navigation payloads (RSC). If one isn't cached, the fetch
  // fails and Next falls back to a full page load, which the branch above handles.
  if (request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request, PAGES));
  }
});
