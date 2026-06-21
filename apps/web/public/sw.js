self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("cubino-shell-v1").then((c) => c.addAll(["/app", "/manifest.json"])));
  self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("/app"))
    );
  }
});

self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? { title: "Cubino", body: "New notification" };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      data: { url: data.url ?? "/app" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/app";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
