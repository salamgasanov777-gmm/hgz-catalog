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
  renderCategories();
  render();
  openFromHash();
}

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

function render() {
  updateFavNav();
  renderTasks();
  const q = document.getElementById("search").value.trim().toLowerCase();
  const grid = document.getElementById("grid");
  const filtered = products.filter((p) => {
    const matchesCat =
      activeCategory === "Все" ? true : activeCategory === "__fav__" ? isFavorite(p.id) : p.category === activeCategory;
    const matchesQ = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    const matchesTaskFilter = !activeTask || matchesTask(p, activeTask);
    return matchesCat && matchesQ && matchesTaskFilter;
  });

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
      <div class="photo" style="${p.photo ? `background-image:url('${photoUrl(p)}')` : ""}">${p.photo ? "" : esc(p.name)}</div>
      <button class="fav-btn ${isFavorite(p.id) ? "active" : ""}" data-fav-id="${p.id ?? i}" aria-label="Избранное">${isFavorite(p.id) ? "★" : "☆"}</button>
      <div class="info">
        <p class="name">${esc(p.name)}</p>
        <p class="meta">${esc(p.unit || "")}${p.price ? " · " + esc(p.price) : ""}</p>
      </div>
    </div>`
    )
    .join("");

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
  document.getElementById("sheet-photo").style.backgroundImage = p.photo ? `url('${photoUrl(p)}')` : "none";
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
    html += `<section class="doc-section"><h3>${esc(s.title)}</h3><p>${esc(s.text).replace(/\n/g, "<br><br>")}</p></section>`;
  });

  (p.tables || []).forEach((t) => {
    const rows = t.rows
      .map(([label, value]) => `<div class="spec-row"><div class="spec-label">${esc(label)}</div><div class="spec-value">${esc(value)}</div></div>`)
      .join("");
    html += `<section class="doc-section"><h3>${esc(t.title)}</h3><div class="spec-table">${rows}</div></section>`;
  });

  if (p.description && !p.sections) {
    html += `<p>${esc(p.description).replace(/\n/g, "<br><br>")}</p>`;
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

function calcHtml(calc) {
  const thicknessRow =
    calc.type === "thickness"
      ? `<label class="calc-field">
          <span>Толщина слоя, мм</span>
          <input id="calc-mm" type="number" inputmode="decimal" min="1" step="1" value="10">
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
      <div id="calc-result" class="calc-result">Введите площадь</div>
      <p class="calc-note">Расчёт ориентировочный: расход зависит от основания, толщины слоя и способа нанесения. Точное количество на объект уточняйте у менеджера.</p>
    </section>`;
}

function wireCalc(calc) {
  const areaInput = document.getElementById("calc-area");
  const mmInput = document.getElementById("calc-mm");
  const result = document.getElementById("calc-result");

  function update() {
    const area = parseFloat((areaInput.value || "").replace(",", "."));
    const mm = mmInput ? parseFloat((mmInput.value || "").replace(",", ".")) : null;

    if (!area || area <= 0) {
      result.textContent = "Введите площадь";
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

const COMPARE_CONFIG = {
  "Клеи": {
    buttonLabel: "⇄ Сравнить клеи",
    title: "Как выбрать клей",
    rows: (items) => {
      const areaTable = items[0]?.tables.find((t) => t.title === "Область применения");
      const areaRows = (areaTable?.rows || []).filter(([label]) => label !== "Тип плитки");
      const rows = areaRows.map(([label]) => ({
        label,
        type: "bool",
        get: (p) => tableValue(p, "Область применения", label) === "ДА",
      }));
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
      { label: "Для влажных помещений", type: "bool", get: (p) => tableValue(p, "Область применения", "повышенным уровнем влажности") === "ДА" },
      { label: "Мешок", type: "text", get: (p) => p.unit },
      { label: "Толщина слоя, мм", type: "text", get: (p) => tableValue(p, "Технические характеристики", "Толщина слоя") },
      { label: "Расход при слое 10 мм, кг/м²", type: "text", get: (p) => (p.calc ? (p.calc.ratePerM2 * 10).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : null) },
      { label: "Расход воды", type: "text", get: (p) => tableValue(p, "Технические характеристики", "Расход воды") },
      { label: "Прочность на отрыв, МПа", type: "text", get: (p) => badgeValue(p, "Прочность на отрыв") },
      { label: "Температура применения", type: "text", get: (p) => badgeValue(p, "Температура основания") },
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
  document.getElementById("qr-url").textContent = url.replace(/^https:\/\//, "");
  document.getElementById("qr-backdrop").classList.add("open");
  document.getElementById("qr-sheet").classList.add("open");
  openOverlay(closeQr);
});

function closeQr() {
  document.getElementById("qr-backdrop").classList.remove("open");
  document.getElementById("qr-sheet").classList.remove("open");
}
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

load();
