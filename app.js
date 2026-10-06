let products = [];

// Порядок разделов в меню и в общем списке. Так решил владелец: сначала
// гипсовые штукатурки и шпаклёвки, за ними гипс и жидкие шпаклёвки, потом
// цементные и прочие смеси, потом грунтовки и краски, затирки после них,
// и в самом конце листовое — гипсокартон, плиты, профили. Порядок товаров внутри раздела —
// как в products.json. Раздел, которого здесь нет, встанет в конец — но лучше вписать.
const CATEGORY_ORDER = [
  "Гипсовая штукатурка",
  "Шпаклёвки",
  "Гипс",
  "Жидкие шпаклёвки",
  "Цементные и цементно-известковые штукатурки",
  "Клеи",
  "Полы",
  "Монтажные смеси",
  "Гидроизоляция",
  "Грунтовки",
  "Краски",
  "Затирки",
  "Гипсокартон",
  "Пазогребневые плиты",
  "Профили и подвесы",
];

function categoryRank(cat) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
let activeCategory = "Все";
let activeTask = null;
let currentProduct = null;

// Подбор по задаче: у большинства товаров ответ уже есть в таблице «Область
// применения», у грунтовок и красок такой таблицы нет — им задачи проставлены
// полем "tasks" в products.json.
const TASKS = [
  { key: "wet", label: "Ванная", needles: ["повышенным уровнем влажности"] },
  { key: "dry", label: "Комната", needles: ["нормальным уровнем влажности"] },
  { key: "facade", label: "Фасад", needles: ["асад"] },
  { key: "floor-heat", label: "Тёплый пол", needles: ["теплых полов"] },
  { key: "plinth", label: "Цоколь", needles: ["Сложные поверхности", "Цоколь"] },
];

function matchesTask(p, taskKey) {
  if (Array.isArray(p.tasks)) return p.tasks.includes(taskKey);

  const task = TASKS.find((t) => t.key === taskKey);
  const table = (p.tables || []).find((t) => t.title === "Область применения");
  if (!task || !table) return false;

  return table.rows.some(([label, value]) => value === "ДА" && task.needles.some((n) => label.includes(n)));
}

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem("hgz-favorites") || "[]"));
  } catch {
    return new Set();
  }
}
let favorites = loadFavorites();

function isFavorite(id) {
  return favorites.has(id);
}

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
    // Убрали из избранного — убираем и из заявки, чтобы при следующем
    // добавлении не всплыло старое количество.
    if (order[id]) {
      delete order[id];
      saveOrder();
    }
  } else favorites.add(id);
  // Safari с запретом cookie бросает исключение при записи — избранное тогда
  // живёт до закрытия страницы, но каталог не обрывается.
  try {
    localStorage.setItem("hgz-favorites", JSON.stringify([...favorites]));
  } catch {}
}

// Тема по умолчанию как на телефоне: днём светлая, ночью тёмная, и меняется сама,
// даже пока каталог открыт. Вручную её можно переключить пунктом меню «⋯»:
// как на телефоне → светлая → тёмная → снова как на телефоне. Ручной выбор
// хранится в hgz-theme-choice; пока его нет, тема идёт за системой. Старый
// ключ hgz-theme стираем: прежний выбор владельца не должен перебивать телефон.
const THEME_KEY = "hgz-theme-choice";
try {
  localStorage.removeItem("hgz-theme");
} catch {}

const systemDark = matchMedia("(prefers-color-scheme: dark)");

function themeChoice() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

// Цвет полосы статуса на телефоне. Светлое значение — то же, что в
// index.html и manifest.json: раньше скрипт ставил свой оттенок (#2c4f78),
// и через миг после загрузки полоса меняла цвет. Теперь значение одно.
const THEME_COLOR = { light: "#1f3b57", dark: "#0e1318" };

// Значки режимов: полукруг — как на телефоне, солнце, луна.
const THEME_ICON = {
  auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  light:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  dark: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.7 6.7 0 0 0 9.7 9.7z"/>',
};
const THEME_LABEL = { auto: "Тема: как на телефоне", light: "Тема: светлая", dark: "Тема: тёмная" };

function applyTheme() {
  const choice = themeChoice();
  if (choice) document.documentElement.setAttribute("data-theme", choice);
  else document.documentElement.removeAttribute("data-theme");

  const dark = (choice || (systemDark.matches ? "dark" : "light")) === "dark";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light);

  const mode = choice || "auto";
  document.getElementById("theme-icon").innerHTML = THEME_ICON[mode];
  document.getElementById("theme-label").textContent = THEME_LABEL[mode];
}

document.getElementById("theme-btn").addEventListener("click", () => {
  const next = { auto: "light", light: "dark", dark: null }[themeChoice() || "auto"];
  try {
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
  } catch {}
  applyTheme();
});

// Сменилась тема телефона (наступила ночь) — подхватываем, если выбрано «как на телефоне».
// На iOS 13 у списка медиазапросов есть только старый addListener.
if (systemDark.addEventListener) systemDark.addEventListener("change", applyTheme);
else if (systemDark.addListener) systemDark.addListener(applyTheme);
applyTheme();

// Данные, с которыми открыт каталог, и когда их последний раз сверяли с сайтом.
const dataText = { products: "", content: "" };
let dataCheckedAt = 0;

async function load() {
  let res;
  // Оба файла запрашиваем сразу, а не по очереди: на медленной связи второй
  // запрос не ждёт окончания первого. Ошибку страниц завода ловим здесь же,
  // чтобы она не всплыла необработанной, пока ждём товары.
  const infoRequest = fetch("./content.json", { cache: "no-cache" }).catch(() => null);
  try {
    // no-cache, а не no-store: свежесть та же — браузер каждый раз сверяется
    // с сайтом, — но ответ остаётся в его кеше. При первом заходе запас
    // (sw.js) забирает товары оттуда, а не качает все 350 КБ второй раз.
    res = await fetch("./products.json", { cache: "no-cache" });
    // Текст запоминаем: по нему потом видно, поменялись ли данные на сайте.
    dataText.products = await res.text();
    products = JSON.parse(dataText.products);
    // Сортировка устойчивая: внутри раздела товары идут как в products.json.
    products.sort((x, y) => categoryRank(x.category) - categoryRank(y.category));
  } catch (e) {
    // Первый заход на плохой связи: сохранённой копии ещё нет, а без товаров
    // показывать нечего. Молчать нельзя — человек увидит пустой белый экран и
    // решит, что каталог сломан.
    document.getElementById("grid").innerHTML =
      `<div class="empty">Каталог не загрузился.<br>Проверьте связь и попробуйте ещё раз.` +
      `<button class="empty-retry" id="empty-retry">Обновить</button></div>`;
    // Обработчик вешаем из скрипта, а не атрибутом onclick: правило
    // безопасности в index.html (CSP) запрещает скрипты внутри разметки.
    document.getElementById("empty-retry").addEventListener("click", () => location.reload());
    return;
  }
  // Страницы про сам завод лежат отдельным файлом: их наполняют текстом и
  // ссылками, а не карточками товаров, и без них каталог обязан работать.
  try {
    const info = await infoRequest;
    dataText.content = info && info.ok ? await info.text() : "";
    content = dataText.content ? JSON.parse(dataText.content) : null;
  } catch {
    content = null;
  }
  dataCheckedAt = Date.now();

  renderHome();
  render();
  openFromHash();
  warmPhotoCache();
}

// Фото завода в первом экране. Лежит в products/, поэтому service worker
// кладёт его в запас так же, как фото товаров.
const HOME_PHOTO = "products/factory-2.jpg";

// Первый экран общего списка и подвал. Раньше каталог начинался сразу со
// списка товаров: человек не видел, чей это каталог, а до разделов добирался
// только через меню ☰. Теперь сверху короткая справка о заводе с кнопками
// страниц завода и лента разделов, внизу — реквизиты и контакты из
// content.json. Меню ☰ после этого убрано: оно только дублировало одно и то же.
// Кто сделал приложение: имя, чем занимается, сайт, телефон и WhatsApp.
// Данные — content.json → developer. Нет блока — подвал без подписи.
function developerHtml(d) {
  if (!d || !d.name) return "";
  const tel = String(d.phone || "").replace(/[^\d+]/g, "");
  const wa = tel.replace(/\D/g, "");
  const host = d.site ? d.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "";
  const hello = encodeURIComponent("Здравствуйте! Увидел каталог завода, хочу узнать про ваши услуги.");
  return `
        <div class="site-foot-dev">
          <div class="site-foot-dev-label">Разработчик приложения</div>
          <div class="site-foot-dev-name">${esc(d.name)}${d.brand ? ` · ${esc(d.brand)}` : ""}</div>
          ${d.about ? `<div class="site-foot-dev-about">${esc(d.about)}</div>` : ""}
          <div class="site-foot-dev-links">
            ${d.site ? `<a href="${esc(d.site)}" target="_blank" rel="noopener">${esc(host)}</a>` : ""}
            ${tel ? `<a href="tel:${esc(tel)}">Позвонить</a>` : ""}
            ${wa ? `<a href="https://wa.me/${esc(wa)}?text=${hello}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
            ${d.instagram ? `<a href="https://instagram.com/${esc(d.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ""}
          </div>
        </div>`;
}

function renderHome() {
  const intro = document.getElementById("home-intro");
  const rail = document.getElementById("home-rail");
  const foot = document.getElementById("site-foot");
  // Элементов может не быть, если у человека в кеше осталась прежняя
  // index.html, — тогда просто без первого экрана.
  if (!intro || !rail || !foot) return;

  const n = products.length;
  intro.innerHTML = `
    <div class="home-photo" style="background-image:url('${photoUrl({ photo: HOME_PHOTO })}')" aria-hidden="true"></div>
    <div class="home-text">
      <div class="home-eyebrow">Производитель · с 1991 года</div>
      <h2 class="home-title">Сухие смеси, гипс и&nbsp;гипсокартон</h2>
      <p class="home-lead">Добыча гипсового камня и производство в Карачаево-Черкесии. ${n} ${plural(n, ["товар", "товара", "товаров"])} с характеристиками, ГОСТами и расчётом расхода.</p>
      <div class="home-links">
        <button type="button" data-page="stores">Где купить</button>
        <button type="button" data-page="contact">Связаться</button>
        <button type="button" data-page="about">О заводе</button>
        <button type="button" data-page="videos">Видео</button>
      </div>
    </div>`;

  const cats = CATEGORY_ORDER.map((cat) => ({ cat, items: products.filter((p) => p.category === cat) })).filter((c) => c.items.length);
  rail.innerHTML = `
    <div class="home-rail-head">Разделы <span>${cats.length}</span></div>
    <div class="home-rail-list">${cats
      .map(
        (c) => `<button type="button" class="home-cat" data-cat="${esc(c.cat)}">
          <span class="home-cat-img" data-src="${photoUrl(c.items[0])}" aria-hidden="true"></span>
          <span class="home-cat-name">${esc(c.cat)}</span>
          <span class="home-cat-n">${c.items.length}</span>
        </button>`
      )
      .join("")}</div>`;
  // Значки разделов грузятся, когда лента до них доезжает: на телефоне
  // видны два-три, остальные уехали вправо и первому экрану не нужны.
  rail.querySelectorAll(".home-cat-img").forEach(lazyPhoto);
  rail.querySelectorAll("[data-cat]").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectCategory(btn.dataset.cat);
      scrollTo({ top: 0 });
    })
  );

  // Без content.json подвалу нечего показать — он остаётся скрытым.
  const a = content && content.about;
  if (a) {
    // Телефон, сайт, ИНН и ОГРН в подвале убраны по решению владельца: всё это
    // есть на странице «О заводе» и «Связаться».
    foot.innerHTML = `
      <div class="site-foot-in">
        <div>
          <div class="site-foot-name">${esc(a.company || "Хабезский гипсовый завод")}</div>
          ${a.address ? `<div class="site-foot-addr">${esc(a.address)}</div>` : ""}
        </div>
        <div class="site-foot-links">
          <button type="button" data-page="stores">Где купить</button>
          <button type="button" data-page="contact">Связаться</button>
          <button type="button" data-page="about">О заводе</button>
          <button type="button" data-page="videos">Видео</button>
        </div>
        ${developerHtml(content.developer)}
      </div>`;
    foot.hidden = false;
  }

  [intro, foot].forEach((box) =>
    box.querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => openPage(btn.dataset.page)))
  );
}

// Справка о заводе и лента разделов нужны только в общем списке. Когда
// человек ищет, выбрал раздел или задачу, они уходят и не отодвигают
// результаты вниз.
function showHome(on) {
  ["home-intro", "home-rail"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.hidden === on) el.hidden = !on;
  });
}

let content = null;

function openFromHash() {
  const m = location.hash.match(/#p=(\d+)/);
  if (!m) return;
  const p = products.find((x) => String(x.id) === m[1]);
  if (p) openSheet(p);
}


// ------------------------------------------------- Страницы про завод
// Все три пункта показываются всегда, даже пустые: так решил владелец —
// наполнять он будет постепенно, а видеть разделы хочет уже сейчас. Пустой
// раздел честно пишет, что данные появятся позже, а не притворяется рабочим.
// Точки продаж ищутся по городу, улице и названию магазина. Город достаём из
// адреса — это всё, что стоит до первой запятой, без сокращения «г.», «с.» и
// прочих. Поле "city" в content.json главнее: им можно поправить адрес,
// записанный не по шаблону, не переписывая сам адрес.
const CITY_PREFIX = /^(?:г|гор|город|с|село|пос|п|пгт|а|аул|х|хут|ст|станица|мкр)\.?\s+/i;

function storeCity(s) {
  if (s && s.city) return String(s.city).trim();
  const head = String((s && s.address) || "").split(",")[0].trim();
  return head.replace(CITY_PREFIX, "").trim() || "Другие адреса";
}

// Города идут по числу точек, от большего к меньшему, и только при равенстве —
// по алфавиту. Так Махачкала с её четырьмя адресами стоит первой, а не
// четвёртой после Дербентского района, как выходило при обычной сортировке.
// Правило само себя поддерживает: появятся точки в другом городе — он и
// поднимется, руками список править не нужно.
function storeCities(all) {
  const count = new Map();
  all.forEach((s) => {
    const c = storeCity(s);
    count.set(c, (count.get(c) || 0) + 1);
  });
  return [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b, "ru"));
}

let storeQuery = "";
let storeCityFilter = "Все";

// У точки может быть и один телефон, и два: на заводском листе адресов у
// половины баз по два номера. В content.json пишется либо строкой, либо
// списком — код принимает оба вида.
function storePhones(s) {
  const raw = Array.isArray(s.phone) ? s.phone : [s.phone];
  return raw.filter(Boolean).map((t) => String(t).trim()).filter(Boolean);
}

