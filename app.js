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
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  localStorage.setItem("hgz-favorites", JSON.stringify([...favorites]));
}

function storedTheme() {
  return localStorage.getItem("hgz-theme");
}

function effectiveTheme() {
  return storedTheme() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

// Цвет полосы статуса на телефоне. Светлое значение — то же, что в
// index.html и manifest.json: раньше скрипт ставил свой оттенок (#2c4f78),
// и через миг после загрузки полоса меняла цвет. Теперь значение одно.
const THEME_COLOR = { light: "#1f5fa8", dark: "#14181c" };

function applyTheme() {
  const stored = storedTheme();
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  else document.documentElement.removeAttribute("data-theme");

  const dark = effectiveTheme() === "dark";
  document.getElementById("theme-btn").textContent = dark ? "☀️" : "🌙";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? THEME_COLOR.dark : THEME_COLOR.light);
}

document.getElementById("theme-btn").addEventListener("click", () => {
  localStorage.setItem("hgz-theme", effectiveTheme() === "dark" ? "light" : "dark");
  applyTheme();
});

applyTheme();

async function load() {
  let res;
  try {
    // no-cache, а не no-store: свежесть та же — браузер каждый раз сверяется
    // с сайтом, — но ответ остаётся в его кеше. При первом заходе запас
    // (sw.js) забирает товары оттуда, а не качает все 350 КБ второй раз.
    res = await fetch("./products.json", { cache: "no-cache" });
    products = await res.json();
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
    const info = await fetch("./content.json", { cache: "no-cache" });
    content = info.ok ? await info.json() : null;
  } catch {
    content = null;
  }

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
    const tel = String(a.phone || "").replace(/[^\d+]/g, "");
    const legal = [a.inn && `ИНН ${a.inn}`, a.ogrn && `ОГРН ${a.ogrn}`].filter(Boolean).join(" · ");
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
        <div class="site-foot-contacts">
          ${a.phone ? `<a href="tel:${tel}">${esc(a.phone)}</a>` : ""}
          ${a.site ? `<a href="${esc(a.site)}" target="_blank" rel="noopener">${esc(a.site.replace(/^https?:\/\/(www\.)?/, ""))}</a>` : ""}
        </div>
        ${legal ? `<div class="site-foot-legal">${esc(legal)}</div>` : ""}
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
  if (manager && manager.phone === phone) {
    if (name && name !== manager.name) saveManager({ name, phone, own: false });
    return null;
  }
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
      const a = c.about;
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
        html += `<input id="store-search" class="search store-search" type="search" inputmode="search" autocomplete="off" placeholder="Город, улица или магазин…">`;
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
}

function selectCategory(cat) {
  activeCategory = cat;
  render();
}

document.getElementById("section-all").addEventListener("click", () => selectCategory("Все"));

// Оверлеи (карточка товара, сравнение, QR, страницы завода) складываются в стек:
// каждый добавляет запись в историю, поэтому кнопка «Назад» на телефоне
// закрывает верхний оверлей, а не выходит из приложения.
const overlayStack = [];
let savedScrollY = 0;

function lockScroll() {
  if (overlayStack.length > 1) return;
  savedScrollY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (overlayStack.length) return;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  window.scrollTo(0, savedScrollY);
}

// Окна, которые ведут себя как диалог, и участки страницы под ними. Пока
// открыто окно, всё остальное помечается inert: туда не уходит Tab и до него
// не добирается программа чтения с экрана. Закрытые окна помечены всегда —
// иначе в них остаются кнопки, доступные с клавиатуры, хотя окна не видно.
const DIALOG_IDS = ["sheet", "compare-sheet", "qr-sheet", "ios-sheet", "page-sheet"];
const PAGE_REGIONS = [".topbar", "#home-intro", "#home-rail", "#section-bar", "#compare-btn", "#grid", "#site-foot", "#update-bar", "#manager-bar", "#install-bar"];

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
  const from = opener || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  overlayStack.push({ onClose, node: node || null, opener: from, reopen });
  lockScroll();
  syncInert();
  focusDialog(node);
  if (restoring || !OVERLAY_HISTORY) return;
  // Новое окно обрывает дорогу вперёд — как новая страница в браузере.
  forwardStack = [];
  history.pushState({ hgzOverlay: overlayStack.length }, "");
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
  unlockScroll();
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

  unlockScroll();
});

