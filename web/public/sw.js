// Offline shell for the web version: app files cache-first, everything else straight to the network
// (timetables and grades are cached by the app itself in localStorage).
const CACHE = "bp-shell-v2";
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
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/relay") || url.pathname.startsWith("/cal") || url.pathname.startsWith("/push") || url.pathname === "/me") return;
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

// Web Push (sent by the Worker's check loop, worker/src/push.ts). iOS shows these only for the app added to the home screen.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Bakaláři+", {
    body: d.body || "", tag: d.tag, icon: "./icon-192.png", badge: "./icon-192.png", data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) { if ("focus" in w) { w.navigate(target).catch(() => {}); return w.focus(); } }
    return self.clients.openWindow(target);
  }));
});