function storeMatches(s, q) {
  if (!q.trim()) return true;
  const hay = normalizeText([s.name, s.address, storeCity(s), s.hours, ...storePhones(s)].filter(Boolean).join(" "));
  return normalizeText(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function storeCardHtml(s) {
  const lines = [s.address, s.hours].filter(Boolean).map((t) => `<p class="line">${esc(t)}</p>`).join("");
  const phones = storePhones(s);
  // Когда номеров два, у каждого своя кнопка: иначе непонятно, куда звонит
  // общая кнопка «Позвонить», и второй номер остаётся просто текстом.
  const callLabel = (t, i) => (phones.length > 1 ? `Позвонить ${i + 1}` : "Позвонить");
  const actions = phones.map(
    (t, i) => `<a href="tel:${esc(t.replace(/[^+\d]/g, ""))}">${callLabel(t, i)}</a>`
  );
  if (s.address) actions.push(`<a href="https://yandex.ru/maps/?text=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">Открыть в картах</a>`);
  return `<div class="store-card"><p class="name">${esc(s.name || "")}</p>${lines}${
    phones.map((t) => `<p class="line">${esc(t)}</p>`).join("")
  }${actions.length ? `<div class="store-actions">${actions.join("")}</div>` : ""}</div>`;
}

function storePlural(n, one, few, many) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

// Когда городов несколько и ни один не выбран, карточки идут группами с
// заголовком города: видно всю географию сразу, ещё до всякого поиска.
function storeResultsHtml(all, cities) {
  const found = all.filter((s) => (storeCityFilter === "Все" || storeCity(s) === storeCityFilter) && storeMatches(s, storeQuery));
  const total = all.length;
  const count = found.length === total
    ? `${total} ${storePlural(total, "точка продаж", "точки продаж", "точек продаж")}`
    : `Найдено: ${found.length} из ${total}`;
  const head = total >= 4 || cities.length > 1 ? `<p class="store-count">${count}</p>` : "";
  if (!found.length) {
    return head + `<p class="page-empty">Ничего не нашлось. Попробуйте другой город или часть названия улицы.</p>`;
  }
  if (cities.length < 2 || storeCityFilter !== "Все") {
    return head + found.map(storeCardHtml).join("");
  }
  return head + cities
    .map((city) => {
      const items = found.filter((s) => storeCity(s) === city);
      if (!items.length) return "";
      return `<h3 class="store-city">${esc(city)}<span>${items.length}</span></h3>${items.map(storeCardHtml).join("")}`;
    })
    .join("");
}

// ------------------------------------------------- Контакт менеджера
// Каталогом пользуется не один человек: у завода региональные менеджеры в
// разных республиках. Поэтому ничей номер в коде не зашит. Менеджер вписывает
// свой контакт у себя на телефоне — и QR-код начинает нести этот контакт
// параметрами (`?m=79280000000&n=Имя Фамилия`). Клиент, открывший каталог по
// такому коду, видит блок «Ваш менеджер», и кнопка «Отправить в WhatsApp» на
// карточке товара пишет сразу ему. Кто пришёл по обычной ссылке, видит общий
// телефон отдела продаж завода из content.json.
const MANAGER_KEY = "hgz-manager";
const MANAGER_ROLE = "Региональный менеджер";
// Ёмкость нашего генератора QR — 213 байт (см. qr.js). Всё, что в ссылке
// после номера, уже percent-кодировано, то есть чистый ASCII: длина строки и
// есть длина в байтах.
const QR_LIMIT = 213;

let manager = null;
let qrNameTrimmed = false;

function loadManager() {
  try {
    const raw = localStorage.getItem(MANAGER_KEY);
    manager = raw ? JSON.parse(raw) : null;
  } catch (e) {
    manager = null;
  }
  // Сохранённое перепроверяем так же строго, как ввод: номер идёт в ссылки
  // tel: и wa.me, имя — на экран. Всё, что не похоже на номер, отбрасываем.
  const phone = manager && typeof manager === "object" ? phoneDigits(manager.phone) : "";
  manager = phone
    ? { name: String(manager.name || "").trim().replace(/\s+/g, " ").slice(0, 60), phone, own: manager.own === true }
    : null;
}

function saveManager(m) {
  manager = m;
  try {
    if (m) localStorage.setItem(MANAGER_KEY, JSON.stringify(m));
    else localStorage.removeItem(MANAGER_KEY);
  } catch (e) {}
}

// Из «8-938-777-74-40» получаем 79387777440 — в таком виде номер нужен и
// ссылке wa.me, и параметру в QR-коде. Пустая строка означает «не номер».
function phoneDigits(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length === 11 && d[0] === "7" ? d : "";
}

function phonePretty(raw) {
  const d = phoneDigits(raw);
  if (!d) return String(raw || "");
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

function managerName() {
  return (manager && manager.name) || "Менеджер завода";
}

// Контакт, приехавший в адресе с QR-кода менеджера. Параметры сразу
// вычищаем из строки браузера: иначе номер уедет дальше, если клиент
// перешлёт ссылку кому-то ещё, и попадёт в закладку.
//
// Ссылку может собрать кто угодно, поэтому молча она контакт не подменяет:
// раньше чужая ссылка с подписью «Менеджер завода» навсегда перехватывала
// заявки клиента в WhatsApp, а на телефоне самого менеджера затирала его
// собственный контакт — и его QR-код переставал нести его номер.
//   • свой контакт менеджера (own) ссылкой не заменяется никогда;
//   • иначе — только с согласия человека: «Записать менеджера …?» или
//     «Сменить менеджера на …?». Раньше у нового клиента первая же ссылка
//     записывалась молча, и ею можно было выдать себя за менеджера завода
//     (находка проверки Strix, 28.09.2026).
// Возвращает контакт-кандидат, о котором нужно спросить, или null, если
// делать ничего не нужно.
function readManagerFromUrl() {
  const q = new URLSearchParams(location.search);
  if (!q.has("m") && !q.has("n")) return null;
  const phone = phoneDigits(q.get("m"));
  const name = (q.get("n") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  q.delete("m");
  q.delete("n");
  const rest = q.toString();
  history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  if (!phone) return null;
  if (manager && manager.own) return null;
  // Номер тот же, а имя другое — тоже спрашиваем, а не переписываем молча:
  // правило «ссылка ничего не записывает без согласия» касается и имени.
  if (manager && manager.phone === phone && (!name || name === manager.name)) return null;
  return { name, phone, own: false };
}

// Адрес для QR-кода. Длинное имя подрезаем по словам, пока ссылка не влезет в
// код: лучше «Магомедсалам» без отчества, чем ошибка вместо картинки.
function qrLink() {
  const base = catalogUrl();
  qrNameTrimmed = false;
  if (!(manager && manager.own && manager.phone)) return base;
  const head = `${base}${base.includes("?") ? "&" : "?"}m=${manager.phone}`;
  const words = String(manager.name || "").trim().split(/\s+/).filter(Boolean);
  for (let n = words.length; n > 0; n--) {
    const url = `${head}&n=${encodeURIComponent(words.slice(0, n).join(" "))}`;
    if (url.length <= QR_LIMIT) {
      qrNameTrimmed = n < words.length;
      return url;
    }
  }
  qrNameTrimmed = words.length > 0;
  return head;
}

function managerCardHtml() {
  if (!manager) return "";
  const wa = `https://wa.me/${manager.phone}`;
  return `<h3 class="contact-head">${manager.own ? "Ваш контакт в каталоге" : "Ваш менеджер"}</h3>` +
    `<div class="store-card"><p class="name">${esc(managerName())}</p>` +
    `<p class="line">${esc(MANAGER_ROLE)}</p>` +
    `<p class="line">${esc(phonePretty(manager.phone))}</p>` +
    `<div class="store-actions"><a href="tel:+${esc(manager.phone)}">Позвонить</a>` +
    `<a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></div></div>`;
}

function factoryContactHtml(c) {
  const a = (c && c.about) || {};
  if (!a.phone) return "";
  const digits = phoneDigits(a.phone);
  const wa = digits ? `<a href="https://wa.me/${digits}" target="_blank" rel="noopener">WhatsApp</a>` : "";
  return `<h3 class="contact-head">Отдел продаж завода</h3>` +
    `<div class="store-card"><p class="name">${esc(a.company || "Завод")}</p>` +
    `<p class="line">${esc(a.phone)}</p>` +
    `<div class="store-actions"><a href="tel:${esc(String(a.phone).replace(/[^+\d]/g, ""))}">Позвонить</a>${wa}</div></div>`;
}

const PAGES = [
  {
    key: "contact",
    label: "Связаться",
    render: (c) => {
      const html = managerCardHtml() + factoryContactHtml(c);
      if (!html) {
        return `<p class="page-empty">Контакты появятся здесь.</p>`;
      }
      if (!manager) {
        return html + `<p class="page-empty">Если вы откроете каталог по QR-коду менеджера, здесь появится его имя и телефон.</p>`;
      }
      return html;
    },
  },
  {
    key: "about",
    label: "О заводе",
    render: (c) => {
      const a = c && c.about;
      if (!a) return `<p class="page-empty">Сведения о заводе появятся здесь.</p>`;
      let html = "";
      if (a.company) html += `<p class="page-lead">${esc(a.company)}</p>`;
      if (a.address) html += `<p class="page-sub">${esc(a.address)}</p>`;
      if (a.director) html += `<p class="page-sub">Генеральный директор — ${esc(a.director)}</p>`;
      if (a.inn || a.ogrn) {
        const legal = [a.inn && `ИНН ${a.inn}`, a.ogrn && `ОГРН ${a.ogrn}`].filter(Boolean).join(" · ");
        html += `<p class="page-sub">${esc(legal)}</p>`;
      }
      // Телефон отдела продаж — общий контакт завода. Он же достаётся тому,
      // кто открыл каталог по обычной ссылке, без QR-кода менеджера.
      if (a.phone) html += `<p class="page-sub">Отдел продаж — ${esc(a.phone)}</p>`;
      if (a.site) html += `<a class="page-link" href="${esc(a.site)}" target="_blank" rel="noopener">${esc(a.site.replace(/^https?:\/\//, ""))}</a>`;
      if (a.phone) {
        html += `<div class="store-actions about-actions"><a href="tel:${esc(String(a.phone).replace(/[^+\d]/g, ""))}">Позвонить в отдел продаж</a></div>`;
      }
      (a.paragraphs || []).forEach((t) => (html += `<p class="page-text">${esc(t)}</p>`));
      if ((a.photos || []).length) {
        html += `<div class="about-photos">${(a.photos || [])
          .map((src) => `<div style="background-image:url('${photoUrl({ photo: src })}')"></div>`)
          .join("")}</div>`;
      }
      if (!(a.paragraphs || []).length) {
        html += `<p class="page-empty">Рассказ о производстве и фотографии завода появятся здесь, как только их пришлёт завод.</p>`;
      }
      return html;
    },
  },
  {
    key: "stores",
    label: "Где купить",
    render: (c) => {
      const all = (c && c.stores) || [];
      // Раздел открывается заново каждый раз — начинаем с чистого поиска,
      // иначе человек вернётся и увидит вчерашний отфильтрованный список.
      storeQuery = "";
      storeCityFilter = "Все";
      if (!all.length) {
        return `<p class="page-empty">Список точек продаж скоро появится здесь. Пока адрес ближайшего магазина подскажет менеджер.</p>`;
      }
      const cities = storeCities(all);
      // Пока точек мало и все они в одном городе, искать нечего: строка поиска
      // и полоса городов только мешали бы. Появятся сами, когда список вырастет.
      const finder = all.length >= 4 || cities.length > 1;
      let html = "";
      if (finder) {
        html += `<input id="store-search" class="search store-search" type="search" inputmode="search" autocomplete="off" placeholder="Город, улица или магазин…" aria-label="Поиск точки продаж">`;
        if (cities.length > 1) {
          html += `<div id="store-cities" class="task-row store-cities">${["Все", ...cities]
            .map((x) => `<button class="task-chip${x === "Все" ? " active" : ""}" data-city="${esc(x)}">${esc(x === "Все" ? "Все города" : x)}</button>`)
            .join("")}</div>`;
        }
      }
      return html + `<div id="store-results">${storeResultsHtml(all, cities)}</div>`;
    },
    // Строка поиска и кнопки городов оживают уже после вставки разметки:
    // перерисовываем только список, поле ввода при этом не теряет фокус.
    after: () => {
      const box = document.getElementById("store-results");
      if (!box) return;
      const all = (content && content.stores) || [];
      const cities = storeCities(all);
      const redraw = () => { box.innerHTML = storeResultsHtml(all, cities); };
      const input = document.getElementById("store-search");
      if (input) input.addEventListener("input", () => { storeQuery = input.value; redraw(); });
      const chips = document.querySelectorAll("#store-cities .task-chip");
      chips.forEach((btn) => {
        btn.addEventListener("click", () => {
          storeCityFilter = btn.dataset.city;
          chips.forEach((b) => b.classList.toggle("active", b === btn));
          redraw();
        });
      });
    },
  },
  {
    key: "videos",
    label: "Видео",
    render: (c) => {
      if (!(c && (c.videos || []).length)) {
        return `<p class="page-empty">Видео о том, как наносить материалы, скоро появится здесь.</p>`;
      }
      return (c.videos || [])
        .map((v) => {
          // Свой ролик играем прямо в каталоге: preload="none" — значит
          // мегабайты поедут только когда человек нажмёт «плей», а до тех
          // пор виден один кадр.
          if (v.file) {
            const poster = v.poster ? ` poster="${photoUrl({ photo: v.poster })}"` : "";
            return `<div class="video-item local"><video controls playsinline preload="none"${poster} src="${esc(v.file)}"></video><div class="title">${esc(v.title || "Видео")}</div><p class="video-offline" hidden>Видео не загрузилось: для просмотра нужен интернет.</p></div>`;
          }
          return `<a class="video-item" href="${esc(v.url)}" target="_blank" rel="noopener"><div class="thumb" style="${
            v.poster ? `background-image:url('${photoUrl({ photo: v.poster })}')` : ""
          }"></div><div class="title">▶ ${esc(v.title || "Смотреть")}</div></a>`;
        })
        .join("");
    },
    // Ролики в запас не кладутся: это десятки мегабайт, и проигрыватель
    // просит их кусками, которые запас хранить не умеет. Без сети ролик не
    // запустится — и вместо молча застывшего плеера говорим это словами. Как
    // только связь вернулась, плеер сбрасываем, и следующее нажатие «плей»
    // снова пробует загрузить ролик.
    after: () => {
      document.querySelectorAll("#page-body .video-item.local video").forEach((video) => {
        const note = video.parentElement.querySelector(".video-offline");
        if (!note) return;
        video.addEventListener("error", () => {
          note.hidden = false;
          addEventListener(
            "online",
            () => {
              note.hidden = true;
              video.load();
            },
            { once: true }
          );
        });
      });
    },
  },
];

function openPage(key) {
  const page = PAGES.find((x) => x.key === key);
  if (!page) return;
  document.getElementById("page-title").textContent = page.label;
  document.getElementById("page-body").innerHTML = page.render(content);
  if (page.after) page.after();
  document.getElementById("page-backdrop").classList.add("open");
  document.getElementById("page-sheet").classList.add("open");
  openOverlay(closePage, document.getElementById("page-sheet"), null, () => openPage(key));
}

function closePage() {
  document.getElementById("page-backdrop").classList.remove("open");
  document.getElementById("page-sheet").classList.remove("open");
  // Окно только прячется, а не удаляется: запущенный ролик так и играл бы
  // со звуком под закрытым окном.
  document.querySelectorAll("#page-body video").forEach((v) => v.pause());
}

// На Android раздел — отдельная запись в истории: системная «Назад» из
// раздела возвращает на главную, а не закрывает каталог (решение владельца
// 02.10.2026). Переход между разделами запись заменяет, а не копит — иначе
// «Назад» листал бы все разделы, где человек побывал. На iPhone записей нет,
// как и у окон (см. OVERLAY_HISTORY).
function selectCategory(cat) {
  const prev = activeCategory;
  activeCategory = cat;
  render();
  if (!OVERLAY_HISTORY || overlayStack.length || cat === prev) return;
  const inCat = history.state && history.state.hgzCat;
  if (cat === "Все") {
    // Кнопка «Все разделы» — тот же шаг назад, что и системная кнопка.
    if (inCat) history.back();
    return;
  }
  forwardStack = [];
  if (inCat) history.replaceState({ hgzCat: cat }, "");
  else history.pushState({ hgzCat: cat }, "");
}

document.getElementById("section-all").addEventListener("click", () => selectCategory("Все"));

// Оверлеи (карточка товара, сравнение, QR, страницы завода) складываются в стек:
// каждый добавляет запись в историю, поэтому кнопка «Назад» на телефоне
// закрывает верхний оверлей, а не выходит из приложения.
const overlayStack = [];
let savedScrollY = 0;

// Страницу под окном отпускаем не сразу, а когда окно уже уехало вниз
// (уход длится 0,22–0,32 с). Отпустить — значит перестроить весь каталог и
// вернуть прокрутку; посреди ухода окна это давало рывок, а в приложении №2
// страница отпускается после ухода шторки — потому там закрытие и плавное.
const UNLOCK_DELAY = 340;
let unlockTimer = 0;

function unlockScrollSoon() {
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    unlockTimer = 0;
    unlockScroll();
  }, UNLOCK_DELAY);
}

// Отпустить сейчас — перед переходом, который сам прокручивает страницу
// (крошки в карточке): иначе отложенное отпускание вернуло бы старую прокрутку.
function unlockScrollNow() {
  if (!unlockTimer) return;
  clearTimeout(unlockTimer);
  unlockTimer = 0;
  unlockScroll();
}

function lockScroll() {
  if (overlayStack.length > 1) return;
  // Окно открыли снова, пока страница ещё не отпущена после прошлого: она
  // по-прежнему закреплена на нужном месте, запоминать заново нечего
  // (window.scrollY сейчас 0, и место в списке потерялось бы).
  clearTimeout(unlockTimer);
  unlockTimer = 0;
  if (document.documentElement.classList.contains("locked")) return;
  savedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.documentElement.classList.add("locked");
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (overlayStack.length) return;
  // Страница не была закреплена окном — возвращать нечего. Иначе «Назад»
  // из меню «⋯» или из раздела (у них свои записи истории, а окна нет)
  // прыгал на старую позицию savedScrollY — наверх или туда, где когда-то
  // открывали карточку.
  if (!document.documentElement.classList.contains("locked")) return;
  document.body.style.position = "";
  document.documentElement.classList.remove("locked");
  document.body.style.top = "";
  document.body.style.width = "";
  window.scrollTo(0, savedScrollY);
}

// Окна, которые ведут себя как диалог, и участки страницы под ними. Пока
// открыто окно, всё остальное помечается inert: туда не уходит Tab и до него
// не добирается программа чтения с экрана. Закрытые окна помечены всегда —
// иначе в них остаются кнопки, доступные с клавиатуры, хотя окна не видно.
const DIALOG_IDS = ["sheet", "compare-sheet", "order-sheet", "qr-sheet", "ios-sheet", "page-sheet", "cert-sheet"];
const PAGE_REGIONS = [".topbar", "#home-intro", "#home-rail", "#section-bar", "#compare-btn", "#order-btn", "#grid", "#site-foot", "#update-bar", "#manager-bar", "#install-bar"];

function setInert(el, on) {
  if (!el) return;
  if (on) el.setAttribute("inert", "");
  else el.removeAttribute("inert");
}

function topOverlay() {
  return overlayStack.length ? overlayStack[overlayStack.length - 1] : null;
}

// Раскладывает inert заново. Окна могут лежать стопкой — например, QR поверх
// открытой карточки товара, — поэтому «живым» остаётся ровно верхнее, а не
// все открытые сразу.
function syncInert() {
  const top = topOverlay();
  DIALOG_IDS.forEach((id) => {
    const el = document.getElementById(id);
    setInert(el, !top || el !== top.node);
  });
  PAGE_REGIONS.forEach((sel) => setInert(document.querySelector(sel), Boolean(top)));
}

// Фокус отдаём самому окну, а не первой кнопке внутри. У страницы «Где купить»
// первой стоит строка поиска, и фокус на ней сразу поднимал бы экранную
// клавиатуру. Окно подписано заголовком, поэтому программа чтения объявит,
// что именно открылось, а дальше Tab идёт по кнопкам окна.
function focusDialog(node) {
  if (node) node.focus({ preventScroll: true });
}

// Возвращаем фокус тому, кто окно открыл. Если под закрытым окном осталось
// другое — фокус уходит туда: так при закрытии QR поверх карточки человек
// остаётся в карточке, а не улетает в шапку, которая ещё помечена inert.
// Чем человек пользуется сейчас — пальцем (мышью) или клавиатурой. От этого
// зависит, рисовать ли рамку фокуса вокруг товара после закрытия окна
// (style.css, html.touch-nav). Клавиши-модификаторы метку не снимают.
document.addEventListener(
  "pointerdown",
  () => document.documentElement.classList.add("touch-nav"),
  { capture: true, passive: true }
);
document.addEventListener(
  "keydown",
  (e) => {
    if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
    document.documentElement.classList.remove("touch-nav");
  },
  true
);

function restoreFocus(opener) {
  const top = topOverlay();
  if (top && top.node) {
    top.node.focus({ preventScroll: true });
    return;
  }
  // body в расчёт не берём: если окно открыли касанием по карточке, фокуса на
  // странице не было вовсе, и «вернуть» его туда значит потерять место в списке.
  const alive = opener && opener !== document.body && opener.isConnected && !opener.closest("[inert]");
  // Иначе — первая кнопка шапки: фокус остаётся в начале страницы, а не
  // теряется. Поле поиска для этого не годится — на телефоне выскочит
  // клавиатура.
  const target = alive ? opener : document.querySelector(".topbar button");
  if (!target) return;
  // Карточка товара — это div, она фокус сама не принимает. Разрешаем ей
  // принять его один раз, не добавляя в обход по Tab: tabindex="-1" делает
  // элемент доступным только для программного фокуса.
  if (!target.matches('a[href], button, input, select, textarea, [tabindex]')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

// На iPhone окна в историю браузера не пишутся. Там жест от правого края —
// «вперёд», и Safari показывает под пальцем снимок той записи, какой он её
// запомнил: закрыл сравнение, ушёл на главную, потянул экран — а оттуда
// выезжает старое окно сравнения. Убрать снимок нельзя, можно только не
// оставлять записей. Закрываются окна там крестиком, нажатием мимо окна и
// свайпом вниз. На Android запись нужна: системная кнопка «Назад» закрывает
// окно, а не выходит из каталога, а жеста «вперёд» там нет.
const OVERLAY_HISTORY = !isIOS();

// Прокрутку после «Назад» возвращаем сами (unlockScroll), браузеру не даём.
// Запись окна добавляется, когда страница уже закреплена (position:fixed), и
// браузер запоминает для неё прокрутку 0. На Android при закрытии окна он
// восстанавливал этот 0 уже после нашего scrollTo — и список прыгал наверх.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// Страницу перезагрузили или телефон выгрузил вкладку, пока было открыто
// окно: запись в истории говорит «открыто окно», а окон нет. Тогда первое
// нажатие ✕ уходило на эту пустую запись, и окно закрывалось только со
// второго раза. Стираем пометку — адрес страницы при этом не меняется.
// То же с записями раздела и меню «⋯»: после перезагрузки каталог открывается
// на главной, и запись не должна говорить другое.
if (history.state && (history.state.hgzOverlay || history.state.hgzCat || history.state.hgzMenu)) {
  history.replaceState(null, "");
}

// Окна, закрытые кнопкой «Назад». Запись о них в истории браузера остаётся,
// и «Вперёд» ведёт туда же — раньше при этом ничего не открывалось, а при
// стопке окон (QR поверх карточки) «Вперёд» даже закрывал карточку: стек
// окон и история расходились. Теперь «Вперёд» открывает окно заново.
let forwardStack = [];
// Пока окно открывается заново по «Вперёд», новую запись в историю не
// добавляем — она там уже есть, мы по ней и пришли.
let restoring = false;

// reopen — как открыть это окно ещё раз, для кнопки «Вперёд».
function openOverlay(onClose, node, opener, reopen) {
  // Кто открыл окно — запоминаем до того, как фокус уедет внутрь. Касание по
  // карточке фокус никуда не ставит, поэтому открывающий элемент можно
  // передать явно.
  let from = opener || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  // Окно открыли пунктом меню «⋯»: меню сейчас закроется, поэтому фокус после
  // закрытия окна возвращаем на саму кнопку «⋯», а не на скрытый пункт.
  if (from && from.closest && from.closest("#more-menu")) from = document.getElementById("more-btn");
  // Окно открыли из меню «⋯»: у меню своя запись в истории. Её не убираем
  // шагом назад (он пришёл бы уже после записи окна и закрыл бы окно), а
  // превращаем в запись окна — «Назад» из окна вернёт туда, где было до меню.
  const fromMenuEntry = OVERLAY_HISTORY && !moreMenu.hidden && history.state && history.state.hgzMenu;
  hideMoreMenu(false);
  // Смещение от прошлого свайпа, которым окно закрыли, — иначе оно
  // откроется не до конца.
  // То же со своим движением смахивания и затемнением, которое при смахивании
  // светлело: открывается окно по общим правилам из style.css.
  if (node) {
    node.style.removeProperty("--drag");
    node.style.transition = "";
    const backdrop = swipeBackdrop(node);
    if (backdrop) {
      backdrop.style.opacity = "";
      backdrop.style.transition = "";
    }
  }
  overlayStack.push({ onClose, node: node || null, opener: from, reopen });
  lockScroll();
  syncInert();
  focusDialog(node);
  if (restoring || !OVERLAY_HISTORY) return;
  // Новое окно обрывает дорогу вперёд — как новая страница в браузере.
  forwardStack = [];
  // Раздел записываем и в запись окна: «Назад» из окна оставит человека в
  // том же разделе, а не выкинет на главную.
  const state = { hgzOverlay: overlayStack.length, hgzCat: activeCategory === "Все" ? null : activeCategory };
  if (fromMenuEntry) history.replaceState(state, "");
  else history.pushState(state, "");
}

// Закрытие идёт через историю, чтобы состояние стека и истории совпадали.
// На iPhone записей нет — там окно закрывается напрямую.
function dismissOverlay() {
  if (!overlayStack.length) return;
  if (OVERLAY_HISTORY) {
    history.back();
    return;
  }
  const entry = overlayStack.pop();
  entry.onClose();
  syncInert();
  restoreFocus(entry.opener);
  unlockScrollSoon();
}

// Глубина записи в истории — сколько окон должно быть открыто. У записи без
// окон состояния нет, это глубина 0.
window.addEventListener("popstate", (e) => {
  if (!OVERLAY_HISTORY) return;
  const depth = (e.state && e.state.hgzOverlay) || 0;

  // «Назад»: закрываем лишние окна сверху.
  while (overlayStack.length > depth) {
    const entry = overlayStack.pop();
    entry.onClose();
    forwardStack.push(entry);
    syncInert();
    restoreFocus(entry.opener);
  }

  // «Вперёд»: открываем закрытые окна в том же порядке.
  while (overlayStack.length < depth) {
    const entry = forwardStack.pop();
    const before = overlayStack.length;
    if (entry && entry.reopen) {
      restoring = true;
      try {
        entry.reopen();
      } finally {
        restoring = false;
      }
    }
    // Открыть не вышло — окна уже нет (например, после перезагрузки или
    // раздел сменился). Тогда тихо возвращаемся на запись, которая
    // соответствует экрану, чтобы стек и история снова совпадали.
    if (overlayStack.length === before) {
      forwardStack = [];
      history.go(overlayStack.length - depth);
      break;
    }
  }

  unlockScrollSoon();

  // Меню «⋯» и раздел — по записи: «Назад» закрывает меню и возвращает из
  // раздела на главную, «Вперёд» открывает их снова.
  const st = e.state || {};
  if (!st.hgzMenu && !moreMenu.hidden) hideMoreMenu(false);
  else if (st.hgzMenu && moreMenu.hidden && !overlayStack.length) {
    restoring = true;
    try {
      openMoreMenu();
    } finally {
      restoring = false;
    }
  }
  const cat = st.hgzCat || "Все";
  if (cat !== activeCategory) {
    activeCategory = cat;
    render();
  }
});

// Escape закрывает верхнее окно — раньше каталог клавиатуру не слушал вовсе.
// Именно верхнее: при стопке окон одно нажатие снимает один слой.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (moreMenuOpen()) {
    e.preventDefault();
    closeMoreMenu(true);
    return;
  }
  if (!overlayStack.length) return;
  e.preventDefault();
  dismissOverlay();
});

// Закрытие шторки свайпом вниз. Тянуть можно только когда содержимое уже
// прокручено к началу — иначе жест конфликтовал бы с чтением длинных карточек.
// Движение — как у шторки приложения №2: пока тянут, затемнение за окном
// светлеет; отпустили — окно уходит вниз с ускорением за 0,22 с; быстрый
// короткий взмах тоже закрывает; недотянули — мягко возвращается на место.
const SWIPE_OUT = "transform 0.22s cubic-bezier(0.4, 0, 1, 1)";
const SWIPE_BACK = "transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1)";

function swipeBackdrop(sheet) {
  const prev = sheet.previousElementSibling;
  return prev && prev.classList.contains("sheet-backdrop") ? prev : null;
}

function enableSwipeToClose(sheet) {
  const backdrop = swipeBackdrop(sheet);
  let startX = 0;
  let startY = 0;
  let shift = 0;
  // Скорость пальца (точек за миллисекунду) — для быстрого взмаха.
  let lastY = 0;
  let lastAt = 0;
  let speed = 0;
  // null — ещё не ясно, что за жест; true — тянем окно; false — не наш жест
  // (прокрутка, листание фото, перемотка ролика), до конца касания не трогаем.
  let dragging = null;

  sheet.addEventListener(
    "touchstart",
    (e) => {
      // Увеличенный сертификат двигают пальцем — это не жест закрытия окна.
      if (e.touches.length !== 1 || sheet.scrollTop > 0 || e.target.closest(".cert-view.zoomed")) {
        dragging = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      lastY = startY;
      lastAt = e.timeStamp;
      speed = 0;
      shift = 0;
      dragging = null;
    },
    { passive: true }
  );

  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (dragging === false) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      // Что за жест, решаем на первом же движении. Раньше решали позже, и
      // iPhone успевал начать свою прокрутку: окно и содержимое ехали
      // одновременно, отсюда рывки. Вниз и больше по вертикали, чем вбок, —
      // тянем окно. Вбок — это листание фото или перемотка ролика, вверх —
      // прокрутка. Раньше на ролике окно не тянулось вовсе, а ролики
      // занимают почти всю страницу «Видео» — потому она и не закрывалась.
      if (dragging === null) {
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        dragging = dy > 0 && Math.abs(dy) > Math.abs(dx) && e.cancelable && sheet.scrollTop <= 0;
        if (!dragging) return;
        sheet.style.transition = "none";
        // Окно — отдельным слоем видеокарты, как в приложении №2: телефон
        // двигает готовую картинку, а не перерисовывает карточку с фото на
        // каждом кадре. Только на время жеста и ухода — постоянный слой у
        // каждого из семи окон съедал бы память.
        sheet.style.willChange = "transform";
        if (backdrop) backdrop.style.transition = "none";
      }

      e.preventDefault();
      const y = e.touches[0].clientY;
      if (e.timeStamp > lastAt) speed = (y - lastY) / (e.timeStamp - lastAt);
      lastY = y;
      lastAt = e.timeStamp;
      shift = Math.max(0, dy);
      sheet.style.setProperty("--drag", `${shift}px`);
      if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - shift / 420));
    },
    { passive: false }
  );

  const finish = () => {
    const was = dragging;
    dragging = null;
    if (!was) return;
    // Закрыть: протянули на 22 % высоты окна (но не больше 150 точек) или
    // быстро смахнули вниз.
    const closeAfter = Math.min(150, sheet.offsetHeight * 0.22);
    if (shift > closeAfter || (speed > 0.6 && shift > 10)) {
      // Смещение не сбрасываем: окно уезжает вниз с той точки, где его
      // отпустили. Раньше его сбрасывали сразу, а на Android окно
      // закрывается через историю, на кадр позже, — и оно успевало прыгнуть
      // вверх, а потом уже уезжало вниз. Сбрасывает смещение openOverlay.
      sheet.style.transition = SWIPE_OUT;
      if (backdrop) {
        backdrop.style.transition = "opacity 0.22s, visibility 0.22s";
        backdrop.style.opacity = "0";
      }
      dismissOverlay();
      setTimeout(() => {
        if (!dragging) sheet.style.willChange = "";
      }, UNLOCK_DELAY);
    } else {
      sheet.style.transition = SWIPE_BACK;
      sheet.style.removeProperty("--drag");
      if (backdrop) {
        backdrop.style.transition = "opacity 0.2s";
        backdrop.style.opacity = "";
      }
      // Вернулось — своё движение больше не нужно: ✕ и открытие снова идут
      // по общим правилам из style.css.
      setTimeout(() => {
        if (dragging) return;
        sheet.style.transition = "";
        sheet.style.willChange = "";
        if (backdrop) backdrop.style.transition = "";
      }, 250);
    }
    shift = 0;
  };

  sheet.addEventListener("touchend", finish);
  sheet.addEventListener("touchcancel", finish);
}

