// Offline support: serve the app shell from cache, refresh it in the background.
// Supabase API calls are never cached; they always go to the network.
const CACHE = "lsbf-advisor-v3";
const SHELL = ["./", "index.html", "css/styles.css", "js/config.js", "js/data.js", "js/app.js", "manifest.webmanifest", "icon.svg"];
const CACHEABLE_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin && !CACHEABLE_HOSTS.includes(url.hostname)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then(hit => {
    const net = fetch(e.request).then(res => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => hit || Response.error());
    return hit || net;
  }));
});
