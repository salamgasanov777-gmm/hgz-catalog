let products = [];
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

function applyTheme() {
  const stored = storedTheme();
  if (stored) document.documentElement.setAttribute("data-theme", stored);
  else document.documentElement.removeAttribute("data-theme");

  const dark = effectiveTheme() === "dark";
  document.getElementById("theme-btn").textContent = dark ? "☀️" : "🌙";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#14181c" : "#2c4f78");
}

document.getElementById("theme-btn").addEventListener("click", () => {
  localStorage.setItem("hgz-theme", effectiveTheme() === "dark" ? "light" : "dark");
  applyTheme();
});

applyTheme();

async function load() {
  const res = await fetch("./products.json", { cache: "no-store" });
  products = await res.json();
  // Дату берём из заголовка ответа, а не из поля в products.json: её не нужно
  // помнить и проставлять руками. GitHub Pages ставит в Last-Modified время
  // последней выкладки сайта, поэтому это дата версии каталога целиком.
  // Офлайн ответ приходит из кеша вместе со своим заголовком — значит,
  // показывается дата ровно той версии, которую человек видит.
  dataDate = res.headers.get("Last-Modified");
  showDataDate();

  // Страницы про сам завод лежат отдельным файлом: их наполняют текстом и
  // ссылками, а не карточками товаров, и без них каталог обязан работать.
  try {
    const info = await fetch("./content.json", { cache: "no-store" });
    content = info.ok ? await info.json() : null;
  } catch {
    content = null;
  }

  renderCategories();
  renderPages();
  render();
  openFromHash();
}

let dataDate = null;
let content = null;

function showDataDate() {
  // Элемента может не быть: у человека в кеше осталась прежняя index.html,
  // а скрипт уже новый. Тогда просто молчим — падать посреди загрузки
  // каталога из-за подписи с датой нельзя.
  const el = document.getElementById("drawer-foot");
  if (!el) return;
  if (!dataDate) {
    el.textContent = "";
    return;
  }
  const d = new Date(dataDate);
  if (isNaN(d)) {
    el.textContent = "";
    return;
  }
  const when = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(/\s*г\.$/, "");
  el.textContent = navigator.onLine ? `Каталог обновлён ${when}` : `Нет сети. Показана версия от ${when}`;
}

addEventListener("online", showDataDate);
addEventListener("offline", showDataDate);

function openFromHash() {
  const m = location.hash.match(/#p=(\d+)/);
  if (!m) return;
  const p = products.find((x) => String(x.id) === m[1]);
  if (p) openSheet(p);
}

function renderCategories() {
  const cats = new Set(products.map((p) => p.category).filter(Boolean));
  const items = [{ key: "Все", label: "Все" }, ...[...cats].map((c) => ({ key: c, label: c }))];

  const drawerList = document.getElementById("drawer-list");
  drawerList.innerHTML = items
    .map((c) => `<button class="drawer-item ${c.key === activeCategory ? "active" : ""}" data-cat="${esc(c.key)}">${esc(c.label)}</button>`)
    .join("");
  drawerList.querySelectorAll(".drawer-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectCategory(btn.dataset.cat);
      dismissOverlay();
    });
  });
}