// Escape закрывает верхнее окно — раньше каталог клавиатуру не слушал вовсе.
// Именно верхнее: при стопке окон одно нажатие снимает один слой.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !overlayStack.length) return;
  e.preventDefault();
  dismissOverlay();
});

// Закрытие шторки свайпом вниз. Тянуть можно только когда содержимое уже
// прокручено к началу — иначе жест конфликтовал бы с чтением длинных карточек.
function enableSwipeToClose(sheet) {
  const CLOSE_AFTER = 90; // столько нужно протянуть, чтобы окно закрылось
  let startY = 0;
  let shift = 0;
  let dragging = false;

  sheet.addEventListener(
    "touchstart",
    (e) => {
      // На плеере перетаскивание — это перемотка, а не закрытие окна.
      if (e.touches.length !== 1 || sheet.scrollTop > 0 || e.target.closest("video")) return;
      startY = e.touches[0].clientY;
      shift = 0;
      dragging = true;
      sheet.style.transition = "none";
    },
    { passive: true }
  );

  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging) return;
      shift = e.touches[0].clientY - startY;
      if (shift <= 0) {
        // Палец пошёл вверх — это обычная прокрутка, отдаём жест содержимому.
        sheet.style.removeProperty("--drag");
        return;
      }
      e.preventDefault();
      sheet.style.setProperty("--drag", `${shift}px`);
    },
    { passive: false }
  );

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = "";
    sheet.style.removeProperty("--drag");
    // Стили сбрасываются до закрытия, поэтому окно доезжает вниз плавно,
    // с той точки, где его отпустили.
    if (shift > CLOSE_AFTER) dismissOverlay();
    shift = 0;
  };

  sheet.addEventListener("touchend", finish);
  sheet.addEventListener("touchcancel", finish);
}

