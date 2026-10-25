// Service worker of the push notices. The push carries no text: it only wakes this worker, which asks the server for the latest event.
// It does no caching and never intercepts page requests.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let ev = null;
    try {
      const r = await fetch("/api/aovivo/ultimo", { cache: "no-store" });
      if (r.ok) ev = await r.json();
    } catch { /* offline: the generic text below */ }
    // A browser demands a visible notification for every push, so there is always one.
    await self.registration.showNotification(ev?.titulo || "Radar do Voto", {
      body: ev?.texto || "Há novidade na apuração. Abra o Radar para ver.",
      tag: ev?.id || "radar",
      lang: "pt-BR",
      data: { url: "/#aovivo" },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const aberta = abertas.find((c) => new URL(c.url).origin === self.location.origin);
    if (aberta) {
      await aberta.focus();
      try { await aberta.navigate(e.notification.data?.url || "/"); } catch { /* a tab this worker does not control: it is already focused */ }
      return;
    }
    await self.clients.openWindow(e.notification.data?.url || "/");
  })());
});