// ------------------------------------------------- Страницы про завод
// Все три пункта показываются всегда, даже пустые: так решил владелец —
// наполнять он будет постепенно, а видеть разделы хочет уже сейчас. Пустой
// раздел честно пишет, что данные появятся позже, а не притворяется рабочим.
const PAGES = [
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
      if (a.site) html += `<a class="page-link" href="${esc(a.site)}" target="_blank" rel="noopener">${esc(a.site.replace(/^https?:\/\//, ""))}</a>`;
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
      if (!(c && (c.stores || []).length)) {
        return `<p class="page-empty">Список точек продаж скоро появится здесь. Пока адрес ближайшего магазина подскажет менеджер.</p>`;
      }
      return (c.stores || [])
        .map((s) => {
          const lines = [s.address, s.hours].filter(Boolean).map((t) => `<p class="line">${esc(t)}</p>`).join("");
          const actions = [];
          if (s.phone) actions.push(`<a href="tel:${esc(s.phone.replace(/[^+\d]/g, ""))}">Позвонить</a>`);
          if (s.address) actions.push(`<a href="https://yandex.ru/maps/?text=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">Открыть в картах</a>`);
          return `<div class="store-card"><p class="name">${esc(s.name || "")}</p>${lines}${
            s.phone ? `<p class="line">${esc(s.phone)}</p>` : ""
          }${actions.length ? `<div class="store-actions">${actions.join("")}</div>` : ""}</div>`;
        })
        .join("");
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
        .map(
          (v) =>
            `<a class="video-item" href="${esc(v.url)}" target="_blank" rel="noopener"><div class="thumb" style="${
              v.thumb ? `background-image:url('${esc(v.thumb)}')` : ""
            }"></div><div class="title">▶ ${esc(v.title || "Смотреть")}</div></a>`
        )
        .join("");
    },
  },
];

function renderPages() {
  const box = document.getElementById("pages-list");
  if (!box) return;
  box.innerHTML = PAGES.map((page) => `<button class="drawer-item" data-page="${page.key}">${esc(page.label)}</button>`).join("");
  box.querySelectorAll("[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.page;
      // Сначала должна закрыться шторка разделов, и только потом открыться
      // страница. Закрытие идёт через историю браузера, то есть не мгновенно:
      // откроем страницу — и её же тут же закроет прилетевший popstate.
      if (!overlayStack.length) {
        openPage(key);
        return;
      }
      window.addEventListener("popstate", () => openPage(key), { once: true });
      dismissOverlay();
    });
  });
}

function openPage(key) {
  const page = PAGES.find((x) => x.key === key);
  if (!page) return;
  document.getElementById("page-title").textContent = page.label;
  document.getElementById("page-body").innerHTML = page.render(content);
  document.getElementById("page-backdrop").classList.add("open");
  document.getElementById("page-sheet").classList.add("open");
  openOverlay(closePage);
}

function closePage() {
  document.getElementById("page-backdrop").classList.remove("open");
  document.getElementById("page-sheet").classList.remove("open");
}

function selectCategory(cat) {
  activeCategory = cat;
  renderCategories();
  render();
}

// Оверлеи (шторка разделов, карточка товара, сравнение) складываются в стек:
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

function openOverlay(onClose) {
  overlayStack.push(onClose);
  lockScroll();
  history.pushState({ hgzOverlay: overlayStack.length }, "");
}

// Закрытие всегда идёт через историю, чтобы состояние стека и истории совпадали.
function dismissOverlay() {
  if (overlayStack.length) history.back();
}

window.addEventListener("popstate", () => {
  const onClose = overlayStack.pop();
  if (onClose) onClose();
  unlockScroll();
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
      if (e.touches.length !== 1 || sheet.scrollTop > 0) return;
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

["sheet", "compare-sheet", "qr-sheet", "ios-sheet"].forEach((id) =>
  enableSwipeToClose(document.getElementById(id))
);

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-backdrop").classList.add("open");
  openOverlay(closeDrawer);
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-backdrop").classList.remove("open");
}

document.getElementById("drawer-btn").addEventListener("click", openDrawer);
document.getElementById("drawer-backdrop").addEventListener("click", dismissOverlay);

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
  ванной: ["повышенным уровнем влажности"],
  санузел: ["повышенным уровнем влажности"],
  душевая: ["повышенным уровнем влажности"],
  комната: ["нормальным уровнем влажности"],
  спальня: ["нормальным уровнем влажности"],
  улица: ["фасад", "наружные"],
  снаружи: ["фасад", "наружные"],
};

