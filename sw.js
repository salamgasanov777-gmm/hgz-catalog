// «Выключатель» старого офлайн-режима каталога на github.io (22.10.2026).
// У кого остался значок со старого адреса, телефон сам скачает этот файл,
// сотрёт старые копии каталога, снимет офлайн-режим и откроет страницу заново —
// а она перекинет на habez-catalog.ru.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Взять открытую страницу под себя: без этого браузер не даёт её перезагрузить,
    // и человек ещё раз видит старую копию (проверено 22.10.2026).
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const pages = await self.clients.matchAll({ type: "window" });
    pages.forEach((p) => p.navigate(p.url));
  })());
});
