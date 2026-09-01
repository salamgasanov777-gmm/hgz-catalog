let products = [];
let activeCategory = "Все";
let currentProduct = null;

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
  const cats = ["Все", ...new Set(products.map((p) => p.category).filter(Boolean))];

  const drawerList = document.getElementById("drawer-list");
  drawerList.innerHTML = cats
    .map((c) => `<button class="drawer-item ${c === activeCategory ? "active" : ""}" data-cat="${c}">${c}</button>`)
    .join("");
  drawerList.querySelectorAll(".drawer-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectCategory(btn.dataset.cat);
      closeDrawer();
    });
  });
}

function selectCategory(cat) {
  activeCategory = cat;
  renderCategories();
  render();
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawer-backdrop").classList.add("open");
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawer-backdrop").classList.remove("open");
}

document.getElementById("drawer-btn").addEventListener("click", openDrawer);
document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);

function render() {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const grid = document.getElementById("grid");
  const filtered = products.filter((p) => {
    const matchesCat = activeCategory === "Все" || p.category === activeCategory;
    const matchesQ = !q || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);
    return matchesCat && matchesQ;
  });

  const compareBtn = document.getElementById("compare-btn");
  compareBtn.style.display = activeCategory === "Клеи" ? "block" : "none";

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty">Пока ничего нет.<br>Добавьте товары в products.json</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p, i) => `
    <div class="card" data-id="${p.id ?? i}">
      <div class="photo" style="${p.photo ? `background-image:url('${p.photo}')` : ""}">${p.photo ? "" : p.name}</div>
      <div class="info">
        <p class="name">${p.name}</p>
        <p class="meta">${p.unit || ""}${p.price ? " · " + p.price : ""}</p>
      </div>
    </div>`
    )
    .join("");

  grid.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const p = filtered.find((x, i) => String(p_id(x, i)) === id);
      openSheet(p);
    });
  });
}

function p_id(p, i) {
  return p.id ?? i;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openSheet(p) {
  currentProduct = p;
  document.getElementById("sheet-photo").style.backgroundImage = p.photo ? `url('${p.photo}')` : "none";
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

  const link = `${location.origin}${location.pathname}#p=${p.id}`;
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
}

document.getElementById("search").addEventListener("input", render);
document.getElementById("backdrop").addEventListener("click", closeSheet);
document.getElementById("sheet-close").addEventListener("click", closeSheet);

function openCompare() {
  const items = products.filter((p) => p.category === "Клеи");
  const wrap = document.getElementById("compare-table-wrap");

  const areaTable = items[0]?.tables.find((t) => t.title === "Область применения");
  const areaRows = (areaTable?.rows || []).filter(([label]) => label !== "Тип плитки");

  const getTableValue = (p, tableTitle, rowLabel) => {
    const t = (p.tables || []).find((x) => x.title === tableTitle);
    const row = t?.rows.find(([l]) => l === rowLabel);
    return row ? row[1] : "";
  };

  const shortName = (name) => {
    const m = name.match(/«([^»]+)»/);
    return m ? m[1] : name;
  };

  let html = '<table class="cmp-table"><thead><tr><th class="cmp-corner"></th>';
  items.forEach((p) => {
    html += `<th><div class="cmp-photo" style="${p.photo ? `background-image:url('${p.photo}')` : ""}"></div><div class="cmp-name">${esc(shortName(p.name))}</div></th>`;
  });
  html += "</tr></thead><tbody>";

  areaRows.forEach(([label]) => {
    html += `<tr><td class="cmp-label">${esc(label)}</td>`;
    items.forEach((p) => {
      const v = getTableValue(p, "Область применения", label);
      html += `<td class="cmp-cell">${v === "ДА" ? '<span class="cmp-check">✓</span>' : ""}</td>`;
    });
    html += "</tr>";
  });

  html += `<tr><td class="cmp-label">Тип плитки</td>`;
  items.forEach((p) => {
    html += `<td class="cmp-cell cmp-text">${esc(getTableValue(p, "Область применения", "Тип плитки"))}</td>`;
  });
  html += "</tr>";

  html += `<tr><td class="cmp-label">Макс. размер плитки для стен, см</td>`;
  items.forEach((p) => {
    html += `<td class="cmp-cell cmp-text">${esc(getTableValue(p, "Максимальный размер плитки", "Для стен, см"))}</td>`;
  });
  html += "</tr>";

  html += `<tr><td class="cmp-label">Макс. размер плитки для пола, см</td>`;
  items.forEach((p) => {
    html += `<td class="cmp-cell cmp-text">${esc(getTableValue(p, "Максимальный размер плитки", "Для пола, см"))}</td>`;
  });
  html += "</tr>";

  html += "</tbody></table>";
  wrap.innerHTML = html;

  document.getElementById("compare-backdrop").classList.add("open");
  document.getElementById("compare-sheet").classList.add("open");
}
function closeCompare() {
  document.getElementById("compare-backdrop").classList.remove("open");
  document.getElementById("compare-sheet").classList.remove("open");
}
document.getElementById("compare-btn").addEventListener("click", openCompare);
document.getElementById("compare-backdrop").addEventListener("click", closeCompare);
document.getElementById("compare-close").addEventListener("click", closeCompare);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

load();
