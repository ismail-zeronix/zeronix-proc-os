/*
 * Zeronix Tech service worker (installable app). Deliberately conservative:
 * - pages always come from the network (prices and stock must be live); only when the network is down does the
 *   visitor get the offline page;
 * - built files (/_next/static, fingerprinted) and the site's icons and fonts are cached after first use;
 * - nothing else is touched: no API calls, no POSTs, no other sites.
 * Bump VERSION to drop old caches.
 */
const VERSION = "zx-site-v3";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE, "/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(?:woff2|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