["sheet", "compare-sheet", "qr-sheet", "ios-sheet", "page-sheet"].forEach((id) =>
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

document.getElementById("fav-nav-btn").addEventListener("click", () => {
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
  if (!btn) return;
  const on = isFavorite(id);
  btn.classList.toggle("active", on);
  btn.textContent = on ? "★" : "☆";
  // В разделе «Избранное» снятая звезда означает, что товару здесь больше не место.
  if (activeCategory === "__fav__" && !on) {
    btn.closest(".card").remove();
    if (!grid.querySelector(".card")) render();
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
  title.textContent = activeCategory === "Все" ? "Каталог продукции" : activeCategory === "__fav__" ? "Избранное" : activeCategory;
  title.title = title.textContent;
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
    syncCardFav(p.id);
    return kept;
  }

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = p.id ?? key;
  card.innerHTML = `
      <div class="photo${p.photo ? " loading" : ""}"${p.photo ? ` data-src="${photoUrl(p)}"` : ""}>${p.photo ? "" : '<span class="photo-soon">Фото скоро</span>'}</div>
      <button class="fav-btn ${isFavorite(p.id) ? "active" : ""}" data-fav-id="${p.id ?? key}" aria-label="Избранное">${isFavorite(p.id) ? "★" : "☆"}</button>
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
      const urls = [...new Set([photoUrl({ photo: HOME_PHOTO }), ...products.map(photoUrl)].filter(Boolean))];
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
    html += calcHtml(p.calc);
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

  if (p.description && !p.sections) {
    html += `<p>${esc(p.description).replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>")}</p>`;
  }

  body.innerHTML = html;

  if (p.calc) {
    wireCalc(p.calc);
  }

  // Клиенту, пришедшему по QR-коду менеджера, кнопка пишет сразу этому
  // менеджеру. У самого менеджера (own) она остаётся обычной: он рассылает
  // товары клиентам и выбирает чат сам.
  const shareTo = manager && !manager.own ? manager.phone : "";
  const shareBtn = document.getElementById("sheet-share");
  shareBtn.href = `https://wa.me/${shareTo}?text=${encodeURIComponent(shareText(p))}`;
  shareBtn.textContent = shareTo ? `📤 Отправить менеджеру в WhatsApp` : `📤 Отправить в WhatsApp`;

  document.getElementById("backdrop").classList.add("open");
  document.getElementById("sheet").classList.add("open");
  document.getElementById("sheet").scrollTop = 0;
  openOverlay(closeSheet, document.getElementById("sheet"), openedFrom, () => openSheet(p, openedFrom));
}

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

function calcHtml(calc) {
  const thicknessRow =
    calc.type === "thickness"
      ? `<label class="calc-field">
          <span>Толщина слоя, мм</span>
          <input id="calc-mm" type="number" inputmode="decimal" min="0.1" step="${calc.stepMm ?? 1}" value="${calc.defaultMm ?? 10}">
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
          <input id="calc-area" type="number" inputmode="decimal" min="0" step="0.1" placeholder="напр. 10">
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

function wireCalc(calc) {
  const areaInput = document.getElementById("calc-area");
  const mmInput = document.getElementById("calc-mm");
  const wasteInput = document.getElementById("calc-waste");
  const result = document.getElementById("calc-result");

  function update() {
    const area = parseFloat((areaInput.value || "").replace(",", "."));
    const mm = mmInput ? parseFloat((mmInput.value || "").replace(",", ".")) : null;

    if (!area || area <= 0) {
      result.textContent = "Введите площадь";
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
      if (calc.pack) {
        const packs = Math.ceil(pieces / calc.pack);
        text += ` (${packs} ${plural(packs, calc.packLabel)} по ${calc.pack} шт)`;
      }
      result.innerHTML = text;
      return;
    }

    let total;
    if (calc.type === "thickness") {
      if (!mm || mm <= 0) {
        result.textContent = "Введите толщину слоя";
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
    } else {
      const bags = Math.ceil(total / calc.pack);
      // Сухие смеси приходят в мешках, но не всё: жидкая гидроизоляция — в
      // ведре. Товар может назвать свою тару полем "packWord" в products.json.
      const packWord = calc.packWord || "меш.";
      result.innerHTML = `Нужно: <b>${formatNum(total)} кг</b> (~${bags} ${packWord} по ${calc.pack} кг)`;
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

// Строки «Область применения» берём из первого товара раздела: таблица у них
// одинаковая, а перечислять её вручную в каждом разделе — только плодить
// расхождения с products.json.
function areaBoolRows(items, skip = []) {
  const table = (items[0]?.tables || []).find((t) => t.title === "Область применения");
  return (table?.rows || [])
    .filter(([label]) => !skip.includes(label))
    .map(([label]) => ({
      label,
      type: "bool",
      get: (p) => tableValue(p, "Область применения", label) === "ДА",
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
    html += `<tr><td class="cmp-label">${esc(row.label)}</td>`;
    items.forEach((p) => {
      const v = row.get(p);
      html +=
        row.type === "bool"
          ? `<td class="cmp-cell">${v ? '<span class="cmp-check">✓</span>' : '<span class="cmp-no">—</span>'}</td>`
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
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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
  if (isStandalone() || localStorage.getItem("hgz-install-hidden")) return;
  document.getElementById("install-bar").classList.add("open");
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  showInstallBar();
});

if (isIOS()) showInstallBar();

document.getElementById("install-yes").addEventListener("click", async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    document.getElementById("install-bar").classList.remove("open");
    return;
  }
  openIosHelp();
});

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
  localStorage.setItem("hgz-install-hidden", "1");
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
