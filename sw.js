const CACHE = "hgz-cache-v22";
// Адреса с ?v= должны совпадать с index.html: иначе браузер сохранит одно,
// а страница попросит другое. Версия поднимается при правках style.css,
// app.js или qr.js — благодаря ей разметка и код не могут разъехаться:
// старая страница просит старые файлы, новая — новые, и пара всегда цела.
const ASSETS = ["./", "./index.html", "./style.css?v=23", "./app.js?v=23", "./qr.js?v=23", "./products.json", "./content.json", "./manifest.json", "./icon-192-v2.png", "./icon-512-v2.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  // Раньше здесь стоял skipWaiting и новая версия молча подменяла старую
  // посреди работы. Теперь она ждёт в стороне, каталог показывает полосу
  // «Вышла новая версия», и подмена происходит по нажатию кнопки.
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Фотографии товаров не меняются: если фото заменили, у него будет другое имя
// файла, а если переснимут все — поднимем версию кеша выше. Поэтому картинки
// отдаём сразу из кеша, не спрашивая сеть. Раньше телефон на каждом открытии
// каталога запрашивал полсотни фотографий заново и, если связь подвисала,
// рисовал их наполовину.
function isPhoto(pathname) {
  return /\/products\/[^/]+\.(jpe?g|webp|png)$/i.test(pathname);
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.status === 200) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

// Ждать сеть вечно нельзя: зависшее соединение — это не «нет интернета»,
// ошибки не будет никогда, и каталог просто не откроется.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Разметка, код и данные — сначала сеть, чтобы правки появлялись сразу. Но с
// ограничением: если за 4 секунды ответа нет, показываем сохранённую копию.
async function networkFirst(req) {
  const network = fetch(req).then((res) => {
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });

  const cached = await caches.match(req);
  if (!cached) return network;

  try {
    return await withTimeout(network, 4000);
  } catch {
    return cached;
  }
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(isPhoto(url.pathname) ? cacheFirst(e.request) : networkFirst(e.request));
});
