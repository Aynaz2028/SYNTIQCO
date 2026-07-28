self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = { title: "HabitFirst", body: "You have a topic due for review.", url: "/dashboard" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/window.svg",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(self.clients.openWindow(url));
});