["sheet", "compare-sheet", "order-sheet", "qr-sheet", "ios-sheet", "page-sheet", "cert-sheet"].forEach((id) =>
  enableSwipeToClose(document.getElementById(id))
);

function updateFavNav() {
  const btn = document.getElementById("fav-nav-btn");
  const star = btn.querySelector(".fav-nav-star");
  const badge = document.getElementById("fav-count");
  const count = favorites.size;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
  star.textContent = activeCategory === "__fav__" ? "★" : "☆";
  btn.classList.toggle("active", activeCategory === "__fav__");
}

// Эмблема и «Habez Gips» в шапке — сразу на главную, как в приложении №2:
// без раздела, поиска и фильтра задачи, наверх страницы. Раздел закрывается
// тем же шагом, что «Все разделы», поэтому «Назад» на Android не сбивается.
// Раздел (или главная, cat = "Все") целиком: без поиска и фильтра задачи, с начала.
function goToCategory(cat) {
  document.getElementById("search").value = "";
  activeTask = null;
  selectCategory(cat);
  scrollTo({ top: 0 });
}

document.getElementById("brand").addEventListener("click", () => {
  if (moreMenuOpen()) {
    closeMoreMenu(false);
    return;
  }
  goToCategory("Все");
});

// Сначала закрыть все окна, потом сделать переход. На Android окна закрываются
// шагом назад по истории, и переход ждёт, пока этот шаг пройдёт, — иначе новая
// запись раздела легла бы раньше шага назад и «Назад» потом сбивался.
function afterOverlaysClosed(fn) {
  if (!overlayStack.length) return fn();
  if (!OVERLAY_HISTORY) {
    while (overlayStack.length) dismissOverlay();
    unlockScrollNow();
    return fn();
  }
  window.addEventListener("popstate", () => {
    unlockScrollNow();
    fn();
  }, { once: true });
  history.go(-overlayStack.length);
}

// Крошки над фото товара — как в приложении №2: «Каталог / Раздел / Имя».
// Короткое имя — то, что в кавычках («ГРАНИТ»); без кавычек — название без
// марки завода в конце («Плита пазогребневая полнотелая ПГП»).
function shortName(p) {
  const m = p.name.match(/«([^»]+)»/);
  return m ? m[1] : p.name.replace(/\s+(ХАБЕЗ|HABEZ)$/i, "");
}
document.getElementById("sheet-crumb-home").addEventListener("click", () => afterOverlaysClosed(() => goToCategory("Все")));
document.getElementById("sheet-crumb-cat").addEventListener("click", () => {
  const cat = currentProduct && currentProduct.category;
  if (cat) afterOverlaysClosed(() => goToCategory(cat));
});

document.getElementById("fav-nav-btn").addEventListener("click", () => {
  // Звезда в шапке доступна и при открытом меню «⋯». Первое касание только
  // закрывает меню, как касание мимо него: иначе запись меню в истории
  // оставалась позади раздела, и «Назад» открывал меню заново.
  if (moreMenuOpen()) {
    closeMoreMenu(false);
    return;
  }
  selectCategory(activeCategory === "__fav__" ? "Все" : "__fav__");
});

