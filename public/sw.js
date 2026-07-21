self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("push", (event) => {
  let data = {}; try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "AnnS CRM";
  event.waitUntil(self.registration.showNotification(title, { body: data.body || "You have a diary reminder.", icon: "/web-app-manifest-192x192.png", badge: "/favicon-96x96.png", tag: data.tag || "anns-crm", renotify: true, data: { url: data.url || "/shaun-diary" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); const target = event.notification.data?.url || "/shaun-diary";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => { for (const client of clients) { if ("focus" in client) { client.navigate(target); return client.focus(); } } return self.clients.openWindow(target); }));
});
