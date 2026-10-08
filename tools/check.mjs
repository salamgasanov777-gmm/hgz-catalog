// Проверка каталога перед публикацией.
//
//   node tools/check.mjs
//
// Ничего не меняет — только читает и сообщает. Три части:
//   1. Согласованность версий (index.html, sw.js, кеш).
//   2. Код: разбирается ли он, есть ли в разметке всё, что ищет app.js,
//      на месте ли файлы офлайн-запаса и значки.
//   3. Данные каталога (products.json, content.json, файлы фотографий).
//   4. Поиск: эталонные запросы из tools/search-cases.json прогоняются через
//      настоящий код поиска из app.js на настоящих товарах.
//
// Если что-то не так — печатает ФАЙЛ, МЕСТО и ЧТО ИМЕННО, и выходит с кодом 1.
// Поэтому скрипт можно ставить в любую проверку перед пушем.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));

const errors = [];
const warnings = [];
const fail = (where, what, detail) => errors.push({ where, what, detail });
const warn = (where, what, detail) => warnings.push({ where, what, detail });

// ------------------------------------------------- 1. Версии
// Метка ?v= в index.html и в sw.js должна быть одна и та же, а версия кеша —
// подняться вместе с ней. Разойдутся — телефон возьмёт старый код к новой
// разметке или не получит обновление вовсе.
function checkVersions() {
  const html = read("index.html");
  const sw = read("sw.js");

  const htmlV = [...html.matchAll(/(?:style\.css|app\.js|qr\.js|guard\.js)\?v=(\d+)/g)].map((m) => m[1]);
  const swV = [...sw.matchAll(/(?:style\.css|app\.js|qr\.js|guard\.js)\?v=(\d+)/g)].map((m) => m[1]);
  const cacheV = (sw.match(/const CACHE = "hgz-cache-v(\d+)"/) || [])[1];

  if (htmlV.length !== 4) {
    fail("index.html", "не найдены метки версии", `ожидалось 4 (style.css, app.js, qr.js, guard.js), найдено ${htmlV.length}`);
  }
  if (swV.length !== 4) {
    fail("sw.js", "не найдены метки версии в списке CORE", `ожидалось 4, найдено ${swV.length}`);
  }
  if (!cacheV) {
    fail("sw.js", "не найдена версия кеша", 'ожидалась строка вида const CACHE = "hgz-cache-v36"');
  }

  const all = new Set([...htmlV, ...swV]);
  if (all.size > 1) {
    fail("index.html + sw.js", "метки версии разошлись", `в index.html: ${htmlV.join(", ")} · в sw.js: ${swV.join(", ")}`);
  }

  const v = htmlV[0];
  if (v && cacheV && v !== cacheV) {
    fail("sw.js", "версия кеша отстала от версии файлов", `файлы v=${v}, кеш hgz-cache-v${cacheV} — поднимите кеш до v${v}`);
  }

  if (!errors.length) {
    console.log(`  версии согласованы: файлы v=${v}, кеш hgz-cache-v${cacheV}`);
  }
  return v;
}

// Сравнение с опубликованным (ветка origin/main). Стили, код и фото телефон
// берёт из запаса, не спрашивая сайт: адрес с ?v= не меняется — значит, и
// файл не менялся. Поэтому правка app.js, style.css, qr.js или замена фото под
// тем же именем без подъёма версии до телефонов не дойдёт. Здесь это и ловим.
const git = (...args) =>
  execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

function checkAgainstPublished(v) {
  let pubHtml;
  try {
    pubHtml = git("show", "origin/main:index.html");
  } catch {
    warn("git", "не удалось сравнить с опубликованной версией", "нет git или ветки origin/main — проверьте подъём версии вручную");
    return;
  }
  const pubV = (pubHtml.match(/app\.js\?v=(\d+)/) || [])[1];
  if (!pubV || !v) return;

  if (Number(v) < Number(pubV)) {
    fail("index.html", "версия ниже опубликованной", `в папке v=${v}, на сайте v=${pubV} — поставьте больше ${pubV}, иначе телефоны не обновятся`);
    return;
  }
  if (v !== pubV) {
    console.log(`  версия поднята: на сайте v=${pubV}, в папке v=${v}`);
    return;
  }

  const changed = ["style.css", "app.js", "qr.js", "guard.js"].filter((f) => {
    try {
      return git("show", `origin/main:${f}`) !== read(f);
    } catch {
      return false;
    }
  });
  let photos = [];
  try {
    photos = git("diff", "--name-only", "--diff-filter=M", "origin/main", "--", "products/").split("\n").filter(Boolean);
  } catch {}

  if (changed.length) {
    fail(changed.join(", "), "код изменён, а версия не поднята", `на сайте и в папке v=${v} — телефоны возьмут старый файл из запаса; поднимите ?v= в index.html и sw.js и hgz-cache-v`);
  }
  if (photos.length) {
    fail(photos.join(", "), "фото заменено под тем же именем, а версия не поднята", "телефоны покажут старое фото — поднимите версию или дайте файлу новое имя");
  }
  if (!changed.length && !photos.length) {
    console.log(`  версия как на сайте (v=${v}): код и фото не менялись, подъём не нужен`);
  }
}

