const CACHE = "hgz-cache-v36";

// Адреса с ?v= должны совпадать с index.html: иначе браузер сохранит одно,
// а страница попросит другое. Версия поднимается при правках style.css,
// app.js или qr.js — благодаря ей разметка и код не могут разъехаться:
// старая страница просит старые файлы, новая — новые, и пара всегда цела.
// Согласованность версий проверяет tools/check.mjs.

// Без этих файлов каталог не откроется вовсе — они обязательны.
const CORE = ["./", "./index.html", "./style.css?v=36", "./app.js?v=36", "./qr.js?v=36"];

// А эти каталог переживёт: товары и страницы завода и так берутся «сначала
// сеть», значок с манифестом нужны только при установке на телефон. Класть их
// в запас полезно, но срывать из-за них установку нельзя.
const EXTRA = ["./products.json", "./content.json", "./manifest.json", "./icon-192-v2.png", "./icon-512-v2.png"];

// Раньше весь список грузился одной командой addAll. Она атомарна: один
// недоступный адрес ронял установку целиком, новая версия не доходила до
// состояния «готова», полоса «Вышла новая версия» не появлялась — и человек
// неделями смотрел старый каталог, не зная об этом. Теперь обязательное и
// второстепенное разделены, и каждый файл кладётся отдельно.
async function precache() {
  const cache = await caches.open(CACHE);

  // cache: "reload" — берём с сети, минуя обычный кеш браузера. GitHub Pages
  // разрешает хранить ответ десять минут, и без этого в запас мог попасть
  // предыдущий файл, а не тот, ради которого поднимали версию.
  for (const url of CORE) {
    const res = await fetch(url, { cache: "reload" });
    if (!res || !res.ok) {
      // Бросаем осознанно: установка не состоится, а старая версия продолжит
      // работать как ни в чём не бывало. Это лучше, чем каталог без кода.
      throw new Error(`Не удалось загрузить обязательный файл: ${url}`);
    }
    await cache.put(url, res);
  }

  await Promise.all(
    EXTRA.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "reload" });
        if (res && res.ok) await cache.put(url, res);
      } catch (e) {
        // Молча пропускаем: этот файл попадёт в запас при первом обращении.
      }
    })
  );
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache());
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
