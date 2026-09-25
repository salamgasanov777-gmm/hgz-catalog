// Проверка каталога перед публикацией.
//
//   node tools/check.mjs
//
// Ничего не меняет — только читает и сообщает. Две части:
//   1. Согласованность версий (index.html, sw.js, кеш).
//   2. Данные каталога (products.json, content.json, файлы фотографий).
//
// Если что-то не так — печатает ФАЙЛ, МЕСТО и ЧТО ИМЕННО, и выходит с кодом 1.
// Поэтому скрипт можно ставить в любую проверку перед пушем.

import fs from "node:fs";
import path from "node:path";
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

  const htmlV = [...html.matchAll(/(?:style\.css|app\.js|qr\.js)\?v=(\d+)/g)].map((m) => m[1]);
  const swV = [...sw.matchAll(/(?:style\.css|app\.js|qr\.js)\?v=(\d+)/g)].map((m) => m[1]);
  const cacheV = (sw.match(/const CACHE = "hgz-cache-v(\d+)"/) || [])[1];

  if (htmlV.length !== 3) {
    fail("index.html", "не найдены метки версии", `ожидалось 3 (style.css, app.js, qr.js), найдено ${htmlV.length}`);
  }
  if (swV.length !== 3) {
    fail("sw.js", "не найдены метки версии в списке CORE", `ожидалось 3, найдено ${swV.length}`);
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

// ------------------------------------------------- 2. Данные каталога
const REQUIRED = ["id", "name", "category", "unit", "photo"];
const KNOWN = [
  "id", "name", "category", "unit", "price", "gost", "photo", "photos",
  "summary", "badges", "sections", "tables", "calc", "tasks",
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

// ------------------------------------------------- Запуск
console.log("Проверка версий");
checkVersions();
console.log("\nПроверка данных");
checkProducts();
checkContent();

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
