const CACHE = "hgz-cache-v4";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./qr.js", "./products.json", "./manifest.json", "./icon-192-v2.png", "./icon-512-v2.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first: always try to get the latest version first. Only fall back
// to the cache when the network is unavailable (offline), so updates show
// up immediately instead of one visit behind.
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
