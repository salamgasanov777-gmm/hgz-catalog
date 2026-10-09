const CACHE = "hgz-cache-v102";

// Фотографии лежат в отдельном ящике, который переживает обновления версии:
// раньше они жили в CACHE и при каждом выпуске стирались вместе с ним —
// около 1,3 МБ заново у каждого клиента. Заменили фото под тем же именем —
// поднимите это число (при этом версию кода поднимать не нужно): старый ящик
// удалится, фото скачаются заново. Проверяет tools/check.mjs.
const PHOTOS = "hgz-photos-1";

// Адреса с ?v= должны совпадать с index.html: иначе браузер сохранит одно,
// а страница попросит другое. Версия поднимается при правках style.css,
// app.js или qr.js — благодаря ей разметка и код не могут разъехаться:
// старая страница просит старые файлы, новая — новые, и пара всегда цела.
// Согласованность версий проверяет tools/check.mjs.

// Без этих файлов каталог не откроется вовсе — они обязательны.
const CORE = ["./", "./index.html", "./style.css?v=102", "./app.js?v=102", "./qr.js?v=102", "./guard.js?v=102"];

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
        // Битые данные в запас не кладём — см. isGoodData ниже.
        if (res && res.ok && (!isData(url) || (await isGoodData(res, url)))) await cache.put(url, res);
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

// Удаляем только свои старые запасы (hgz-cache-…). Хранилище общее на весь
// адрес github.io, там же лежат запасы приложения №2 (habez-pro) — раньше
// каждое наше обновление стирало и их.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => (k.startsWith("hgz-cache-") && k !== CACHE) || (k.startsWith("hgz-photos-") && k !== PHOTOS))
            .map((k) => caches.delete(k))
        )
      )
  );
  self.clients.claim();
});

// Фотографии товаров не меняются: если фото заменили, у него будет другое имя
// файла, а если переснимут все — поднимем число PHOTOS выше. Поэтому картинки
// отдаём сразу из кеша, не спрашивая сеть. Раньше телефон на каждом открытии
// каталога запрашивал полсотни фотографий заново и, если связь подвисала,
// рисовал их наполовину.
// Сканы сертификатов (certs/имя.jpg) — туда же (с v102): меняются раз в
// несколько лет, а менеджер показывает их на объекте, часто без связи. Раньше
// они шли «сначала сеть» (до 4 с ожидания) и лежали в ящике версии — каждый
// выпуск их стирал. Заменили скан под тем же именем — поднимите PHOTOS.
function isPhoto(pathname) {
  return /\/(products|certs)\/[^/]+\.(jpe?g|webp|png)$/i.test(pathname);
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.status === 200) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy));
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

// Файлы данных: товары и страницы завода.
function isData(pathname) {
  return /\/(products|content)\.json$/i.test(pathname);
}

// Целы ли данные. Сайт может ответить «успешно» и испорченным файлом —
// например, если на сайт попала правка products.json с ошибкой. Раньше такой
// файл ложился в запас поверх хорошей копии, и каталог у клиентов пустел даже
// без интернета, пока не выложат исправление. Теперь битый файл не показываем
// и не сохраняем — остаётся прежняя копия.
async function isGoodData(res, pathname) {
  try {
    const data = await res.clone().json();
    if (/products\.json$/i.test(pathname)) {
      return Array.isArray(data) && data.length > 0 && data.every((p) => p && p.id != null && typeof p.name === "string");
    }
    return Boolean(data) && typeof data === "object" && !Array.isArray(data);
  } catch {
    return false;
  }
}

