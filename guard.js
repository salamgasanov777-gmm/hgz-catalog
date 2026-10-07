// Запасной экран при запуске каталога.
//
// Пока каталог запускается, в сетке стоит «Загружаем каталог…». Раньше, если
// запуск срывался, надпись так и висела вечно, и человек не понимал, ждать
// ему или что-то делать. Бывает это в двух случаях:
//   1. Основной код (app.js) не запустился — чаще всего телефон со старым
//      браузером не понимает современный код и бросает ошибку.
//   2. Связь подвисла: товары запрошены, а ответ не идёт и не обрывается.
// Здесь мы ловим оба случая и вместо вечной надписи показываем, что случилось
// и что нажать.
//
// Файл нарочно написан самым старым видом JavaScript (var, function, без
// стрелок и «?.»): он должен сработать именно там, где app.js не понимают.
// Подключается до app.js — иначе не успеет услышать его ошибку.
//
// Когда каталог открылся, app.js сам убирает надпись (у неё класс «empty»), а
// с ней и этот экран, — поэтому если связь всё-таки дотянула, человек просто
// увидит каталог.
(function () {
  var SLOW_MS = 12000;
  var shown = false;

  function loader() {
    return document.querySelector(".grid-loading");
  }

  // Менеджер, которого человек сам записал себе в каталоге (полоса «Записать
  // менеджера?»). Номер перепроверяем: в ссылку идут только цифры.
  function managerPhone() {
    try {
      var m = JSON.parse(localStorage.getItem("hgz-manager") || "null");
      if (!m || m.own) return "";
      var digits = String(m.phone || "").replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15 ? digits : "";
    } catch (e) {
      return "";
    }
  }

  function show(title, text) {
    var box = loader();
    if (!box || shown) return;
    shown = true;
    box.innerHTML = "";

    var h = document.createElement("strong");
    h.className = "boot-title";
    h.textContent = title;
    box.appendChild(h);

    var p = document.createElement("p");
    p.className = "boot-text";
    p.textContent = text;
    box.appendChild(p);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "empty-retry";
    btn.textContent = "Обновить";
    btn.addEventListener("click", function () {
      location.reload();
    });
    box.appendChild(btn);

    var phone = managerPhone();
    if (phone) {
      var a = document.createElement("a");
      a.className = "boot-manager";
      a.href = "https://wa.me/" + phone;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Написать менеджеру в WhatsApp";
      box.appendChild(a);
    }
  }

  // Ошибка в самом app.js, пока каталог ещё не открылся.
  window.addEventListener("error", function (e) {
    var file = (e && e.filename) || "";
    if (file.indexOf("/app.js") === -1 || !loader()) return;
    show(
      "Не получилось открыть каталог",
      "Похоже, браузер на этом телефоне устарел. Нажмите «Обновить». Если не поможет — откройте ссылку в Chrome или обновите браузер."
    );
  });

  // Запуск оборвался на полпути (ошибка в загрузке данных).
  window.addEventListener("unhandledrejection", function () {
    if (!loader()) return;
    show("Не получилось открыть каталог", "Нажмите «Обновить». Если не поможет — проверьте интернет и попробуйте ещё раз.");
  });

  // Связь подвисла: прошло 12 секунд, а каталог всё ещё грузится.
  setTimeout(function () {
    if (!loader()) return;
    show("Каталог открывается дольше обычного", "Проверьте интернет и нажмите «Обновить».");
  }, SLOW_MS);
})();
