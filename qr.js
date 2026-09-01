// Генератор QR-кода: режим «байты», уровень коррекции M, версии 1–10
// (до 213 символов — с запасом на любую ссылку каталога).
// Своя реализация, чтобы код рисовался офлайн, без обращения к чужим сервисам.
(function (global) {
  "use strict";

  // Ёмкость данных в байтах для уровня M по версиям 1–10.
  const CAPACITY = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

  // По версии: [кодовых слов коррекции на блок, [число блоков, данных в блоке], ...].
  const EC_BLOCKS = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]],
  };

  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  };

  // Готовые 18-битные строки версии (нужны начиная с 7-й).
  const VERSION_BITS = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

  // Готовые 15-битные строки формата для уровня M по маскам 0–7.
  const FORMAT_BITS = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

  // Таблицы логарифмов поля Галуа GF(256) для кодов Рида — Соломона.
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function buildTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function mul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      // Умножение на (x + α^i): сдвиг степени — в next[j], множитель — в next[j+1].
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    const gen = rsGenerator(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const byte of data) {
      const factor = byte ^ res[0];
      res.shift();
      res.push(0);
      for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
    }
    return res;
  }

  function toUtf8(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function buildCodewords(bytes, version) {
    const [ecLen, groups] = EC_BLOCKS[version];
    let totalData = 0;
    groups.forEach(([count, size]) => (totalData += count * size));

    // Поток бит: индикатор режима (0100), длина, данные, ограничитель.
    const bits = [];
    const push = (value, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
    };
    push(4, 4);
    push(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach((b) => push(b, 8));
    for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    // Добивка чередующимися байтами до полной ёмкости.
    const PAD = [0xec, 0x11];
    for (let i = 0; data.length < totalData; i++) data.push(PAD[i % 2]);

    // Разбивка на блоки и вычисление коррекции для каждого.
    const dataBlocks = [];
    const ecBlocks = [];
    let pos = 0;
    groups.forEach(([count, size]) => {
      for (let i = 0; i < count; i++) {
        const block = data.slice(pos, pos + size);
        pos += size;
        dataBlocks.push(block);
        ecBlocks.push(rsEncode(block, ecLen));
      }
    });

    // Чередование: сначала байты данных по блокам, затем байты коррекции.
    const result = [];
    const maxData = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxData; i++) {
      dataBlocks.forEach((b) => {
        if (i < b.length) result.push(b[i]);
      });
    }
    for (let i = 0; i < ecLen; i++) ecBlocks.forEach((b) => result.push(b[i]));
    return result;
  }

  function createMatrix(version) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));

    const finder = (row, col) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r;
          const cc = col + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          // Кольцо 7×7 — тёмное, вокруг него (r/c равны -1 или 7) светлая
          // разделительная полоса, поэтому проверяем попадание в квадрат.
          const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const edge = inBox && (r === 0 || r === 6 || c === 0 || c === 6);
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          m[rr][cc] = edge || core ? 1 : 0;
        }
      }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      const bit = i % 2 === 0 ? 1 : 0;
      m[6][i] = bit;
      m[i][6] = bit;
    }

    // Выравнивающие узоры ставятся во всех сочетаниях координат, кроме трёх
    // углов с поисковыми узорами. Синхрополосу они при этом перекрывают.
    const centers = ALIGN[version];
    const last = centers[centers.length - 1];
    centers.forEach((r) => {
      centers.forEach((c) => {
        const atFinder = (r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6);
        if (atFinder) return;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const ring = Math.max(Math.abs(dr), Math.abs(dc));
            m[r + dr][c + dc] = ring === 1 ? 0 : 1;
          }
        }
      });
    });

    m[size - 8][8] = 1; // обязательный тёмный модуль

    // Резервируем места под строки формата и версии.
    for (let i = 0; i < 9; i++) {
      if (m[8][i] === null) m[8][i] = 0;
      if (m[i][8] === null) m[i][8] = 0;
    }
    for (let i = 0; i < 8; i++) {
      if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 0;
      if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 0;
    }
    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          m[size - 11 + j][i] = 0;
          m[i][size - 11 + j] = 0;
        }
      }
    }
    return m;
  }

  function placeData(matrix, codewords, reserved) {
    const size = matrix.length;
    const bits = [];
    codewords.forEach((b) => {
      for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    });

    let idx = 0;
    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--; // столбец синхрополосы пропускаем
      for (let step = 0; step < size; step++) {
        const row = upward ? size - 1 - step : step;
        for (const col of [right, right - 1]) {
          if (reserved[row][col]) continue;
          matrix[row][col] = idx < bits.length ? bits[idx] : 0;
          idx++;
        }
      }
      upward = !upward;
    }
  }

  function maskBit(pattern, row, col) {
    switch (pattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    }
  }

  function penalty(m) {
    const size = m.length;
    let score = 0;

    // Правило 1: серии одинаковых модулей длиннее четырёх.
    const runs = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
      }
    };
    runs((r, c) => m[r][c]);
    runs((c, r) => m[r][c]);

    // Правило 2: однотонные блоки 2×2.
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // Правило 3: узор, похожий на поисковый.
    const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const match = (get, a, b, pat) => pat.every((v, i) => get(a, b + i) === v);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b + 11 <= size; b++) {
        if (match((x, y) => m[x][y], a, b, P1) || match((x, y) => m[x][y], a, b, P2)) score += 40;
        if (match((x, y) => m[y][x], a, b, P1) || match((x, y) => m[y][x], a, b, P2)) score += 40;
      }
    }

    // Правило 4: перекос баланса тёмного и светлого.
    let dark = 0;
    m.forEach((row) => row.forEach((v) => (dark += v)));
    const percent = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function applyFormat(m, mask, version) {
    const size = m.length;
    const bits = FORMAT_BITS[mask];
    const bit = (i) => (bits >> i) & 1;

    for (let i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
    m[8][7] = bit(8);
    m[8][8] = bit(7);
    m[7][8] = bit(6);
    for (let i = 9; i <= 14; i++) m[14 - i][8] = bit(14 - i);

    // Вторая копия: биты 0–6 идут вверх по правому краю (модуль size-8
    // пропускаем — там обязательный тёмный), биты 7–14 — по нижней строке.
    for (let i = 0; i <= 6; i++) m[size - 1 - i][8] = bit(i);
    for (let i = 7; i <= 14; i++) m[8][size - 15 + i] = bit(i);

    if (version >= 7) {
      const v = VERSION_BITS[version];
      for (let i = 0; i < 18; i++) {
        const b = (v >> i) & 1;
        const r = Math.floor(i / 3);
        const c = size - 11 + (i % 3);
        m[r][c] = b;
        m[c][r] = b;
      }
    }
  }

  // Возвращает матрицу true/false: true — тёмный модуль.
  function encode(text) {
    const bytes = toUtf8(text);
    const version = CAPACITY.findIndex((cap) => bytes.length <= cap) + 1;
    if (version === 0) throw new Error("Слишком длинная строка для QR");

    const codewords = buildCodewords(bytes, version);
    const base = createMatrix(version);
    const reserved = base.map((row) => row.map((v) => v !== null));

    const matrix = base.map((row) => row.map((v) => (v === null ? 0 : v)));
    placeData(matrix, codewords, reserved);

    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = matrix.map((row, r) =>
        row.map((v, c) => (!reserved[r][c] && maskBit(mask, r, c) ? v ^ 1 : v))
      );
      applyFormat(candidate, mask, version);
      const score = penalty(candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best.map((row) => row.map((v) => v === 1));
  }

  // Рисует QR в canvas: quiet zone 4 модуля, как требует стандарт.
  function draw(canvas, text, pixelSize) {
    const modules = encode(text);
    const quiet = 4;
    const total = modules.length + quiet * 2;
    const scale = pixelSize || 8;

    canvas.width = total * scale;
    canvas.height = total * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    modules.forEach((row, r) => {
      row.forEach((on, c) => {
        if (on) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      });
    });
  }

  global.QR = { encode, draw };
})(window);