// ------------------------------------------------- 2. Код
// Опечатка в app.js ломает каталог у всех, а проверка данных её не видит.
// 7 сентября 2026 код искал в разметке удалённый элемент и обрывался — кнопка
// QR перестала открываться. Обе ошибки ловятся здесь, ничего не запуская.
function checkCode() {
  const before = errors.length;
  for (const f of ["app.js", "qr.js", "guard.js", "sw.js"]) {
    try {
      new vm.Script(read(f), { filename: f });
    } catch (e) {
      fail(f, "код не разбирается — каталог не запустится", e.message);
    }
  }

  // Каждый getElementById("…") из app.js должен найти элемент: в index.html
  // или в разметке, которую app.js рисует сам (id="…" в его шаблонах).
  const app = read("app.js");
  const html = read("index.html");
  const wanted = new Set([...app.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]));
  const have = new Set([
    ...[...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
    ...[...app.matchAll(/\bid="([^"$]+)"/g)].map((m) => m[1]),
  ]);
  const missing = [...wanted].filter((id) => !have.has(id));
  if (missing.length) {
    fail("app.js → index.html", "код ищет элементы, которых нет в разметке", missing.join(", "));
  }

  // Файлы, которые service worker кладёт в запас, и значки из манифеста.
  const sw = read("sw.js");
  const listed = ["CORE", "EXTRA"].flatMap((name) => {
    const m = sw.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
    if (!m) {
      fail("sw.js", `не найден список ${name}`, "проверка файлов офлайн-запаса не выполнена");
      return [];
    }
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  });
  for (const entry of listed) {
    const file = entry.replace(/^\.\//, "").replace(/\?.*$/, "") || "index.html";
    if (!exists(file)) fail("sw.js", "файла из офлайн-запаса нет в папке", entry);
  }
  const manifest = parseJson("manifest.json");
  for (const icon of (manifest && manifest.icons) || []) {
    if (!exists(icon.src)) fail("manifest.json", "значок не найден", icon.src);
  }

  if (errors.length === before) {
    console.log(`  код разбирается; элементов, которые ищет app.js: ${wanted.size}, все на месте; файлов запаса: ${listed.length}`);
  }
}

// ------------------------------------------------- 3. Данные каталога
const REQUIRED =["id", "name", "category", "unit", "photo"];
const KNOWN = [
  "id", "name", "category", "unit", "price", "gost", "photo", "photos",
  "summary", "purpose", "badges", "sections", "tables", "calc", "tasks", "cert",
];

function parseJson(file) {
  try {
    return JSON.parse(read(file));
  } catch (e) {
    fail(file, "файл не разбирается как JSON", e.message);
    return null;
  }
}

function checkPhoto(where, src) {
  if (!exists(src)) {
    fail(where, "фотография не найдена", src);
    return;
  }
  if (/\.jpg$/i.test(src)) {
    const webp = src.replace(/\.jpg$/i, ".webp");
    if (!exists(webp)) fail(where, "нет пары .webp", webp);
  }
}

function checkProducts() {
  const products = parseJson("products.json");
  if (!products) return null;

  if (!Array.isArray(products)) {
    fail("products.json", "ожидался список товаров", `получен ${typeof products}`);
    return null;
  }

  // Порядок разделов — единственный список, где они перечислены.
  const app = read("app.js");
  const block = (app.match(/const CATEGORY_ORDER = \[([\s\S]*?)\];/) || [])[1] || "";
  const categories = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!categories.length) {
    fail("app.js", "не найден список разделов CATEGORY_ORDER", "проверка разделов пропущена");
  }
  const taskKeys = [...app.matchAll(/\{ key: "([^"]+)", label/g)].map((m) => m[1]);

  const seen = new Map();
  const ids = [];

  for (const p of products) {
    const where = `товар ${p.id ?? "без id"} «${String(p.name ?? "").slice(0, 40)}»`;

    for (const f of REQUIRED) {
      if (!(f in p)) fail(where, "нет обязательного поля", f);
      else if (p[f] === null || p[f] === undefined || String(p[f]).trim() === "") {
        fail(where, "обязательное поле пустое", f);
      }
    }

    for (const f of Object.keys(p)) {
      if (!KNOWN.includes(f)) fail(where, "неизвестное поле", `${f} — код его не показывает`);
    }

    if (typeof p.id !== "number" || !Number.isInteger(p.id)) {
      fail(where, "id не целое число", String(p.id));
    } else {
      ids.push(p.id);
      if (seen.has(p.id)) fail(where, "повтор id", `такой же id у «${seen.get(p.id)}»`);
      else seen.set(p.id, p.name);
    }

    if (categories.length && p.category && !categories.includes(p.category)) {
      fail(where, "раздела нет в CATEGORY_ORDER", `«${p.category}» — впишите его в app.js, иначе товар уедет в конец списка`);
    }

    for (const t of p.tasks || []) {
      if (taskKeys.length && !taskKeys.includes(t)) fail(where, "неизвестная метка задачи", t);
    }

    if (p.photo) checkPhoto(where, p.photo);
    for (const src of p.photos || []) checkPhoto(where, src);
    if (Array.isArray(p.photos) && p.photos.length && p.photo && p.photos[0] !== p.photo) {
      warn(where, "photo и первый снимок в photos различаются", `${p.photo} ≠ ${p.photos[0]}`);
    }

    for (const t of p.tables || []) {
      for (const row of t.rows || []) {
        if (!Array.isArray(row) || row.length !== 2 || !row.every((x) => typeof x === "string")) {
          fail(where, `строка таблицы «${t.title}» не пара из двух строк`, JSON.stringify(row));
        }
      }
    }
    for (const b of p.badges || []) {
      if (!("label" in b) || !("value" in b)) fail(where, "у бейджа нет label или value", JSON.stringify(b));
    }
    for (const s of p.sections || []) {
      if (!("title" in s) || !("text" in s)) fail(where, "у раздела нет title или text", JSON.stringify(s).slice(0, 60));
    }

    const c = p.calc;
    if (c) {
      const need = { thickness: ["ratePerM2", "pack"], fixed: ["ratePerM2", "pack"], liquid: ["ratePerM2", "pack", "packUnit"], pieces: ["item"] };
      if (!need[c.type]) fail(where, "неизвестный тип калькулятора", String(c.type));
      else {
        for (const f of need[c.type]) if (!(f in c)) fail(where, `калькулятор «${c.type}»: нет поля`, f);
        if (c.type === "pieces" && !("areaPerItem" in c) && !("packArea" in c && "pack" in c)) {
          fail(where, "калькулятор «pieces»: нечем считать площадь штуки", "нужно areaPerItem либо packArea + pack");
        }
        if (c.type === "pieces" && "pack" in c && !("packLabel" in c)) {
          fail(where, "калькулятор «pieces»: есть pack, но нет packLabel", "иначе расчёт упадёт при выводе числа упаковок");
        }
      }
    }
  }

  // Пропуски в нумерации: не ошибка, но чаще всего это забытый товар.
  if (ids.length) {
    const gaps = [];
    for (let i = Math.min(...ids); i <= Math.max(...ids); i++) if (!ids.includes(i)) gaps.push(i);
    if (gaps.length) warn("products.json", "пропуски в нумерации id", gaps.join(", "));
  }

  // Ссылки на товары внутри текстов: #p=НОМЕР должен существовать.
  const known = new Set(ids);
  const all = read("products.json") + read("content.json");
  for (const m of all.matchAll(/#p=(\d+)/g)) {
    const n = Number(m[1]);
    if (!known.has(n)) fail("ссылка в тексте", "ссылка на несуществующий товар", `#p=${n}`);
  }

  console.log(`  товаров: ${products.length}, id ${Math.min(...ids)}–${Math.max(...ids)}, разделов в списке: ${categories.length}`);
  return products;
}

function checkContent() {
  const c = parseJson("content.json");
  if (!c) return;

  for (const src of c.about?.photos || []) checkPhoto("content.json → о заводе", src);

  (c.stores || []).forEach((s, i) => {
    const where = `content.json → точка ${i + 1} «${s.address || "без адреса"}»`;
    if (!s.address) fail(where, "нет адреса", "без него не построится кнопка «Открыть в картах»");
    const phones = Array.isArray(s.phone) ? s.phone : [s.phone];
    if (!phones.filter(Boolean).length) warn(where, "нет телефона", "кнопка «Позвонить» не появится");
  });

  (c.videos || []).forEach((v, i) => {
    const where = `content.json → видео ${i + 1} «${v.title || "без названия"}»`;
    if (!v.file && !v.url) fail(where, "нет ни file, ни url", "ролик не откроется");
    if (v.file && !exists(v.file)) fail(where, "файл ролика не найден", v.file);
    if (v.poster) checkPhoto(where, v.poster);
    else warn(where, "нет кадра-обложки", "на месте ролика будет чёрный прямоугольник");
  });

  console.log(`  страницы завода: точек продаж ${(c.stores || []).length}, видео ${(c.videos || []).length}`);
}

// ------------------------------------------------- Сертификаты
// Товар ссылается на сертификат ключом («cert»), а файл и срок лежат в реестре
// content.json → certificates. Проверяем связку целиком и следим за сроками:
// просроченный сертификат в карточке — ошибка, скоро истекающий — предупреждение.
function checkCertificates() {
  const c = parseJson("content.json");
  const products = parseJson("products.json");
  if (!c || !Array.isArray(products)) return;
  const reg = c.certificates || {};
  const today = new Date();
  const used = new Set();

  for (const [key, cert] of Object.entries(reg)) {
    const where = `content.json → certificates → ${key}`;
    if (!cert.file) fail(where, "нет поля file", "кнопка «Сертификат» не откроет файл");
    else if (!exists(cert.file)) fail(where, "файл сертификата не найден", cert.file);
    else if (!exists(cert.file.replace(/\.pdf$/i, ".jpg"))) fail(where, "нет картинки рядом с PDF", cert.file.replace(/\.pdf$/i, ".jpg") + " — её показывает окно просмотра");
    const m = String(cert.until || "").match(/^(\d\d)\.(\d\d)\.(\d{4})$/);
    if (!m) {
      fail(where, "срок действия не в виде ДД.ММ.ГГГГ", String(cert.until));
      continue;
    }
    const end = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
    const days = Math.floor((end - today) / 86400000);
    if (days < 0) fail(where, "сертификат просрочен", `срок истёк ${cert.until} — замените файл и дату`);
    else if (days < 90) warn(where, "сертификат скоро истекает", `осталось ${days} дн., до ${cert.until}`);
  }

  for (const p of products) {
    if (p.cert === undefined) continue;
    used.add(p.cert);
    if (!reg[p.cert]) fail(`товар ${p.id} «${String(p.name).slice(0, 40)}»`, "сертификата нет в реестре", `cert: «${p.cert}»`);
  }
  for (const key of Object.keys(reg)) {
    if (!used.has(key)) warn(`content.json → certificates → ${key}`, "сертификат никому не назначен", "файл лежит зря");
  }

  console.log(`  сертификаты: файлов ${Object.keys(reg).length}, товаров с кнопкой ${products.filter((p) => p.cert).length} из ${products.length}`);
}

// ------------------------------------------------- 4. Поиск
// Код поиска вырезается из app.js по меткам и запускается на товарах из
// products.json — это тот же код, что работает у клиента, а не его копия.
// Эталонные запросы лежат в tools/search-cases.json. Условия записи:
//   equalsTask / includeTask — результат совпадает с чипом задачи (все товары
//     чипа находятся); sameAs — тот же набор, что у другого запроса;
//   min / max — число найденных; include / exclude — части названий, которые
//     должны / не должны встретиться; first — часть названия первого товара.
function loadSearchEngine(products) {
  const src = read("app.js");
  const a = src.indexOf("const TASKS = [");
  const b = src.indexOf("function loadFavorites()");
  const c = src.indexOf("// ---------------------------------------------------------------- Поиск");
  const d = src.indexOf("function render() {");
  if ([a, b, c, d].some((x) => x < 0)) throw new Error("не найдены метки блока поиска в app.js (TASKS / «Поиск» / render)");
  const code =
    "let products = [];\n" + src.slice(a, b) + "\n" + src.slice(c, d) + "\n" +
    "globalThis.__api = { searchMatch, tokenize, translitVariants, matchesTask, setProducts: (p) => { products = p; } };";
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const api = ctx.__api;
  api.setProducts(products);
  const run = (q) => {
    const tokens = api.tokenize(q);
    const lat = api.translitVariants(q);
    if (!tokens.length) return [];
    return products
      .map((p, i) => ({ p, i, m: api.searchMatch(p, tokens, lat) }))
      .filter((x) => x.m)
      .sort((x, y) => y.m.score - x.m.score || x.i - y.i)
      .map((x) => x.p);
  };
  return { run, task: (key) => products.filter((p) => api.matchesTask(p, key)) };
}

function checkSearch() {
  const products = parseJson("products.json");
  const cases = parseJson("tools/search-cases.json");
  if (!Array.isArray(products) || !Array.isArray(cases)) return;
  let engine;
  try {
    engine = loadSearchEngine(products);
  } catch (e) {
    fail("app.js", "не удалось запустить поиск для проверки", e.message);
    return;
  }
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е");
  const has = (list, part) => list.some((p) => norm(p.name).includes(norm(part)));
  const ids = (list) => new Set(list.map((p) => p.id));
  let bad = 0;

  for (const k of cases) {
    const where = `поиск «${k.q}»`;
    const res = engine.run(k.q);
    const names = (list) => list.slice(0, 4).map((p) => String(p.name).slice(0, 30)).join("; ");
    const problem = (what, detail) => {
      bad++;
      fail(where, what, detail + (k.why ? ` (${k.why})` : ""));
    };

    for (const key of [k.equalsTask, k.includeTask].filter(Boolean)) {
      const chip = engine.task(key);
      const got = ids(res);
      const missing = chip.filter((p) => !got.has(p.id));
      if (missing.length) problem(`не нашёл товары чипа «${key}»`, `нет ${missing.length} из ${chip.length}: ${names(missing)}`);
      if (k.equalsTask) {
        const chipIds = ids(chip);
        const extra = res.filter((p) => !chipIds.has(p.id));
        if (extra.length) problem(`нашёл лишнее сверх чипа «${key}»`, `${extra.length} шт.: ${names(extra)}`);
      }
    }
    if (k.sameAs) {
      const other = engine.run(k.sameAs);
      const a = ids(res);
      const b = ids(other);
      if (a.size !== b.size || [...a].some((id) => !b.has(id))) {
        problem(`результат не совпал с запросом «${k.sameAs}»`, `${res.length} против ${other.length}`);
      }
    }
    if (k.min !== undefined && res.length < k.min) problem("нашлось меньше нужного", `${res.length}, нужно не меньше ${k.min}`);
    if (k.max !== undefined && res.length > k.max) problem("нашлось больше допустимого", `${res.length}, допустимо не больше ${k.max}: ${names(res)}…`);
    for (const part of k.include || []) if (!has(res, part)) problem("не нашёл нужный товар", `«${part}»; нашлось ${res.length}: ${names(res)}`);
    for (const part of k.exclude || []) if (has(res, part)) problem("нашёл лишнее", `«${part}»`);
    if (k.first && !(res[0] && norm(res[0].name).includes(norm(k.first)))) {
      problem("первым стоит не тот товар", `ожидали «${k.first}», первым — «${res[0] ? String(res[0].name).slice(0, 40) : "ничего"}»`);
    }
  }
  console.log(`  поиск: ${cases.length} эталонных запросов${bad ? `, не прошли: ${bad}` : ", все прошли"}`);
}

// ------------------------------------------------- Запуск
console.log("Проверка версий");
checkAgainstPublished(checkVersions());
console.log("\nПроверка кода");
checkCode();
console.log("\nПроверка данных");
checkProducts();
checkContent();
checkCertificates();
console.log("\nПроверка поиска");
checkSearch();

if (warnings.length) {
  console.log(`\nПредупреждения (${warnings.length}) — публиковать можно, но посмотрите:`);
  for (const w of warnings) console.log(`  ${w.where}\n    ${w.what}: ${w.detail}`);
}

if (errors.length) {
  console.log(`\nОШИБКИ (${errors.length}):`);
  for (const e of errors) console.log(`  ${e.where}\n    ${e.what}: ${e.detail}`);
  console.log("\nРЕЗУЛЬТАТ: FAIL — публиковать нельзя, сначала исправьте перечисленное.");
  process.exit(1);
}

console.log("\nРЕЗУЛЬТАТ: PASS — каталог готов к публикации.");