function renderTasks() {
  const wrap = document.getElementById("task-row");
  wrap.innerHTML = TASKS.map(
    (t) => `<button class="task-chip ${t.key === activeTask ? "active" : ""}" data-task="${t.key}">${esc(t.label)}</button>`
  ).join("");
  wrap.querySelectorAll(".task-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTask = activeTask === btn.dataset.task ? null : btn.dataset.task;
      render();
    });
  });
}

// Обновляет звёздочку одного товара прямо в списке. Полная перерисовка сетки
// пересоздаёт все карточки, их фотографии подгружаются заново — на телефоне это
// видно как мигание, поэтому после смены избранного трогаем только нужное.
function syncCardFav(id) {
  const grid = document.getElementById("grid");
  const btn = grid.querySelector(`.fav-btn[data-fav-id="${id}"]`);
  if (!btn) {
    // В «Избранном» звезду сняли и тут же вернули в окне товара: карточку из
    // списка уже убрали, и без перерисовки счётчик показывал товар, а список —
    // «пусто». Перерисовка вернёт её (cardNode отдаёт готовую карточку).
    if (activeCategory === "__fav__" && isFavorite(id)) render();
    return;
  }
  const on = isFavorite(id);
  btn.classList.toggle("active", on);
  btn.textContent = on ? "★" : "☆";
  btn.setAttribute("aria-pressed", String(on));
  // В разделе «Избранное» снятая звезда означает, что товару здесь больше не место.
  if (activeCategory === "__fav__" && !on) {
    btn.closest(".card").remove();
    // render и счётчик «N товаров в избранном» обновит, и пустоту покажет.
    render();
  }
}

// ---------------------------------------------------------------- Поиск
// Прораб ищет не название, а задачу: «под плитку», «ванная», «машинное
// нанесение». Раньше поиск смотрел только на название, и по слову «плитка»
// не находилось ничего, хотя подходящих товаров два десятка. Теперь ищем по
// всей карточке, но с приоритетом: совпадение в названии весит больше, чем
// слово в глубине инструкции, иначе на «фасад» вываливается полкаталога.

// Слова, которыми спрашивают люди, и слова, которыми пишет завод.
// Значение с пробелом ищется целой фразой по тексту поля: слово «влажности»
// стоит и в «нормальной влажности», и в «повышенной», поэтому по нему одному
// в выдачу попадал весь каталог.
const SEARCH_SYNONYMS = {
  ванная: ["повышенным уровнем влажности"],
  ванной: ["повышенным уровнем влажности"],
  санузел: ["повышенным уровнем влажности"],
  душевая: ["повышенным уровнем влажности"],
  комната: ["нормальным уровнем влажности"],
  спальня: ["нормальным уровнем влажности"],
  улица: ["фасад", "наружные"],
  снаружи: ["фасад", "наружные"],
  // Сокращения, которыми называют товар на объекте, а в названии их нет.
  гкл: ["гипсокартонный"],
  гклв: ["гипсокартонный"],
  пгп: ["пазогребневая"],
};

const FIELD_WEIGHT = { name: 100, gost: 45, summary: 50, unit: 40, area: 35, section: 14, table: 12 };
// Слово, найденное только в инструкции или в таблице характеристик, товар в
// выдачу не пускает. Иначе «грунт» находит все 49 товаров: грунтовать
// основание велено в инструкции у каждого. Такое совпадение по-прежнему
// поднимает товар в списке и объясняется подписью «найдено в: инструкция»,
// но само по себе поводом показать товар не является.
const STRONG_FIELDS = ["name", "gost", "summary", "unit", "area"];
const FIELD_LABEL = { gost: "ГОСТ", summary: "описание", unit: "фасовка", area: "область применения", section: "инструкция", table: "характеристики" };

// Латинские буквы, неотличимые от русских на вид. В названиях они намешаны:
// у клея «ГРАНИТ» С2TS1 первая буква русская, а «TS1» — латинские. Человек
// наберёт всё одной раскладкой, и без этой замены не найдёт ничего. Приводим
// к русским и запрос, и указатель — тогда они встречаются посередине.
const LOOKALIKE = { a: "а", b: "в", c: "с", e: "е", h: "н", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х", y: "у" };

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[abcehkmoptxy]/g, (c) => LOOKALIKE[c]);
}

function tokenize(text) {
  return normalizeText(text).split(/[^a-zа-я0-9]+/).filter((w) => w.length > 1);
}

// ------------------------------------------------- Латинская раскладка
// Прораб нередко набирает «plitka», а не «плитка»: забыл переключить раскладку
// или пишет с чужого телефона. Раньше такой запрос не находил ничего — человек
// решал, что товара нет.
//
// Перевод применяется ТОЛЬКО к запросу и только как ещё один вариант слова,
// рядом с синонимами. Указатель товаров, веса полей и правило «слово из одной
// инструкции товар не показывает» остаются нетронутыми: латинский вариант
// ищется теми же правилами, что и русский, поэтому и состав выдачи, и её
// порядок совпадают с набранным по-русски.
//
// Обратный путь — перевести в латиницу сам каталог — отвергнут: в названиях
// есть настоящая латиница (HABEZ, EKREM, ЖАНЕ M100, клеи С2TS1), и её перевод
// наплодил бы ложных совпадений там, где сейчас всё точно.

// Сначала сочетания из нескольких букв, потом одиночные: иначе «sh» в
// «shtukaturka» разберётся как «с» плюс «н» и получится бессмыслица.
const TRANSLIT = [
  ["shch", "щ"], ["sch", "щ"],
  ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"],
  ["yo", "е"], ["yu", "ю"], ["ya", "я"], ["ye", "е"], ["yi", "и"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"],
  ["z", "з"], ["i", "и"], ["j", "ж"], ["k", "к"], ["l", "л"], ["m", "м"],
  ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"],
  ["u", "у"], ["f", "ф"], ["h", "х"], ["y", "й"], ["w", "в"], ["q", "к"],
  ["x", "кс"],
];

function latinToCyrillic(word) {
  let out = "";
  let i = 0;
  while (i < word.length) {
    const pair = TRANSLIT.find(([lat]) => word.startsWith(lat, i));
    if (pair) {
      out += pair[1];
      i += pair[0].length;
      continue;
    }
    if (word[i] === "c") {
      // «c» — самая двусмысленная буква. Перед e, i, y это «ц» (cement →
      // цемент), в остальных случаях «к» (skoba → скоба). Сочетания ch и ts
      // разобраны выше и сюда не доходят.
      const next = word[i + 1];
      out += next === "e" || next === "i" || next === "y" ? "ц" : "к";
      i += 1;
      continue;
    }
    out += word[i];
    i += 1;
  }
  return out;
}

// Слова запроса в том виде, как их набрали. Брать их после normalizeText
// поздно: она уже подменила часть латинских букв похожими русскими, и от
// «plitka» остаётся «рliтка».
function rawWords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/)
    .filter((w) => w.length > 1);
}

// Возвращает соответствие «слово, как его увидит поиск» → русские варианты.
// Для русского запроса карта пустая, то есть поиск работает ровно как раньше.
function translitVariants(query) {
  const map = new Map();
  for (const raw of rawWords(query)) {
    if (!/^[a-z]+$/.test(raw)) continue; // только целиком латинское слово
    const key = normalizeText(raw);
    const cyr = normalizeText(latinToCyrillic(raw));
    if (!cyr || cyr === key) continue;
    const list = map.get(key) || [];
    const add = (v) => {
      if (v && !list.includes(v)) list.push(v);
    };
    add(cyr);
    // «Э» и «Е» в латинице пишутся одной буквой: ekonom — это ЭКОНОМ,
    // elitgrunt — ЭЛИТГРУНТ. Предлагаем оба прочтения.
    if (cyr.startsWith("е")) add("э" + cyr.slice(1));
    map.set(key, list);
  }
  return map;
}

// Индекс собирается один раз на товар и остаётся при нём: перебирать заново
// на каждую букву в строке поиска незачем.
function searchIndex(p) {
  if (p._index) return p._index;
  const areaTable = (p.tables || []).find((t) => t.title === "Область применения");
  const areaRows = (areaTable?.rows || []).filter(([, value]) => value === "ДА").map(([label]) => label);
  const otherTables = (p.tables || [])
    .filter((t) => t.title !== "Область применения")
    .flatMap((t) => t.rows.map((r) => r[0] + " " + r[1]));

  const field = (text) => ({ words: tokenize(text), text: normalizeText(text) });

  p._index = {
    name: field(p.name),
    gost: field(p.gost),
    summary: field(p.summary),
    unit: field(p.unit + " " + p.category),
    area: field(areaRows.join(" ")),
    section: field((p.sections || []).map((x) => x.title + " " + x.text).join(" ")),
    table: field(otherTables.join(" ")),
  };
  return p._index;
}

// «тёплый» и «теплых», «плитка» и «плиточный» — одно и то же слово в разных
// формах, поэтому сверяем начала слов, а не целиком.
// Возвращает качество совпадения: 2 — слово начинается с запроса («плитка»
// и «плиточный»), 1 — совпал только корень («аквастоп» и «аквалайт»), 0 — нет.
// Разница нужна, чтобы по запросу «аквастоп» первым шёл АКВАСТОП, а не сосед
// по первым четырём буквам.
function wordMatches(indexed, query) {
  // Слово набрано целиком — это самое сильное попадание: по запросу «пол»
  // сначала должны идти полы, а уж потом всё полимерное и полнотелое.
  if (indexed === query) return 3;

  // Человек набирает начало слова, и так он делает почти всегда: «шту» — это
  // будущая «штукатурка». Никаких ограничений по длине здесь быть не должно,
  // иначе на третьей букве список пустеет, а на шестой снова наполняется.
  if (indexed.startsWith(query)) return 2;

  // Обратное направление — только на длину окончания: «полов» и «пол» одно и
  // то же, а «бетоноконтакт» и «бетон» — разные товары. Двухбуквенные слова
  // сюда не пускаем совсем: иначе запрос «нарт» цепляется за предлог «на».
  if (indexed.length >= 4 && query.startsWith(indexed) && query.length - indexed.length <= 2) return 2;

  // Общий корень: «штукатурка» и «штукатурная», «шпаклёвка» и «шпаклёвочная».
  // Слова должны быть близкой длины, иначе «гипсокартон» находит всё
  // «гипсовое», а «плита» — весь «плиточный» клей.
  if (query.length <= 4) return 0;
  const limit = Math.min(indexed.length, query.length);
  if (limit < 5) return 0;
  let same = 0;
  while (same < limit && indexed[same] === query[same]) same++;
  return same >= 4 && Math.abs(indexed.length - query.length) <= 4 ? 1 : 0;
}

function fieldQuality(field, variant) {
  if (variant.includes(" ")) return field.text.includes(variant) ? 2 : 0;
  let best = 0;
  for (const word of field.words) {
    const q = wordMatches(word, variant);
    if (q > best) best = q;
    if (best === 3) break;
  }
  return best;
}

// Каждое слово запроса должно найтись хоть где-то, иначе товар не подходит.
// Оценка — сумма весов лучших попаданий, подсказка — самое сильное поле,
// кроме названия: если совпало название, объяснять нечего.
function searchMatch(p, queryTokens, latinVariants) {
  const index = searchIndex(p);
  let score = 0;
  let hintField = null;
  let hintWeight = 0;
  let strong = false;

  for (const token of queryTokens) {
    const variants = [token, ...(SEARCH_SYNONYMS[token] || []), ...((latinVariants && latinVariants.get(token)) || [])];
    let best = 0;
    let bestField = null;
    for (const field of Object.keys(FIELD_WEIGHT)) {
      const weight = FIELD_WEIGHT[field];
      // Слово целиком весит больше начала слова, начало — больше общего корня.
      const quality = Math.max(...variants.map((v) => fieldQuality(index[field], v)));
      const points = quality === 3 ? weight * 1.4 : quality === 2 ? weight * 1.2 : quality === 1 ? weight : 0;
      if (points > best) {
        best = points;
        bestField = field;
      }
    }
    if (!best) return null;
    if (STRONG_FIELDS.includes(bestField)) strong = true;
    score += best;
    if (bestField !== "name" && best > hintWeight) {
      hintWeight = best;
      hintField = bestField;
    }
  }

  // Ни одного попадания в название, описание, фасовку или область применения —
  // товар нашёлся только по случайному слову в инструкции. Не показываем.
  if (!strong) return null;

  return { score, hint: hintField ? FIELD_LABEL[hintField] : null };
}

function render() {
  updateFavNav();
  renderTasks();
  const q = document.getElementById("search").value.trim();
  const queryTokens = tokenize(q);
  const latinVariants = translitVariants(q);
  // Запрос из одних знаков («!!!», «…», «-») не даёт ни одного слова. Раньше
  // пустой список слов значил «фильтра нет», и такой запрос показывал все
  // товары разом. Одна буква — другое дело: человек только начал набирать.
  const noWords = q && !/[a-zа-яё0-9]/i.test(q);
  showHome(activeCategory === "Все" && !activeTask && !q);
  const grid = document.getElementById("grid");
  const hints = new Map();

  let filtered = products.filter((p) => {
    const matchesCat =
      activeCategory === "Все" ? true : activeCategory === "__fav__" ? isFavorite(p.id) : p.category === activeCategory;
    const matchesTaskFilter = !activeTask || matchesTask(p, activeTask);
    if (!matchesCat || !matchesTaskFilter || noWords) return false;
    if (!queryTokens.length) return true;

    const found = searchMatch(p, queryTokens, latinVariants);
    if (!found) return false;
    hints.set(p.id, found);
    return true;
  });

  // При поиске порядок — по совпадению, иначе заводской порядок каталога.
  if (queryTokens.length) {
    filtered = filtered
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (hints.get(b.p.id).score - hints.get(a.p.id).score) || (a.i - b.i))
      .map((x) => x.p);
  }

  // Название открытого раздела — в заголовке шапки, она всегда на виду.
  // Под шапкой — счёт товаров и возврат ко всем разделам.
  const title = document.querySelector(".topbar h1");
  title.textContent = activeCategory === "Все" ? "каталог продукции" : activeCategory === "__fav__" ? "Избранное" : activeCategory;
  title.title = title.textContent;
  // На главной вторая строка — тихая подпись под «Habez Gips», как в приложении №2;
  // в разделе там его название, и оно должно читаться.
  title.classList.toggle("home", activeCategory === "Все");
  // Длинное название («Цементные и цементно-известковые штукатурки») в одну
  // строку не помещается — даём ему две строки шрифтом поменьше.
  title.classList.toggle("long", title.textContent.length > 22);
  const bar = document.getElementById("section-bar");
  bar.hidden = activeCategory === "Все";
  if (!bar.hidden) {
    const n = filtered.length;
    const what = activeCategory === "__fav__" ? "в избранном" : "в разделе";
    document.getElementById("section-count").textContent = n
      ? `${n} ${plural(n, ["товар", "товара", "товаров"])} ${what}${queryTokens.length ? " по запросу" : ""}`
      : "";
  }

  const compareBtn = document.getElementById("compare-btn");
  const compareConfig = COMPARE_CONFIG[activeCategory];
  compareBtn.style.display = compareConfig ? "block" : "none";
  if (compareConfig) compareBtn.textContent = compareConfig.buttonLabel;

  // «Оформить заявку» — только в «Избранном» и только когда там есть товары.
  const orderBtn = document.getElementById("order-btn");
  const orderCount = activeCategory === "__fav__" ? orderItems().length : 0;
  orderBtn.style.display = orderCount ? "block" : "none";
  if (orderCount) orderBtn.textContent = `Оформить заявку · ${orderCount} ${plural(orderCount, ["товар", "товара", "товаров"])}`;

  if (filtered.length === 0) {
    let msg;
    // Поиск работает внутри открытого раздела. Если здесь пусто, а в других
    // разделах слово находится — говорим об этом прямо: иначе клиент в
    // магазине решит, что плиточного клея у завода нет, хотя открыты шпаклёвки.
    const elsewhere =
      queryTokens.length && activeCategory !== "Все"
        ? products.filter((p) => (!activeTask || matchesTask(p, activeTask)) && searchMatch(p, queryTokens, latinVariants)).length
        : 0;
    const where = activeCategory === "__fav__" ? "в избранном" : `в разделе «${esc(activeCategory)}»`;
    if (elsewhere) {
      const n = `${elsewhere} ${plural(elsewhere, ["товар", "товара", "товаров"])}`;
      msg =
        `По запросу «${esc(q)}» ${where} ничего нет,<br>но ${elsewhere === 1 ? "нашёлся" : "нашлось"} ${n} в других разделах.` +
        `<button class="empty-all" id="empty-all">Показать</button>`;
    } else if (activeCategory === "__fav__" && !q) {
      msg = "В избранном пока пусто.<br>Нажмите ★ на карточке товара, чтобы добавить.";
    } else if (activeTask) {
      const label = TASKS.find((t) => t.key === activeTask)?.label;
      msg = q
        ? `По запросу «${esc(q)}» под задачу «${esc(label)}» ничего нет.<br>Снимите фильтр задачи или измените запрос.`
        : `Под задачу «${esc(label)}» в этом разделе ничего нет.<br>Снимите фильтр или выберите другой раздел.`;
    } else if (q) {
      // Подсказываем слова, которых человек ещё не пробовал.
      const tried = new Set(queryTokens);
      const ideas = ["плитка", "фасад", "ванная", "потолок", "пол"].filter((w) => !tried.has(w)).slice(0, 3);
      msg = `По запросу «${esc(q)}» ничего не нашлось.<br>Попробуйте другое слово — например, ${ideas.map((w) => `«${w}»`).join(", ")}.`;
    } else {
      msg = "Пока ничего нет.<br>Добавьте товары в products.json";
    }
    grid.innerHTML = `<div class="empty">${msg}</div>`;
    document.getElementById("empty-all")?.addEventListener("click", () => selectCategory("Все"));
    return;
  }

  // Карточки не пересобираются заново. Раньше на каждую набранную букву сетка
  // переписывалась целиком: все карточки создавались с нуля, у каждой заново
  // проигрывалась анимация появления, а фотографии снова показывали серую
  // заглушку — от этого весь экран и рябил при наборе. Теперь карточка живёт
  // столько же, сколько страница, а поиск только переставляет готовые.
  const empty = grid.querySelector(".empty");
  if (empty) empty.remove();

  // В общем списке между разделами стоят подписи. При поиске их нет: там
  // товары идут по совпадению, а не по разделам.
  const grouped = activeCategory === "Все" && !queryTokens.length;
  const nodes = [];
  let lastCat = null;
  filtered.forEach((p) => {
    if (grouped && p.category && p.category !== lastCat) {
      nodes.push(groupHeadNode(p.category, filtered.filter((x) => x.category === p.category).length));
      lastCat = p.category;
    }
    const card = cardNode(p);
    setCardHint(card, hints.get(p.id)?.hint);
    nodes.push(card);
  });

  let prev = null;
  nodes.forEach((node) => {
    // Тот, что уже стоит на своём месте, не трогаем: вынуть узел и вставить
    // обратно — это и есть заново проигранная анимация.
    const here = prev ? prev.nextSibling : grid.firstChild;
    if (node !== here) grid.insertBefore(node, here);
    prev = node;
  });
  while (prev ? prev.nextSibling : grid.firstChild) {
    grid.removeChild(prev ? prev.nextSibling : grid.firstChild);
  }
}