// Разметка, код и данные — сначала сеть, чтобы правки появлялись сразу. Но с
// ограничением: если за 4 секунды ответа нет, показываем сохранённую копию.
async function networkFirst(req) {
  // Страница с хвостом «?…» — та же главная: ссылка менеджера из QR
  // (?m=…&n=…), «Поделиться каталогом», метка ?new. Раньше её искали в запасе
  // по точному адресу, не находили — и без сети вместо сохранённого каталога
  // была ошибка браузера. Теперь берём сохранённую главную, а каждую такую
  // ссылку отдельной копией не храним.
  const url = new URL(req.url);
  const page = req.mode === "navigate" && url.search !== "";
  const data = isData(url.pathname);

  // good — ответ годится и показать, и сохранить: код 200, а у данных ещё и
  // целое содержимое. Проверка данных читает файл целиком, поэтому 4 секунды
  // ниже считаются до конца загрузки, а не до первого байта.
  const network = fetch(req).then(async (res) => {
    const good = Boolean(res) && res.status === 200 && (!data || (await isGoodData(res, url.pathname)));
    if (good && !page) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return { res, good };
  });

  const cached =
    (await caches.match(req)) ||
    (page ? (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html")) : undefined);
  // Копии ещё нет (первый заход) — отдаём, что пришло: каталог сам покажет
  // «Каталог не загрузился» с кнопкой «Обновить».
  if (!cached) return network.then((r) => r.res);

  try {
    const { res, good } = await withTimeout(network, 4000);
    // Сайт ответил ошибкой (404, сбой сервера) или прислал битые данные —
    // рабочая копия лучше страницы с ошибкой или пустого каталога.
    return good ? res : cached;
  } catch {
    return cached;
  }
}

// «Сразу копию, свежее — фоном» (с v98). Раньше при зависшей связи (полоска
// есть, данных нет — подвал, торговый зал) страница и данные ждали сеть до
// 4 секунд каждая, подряд: до 8 секунд «Загружаем каталог…», хотя всё лежало
// на телефоне. Теперь, если копия есть, отдаём её сразу, а свежую качаем
// следом и кладём в запас — каталог в это время уже открыт. Новое каталог
// замечает сам: через 3 секунды после запуска app.js сверяет данные с сайтом
// запросом cache: "reload" (он идёт «сначала сеть») и показывает полосу
// «Каталог обновился». Первый заход без копии — по-прежнему «сначала сеть».
const VERSION = CACHE.replace("hgz-cache-v", "");

async function refresh(url, data) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res || res.status !== 200) return;
    const path = new URL(url).pathname;
    if (data) {
      if (!(await isGoodData(res, path))) return;
    } else {
      // Свежая главная кладётся только если она просит те же файлы, что лежат
      // в запасе: иначе офлайн она запросила бы код, которого нет. Новый код
      // приходит обычным путём — полосой «Вышла новая версия».
      if (!(await res.clone().text()).includes(`app.js?v=${VERSION}`)) return;
    }
    const cache = await caches.open(CACHE);
    await cache.put(url, res);
  } catch {
    // Нет связи — копия остаётся прежней.
  }
}

async function showCachedThenRefresh(e) {
  const req = e.request;
  const url = new URL(req.url);
  const page = req.mode === "navigate";
  const search = page && url.search !== "";
  const cached =
    (await caches.match(req)) ||
    (search ? (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html")) : undefined);
  if (!cached) return networkFirst(req);
  if (!search) e.waitUntil(refresh(req.url, !page));
  return cached;
}

// Кому нужна свежая версия сразу, а не копия: проверка обновления в app.js
// (cache: "reload") и обновление страницы пальцем или кнопкой.
function wantsNetwork(req) {
  return req.cache === "reload" || (req.mode === "navigate" && req.cache === "no-cache");
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

  if (isPhoto(url.pathname) || versioned) {
    e.respondWith(cacheFirst(e.request, isPhoto(url.pathname) ? PHOTOS : CACHE));
    return;
  }
  // Страница и данные завода — копия сразу; всё прочее (манифест, значки,
  // сертификаты-картинки) — сначала сеть с ограничением.
  const showable = e.request.mode === "navigate" || isData(url.pathname);
  e.respondWith(showable && !wantsNetwork(e.request) ? showCachedThenRefresh(e) : networkFirst(e.request));
});