const FIELD_WEIGHT = { name: 100, summary: 50, unit: 40, area: 35, section: 14, table: 12 };
const FIELD_LABEL = { summary: "описание", unit: "фасовка", area: "область применения", section: "инструкция", table: "характеристики" };

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/ё/g, "е");
}

function tokenize(text) {
  return normalizeText(text).split(/[^a-zа-я0-9]+/).filter((w) => w.length > 1);
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
function wordMatches(indexed, query) {
  // Короткое слово вроде «пол» иначе цепляет «полимерную» и «полностью»,
  // поэтому ему разрешаем только близкую по длине форму: «пола», «полов».
  if (query.length <= 3) return indexed.startsWith(query) && indexed.length <= query.length + 2;

  if (indexed.startsWith(query) || query.startsWith(indexed)) return true;

  const limit = Math.min(indexed.length, query.length);
  if (limit < 5) return false;
  let same = 0;
  while (same < limit && indexed[same] === query[same]) same++;
  return same >= 4;
}

function fieldHas(field, variant) {
  if (variant.includes(" ")) return field.text.includes(variant);
  return field.words.some((word) => wordMatches(word, variant));
}

// Каждое слово запроса должно найтись хоть где-то, иначе товар не подходит.
// Оценка — сумма весов лучших попаданий, подсказка — самое сильное поле,
// кроме названия: если совпало название, объяснять нечего.
function searchMatch(p, queryTokens) {
  const index = searchIndex(p);
  let score = 0;
  let hintField = null;
  let hintWeight = 0;

  for (const token of queryTokens) {
    const variants = [token, ...(SEARCH_SYNONYMS[token] || [])];
    let best = 0;
    let bestField = null;
    for (const field of Object.keys(FIELD_WEIGHT)) {
      const weight = FIELD_WEIGHT[field];
      if (weight <= best) continue;
      const hit = variants.some((v) => fieldHas(index[field], v));
      if (hit) {
        best = weight;
        bestField = field;
      }
    }
    if (!best) return null;
    score += best;
    if (bestField !== "name" && best > hintWeight) {
      hintWeight = best;
      hintField = bestField;
    }
  }

  return { score, hint: hintField ? FIELD_LABEL[hintField] : null };
}

function render() {
  updateFavNav();
  renderTasks();
  const q = document.getElementById("search").value.trim();
  const queryTokens = tokenize(q);
  const grid = document.getElementById("grid");
  const hints = new Map();

  let filtered = products.filter((p) => {
    const matchesCat =
      activeCategory === "Все" ? true : activeCategory === "__fav__" ? isFavorite(p.id) : p.category === activeCategory;
    const matchesTaskFilter = !activeTask || matchesTask(p, activeTask);
    if (!matchesCat || !matchesTaskFilter) return false;
    if (!queryTokens.length) return true;

    const found = searchMatch(p, queryTokens);
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

  const compareBtn = document.getElementById("compare-btn");
  const compareConfig = COMPARE_CONFIG[activeCategory];
  compareBtn.style.display = compareConfig ? "block" : "none";
  if (compareConfig) compareBtn.textContent = compareConfig.buttonLabel;

  if (filtered.length === 0) {
    let msg;
    if (activeCategory === "__fav__") {
      msg = "В избранном пока пусто.<br>Нажмите ★ на карточке товара, чтобы добавить.";
    } else if (activeTask) {
      const label = TASKS.find((t) => t.key === activeTask)?.label;
      msg = `Под задачу «${esc(label)}» в этом разделе ничего нет.<br>Снимите фильтр или выберите другой раздел.`;
    } else if (q) {
      msg = `По запросу «${esc(q)}» ничего не нашлось.<br>Попробуйте другое слово — например, «плитка», «фасад» или «ванная».`;
    } else {
      msg = "Пока ничего нет.<br>Добавьте товары в products.json";
    }
    grid.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p, i) => `
    <div class="card" data-id="${p.id ?? i}">
      <div class="photo${p.photo ? " loading" : ""}" style="${p.photo ? `background-image:url('${photoUrl(p)}')` : ""}">${p.photo ? "" : esc(p.name)}</div>
      <button class="fav-btn ${isFavorite(p.id) ? "active" : ""}" data-fav-id="${p.id ?? i}" aria-label="Избранное">${isFavorite(p.id) ? "★" : "☆"}</button>
      <div class="info">
        <p class="name">${esc(p.name)}</p>
        <p class="meta">${esc(p.unit || "")}${p.price ? " · " + esc(p.price) : ""}</p>
        ${hints.get(p.id)?.hint ? `<p class="found">найдено в: ${esc(hints.get(p.id).hint)}</p>` : ""}
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".photo.loading").forEach(watchPhoto);

  grid.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector(".fav-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(Number(id));
      updateFavNav();
      syncCardFav(Number(id));
    });
    card.addEventListener("click", () => {
      const p = filtered.find((x, i) => String(p_id(x, i)) === id);
      openSheet(p);
    });
  });
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
    box.innerHTML = "";
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

function photoUrl(p) {
  if (!p.photo) return "";
  return WEBP_OK ? p.photo.replace(/\.jpg$/i, ".webp") : p.photo;
}

function p_id(p, i) {
  return p.id ?? i;
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

function openSheet(p) {
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

  document.getElementById("sheet-share").href = `https://wa.me/?text=${encodeURIComponent(shareText(p))}`;

  document.getElementById("backdrop").classList.add("open");
  document.getElementById("sheet").classList.add("open");
  document.getElementById("sheet").scrollTop = 0;
  openOverlay(closeSheet);
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
      result.innerHTML = `Нужно: <b>${formatNum(total)} кг</b> (~${bags} меш. по ${calc.pack} кг)`;
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
  "Шпаклевка": {
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
    rows: () => [
      ROW.wet,
      ROW.unit(),
      ROW.consumption,
      ROW.tech("Время высыхания"),
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
      ROW.tech("Листов на паллете"),
    ],
  },
  "Пазогребневые плиты": {
    buttonLabel: "⇄ Сравнить плиты",
    title: "Как выбрать плиту",
    rows: () => [
      ROW.wet,
      ROW.tech("Размер плиты"),
      ROW.tech("Толщина"),
      ROW.tech("В упаковке"),
      ROW.tech("Площадь упаковки"),
    ],
  },
};

function openCompare() {
  const config = COMPARE_CONFIG[activeCategory];
  if (!config) return;

  const items = products.filter((p) => p.category === activeCategory);
  const rows = config.rows(items);
  const wrap = document.getElementById("compare-table-wrap");

  const shortName = (name) => {
    const m = name.match(/«([^»]+)»/);
    return m ? m[1] : name;
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
          ? `<td class="cmp-cell">${v ? '<span class="cmp-check">✓</span>' : ""}</td>`
          : `<td class="cmp-cell cmp-text">${esc(v ?? "—")}</td>`;
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  wrap.innerHTML = html;

  document.getElementById("compare-title").textContent = config.title;
  document.getElementById("compare-backdrop").classList.add("open");
  document.getElementById("compare-sheet").classList.add("open");
  openOverlay(closeCompare);
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

document.getElementById("qr-btn").addEventListener("click", () => {
  const canvas = document.getElementById("qr-canvas");
  const url = catalogUrl();
  // Модуль в 8 точек: код остаётся читаемым и когда его показывают
  // с экрана телефона, и когда распечатывают.
  QR.draw(canvas, url, 8);
  resetCopyBtn();
  document.getElementById("qr-backdrop").classList.add("open");
  document.getElementById("qr-sheet").classList.add("open");
  openOverlay(closeQr);
});

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
  const ok = await copyText(catalogUrl());
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
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

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
  document.getElementById("ios-backdrop").classList.add("open");
  document.getElementById("ios-sheet").classList.add("open");
  openOverlay(closeIos);
});

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

load();