// Подписи разделов в общем списке. Нажатие открывает раздел.
const groupHeads = new Map();

function groupHeadNode(cat, count) {
  let head = groupHeads.get(cat);
  if (!head) {
    head = document.createElement("button");
    head.className = "group-head";
    head.type = "button";
    head.addEventListener("click", () => {
      selectCategory(cat);
      scrollTo({ top: 0 });
    });
    groupHeads.set(cat, head);
  }
  head.innerHTML = `<span>${esc(cat)}</span><span class="group-count">${count} ${plural(count, ["товар", "товара", "товаров"])} ›</span>`;
  return head;
}

// Карточки товаров живут в этом хранилище от загрузки до закрытия страницы:
// один товар — один узел, сколько бы раз ни менялся поиск или раздел.
const cardNodes = new Map();

function cardNode(p) {
  const key = p.id ?? p.name;
  const kept = cardNodes.get(key);
  if (kept) {
    // Звезду ставим на самом узле, а не ищем в сетке: сохранённая карточка
    // сейчас может лежать вне #grid, и поиск её не находил — после смены
    // избранного звезда возвращалась в сетку со старым видом.
    const btn = kept.querySelector(".fav-btn");
    if (btn) {
      const on = isFavorite(p.id);
      btn.classList.toggle("active", on);
      btn.textContent = on ? "★" : "☆";
      btn.setAttribute("aria-pressed", String(on));
    }
    return kept;
  }

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = p.id ?? key;
  card.innerHTML = `
      <div class="photo${p.photo ? " loading" : ""}"${p.photo ? ` data-src="${photoUrl(p)}"` : ""}>${p.photo ? "" : '<span class="photo-soon">Фото скоро</span>'}</div>
      <button class="fav-btn ${isFavorite(p.id) ? "active" : ""}" data-fav-id="${p.id ?? key}" aria-label="В избранное: ${esc(p.name)}" aria-pressed="${isFavorite(p.id)}">${isFavorite(p.id) ? "★" : "☆"}</button>
      <div class="info">
        <p class="name">${esc(p.name)}</p>
        <p class="meta">${esc(p.unit || "")}${p.price ? " · " + esc(p.price) : ""}</p>
      </div>`;

  // Кнопкой для клавиатуры и программ чтения служит название товара, а не
  // вся карточка. Раньше кнопкой была карточка целиком, а внутри неё — ещё
  // одна кнопка, «в избранное». Кнопка в кнопке — нарушение: программа чтения
  // экрана могла объявить карточку, но не дать добраться до звёздочки. Пальцем
  // и мышью карточка по-прежнему открывается нажатием в любое место, вид не
  // меняется.
  const name = card.querySelector(".name");
  name.tabIndex = 0;
  name.setAttribute("role", "button");

  const photo = card.querySelector(".photo.loading");
  if (photo) lazyPhoto(photo);

  card.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(p.id);
    updateFavNav();
    syncCardFav(p.id);
  });
  // Фокус после закрытия возвращается на название — туда, где он был.
  card.addEventListener("click", () => openSheet(p, name));

  // Enter и пробел на названии открывают карточку. Оба ведут в тот же
  // обработчик нажатия, что и палец: второго пути открытия нет, а значит нет
  // и двойного срабатывания.
  name.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    // Пробел без этого прокручивает страницу.
    e.preventDefault();
    card.click();
  });

  cardNodes.set(key, card);
  return card;
}

// Подпись «найдено в: описание» появляется и исчезает вместе с поиском, а сама
// карточка при этом остаётся прежней.
function setCardHint(card, hint) {
  const line = card.querySelector(".found");
  if (!hint) {
    if (line) line.remove();
    return;
  }
  const text = `найдено в: ${hint}`;
  if (line) {
    if (line.textContent !== text) line.textContent = text;
    return;
  }
  const p = document.createElement("p");
  p.className = "found";
  p.textContent = text;
  card.querySelector(".info").appendChild(p);
}

// Фон в CSS браузер сам по формату не выбирает, поэтому один раз проверяем
// поддержку WebP и подставляем нужное расширение. Фотографии в нём весят втрое
// меньше; старым iPhone (iOS 13 и раньше) достаётся исходный JPEG.
const WEBP_OK = (() => {
  try {
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
})();

// Фотография едет фоном, а у фона нет события загрузки. Поэтому просим
// браузер загрузить тот же адрес отдельной картинкой: он берёт её из того же
// кеша, лишнего запроса не делает, зато сообщает, когда можно убрать заглушку.
// Снимков у товара может быть несколько: сама упаковка и этикетка крупным
// планом, где видно надписи, номер ТУ и значки. Первым всегда идёт то, что
// стоит на полке, — по нему товар и узнают.
function productPhotos(p) {
  if (Array.isArray(p.photos) && p.photos.length) return p.photos;
  return p.photo ? [p.photo] : [];
}

function showPhotos(p) {
  const box = document.getElementById("sheet-photo");
  const dots = document.getElementById("sheet-dots");
  const photos = productPhotos(p);

  box.onscroll = null;
  box.scrollLeft = 0;

  if (photos.length < 2) {
    box.className = "photo-big";
    // Без фотографии показываем честную заглушку, а не пустой серый
    // прямоугольник: он читается как ошибка загрузки.
    box.innerHTML = photos.length ? "" : '<span class="photo-soon">Фотография появится позже</span>';
    box.style.backgroundImage = photos.length ? `url('${photoUrl({ photo: photos[0] })}')` : "none";
    box.classList.toggle("loading", photos.length > 0);
    if (photos.length) watchPhoto(box);
    dots.className = "photo-dots";
    dots.innerHTML = "";
    return;
  }

  box.className = "photo-big gallery";
  box.style.backgroundImage = "none";
  box.innerHTML = photos
    .map((src) => `<div class="photo-slide loading" style="background-image:url('${photoUrl({ photo: src })}')"></div>`)
    .join("");
  box.querySelectorAll(".photo-slide").forEach(watchPhoto);

  dots.className = "photo-dots open";
  dots.innerHTML = photos.map((_, i) => `<span class="${i === 0 ? "active" : ""}"></span>`).join("");

  box.onscroll = () => {
    const current = Math.round(box.scrollLeft / box.clientWidth);
    dots.querySelectorAll("span").forEach((dot, i) => dot.classList.toggle("active", i === current));
  };
}

function watchPhoto(el) {
  const src = (el.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/) || [])[1];
  if (!src) {
    el.classList.remove("loading");
    return;
  }
  const img = new Image();
  const done = () => el.classList.remove("loading");
  img.onload = done;
  img.onerror = done;
  img.src = src;
  if (img.complete) done();
}

// Фотография карточки ставится только когда карточка подъезжает к экрану —
// за один экран до появления. Раньше все полсотни фото запрашивались разом при
// открытии каталога и делили слабый канал между собой, поэтому и первые восемь,
// которые человек видит, приходили последними. Место под фото задано
// пропорцией в стилях, так что карточка не прыгает, пока фото едет, — на его
// месте та же переливающаяся заглушка, что и раньше.
const photoObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            photoObserver.unobserve(e.target);
            showCardPhoto(e.target);
          });
        },
        { rootMargin: "100% 0px" }
      )
    : null;

function showCardPhoto(el) {
  el.style.backgroundImage = `url('${el.dataset.src}')`;
  watchPhoto(el);
}

function lazyPhoto(el) {
  if (photoObserver) photoObserver.observe(el);
  else showCardPhoto(el);
}

// Офлайн каталог показывает только те фото, что уже побывали в запасе. Раз
// карточки внизу теперь не грузятся сами, дотягиваем их фото в запас фоном:
// по два за раз, с низким приоритетом, чтобы не отнимать канал у того, что
// на экране. Ждём, пока страницей начнёт управлять service worker, — только
// тогда запрос проходит через него и фото откладывается в запас. Заодно в
// запас попадают и фото первого экрана: при самом первом заходе они
// приходят раньше, чем service worker успевает включиться, и раньше в запас
// не попадали до второго открытия каталога.
function warmPhotoCache() {
  if (!("serviceWorker" in navigator)) return;
  const start = () =>
    setTimeout(() => {
      // Все снимки: и главные, и листаемые (этикетки), и фото страницы «О
      // заводе» — иначе без сети они остаются пустыми, если их не открывали.
      const extra = [...products.flatMap((p) => p.photos || []), ...((content && content.about && content.about.photos) || [])];
      const all = [photoUrl({ photo: HOME_PHOTO }), ...products.map(photoUrl), ...extra.map((photo) => photoUrl({ photo }))];
      const urls = [...new Set(all.filter(Boolean))];
      let i = 0;
      const next = () => {
        if (i >= urls.length) return;
        fetch(urls[i++], { priority: "low" })
          .then((res) => res.blob())
          .catch(() => {})
          .finally(next);
      };
      next();
      next();
    }, 1500);
  if (navigator.serviceWorker.controller) start();
  else navigator.serviceWorker.addEventListener("controllerchange", start, { once: true });
}

function photoUrl(p) {
  if (!p.photo) return "";
  return WEBP_OK ? p.photo.replace(/\.jpg$/i, ".webp") : p.photo;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function updateSheetFavButton() {
  const btn = document.getElementById("sheet-fav");
  const fav = currentProduct && isFavorite(currentProduct.id);
  btn.textContent = fav ? "★" : "☆";
  btn.classList.toggle("active", !!fav);
  btn.setAttribute("aria-pressed", String(!!fav));
  updateFavNav();
}

document.getElementById("sheet-fav").addEventListener("click", () => {
  if (!currentProduct) return;
  toggleFavorite(currentProduct.id);
  updateSheetFavButton();
  syncCardFav(currentProduct.id);
});

function openSheet(p, openedFrom) {
  currentProduct = p;
  updateSheetFavButton();
  showPhotos(p);
  document.getElementById("sheet-name").textContent = p.name;
  document.getElementById("sheet-crumb-cat").textContent = p.category;
  document.getElementById("sheet-crumb-name").textContent = shortName(p);
  document.getElementById("sheet-price").textContent = [p.unit, p.price].filter(Boolean).join(" · ");
  document.getElementById("sheet-gost").textContent = p.gost || "";

  const badges = document.getElementById("sheet-badges");
  badges.innerHTML = (p.badges || [])
    .map((b) => `<div class="badge"><span class="badge-value">${esc(b.value)}</span><span class="badge-label">${esc(b.label)}</span></div>`)
    .join("");

  const body = document.getElementById("sheet-body");
  let html = "";

  if (p.summary) {
    html += `<p class="summary">${esc(p.summary)}</p>`;
  }

  if (p.calc) {
    html += calcHtml(p.calc, p);
  }

  (p.sections || []).forEach((s) => {
    html += `<section class="doc-section"><h3>${esc(s.title)}</h3><p>${esc(s.text).replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>")}</p></section>`;
  });

  (p.tables || []).forEach((t) => {
    const rows = t.rows
      .map(([label, value]) => `<div class="spec-row"><div class="spec-label">${esc(label)}</div><div class="spec-value">${esc(value)}</div></div>`)
      .join("");
    html += `<section class="doc-section"><h3>${esc(t.title)}</h3><div class="spec-table">${rows}</div></section>`;
  });

  body.innerHTML = html;

  if (p.calc) {
    wireCalc(p.calc, p);
  }

  // Клиенту, пришедшему по QR-коду менеджера, кнопка пишет сразу этому
  // менеджеру. У самого менеджера (own) она остаётся обычной: он рассылает
  // товары клиентам и выбирает чат сам.
  const shareTo = manager && !manager.own ? manager.phone : "";
  const shareBtn = document.getElementById("sheet-share");
  shareBtn.href = `https://wa.me/${shareTo}?text=${encodeURIComponent(shareText(p))}`;
  document.getElementById("sheet-share-label").textContent = shareTo ? "Отправить менеджеру в WhatsApp" : "Отправить в WhatsApp";
  // «Узнать цену и наличие» — тому же адресату: менеджеру из QR, а без него
  // клиент сам выбирает чат (решение владельца 02.10.2026). Текст собирается
  // в момент нажатия, чтобы в него попал свежий расчёт из калькулятора.
  document.getElementById("sheet-ask").href = `https://wa.me/${shareTo}?text=${encodeURIComponent(askText(p))}`;

  // Сертификат: в карточке лежит только ключ («cert»), сам файл и срок его
  // действия — в реестре content.json → certificates. Один сертификат
  // обслуживает много товаров, поэтому срок меняется в одном месте. Если
  // реестра нет (content.json не загрузился) или ключ не найден — кнопки нет.
  const cert = p.cert && content && content.certificates ? content.certificates[p.cert] : null;
  currentCert = cert;
  const certWrap = document.getElementById("sheet-cert-wrap");
  certWrap.hidden = !cert;
  if (cert) {
    document.getElementById("sheet-cert").href = cert.file;
    document.getElementById("sheet-cert-note").textContent = `Действует до ${cert.until}.`;
  }

  document.getElementById("backdrop").classList.add("open");
  document.getElementById("sheet").classList.add("open");
  document.getElementById("sheet").scrollTop = 0;
  openOverlay(closeSheet, document.getElementById("sheet"), openedFrom, () => openSheet(p, openedFrom));
}

// Сертификат открытой карточки — по нему кнопка открывает просмотр.
let currentCert = null;

// Сертификат показываем в окне поверх карточки, а не ссылкой на PDF: в окне
// есть крестик, а у PDF на iPhone кнопки «назад» нет. В реестре лежит PDF, а
// показывается картинка рядом с ним (тем же именем, .jpg). PDF остаётся как
// исходник — для отправки клиенту.
function openCert(cert) {
  const img = document.getElementById("cert-img");
  const note = document.getElementById("cert-note");
  const view = document.getElementById("cert-view");
  view.classList.remove("zoomed");
  note.textContent = `Действует до ${cert.until}. ${CERT_HINT_FIT}`;
  // Сначала убираем прошлую картинку: на медленной связи новая грузится не
  // сразу, и всё это время в окне стоял бы сертификат другого товара.
  img.removeAttribute("src");
  img.onerror = () => {
    note.textContent = "Сертификат не загрузился. Проверьте связь и откройте снова.";
  };
  img.src = cert.file.replace(/\.pdf$/i, ".jpg");
  prepareCertFile(cert);
  view.scrollTo(0, 0);
  document.getElementById("cert-backdrop").classList.add("open");
  document.getElementById("cert-sheet").classList.add("open");
  openOverlay(closeCert, document.getElementById("cert-sheet"), null, () => openCert(cert));
}

function closeCert() {
  document.getElementById("cert-backdrop").classList.remove("open");
  document.getElementById("cert-sheet").classList.remove("open");
}

// «Отправить сертификат»: прораб или технадзор просит документ — продавец
// отправляет сам PDF через «Поделиться» телефона (WhatsApp, Telegram, почта).
// Файл скачиваем заранее, при открытии окна: «Поделиться» браузер разрешает
// только сразу после нажатия, ждать загрузки 1–2 МБ после него нельзя. Не
// успел скачаться или телефон не умеет делиться файлами — уходит ссылка.
// Качаем, только если телефон вообще умеет делиться файлами: на компьютере
// лишние мегабайты ни к чему.
let certFile = null;
let certFileFor = "";

function prepareCertFile(cert) {
  certFile = null;
  certFileFor = cert.file;
  if (!navigator.canShare || !window.File) return;
  fetch(cert.file)
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (!blob || certFileFor !== cert.file) return;
      const file = new File([blob], cert.file.split("/").pop(), { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) certFile = file;
    })
    .catch(() => {});
}

