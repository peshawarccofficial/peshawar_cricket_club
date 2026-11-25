const CACHE_NAME = "pcc-shell-v1";
const APP_SHELL = ["/offline", "/icon-192.png", "/icon-512.png", "/icon-96.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || (await caches.match("/offline"))));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok && new URL(request.url).pathname.startsWith("/_next/static/")) {
      const copy = response.clone();
      void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Peshawar Cricket Club";
  const options = {
    body: data.body || "There's a new cricket update.",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: { url: data.url || "/" },
    tag: data.tag || "pcc-update"
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) return client.navigate(target.href).then(() => client.focus());
    }
    return self.clients.openWindow(target.href);
  }));
});
