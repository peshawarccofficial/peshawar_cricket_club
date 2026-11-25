export function GET() {
  const worker = `
const CACHE = "pcc-admin-shell-v2";
const OFFLINE = "/admin/offline";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE, "/app-icon-192.png", "/app-icon-512.png", "/icon-192.png", "/icon-512.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("pcc-admin-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
  }
});
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "PCC Admin", {
    body: data.body || "A new club update is available.",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: data.tag || "pcc-admin-update",
    data: { url: data.url || "/admin?view=notifications" }
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "/admin", self.location.origin);
  if (target.origin !== self.location.origin || !(target.pathname === "/admin" || target.pathname.startsWith("/admin/"))) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if (new URL(client.url).origin === self.location.origin) return client.navigate(target.href).then(() => client.focus());
    }
    return self.clients.openWindow(target.href);
  }));
});
`;
  return new Response(worker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/admin"
    }
  });
}