document.getElementById("cert-send").addEventListener("click", () => {
  if (!certFileFor) return;
  const url = new URL(certFileFor, location.href).href;
  const title = currentProduct ? `Сертификат соответствия — ${currentProduct.name}` : "Сертификат соответствия";
  if (certFile) {
    navigator.share({ files: [certFile], title }).catch(() => {});
    return;
  }
  if (navigator.share) {
    navigator.share({ title, text: title, url }).catch(() => {});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${title}: ${url}`)}`, "_blank", "noopener");
});

document.getElementById("sheet-cert").addEventListener("click", (e) => {
  if (!currentCert) return;
  e.preventDefault();
  openCert(currentCert);
});
// Нажатие по сертификату — увеличить или вернуть целиком. Увеличивается то
// место, куда нажали: оно остаётся под пальцем, а не уезжает в угол.
const CERT_HINT_FIT = "Нажмите на сертификат, чтобы увеличить.";
const CERT_HINT_ZOOM = "Двигайте пальцем. Нажмите ещё раз, чтобы вернуть целиком.";
// С клавиатуры: Enter или пробел увеличивают середину сертификата.
document.getElementById("cert-img").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  const box = e.currentTarget.getBoundingClientRect();
  e.currentTarget.dispatchEvent(new MouseEvent("click", { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
});
document.getElementById("cert-img").addEventListener("click", (e) => {
  const view = document.getElementById("cert-view");
  const img = e.currentTarget;
  const box = img.getBoundingClientRect();
  const fx = (e.clientX - box.left) / box.width;
  const fy = (e.clientY - box.top) / box.height;
  const zoomed = view.classList.toggle("zoomed");
  document.getElementById("cert-note").textContent =
    document.getElementById("cert-note").textContent.split(". ")[0] + ". " + (zoomed ? CERT_HINT_ZOOM : CERT_HINT_FIT);
  if (zoomed) {
    view.scrollLeft = fx * img.offsetWidth - view.clientWidth / 2;
    view.scrollTop = fy * img.offsetHeight - view.clientHeight / 2;
  } else {
    view.scrollTo(0, 0);
  }
});
document.getElementById("cert-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("cert-close").addEventListener("click", dismissOverlay);

// Запрос цены: товар, фасовка и — если клиент считал расход — сколько нужно.
// Цен в каталоге нет (решение по ним не принято), поэтому вопрос задаётся
// человеку, а не подставляется число.
function askText(p) {
  const lines = ["Здравствуйте! Подскажите цену и наличие:", p.name];
  if (p.unit) lines.push(`Фасовка: ${p.unit}`);
  const res = document.getElementById("calc-result");
  if (res && /^Нужно:/.test(res.textContent)) {
    const area = document.getElementById("calc-area");
    const mm = document.getElementById("calc-mm");
    const what = [area && area.value ? `${area.value.trim()} м²` : "", mm && mm.value ? `слой ${mm.value.trim()} мм` : ""]
      .filter(Boolean)
      .join(", ");
    lines.push(`По расчёту в каталоге: ${res.textContent.replace(/^Нужно:\s*/, "")}${what ? ` — ${what}` : ""}`);
  }
  // Без ссылки, как и в заявке: WhatsApp рисовал под вопросом карточку сайта.
  return lines.join("\n");
}

document.getElementById("sheet-ask").addEventListener("click", (e) => {
  if (!currentProduct) return;
  const to = manager && !manager.own ? manager.phone : "";
  e.currentTarget.href = `https://wa.me/${to}?text=${encodeURIComponent(askText(currentProduct))}`;
});

// ---------------------------------------------------------------- Заявка
// Заявка списком из «Избранного» (решение владельца 05.10.2026): клиент
// отмечает товары звёздочкой, в окне заявки ставит количество и фасовку и
// одной кнопкой отправляет список в WhatsApp — менеджеру из QR или в чат,
// который выберет сам. Сервера нет: каталог ничего не отправляет сам, на
// телефоне помнит только количество и фасовку по каждому товару.
const ORDER_KEY = "hgz-order";

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}
let order = loadOrder();

function saveOrder() {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {}
}

// Считаем в том, в чём товар продаётся: мешками, вёдрами, листами. Поддоны
// не предлагаем — сколько мешков на поддоне, завод ещё не подтвердил.
const PACK_NOUNS = {
  мешок: ["мешок", "мешка", "мешков"],
  канистра: ["канистра", "канистры", "канистр"],
  ведро: ["ведро", "ведра", "вёдер"],
  лист: ["лист", "листа", "листов"],
  плита: ["плита", "плиты", "плит"],
  упаковка: ["упаковка", "упаковки", "упаковок"],
};

// Фасовки из поля unit: «мешок 30 кг / 25 кг» — две на выбор, «ведро 6 кг /
// 11 кг / 20 кг» — три. «упаковка 30 плит / 10 м²» — одна, просто описанная
// двумя способами: варианты считаются фасовками, только если у всех частей
// одна и та же мера (кг, л, мм).
function packOptions(p) {
  const unit = String(p.unit || "").trim();
  const m = unit.match(/^([а-яё]+)\s+(.+)$/i);
  const noun = m && PACK_NOUNS[m[1].toLowerCase()] ? m[1].toLowerCase() : "";
  const rest = noun ? m[2] : unit;
  const parts = rest.split(/\s*\/\s*/);
  const measure = (s) => (s.match(/^[\d,]+\s*([^\d\s]+)$/) || [])[1];
  const several = parts.length > 1 && parts.every((x) => measure(x) && measure(x) === measure(parts[0]));
  return { forms: noun ? PACK_NOUNS[noun] : ["уп.", "уп.", "уп."], options: several ? parts : [rest] };
}

function orderEntry(p) {
  const e = order[p.id] || {};
  const { options } = packOptions(p);
  const qty = Number.isInteger(e.qty) && e.qty > 0 ? e.qty : 1;
  const opt = Number.isInteger(e.opt) && e.opt >= 0 && e.opt < options.length ? e.opt : 0;
  return { qty, opt, calc: Boolean(e.calc) };
}

// «14 мешков по 30 кг», «6 листов 12,5 мм», «2 уп. по 6 кг».
function orderLine(p) {
  const { forms, options } = packOptions(p);
  const { qty, opt } = orderEntry(p);
  const pack = options[opt];
  return `${qty} ${plural(qty, forms)} ${/мм$/.test(pack) ? pack : "по " + pack}`;
}

// Калькулятор в карточке подсказывает количество для заявки: что посчитали
// последним, то и подставится. Фасовка — та, по которой считал калькулятор.
function rememberCalc(p, qty, packValue) {
  if (!p || !(qty > 0)) return;
  const { options } = packOptions(p);
  const i = packValue == null ? -1 : options.findIndex((o) => parseFloat(o.replace(",", ".")) === packValue);
  order[p.id] = { qty, opt: i >= 0 ? i : orderEntry(p).opt, calc: true };
  saveOrder();
}

function orderItems() {
  return products.filter((p) => favorites.has(p.id));
}

function orderText() {
  const lines = ["Заявка из каталога ХГЗ:"];
  // Только названия и количество, без ссылок: по ссылке WhatsApp рисует
  // большую карточку сайта с картинкой, а в заявке она лишняя (владелец,
  // проверка на телефоне 05.10.2026).
  orderItems().forEach((p, i) => lines.push(`${i + 1}. ${p.name} — ${orderLine(p)}`));
  const obj = document.getElementById("order-object").value.trim();
  const when = document.getElementById("order-when").value.trim();
  if (obj || when) lines.push("");
  if (obj) lines.push(`Объект: ${obj}`);
  if (when) lines.push(`Когда нужно: ${when}`);
  return lines.join("\n");
}

function renderOrderRow(p) {
  const { forms, options } = packOptions(p);
  const e = orderEntry(p);
  const pack =
    options.length > 1
      ? `<select class="order-pack" aria-label="Фасовка">${options
          .map((o, i) => `<option value="${i}"${i === e.opt ? " selected" : ""}>${esc(o)}</option>`)
          .join("")}</select>`
      : `<span class="order-pack-one">${esc(options[0])}</span>`;
  return (
    `<div class="order-row" data-id="${p.id}">` +
    `<div class="order-name">${esc(p.name)}</div>` +
    `<div class="order-ctrl">${pack}` +
    `<div class="order-qty"><button type="button" class="order-minus" aria-label="Меньше">−</button>` +
    `<input class="order-num" type="text" inputmode="numeric" autocomplete="off" value="${e.qty}" aria-label="Количество">` +
    `<button type="button" class="order-plus" aria-label="Больше">+</button></div>` +
    `<span class="order-word">${plural(e.qty, forms)}</span></div>` +
    (e.calc ? `<p class="order-hint">Количество — по расчёту в каталоге</p>` : "") +
    `</div>`
  );
}

function openOrder() {
  const items = orderItems();
  if (!items.length) return;
  document.getElementById("order-list").innerHTML = items.map(renderOrderRow).join("");
  document.getElementById("order-send-label").textContent =
    manager && !manager.own ? "Отправить заявку менеджеру" : "Отправить заявку в WhatsApp";
  document.getElementById("order-copy-label").textContent = "Скопировать текст";
  updateOrderLink();
  document.getElementById("order-backdrop").classList.add("open");
  document.getElementById("order-sheet").classList.add("open");
  document.getElementById("order-sheet").scrollTop = 0;
  openOverlay(closeOrder, document.getElementById("order-sheet"), document.getElementById("order-btn"), () => {
    if (activeCategory === "__fav__") openOrder();
  });
}

function closeOrder() {
  document.getElementById("order-backdrop").classList.remove("open");
  document.getElementById("order-sheet").classList.remove("open");
}

// Количество и фасовку человек правит сам — запоминаем, и подсказка «по
// расчёту» больше не нужна.
function setOrderQty(row, qty, opt) {
  const p = products.find((x) => x.id === Number(row.dataset.id));
  if (!p) return;
  const e = orderEntry(p);
  const next = { qty: Math.min(9999, Math.max(1, qty ?? e.qty)), opt: opt ?? e.opt, calc: false };
  order[p.id] = next;
  saveOrder();
  row.querySelector(".order-word").textContent = plural(next.qty, packOptions(p).forms);
  row.querySelector(".order-hint")?.remove();
  return next;
}

const orderList = document.getElementById("order-list");
orderList.addEventListener("click", (e) => {
  const btn = e.target.closest(".order-minus, .order-plus");
  if (!btn) return;
  const row = btn.closest(".order-row");
  const input = row.querySelector(".order-num");
  const now = parseInt(input.value, 10) || 1;
  const next = setOrderQty(row, now + (btn.classList.contains("order-plus") ? 1 : -1));
  if (next) input.value = next.qty;
});
orderList.addEventListener("input", (e) => {
  if (!e.target.classList.contains("order-num")) return;
  const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
  if (digits !== e.target.value) e.target.value = digits;
  if (digits) setOrderQty(e.target.closest(".order-row"), parseInt(digits, 10));
});
// Поле оставили пустым или с нулём — возвращаем то, что сохранено.
orderList.addEventListener("focusout", (e) => {
  if (!e.target.classList.contains("order-num")) return;
  const next = setOrderQty(e.target.closest(".order-row"), parseInt(e.target.value, 10) || null);
  if (next) e.target.value = next.qty;
});
orderList.addEventListener("change", (e) => {
  if (e.target.classList.contains("order-pack")) setOrderQty(e.target.closest(".order-row"), null, Number(e.target.value));
});

document.getElementById("order-btn").addEventListener("click", openOrder);
document.getElementById("order-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("order-close").addEventListener("click", dismissOverlay);

// Адресат — как у «Узнать цену»: менеджер из QR, иначе клиент выбирает чат.
// Адрес у кнопки есть всегда, а не появляется в момент нажатия: иначе во
// встроенном браузере WhatsApp, при долгом нажатии («скопировать ссылку») и у
// экранной читалки кнопка была ссылкой без адреса. Обновляется при открытии
// окна и при любой правке — количества, фасовки, «Объекта», «Когда нужно».
const orderSend = document.getElementById("order-send");
function updateOrderLink() {
  const to = manager && !manager.own ? manager.phone : "";
  orderSend.href = `https://wa.me/${to}?text=${encodeURIComponent(orderText())}`;
}
document.getElementById("order-sheet").addEventListener("input", updateOrderLink);
document.getElementById("order-sheet").addEventListener("change", updateOrderLink);
document.getElementById("order-sheet").addEventListener("focusout", updateOrderLink);
// Кнопки «−» и «+» меняют число без события input.
orderList.addEventListener("click", updateOrderLink);
// Запасной путь: на самом нажатии — самый свежий текст.
orderSend.addEventListener("click", updateOrderLink);

// Запасной путь, если WhatsApp нет: текст в буфер — дальше в Telegram или SMS.
document.getElementById("order-copy").addEventListener("click", async () => {
  // Тот же способ, что у «Скопировать ссылку» в окне QR (copyText ниже).
  const ok = await copyText(orderText());
  document.getElementById("order-copy-label").textContent = ok
    ? "Скопировано — вставьте в любой мессенджер"
    : "Не удалось скопировать";
});

function shareText(p) {
  const lines = [];
  lines.push(p.name);
  const meta = [p.unit, p.price].filter(Boolean).join(" · ");
  if (meta) lines.push(meta);
  if (p.gost) lines.push(p.gost);
  lines.push("");

  if (p.summary) {
    lines.push(p.summary);
    lines.push("");
  }

  if (p.badges && p.badges.length) {
    p.badges.forEach((b) => lines.push(`• ${b.label}: ${b.value}`));
    lines.push("");
  }

  const link = `${catalogUrl()}#p=${p.id}`;
  lines.push(`Подробнее: ${link}`);

  return lines.join("\n");
}

// Склонение существительного при числе: 1 лист, 2 листа, 5 листов.
function plural(n, forms) {
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0];
  if (ten >= 2 && ten <= 4 && (hundred < 10 || hundred >= 20)) return forms[1];
  return forms[2];
}

// Подсказка к толщине слоя — только заводские цифры из карточки товара:
// диапазон из строки «Толщина слоя» («2–5») или, если его нет, толщина, при
// которой завод дал расход («при толщине слоя 2,5 мм» → «2,5»). Своих чисел
// не подставляем: раньше поле само заполнялось 10 мм, и у клея СТАНДАРТ
// (2–5 мм) или шпаклёвки ФИНИШ (0,2–2 мм) расчёт выходил в разы больше нужного.
function thicknessHint(p) {
  const rows = [
    ...(p.tables || []).flatMap((t) => t.rows || []),
    ...(p.badges || []).map((b) => [b.label, b.value]),
  ];
  for (const [label, value] of rows) {
    if (/толщина слоя/i.test(label) && !/максимальн|при толщине/i.test(label)) {
      const range = String(value).replace(/\s*мм\s*$/, "").trim();
      if (/^[\d,]+(\s*[–-]\s*[\d,]+)?$/.test(range)) return range;
    }
  }
  for (const [label] of rows) {
    const m = String(label).match(/при толщине слоя ([\d,]+)\s*мм/i);
    if (m) return m[1];
  }
  return "";
}

// Поля ввода — текстовые с цифровой клавиатурой (inputmode="decimal"), а не
// type="number": часть браузеров в числовом поле не принимает запятую, а на
// русской клавиатуре дробь пишут именно через неё. Запятую разбирает wireCalc.
function calcHtml(calc, p) {
  const hint = calc.type === "thickness" ? thicknessHint(p) : "";
  const thicknessRow =
    calc.type === "thickness"
      ? `<label class="calc-field">
          <span>Толщина слоя, мм</span>
          <input id="calc-mm" type="text" inputmode="decimal" autocomplete="off"
            value="${calc.defaultMm ?? ""}" placeholder="${esc(hint ? "напр. " + hint : "")}">
        </label>`
      : "";

  // Листы и плиты режут по проёмам и углам, обрезки в дело не идут. Заводской
  // нормы на это нет, поэтому запас — необязательная галочка, а не молчаливая
  // прибавка к результату.
  const wasteRow = calc.waste
    ? `<label class="calc-check">
          <input id="calc-waste" type="checkbox">
          <span>С запасом на подрезку ${Math.round(calc.waste * 100)}%</span>
        </label>`
    : "";

  return `
    <section class="calc-box">
      <h3>Расчёт расхода</h3>
      <div class="calc-row">
        <label class="calc-field">
          <span>Площадь, м²</span>
          <input id="calc-area" type="text" inputmode="decimal" autocomplete="off" placeholder="напр. 10">
        </label>
        ${thicknessRow}
      </div>
      ${wasteRow}
      <div id="calc-result" class="calc-result">Введите площадь</div>
      ${calc.note ? `<p class="calc-note">${esc(calc.note)}</p>` : ""}
      <p class="calc-note">${
        calc.type === "pieces"
          ? "Расчёт ориентировочный: количество зависит от размеров помещения и раскроя. Точное количество на объект уточняйте у менеджера."
          : "Расчёт ориентировочный: расход зависит от основания, толщины слоя и способа нанесения. Точное количество на объект уточняйте у менеджера."
      }</p>
    </section>`;
}

// Число из поля: «1 200» — это 1200 (пробел между разрядами), «10,5» — 10.5.
// Пусто — null. Всё прочее («2х5», «10м») — NaN: раньше parseFloat молча
// брал первые цифры, и «1 200 м²» считалось как 1 м².
function parseCalcNum(s) {
  const t = String(s || "").replace(/[\s  ]/g, "").replace(",", ".");
  if (!t) return null;
  return /^(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
}

function wireCalc(calc, p) {
  const areaInput = document.getElementById("calc-area");
  const mmInput = document.getElementById("calc-mm");
  const wasteInput = document.getElementById("calc-waste");
  const result = document.getElementById("calc-result");
  const hint = mmInput ? thicknessHint(p) : "";

  function update() {
    const area = parseCalcNum(areaInput.value);
    const mm = mmInput ? parseCalcNum(mmInput.value) : null;

    if (Number.isNaN(area)) {
      result.textContent = "Площадь — только цифрами, например 12,5";
      return;
    }
    if (!area || area <= 0) {
      result.textContent = "Введите площадь";
      return;
    }
    // Лишний ноль или случайно зажатая цифра дают миллионы мешков — такой
    // «результат» только сбивает с толку. Просим проверить число.
    if (area > 100000) {
      result.textContent = "Проверьте площадь — больше 100 000 м²";
      return;
    }

    if (calc.type === "pieces") {
      // Площадь штуки: либо задана прямо, либо выводится из упаковки — так
      // 30 плит на 10 м² дают ровно треть метра без потерь на округлении.
      const areaPerItem = calc.areaPerItem ?? calc.packArea / calc.pack;
      const withWaste = wasteInput && wasteInput.checked ? area * (1 + calc.waste) : area;
      // Крошечный допуск: без него 12 м² плитой в 1/3 м² дают 36.000000000000004
      // штуки, и покупатель получает лишнюю плиту на ровной площади.
      const pieces = Math.ceil(withWaste / areaPerItem - 1e-9);
      const covered = pieces * areaPerItem;
      let text = `Нужно: <b>${pieces} ${plural(pieces, calc.item)}</b> — это ${formatNum(covered)} м²`;
      let packs = 0;
      if (calc.pack) {
        packs = Math.ceil(pieces / calc.pack);
        text += ` (${packs} ${plural(packs, calc.packLabel)} по ${calc.pack} шт)`;
      }
      result.innerHTML = text;
      // В заявку — в тех же единицах, что в фасовке: упаковками или штуками.
      rememberCalc(p, /^упаковка/i.test(p.unit || "") && packs ? packs : pieces, null);
      return;
    }

    let total;
    if (calc.type === "thickness") {
      if (Number.isNaN(mm)) {
        result.textContent = "Толщина — только цифрами, например 3";
        return;
      }
      if (!mm || mm <= 0) {
        result.textContent = hint
          ? `Введите толщину слоя — у завода: ${hint} мм`
          : "Введите толщину слоя";
        return;
      }
      if (mm > 200) {
        result.textContent = "Проверьте толщину слоя";
        return;
      }
      total = calc.ratePerM2 * area * mm;
    } else {
      total = calc.ratePerM2 * area;
    }

    if (calc.type === "liquid") {
      const bigUnit = calc.packUnit === "г" ? "кг" : "л";
      const containers = Math.ceil(total / calc.pack);
      result.innerHTML = `Нужно: <b>${formatNum(total / 1000)} ${bigUnit}</b> (~${containers} уп. по ${formatNum(calc.pack / 1000)} ${bigUnit})`;
      rememberCalc(p, containers, calc.pack / 1000);
    } else {
      const bags = Math.ceil(total / calc.pack);
      // Сухие смеси приходят в мешках, но не всё: жидкая гидроизоляция — в
      // ведре. Товар может назвать свою тару полем "packWord" в products.json.
      const packWord = calc.packWord || "меш.";
      result.innerHTML = `Нужно: <b>${formatNum(total)} кг</b> (~${bags} ${packWord} по ${calc.pack} кг)`;
      rememberCalc(p, bags, calc.pack);
    }
  }

  function formatNum(n) {
    return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  }

  areaInput.addEventListener("input", update);
  if (mmInput) mmInput.addEventListener("input", update);
  if (wasteInput) wasteInput.addEventListener("change", update);
}

function closeSheet() {
  document.getElementById("backdrop").classList.remove("open");
  document.getElementById("sheet").classList.remove("open");
  currentProduct = null;
  // Перерисовывать список не нужно: звезду, снятую в самой карточке, сетка
  // уже получила через syncCardFav.
}

document.getElementById("search").addEventListener("input", render);
document.getElementById("backdrop").addEventListener("click", dismissOverlay);
document.getElementById("sheet-close").addEventListener("click", dismissOverlay);

function tableValue(p, tableTitle, needle) {
  const t = (p.tables || []).find((x) => x.title === tableTitle);
  if (!t) return null;
  const row = t.rows.find(([l]) => l.includes(needle));
  return row ? row[1] : null;
}

function badgeValue(p, needle) {
  const b = (p.badges || []).find((x) => x.label.includes(needle));
  return b ? b.value : null;
}

// Расход у разных товаров считается по-разному: смеси в килограммах на слой,
// клеи и гидроизоляция просто на квадрат, грунтовки в миллилитрах. В сравнении
// это должна быть одна строка, поэтому приводим к единому виду.
function consumptionText(p) {
  const c = p.calc;
  if (!c) return null;
  const num = (n) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  if (c.type === "thickness") return `${num(c.ratePerM2 * 10)} кг/м² при 10 мм`;
  if (c.type === "fixed") return `${num(c.ratePerM2)} кг/м²`;
  if (c.type === "liquid") return `${num(c.ratePerM2)} ${c.packUnit === "г" ? "г" : "мл"}/м²`;
  return null;
}

// Строки «Область применения» собираем со всех товаров раздела, в порядке
// появления, а не перечисляем вручную — иначе расходились бы с products.json.
// Раньше брали только первый товар, но таблицы в разделе разные: в «Полах»
// так пропадали «Устройство уклонов» и «Наливной пол». Ячейка тройная:
// «ДА» — ✓, «НЕТ» — прочерк, строки у товара нет — «нет данных» (null): завод
// об этом не писал, и прочерком мы бы выдумали ответ «нельзя».
// title — из какой таблицы брать строки «ДА/НЕТ»: по умолчанию «Область
// применения», у полов ещё и «Последующие покрытия».
function areaBoolRows(items, skip = [], title = "Область применения") {
  const table = (p) => (p.tables || []).find((t) => t.title === title);
  const labels = [];
  items.forEach((p) => {
    (table(p)?.rows || []).forEach(([label]) => {
      if (!labels.includes(label) && !skip.includes(label)) labels.push(label);
    });
  });
  // Строку ищем по точному совпадению: при частичном (как в tableValue)
  // короткая метка из одного товара нашла бы чужую длинную у другого.
  return labels.map((label) => ({
    label,
    type: "bool",
    get: (p) => {
      const row = (table(p)?.rows || []).find(([l]) => l === label);
      return row ? row[1] === "ДА" : null;
    },
  }));
}

const ROW = {
  unit: (label = "Фасовка") => ({ label, type: "text", get: (p) => p.unit }),
  consumption: { label: "Расход", type: "text", get: consumptionText },
  tech: (label, needle) => ({ label, type: "text", get: (p) => tableValue(p, "Технические характеристики", needle ?? label) }),
  badge: (label, needle) => ({ label, type: "text", get: (p) => badgeValue(p, needle ?? label) }),
  wet: { label: "Для влажных помещений", type: "bool", get: (p) => (Array.isArray(p.tasks) ? p.tasks.includes("wet") : tableValue(p, "Область применения", "повышенным уровнем влажности") === "ДА") },
};

const COMPARE_CONFIG = {
  "Клеи": {
    buttonLabel: "⇄ Сравнить клеи",
    title: "Как выбрать клей",
    rows: (items) => {
      const rows = areaBoolRows(items, ["Тип плитки"]);
      rows.push({ label: "Тип плитки", type: "text", get: (p) => tableValue(p, "Область применения", "Тип плитки") });
      rows.push({ label: "Макс. размер плитки для стен, см", type: "text", get: (p) => tableValue(p, "Максимальный размер плитки", "Для стен, см") });
      rows.push({ label: "Макс. размер плитки для пола, см", type: "text", get: (p) => tableValue(p, "Максимальный размер плитки", "Для пола, см") });
      return rows;
    },
  },
  "Гипсовая штукатурка": {
    buttonLabel: "⇄ Сравнить штукатурки",
    title: "Как выбрать штукатурку",
    rows: () => [
      ROW.wet,
      ROW.unit("Мешок"),
      ROW.tech("Толщина слоя", "олщина слоя"),
      ROW.consumption,
      ROW.tech("Расход воды"),
      ROW.badge("Прочность на отрыв, МПа", "Прочность на отрыв"),
      ROW.badge("Температура применения", "Температура основания"),
    ],
  },
  "Цементные и цементно-известковые штукатурки": {
    buttonLabel: "⇄ Сравнить штукатурки",
    title: "Как выбрать цементную штукатурку",
    rows: (items) => [
      ...areaBoolRows(items),
      ROW.unit("Мешок"),
      ROW.tech("Толщина слоя", "олщина слоя"),
      ROW.consumption,
      ROW.tech("Расход воды"),
      ROW.tech("Жизнеспособность раствора"),
      ROW.tech("Температура применения", "Температура основания"),
    ],
  },
  "Жидкие шпаклёвки": {
    buttonLabel: "⇄ Сравнить шпаклёвки",
    title: "Как выбрать жидкую шпаклёвку",
    rows: () => [
      ROW.wet,
      ROW.unit(),
      ROW.tech("Внешний вид покрытия"),
      ROW.tech("Рекомендуемая толщина слоя"),
      ROW.tech("Время полного высыхания одного слоя"),
      ROW.tech("Сухой остаток"),
    ],
  },
  "Шпаклёвки": {
    buttonLabel: "⇄ Сравнить шпаклёвки",
    title: "Как выбрать шпаклёвку",
    rows: (items) => [
      ROW.wet,
      ROW.unit("Мешок"),
      ROW.tech("Толщина слоя", "олщина слоя"),
      ROW.consumption,
      ROW.tech("Расход воды", "Расход воды"),
      ROW.badge("Прочность на отрыв, МПа", "Прочность на отрыв"),
      ROW.badge("Температура применения", "Температура основания"),
    ],
  },
  "Полы": {
    buttonLabel: "⇄ Сравнить полы",
    title: "Как выбрать пол",
    rows: (items) => [
      ...areaBoolRows(items),
      // Что можно укладывать поверх пола — отдельным блоком с подзаголовком,
      // иначе строки «Линолеум», «Паркет» читались бы как область применения.
      { type: "head", label: "Что укладывать сверху" },
      ...areaBoolRows(items, [], "Последующие покрытия"),
      { type: "head", label: "Характеристики" },
      ROW.unit("Мешок"),
      ROW.tech("Толщина слоя", "олщина слоя"),
      ROW.consumption,
      ROW.tech("Срок хранения"),
    ],
  },
  "Монтажные смеси": {
    buttonLabel: "⇄ Сравнить смеси",
    title: "Как выбрать монтажную смесь",
    rows: (items) => [
      ...areaBoolRows(items),
      ROW.unit("Мешок"),
      ROW.consumption,
      ROW.tech("Расход воды", "Расход воды"),
      ROW.tech("Жизнеспособность раствора"),
      ROW.tech("Температура применения", "Температура основания"),
    ],
  },
  "Грунтовки": {
    buttonLabel: "⇄ Сравнить грунтовки",
    title: "Как выбрать грунтовку",
    rows: () => [
      ROW.wet,
      ROW.unit(),
      ROW.consumption,
      ROW.tech("Для чего", "Область применения"),
      ROW.tech("Время высыхания"),
      ROW.tech("Цвет плёнки", "Цвет пленки"),
    ],
  },
  "Гидроизоляция": {
    buttonLabel: "⇄ Сравнить гидроизоляцию",
    title: "Как выбрать гидроизоляцию",
    rows: () => [
      ROW.unit(),
      ROW.consumption,
      ROW.tech("Рабочая температура"),
      ROW.tech("Водонепроницаемость"),
      ROW.tech("Срок хранения"),
    ],
  },
  "Краски": {
    buttonLabel: "⇄ Сравнить краски",
    title: "Как выбрать краску",
    // Расхода завод по краскам не давал — в паспорте качества есть только
    // укрывистость, а это не одно и то же. Сравниваем по тому, что дано.
    rows: () => [
      ROW.wet,
      ROW.unit(),
      { label: "Где применяется", type: "text", get: (p) => ((p.tasks || []).includes("facade") ? "снаружи, фасад" : "внутри помещений") },
      ROW.tech("Укрывистость высушенной плёнки"),
      ROW.tech("Массовая доля нелетучих веществ"),
      ROW.tech("Условная вязкость"),
      ROW.tech("Смываемость плёнки"),
      ROW.tech("Адгезия"),
    ],
  },
  "Гипсокартон": {
    buttonLabel: "⇄ Сравнить листы",
    title: "Как выбрать гипсокартон",
    rows: () => [
      ROW.wet,
      ROW.tech("Размер листа"),
      ROW.tech("Толщина"),
      ROW.tech("Площадь листа"),
      // В маркировочных карточках завод пишет «Листов на паллете», в паспортах
      // качества — «Количество в упаковке». Цифра одна и та же, слово разное.
      { label: "Листов в упаковке", type: "text",
        get: (p) => tableValue(p, "Технические характеристики", "Листов на паллете") ??
                    tableValue(p, "Технические характеристики", "Количество в упаковке") },
    ],
  },
  "Пазогребневые плиты": {
    buttonLabel: "⇄ Сравнить плиты",
    title: "Как выбрать плиту",
    rows: () => [
      ROW.wet,
      ROW.tech("Толщина"),
      ROW.tech("Исполнение"),
      ROW.tech("Размер плиты"),
      ROW.tech("В упаковке"),
      ROW.tech("Площадь упаковки"),
      ROW.tech("Количество на поддоне"),
    ],
  },
};

function openCompare() {
  const config = COMPARE_CONFIG[activeCategory];
  if (!config) return;

  const items = products.filter((p) => p.category === activeCategory);
  const rows = config.rows(items);
  const wrap = document.getElementById("compare-table-wrap");

  // Подпись столбца. Обычно короткое имя стоит в кавычках — «ЭКОНОМ», «ЛЮКС».
  // У гипсокартона и плит кавычек нет, и полное название в узкий столбец не
  // влезает: убираем слова, одинаковые у всех, и остаётся только отличие —
  // «влагостойкий», «огнестойкий». У базового товара своих слов не остаётся,
  // ему достаётся последнее общее слово — «лист», «полнотелая».
  const words = (name) => String(name).split(/\s+/).filter(Boolean);
  const names = items.map((p) => p.name);
  let head = 0;
  let tail = 0;
  if (names.length > 1 && !names.every((n) => /«[^»]+»/.test(n))) {
    const lists = names.map(words);
    const min = Math.min(...lists.map((l) => l.length));
    const same = (get) => lists.every((l) => get(l).toLowerCase() === get(lists[0]).toLowerCase());
    while (head < min && same((l) => l[head])) head++;
    while (head + tail < min && same((l) => l[l.length - 1 - tail])) tail++;
  }

  const shortName = (name) => {
    const m = name.match(/«([^»]+)»/);
    if (m) return m[1];
    if (!head && !tail) return name;
    const list = words(name);
    const rest = list.slice(head, list.length - tail);
    return rest.length ? rest.join(" ") : words(names[0])[head - 1] || name;
  };

  let html = '<table class="cmp-table"><thead><tr><th class="cmp-corner"></th>';
  items.forEach((p) => {
    html += `<th><div class="cmp-photo" style="${p.photo ? `background-image:url('${photoUrl(p)}')` : ""}"></div><div class="cmp-name">${esc(shortName(p.name))}</div></th>`;
  });
  html += "</tr></thead><tbody>";

  rows.forEach((row) => {
    if (row.type === "head") {
      html += `<tr class="cmp-head"><td colspan="${items.length + 1}">${esc(row.label)}</td></tr>`;
      return;
    }
    html += `<tr><td class="cmp-label">${esc(row.label)}</td>`;
    items.forEach((p) => {
      const v = row.get(p);
      html +=
        row.type === "bool"
          ? `<td class="cmp-cell">${v === null ? '<span class="cmp-none">нет данных</span>' : v ? '<span class="cmp-check">✓</span>' : '<span class="cmp-no">—</span>'}</td>`
          : `<td class="cmp-cell cmp-text">${esc(v ?? "—")}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  wrap.innerHTML = html;

  document.getElementById("compare-title").textContent = config.title;
  document.getElementById("compare-backdrop").classList.add("open");
  document.getElementById("compare-sheet").classList.add("open");
  // Вернуться «Вперёд» можно только в тот же раздел: сравнение строится по
  // открытому разделу, и в чужом оно было бы другим.
  const cat = activeCategory;
  openOverlay(closeCompare, document.getElementById("compare-sheet"), null, () => {
    if (activeCategory === cat) openCompare();
  });
}
function closeCompare() {
  document.getElementById("compare-backdrop").classList.remove("open");
  document.getElementById("compare-sheet").classList.remove("open");
}
// Запасной адрес на случай, когда каталог открыт локально при разработке:
// код должен вести на живой сайт, а не на localhost.
const APP_URL = "https://salamgasanov777-gmm.github.io/hgz-catalog/";

// На живом сайте адрес берётся из строки браузера, а не из константы: после
// переезда на собственный домен QR-код начнёт вести на него сам, без правок
// в коде. Локальная разработка (file://, localhost) отсекается по протоколу
// и имени хоста и получает APP_URL.
function catalogUrl() {
  const local = location.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(location.hostname);
  if (local) return APP_URL;
  return location.origin + location.pathname.replace(/index\.html$/, "");
}

document.getElementById("qr-btn").addEventListener("click", openQr);

// ------------------------------------------------- Меню «⋯» в шапке
const moreBtn = document.getElementById("more-btn");
const moreMenu = document.getElementById("more-menu");
const moreScrim = document.getElementById("more-scrim");
// Скрытые пункты (например «Установить» в уже установленном приложении)
// стрелками не перебираются.
const moreItems = () => [...moreMenu.querySelectorAll('[role="menuitem"]')].filter((el) => !el.hidden);

function moreMenuOpen() {
  return !moreMenu.hidden;
}

function openMoreMenu() {
  // Ссылка строится при каждом открытии: у менеджера в ней его контакт (та же,
  // что в QR-коде), и клиент, открыв её, получит предложение записать менеджера.
  const text = `Каталог продукции Хабезского гипсового завода: ${qrLink()}`;
  document.getElementById("share-catalog").href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  // «Установить на телефон» — пока каталог не установлен и браузер умеет
  // установку (Chrome сообщил о готовности или это iPhone с инструкцией).
  // Раньше крестик на полосе установки прятал её навсегда, вернуть было нечем.
  document.getElementById("install-menu").hidden = isStandalone() || !(installPrompt || isIOS());
  moreMenu.hidden = false;
  moreScrim.hidden = false;
  moreBtn.setAttribute("aria-expanded", "true");
  moreItems()[0].focus();
  // На Android у открытого меню своя запись: «Назад» закрывает меню, а не
  // каталог. Раздел переносим в неё, чтобы «Назад» не сбросил его.
  if (OVERLAY_HISTORY && !restoring) {
    forwardStack = [];
    history.pushState({ hgzMenu: true, hgzCat: (history.state && history.state.hgzCat) || null }, "");
  }
}

// Только спрятать меню, историю не трогать — для «Назад» и для окна,
// открытого пунктом меню (оно само забирает запись меню себе).
function hideMoreMenu(returnFocus) {
  if (moreMenu.hidden) return;
  moreMenu.hidden = true;
  moreScrim.hidden = true;
  moreBtn.setAttribute("aria-expanded", "false");
  if (returnFocus) moreBtn.focus();
}

// Закрыть меню человеком (✕ мимо меню, Escape, пункт без окна): запись меню
// снимаем шагом назад, чтобы следующая «Назад» не попала на пустое место.
function closeMoreMenu(returnFocus) {
  if (moreMenu.hidden) return;
  hideMoreMenu(returnFocus);
  if (OVERLAY_HISTORY && history.state && history.state.hgzMenu) history.back();
}

moreBtn.addEventListener("click", () => (moreMenuOpen() ? closeMoreMenu(true) : openMoreMenu()));
moreScrim.addEventListener("click", () => closeMoreMenu(false));
// Пункт закрывает меню; само действие пункта повешено на него отдельно.
moreMenu.addEventListener("click", (e) => {
  // Пункт темы меню не закрывает: режимов три, и переключают их по кругу.
  const item = e.target.closest('[role="menuitem"]');
  if (item && !item.dataset.keep) closeMoreMenu(false);
});
moreMenu.addEventListener("keydown", (e) => {
  const items = moreItems();
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") items[(i + 1) % items.length].focus();
  else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length].focus();
  else if (e.key === "Home") items[0].focus();
  else if (e.key === "End") items[items.length - 1].focus();
  else if (e.key === "Tab") return closeMoreMenu(false);
  // Пробел на ссылке («Поделиться») сам не срабатывает — нажимаем за человека.
  else if (e.key === " " && document.activeElement.tagName === "A") document.activeElement.click();
  else return;
  e.preventDefault();
});
document.getElementById("contact-btn").addEventListener("click", () => openPage("contact"));

function openQr() {
  const canvas = document.getElementById("qr-canvas");
  const url = qrLink();
  // Модуль в 8 точек: код остаётся читаемым и когда его показывают
  // с экрана телефона, и когда распечатывают.
  QR.draw(canvas, url, 8);
  renderQrManager();
  resetCopyBtn();
  document.getElementById("qr-backdrop").classList.add("open");
  document.getElementById("qr-sheet").classList.add("open");
  openOverlay(closeQr, document.getElementById("qr-sheet"), null, openQr);
}

// Копирование ссылки. Современный способ работает только на защищённом
// соединении; на старых Safari и при открытии по http остаётся запасной —
// скрытое поле и системная команда «копировать».
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* падаем в запасной способ */
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  document.body.appendChild(field);
  field.select();
  field.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(field);
  return ok;
}

let copyResetTimer = null;

function resetCopyBtn() {
  const btn = document.getElementById("qr-copy");
  clearTimeout(copyResetTimer);
  btn.textContent = "Скопировать ссылку";
  btn.classList.remove("done");
}

document.getElementById("qr-copy").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const ok = await copyText(qrLink());
  btn.textContent = ok ? "Ссылка скопирована ✓" : "Не получилось скопировать — попробуйте ещё раз";
  btn.classList.toggle("done", ok);
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    btn.textContent = "Скопировать ссылку";
    btn.classList.remove("done");
  }, 2500);
});

function closeQr() {
  document.getElementById("qr-backdrop").classList.remove("open");
  document.getElementById("qr-sheet").classList.remove("open");
}
document.getElementById("page-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("page-close").addEventListener("click", dismissOverlay);
document.getElementById("qr-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("qr-close").addEventListener("click", dismissOverlay);

// Установка на телефон. В Chrome браузер сам сообщает о готовности через
// beforeinstallprompt, в Safari такого события нет — там показываем инструкцию.
let installPrompt = null;

function isStandalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIOS() {
  // iPad с iPadOS 13 представляется компьютером Mac — узнаём его по экрану
  // с касаниями: у настоящего Mac их нет.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

// Увеличение щипком выключено по просьбе владельца: каталог дают в руки
// клиенту, и случайный щипок раздувал экран. Safari на iPhone запрет в теге
// viewport не соблюдает с iOS 10, поэтому гасим сам жест: gesturestart —
// событие только Safari, touchmove двумя пальцами — запасной путь.
// Прокрутку одним пальцем это не задевает.
["gesturestart", "gesturechange"].forEach((type) => document.addEventListener(type, (e) => e.preventDefault()));
document.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

function showInstallBar() {
  let hidden = false;
  try {
    hidden = Boolean(localStorage.getItem("hgz-install-hidden"));
  } catch {}
  if (isStandalone() || hidden) return;
  document.getElementById("install-bar").classList.add("open");
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  showInstallBar();
});

if (isIOS()) showInstallBar();

async function startInstall() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    document.getElementById("install-bar").classList.remove("open");
    return;
  }
  openIosHelp();
}

document.getElementById("install-yes").addEventListener("click", startInstall);
document.getElementById("install-menu").addEventListener("click", startInstall);

function openIosHelp() {
  document.getElementById("ios-backdrop").classList.add("open");
  document.getElementById("ios-sheet").classList.add("open");
  openOverlay(closeIos, document.getElementById("ios-sheet"), null, openIosHelp);
}

function closeIos() {
  document.getElementById("ios-backdrop").classList.remove("open");
  document.getElementById("ios-sheet").classList.remove("open");
}
document.getElementById("ios-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("ios-close").addEventListener("click", dismissOverlay);

document.getElementById("install-no").addEventListener("click", () => {
  try {
    localStorage.setItem("hgz-install-hidden", "1");
  } catch {}
  document.getElementById("install-bar").classList.remove("open");
});

window.addEventListener("appinstalled", () => {
  document.getElementById("install-bar").classList.remove("open");
});

document.getElementById("compare-btn").addEventListener("click", openCompare);
document.getElementById("compare-backdrop").addEventListener("click", dismissOverlay);
document.getElementById("compare-close").addEventListener("click", dismissOverlay);

// Обновление каталога. Телефон хранит приложение у себя и сам подтягивает
// новую версию не сразу — из-за этого можно неделю смотреть вчерашние цены и
// не знать об этом. Поэтому: новая версия ставится рядом и ждёт, каталог
// показывает полосу «Вышла новая версия», и только по кнопке она заступает
// на место старой, после чего страница перезагружается.
if ("serviceWorker" in navigator) {
  // Было ли приложение уже под управлением своей копии. Если нет — это первая
  // установка, и смена управляющего не повод перезагружаться.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let waitingWorker = null;

  const showUpdateBar = (worker) => {
    waitingWorker = worker;
    document.getElementById("install-bar").classList.remove("open");
    document.getElementById("update-bar").classList.add("open");
  };

  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      if (reg.waiting && hadController) showUpdateBar(reg.waiting);

      reg.addEventListener("updatefound", () => {
        const fresh = reg.installing;
        if (!fresh) return;
        fresh.addEventListener("statechange", () => {
          if (fresh.state === "installed" && navigator.serviceWorker.controller) showUpdateBar(fresh);
        });
      });

      // Каталог с телефона обычно не закрывают, а сворачивают, поэтому проверку
      // делаем при каждом возвращении к нему, а не только при запуске.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch(() => {});

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  document.getElementById("update-yes").addEventListener("click", (e) => {
    e.currentTarget.textContent = "Обновляем…";
    e.currentTarget.disabled = true;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "skip-waiting" });
      // Если ответа нет — перезагружаемся сами, чтобы кнопка не зависла.
      setTimeout(() => location.reload(), 3000);
    } else {
      location.reload();
    }
  });
}


// Свежесть данных. Каталог на телефоне обычно не закрывают, а сворачивают:
// товары и страницы завода читались один раз при запуске, и неделю спустя
// человек мог смотреть старые данные, хотя на сайте их давно поправили (код
// обновляется полосой выше, а правка только данных её не вызывает). Теперь при
// возвращении в каталог — не чаще раза в 30 минут — сверяем данные с сайтом
// и, если они изменились, показываем ту же полосу: «Обновить» перезагружает
// страницу. Сами посреди работы не перерисовываем — человек мог листать.
const DATA_CHECK_EVERY = 30 * 60 * 1000;

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !dataText.products) return;
  if (Date.now() - dataCheckedAt < DATA_CHECK_EVERY) return;
  dataCheckedAt = Date.now();
  try {
    const [p, c] = await Promise.all([
      fetch("./products.json", { cache: "no-cache" }),
      fetch("./content.json", { cache: "no-cache" }),
    ]);
    if (!p.ok) return;
    const productsNow = await p.text();
    const contentNow = c.ok ? await c.text() : dataText.content;
    if (productsNow === dataText.products && contentNow === dataText.content) return;
    document.getElementById("update-text").textContent = "Каталог обновился";
    document.getElementById("install-bar").classList.remove("open");
    document.getElementById("update-bar").classList.add("open");
  } catch {
    // Нет сети — сверим в следующий раз.
  }
});

// Кнопку «Обновить» обслуживает блок service worker выше; где его нет,
// она просто перезагружает страницу.
if (!("serviceWorker" in navigator)) {
  document.getElementById("update-yes").addEventListener("click", () => location.reload());
}

// ------------------------------------------------- Настройка контакта в QR
// Форма живёт прямо в окне QR-кода: менеджер открывает код, чтобы показать
// его клиенту, — там же и вписывает себя, один раз на своём телефоне.
function refreshQr() {
  QR.draw(document.getElementById("qr-canvas"), qrLink(), 8);
  renderQrManager();
  resetCopyBtn();
}

function renderQrManager() {
  const box = document.getElementById("qr-manager");
  if (!box) return;
  const mine = manager && manager.own;
  box.innerHTML = mine
    ? `<p class="qr-manager-line">В коде ваш контакт: <b>${esc(managerName())}</b>, ${esc(phonePretty(manager.phone))}</p>${
        qrNameTrimmed ? `<p class="mgr-note">Имя в коде укорочено — целиком оно не помещается.</p>` : ""
      }<div class="mgr-actions"><button type="button" data-mgr="edit">Изменить</button><button type="button" data-mgr="clear" class="ghost">Убрать</button></div>`
    : `<p class="qr-manager-line">Вы менеджер завода? Впишите свой контакт — и тот, кто отсканирует этот код, увидит, к кому обращаться, а его заявки на товар придут вам в WhatsApp.</p><div class="mgr-actions"><button type="button" data-mgr="edit">Указать свой контакт</button></div>`;
  wireManagerButtons(box);
}

function showManagerForm() {
  const box = document.getElementById("qr-manager");
  const m = manager && manager.own ? manager : { name: "", phone: "" };
  box.innerHTML =
    `<input id="mgr-name" class="search mgr-input" type="text" autocomplete="name" placeholder="Имя и фамилия" value="${esc(m.name || "")}">` +
    `<input id="mgr-phone" class="search mgr-input" type="tel" inputmode="tel" autocomplete="tel" placeholder="Телефон, 8 928 000-00-00" value="${esc(m.phone ? phonePretty(m.phone) : "")}">` +
    `<p class="mgr-note">Должность подставится сама: ${esc(MANAGER_ROLE.toLowerCase())}.</p>` +
    `<p id="mgr-error" class="mgr-error"></p>` +
    `<div class="mgr-actions"><button type="button" data-mgr="save">Сохранить</button><button type="button" data-mgr="cancel" class="ghost">Отмена</button></div>`;
  wireManagerButtons(box);
  const name = document.getElementById("mgr-name");
  if (name) name.focus();
}

function wireManagerButtons(box) {
  box.querySelectorAll("[data-mgr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const what = btn.dataset.mgr;
      if (what === "edit") return showManagerForm();
      if (what === "cancel") return renderQrManager();
      if (what === "clear") {
        saveManager(null);
        return refreshQr();
      }
      const phone = phoneDigits(document.getElementById("mgr-phone").value);
      if (!phone) {
        document.getElementById("mgr-error").textContent = "Проверьте номер: нужно 11 цифр, например 8 928 032-75-21.";
        return;
      }
      const name = document.getElementById("mgr-name").value.trim().replace(/\s+/g, " ").slice(0, 60);
      saveManager({ name, phone, own: true });
      refreshQr();
    });
  });
}

// Полоса о менеджере из ссылки: клиент отсканировал код и решает, записать
// ли этот контакт. Сама не уходит — без нажатия ничего не записывается, а
// крестик значит «не записывать» (или «оставить прежнего»).
let pendingManager = null;

function offerManager(m) {
  const bar = document.getElementById("manager-bar");
  if (!bar) return;
  pendingManager = m;
  const who = m.name ? `${m.name}, ${phonePretty(m.phone)}` : phonePretty(m.phone);
  const first = !manager;
  document.getElementById("manager-bar-text").textContent = first ? `Записать менеджера: ${who}?` : `Сменить менеджера на ${who}?`;
  document.getElementById("manager-bar-open").textContent = first ? "Записать" : "Сменить";
  bar.classList.add("open");
}

document.getElementById("manager-bar-open").addEventListener("click", () => {
  document.getElementById("manager-bar").classList.remove("open");
  if (pendingManager) {
    saveManager(pendingManager);
    pendingManager = null;
  }
  openPage("contact");
});
document.getElementById("manager-bar-hide").addEventListener("click", () => {
  pendingManager = null;
  document.getElementById("manager-bar").classList.remove("open");
});

// Закрытые окна помечаем сразу: до первого открытия в них тоже нельзя
// попадать с клавиатуры.
syncInert();

loadManager();
const managerFromUrl = readManagerFromUrl();
if (managerFromUrl) offerManager(managerFromUrl);

load();
