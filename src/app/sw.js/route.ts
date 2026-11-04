/**
 * The service worker of the installed app, served at /sw.js (public; see the matcher in src/proxy.ts).
 *
 * It is deliberately small and keeps business data out of the cache:
 * - build files (/_next/static, hashed names), app icons and launch images: cache first;
 * - page loads: always the network; only when that fails, the offline page (/offline.html);
 * - everything else (API calls, server actions, page data, PDFs, prints): not touched, never cached.
 *
 * The version changes with every build, so the browser sees a new worker after a deploy; it waits until the user
 * presses Refresh in the "new version" message (components/pwa/sw-register.tsx), which posts SKIP_WAITING.
 */
const VERSION = process.env.APP_VERSION ?? "dev";

const source = `// Zeronix OS service worker, build ${VERSION}
const VERSION = ${JSON.stringify(VERSION)};
const STATIC_CACHE = "zeronix-static-" + VERSION;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/zeronix-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("zeronix-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // pages are never stored; the offline page only stands in when the network is gone
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok && res.type === "basic") cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
  // anything else goes straight to the network, untouched
});
`;

// rendered per request, so our no-cache header is what the browser gets (a prerendered route would be cached)
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
