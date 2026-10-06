const CACHE = "hgz-cache-v73";

// Адреса с ?v= должны совпадать с index.html: иначе браузер сохранит одно,
// а страница попросит другое. Версия поднимается при правках style.css,
// app.js или qr.js — благодаря ей разметка и код не могут разъехаться:
// старая страница просит старые файлы, новая — новые, и пара всегда цела.
// Согласованность версий проверяет tools/check.mjs.

// Без этих файлов каталог не откроется вовсе — они обязательны.
const CORE = ["./", "./index.html", "./style.css?v=73", "./app.js?v=73", "./qr.js?v=73"];

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

  // Как брать файл, чтобы в запас не попала старая копия и ничего не
  // качалось дважды. Раньше всё бралось с cache: "reload" — мимо кеша
  // браузера, и при первом заходе человек скачивал каталог два раза: сначала
  // страница, потом запас.
  // - Файлы с ?v= в адресе берём как обычно: у новой версии другой адрес,
  //   старую копию под ним браузер найти не может, а свежую страница только
  //   что сама скачала.
  // - Остальные (разметка, товары) — no-cache: браузер обязательно сверяется
  //   с сайтом. GitHub Pages разрешает хранить ответ десять минут, и без
  //   сверки в запас мог попасть предыдущий файл. Если файл не менялся, сайт
  //   отвечает коротким «не изменилось», и он не качается заново.
  const mode = (url) => (url.includes("?v=") ? "default" : "no-cache");

  for (const url of CORE) {
    const res = await fetch(url, { cache: mode(url) });
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
        const res = await fetch(url, { cache: mode(url) });
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
  // Страница с хвостом «?…» — та же главная: ссылка менеджера из QR
  // (?m=…&n=…), «Поделиться каталогом», метка ?new. Раньше её искали в запасе
  // по точному адресу, не находили — и без сети вместо сохранённого каталога
  // была ошибка браузера. Теперь берём сохранённую главную, а каждую такую
  // ссылку отдельной копией не храним.
  const page = req.mode === "navigate" && new URL(req.url).search !== "";

  const network = fetch(req).then((res) => {
    if (res && res.status === 200 && !page) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });

  const cached =
    (await caches.match(req)) ||
    (page ? (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html")) : undefined);
  if (!cached) return network;

  try {
    const res = await withTimeout(network, 4000);
    // Сайт ответил ошибкой (404, сбой сервера) — рабочая копия лучше
    // страницы с ошибкой или битых данных.
    return res && res.status === 200 ? res : cached;
  } catch {
    return cached;
  }
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Ролики не трогаем вовсе — их берёт с сети сам браузер. Проигрыватель
  // просит их кусками (Range, ответ 206), а запас умеет хранить только файл
  // целиком. Если бы однажды пришёл целый файл, в запас лёг бы ролик в несколько мегабайт,
  // и потом запас отдавал бы его целиком на просьбу о куске — iPhone такое
  // играть отказывается. Без сети ролик честно не играет, об этом говорит
  // подпись под плеером.
  if (/\.(mp4|webm|mov|m4v)$/i.test(url.pathname)) return;

  // Сертификаты (PDF) — тоже мимо запаса: это сканы по 1–2 МБ, открываются
  // редко и по нажатию. Без сети файл не откроется, как и ролик.
  if (/\.pdf$/i.test(url.pathname)) return;

  // Стили и код с меткой версии (app.js?v=N) под этим адресом не меняются
  // никогда: правка кода — новый номер, новый адрес. Поэтому их, как и фото,
  // берём сразу из запаса. Раньше они шли «сначала сеть» и на еле живой связи
  // каждый ждал до 4 секунд: страница, стили, код, данные — до 12 секунд
  // пустого экрана. Цена решения — номер версии обязан подниматься при каждой
  // правке; забытый подъём ловит tools/check.mjs (сравнивает с опубликованным).
  const versioned = e.request.mode !== "navigate" && /\.(css|js)$/i.test(url.pathname) && /[?&]v=\d+/.test(url.search);

  e.respondWith(isPhoto(url.pathname) || versioned ? cacheFirst(e.request) : networkFirst(e.request));
});
