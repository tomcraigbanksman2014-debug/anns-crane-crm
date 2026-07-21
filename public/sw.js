self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "AnnS CRM", { body: data.body || "You have a diary update.", icon: "/web-app-manifest-192x192.png", badge: "/favicon-96x96.png", tag: data.tag || "shaun-diary", data: { url: data.url || "/shaun-diary" } }));
});
self.addEventListener("notificationclick", event => { event.notification.close(); const url = event.notification.data?.url || "/shaun-diary"; event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => { for (const client of list) { if ("focus" in client) { client.navigate(url); return client.focus(); } } return clients.openWindow(url); })); });
self.addEventListener("fetch", () => {});
