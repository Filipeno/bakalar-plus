// Offline shell for the web version: app files cache-first, everything else straight to the network
// (timetables and grades are cached by the app itself in localStorage).
const CACHE = "bp-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/relay") || url.pathname.startsWith("/cal")) return;
  // HTML: network first (fresh deploys), fall back to cache offline. Hashed assets: cache first.
  const isPage = e.request.mode === "navigate";
  e.respondWith(
    (isPage ? fetch(e.request).catch(() => caches.match("./index.html")) : caches.match(e.request).then((hit) => hit || fetch(e.request)))
      .then((res) => {
        if (res && res.ok && !isPage) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
  );
});
