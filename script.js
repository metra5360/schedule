/**
 * Мій розклад уроків — головний скрипт
 * Інкапсульовано в IIFE для уникнення забруднення глобальної області.
 * Безпека: без innerHTML для користувацького вводу, екранування та валідація посилань.
 */
(function () {
  "use strict";

  const DAYS = [
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "П'ятниця",
    "Субота",
    "Неділя",
  ];

  const STORAGE_KEY = "scheduleData";
  const DEBOUNCE_MS = 400;

  const defaultSchedule = Object.fromEntries(DAYS.map((d) => [d, []]));

  /** Повертає індекс поточного дня (0 = понеділок, 6 = неділя) */
  function getCurrentDayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  }

  /** Перевіряє, чи URL безпечний (тільки http/https) */
  function isAllowedUrl(url) {
    if (!url || typeof url !== "string") return false;
    const t = url.trim();
    return t.startsWith("http://") || t.startsWith("https://");
  }

  /** Повертає безпечний href або "#" */
  function safeHref(url) {
    return isAllowedUrl(url) ? url.trim() : "#";
  }

  /** Екранує HTML для безпеки від XSS */
  function escapeHtml(text) {
    if (text == null) return "";
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  /** Валідує та нормалізує один урок */
  function normalizeLesson(raw) {
    const o = raw && typeof raw === "object" ? raw : {};
    return {
      name: typeof o.name === "string" ? o.name : "",
      link: typeof o.link === "string" ? o.link : "",
      startTime: typeof o.startTime === "string" ? o.startTime : "",
      endTime: typeof o.endTime === "string" ? o.endTime : "",
      color: typeof o.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color : "",
    };
  }

  /** Валідує структуру збережених даних */
  function validateSchedule(data) {
    if (!data || typeof data !== "object") return null;
    const out = {};
    for (const day of DAYS) {
      const arr = Array.isArray(data[day]) ? data[day] : [];
      out[day] = arr.map(normalizeLesson);
    }
    return out;
  }

  function getSchedule() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultSchedule));
      const parsed = JSON.parse(raw);
      return validateSchedule(parsed) || JSON.parse(JSON.stringify(defaultSchedule));
    } catch (_) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSchedule));
      return JSON.parse(JSON.stringify(defaultSchedule));
    }
  }

  function saveSchedule(data) {
    const valid = validateSchedule(data);
    if (valid) localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  }

  let saveDebounceTimer = null;
  function debouncedSave(data) {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(function () {
      saveSchedule(data);
      saveDebounceTimer = null;
    }, DEBOUNCE_MS);
  }

  const $ = (id) => document.getElementById(id);
  const daySelect = $("daySelect");
  const lessonsArea = $("lessonsArea");
  const emptyState = $("emptyState");
  const noResultsState = $("noResultsState");
  const lessonFilter = $("lessonFilter");
  const importFile = $("importFile");

  function getFilterText() {
    return (lessonFilter && lessonFilter.value) ? lessonFilter.value.trim().toLowerCase() : "";
  }

  const emptyStateText = $("emptyStateText");
  const EMPTY_NO_DAY = "Обери день тижня і натисни «Додати урок», щоб почати.";
  const EMPTY_NO_LESSONS = "У цьому дні немає уроків. Натисни «Додати урок», щоб додати перший!";

  function showEmptyState(show, noResults, hasDaySelected) {
    if (emptyState) {
      emptyState.hidden = !show || noResults;
      if (emptyStateText) emptyStateText.textContent = hasDaySelected ? EMPTY_NO_LESSONS : EMPTY_NO_DAY;
    }
    if (noResultsState) noResultsState.hidden = !noResults;
  }

  /** Побудова одного блоку уроку через DOM (без innerHTML з користувацьким вводом) */
  function buildLessonBlock(day, index, lesson) {
    const article = document.createElement("article");
    article.className = "lesson-block";
    article.dataset.day = day;
    article.dataset.index = String(index);
    article.draggable = true;
    if (lesson.color) article.style.setProperty("--lesson-color", lesson.color);

    const heading = document.createElement("h3");
    heading.textContent = "Урок " + (index + 1);
    article.appendChild(heading);

    const actions = document.createElement("div");
    actions.className = "lesson-actions";

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn-delete";
    btnDelete.setAttribute("aria-label", "Видалити урок");
    btnDelete.textContent = "❌";
    actions.appendChild(btnDelete);

    const btnUp = document.createElement("button");
    btnUp.type = "button";
    btnUp.className = "btn-move";
    btnUp.setAttribute("aria-label", "Перемістити урок вгору");
    btnUp.textContent = "⬆";
    actions.appendChild(btnUp);

    const btnDown = document.createElement("button");
    btnDown.type = "button";
    btnDown.className = "btn-move";
    btnDown.setAttribute("aria-label", "Перемістити урок вниз");
    btnDown.textContent = "⬇";
    actions.appendChild(btnDown);

    article.appendChild(actions);

    const fieldName = document.createElement("div");
    fieldName.className = "lesson-field";
    const labelName = document.createElement("label");
    labelName.setAttribute("for", "lesson-name-" + day + "-" + index);
    labelName.textContent = "📘 Назва:";
    fieldName.appendChild(labelName);
    const inputName = document.createElement("input");
    inputName.id = "lesson-name-" + day + "-" + index;
    inputName.type = "text";
    inputName.placeholder = "Назва уроку...";
    inputName.value = lesson.name;
    fieldName.appendChild(inputName);
    article.appendChild(fieldName);

    const fieldLink = document.createElement("div");
    fieldLink.className = "lesson-field";
    const labelLink = document.createElement("label");
    labelLink.setAttribute("for", "lesson-link-" + day + "-" + index);
    labelLink.textContent = "🔗 Посилання:";
    fieldLink.appendChild(labelLink);
    const inputLink = document.createElement("input");
    inputLink.id = "lesson-link-" + day + "-" + index;
    inputLink.type = "url";
    inputLink.placeholder = "https://... Zoom або Meet";
    inputLink.value = lesson.link;
    fieldLink.appendChild(inputLink);
    article.appendChild(fieldLink);

    const timeRow = document.createElement("div");
    timeRow.className = "lesson-time-row";
    const fieldStart = document.createElement("div");
    fieldStart.className = "lesson-field";
    const labelStart = document.createElement("label");
    labelStart.setAttribute("for", "lesson-start-" + day + "-" + index);
    labelStart.textContent = "Початок:";
    fieldStart.appendChild(labelStart);
    const inputStart = document.createElement("input");
    inputStart.id = "lesson-start-" + day + "-" + index;
    inputStart.type = "time";
    inputStart.value = lesson.startTime || "";
    fieldStart.appendChild(inputStart);
    timeRow.appendChild(fieldStart);
    const fieldEnd = document.createElement("div");
    fieldEnd.className = "lesson-field";
    const labelEnd = document.createElement("label");
    labelEnd.setAttribute("for", "lesson-end-" + day + "-" + index);
    labelEnd.textContent = "Кінець:";
    fieldEnd.appendChild(labelEnd);
    const inputEnd = document.createElement("input");
    inputEnd.id = "lesson-end-" + day + "-" + index;
    inputEnd.type = "time";
    inputEnd.value = lesson.endTime || "";
    fieldEnd.appendChild(inputEnd);
    timeRow.appendChild(fieldEnd);
    article.appendChild(timeRow);

    const colorWrap = document.createElement("div");
    colorWrap.className = "lesson-color-wrap";
    const labelColor = document.createElement("label");
    labelColor.textContent = "Колір:";
    colorWrap.appendChild(labelColor);
    const inputColor = document.createElement("input");
    inputColor.type = "color";
    inputColor.value = lesson.color || "#2563eb";
    inputColor.setAttribute("aria-label", "Колір позначки уроку");
    colorWrap.appendChild(inputColor);
    article.appendChild(colorWrap);

    const linkWrap = document.createElement("p");
    linkWrap.className = "lesson-link-wrap";
    if (isAllowedUrl(lesson.link)) {
      const a = document.createElement("a");
      a.href = safeHref(lesson.link);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "🎥 Перейти на урок";
      linkWrap.appendChild(a);
    } else {
      const span = document.createElement("span");
      span.className = "no-link";
      span.textContent = "Посилання ще не додано";
      linkWrap.appendChild(span);
    }
    article.appendChild(linkWrap);

    function updateLinkDisplay() {
      linkWrap.textContent = "";
      const link = inputLink.value.trim();
      if (isAllowedUrl(link)) {
        const a = document.createElement("a");
        a.href = safeHref(link);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "🎥 Перейти на урок";
        linkWrap.appendChild(a);
      } else {
        const span = document.createElement("span");
        span.className = "no-link";
        span.textContent = "Посилання ще не додано";
        linkWrap.appendChild(span);
      }
    }

    function persist() {
      const schedule = getSchedule();
      if (!schedule[day] || !schedule[day][index]) return;
      schedule[day][index] = {
        name: inputName.value,
        link: inputLink.value,
        startTime: inputStart.value,
        endTime: inputEnd.value,
        color: inputColor.value || "",
      };
      debouncedSave(schedule);
    }

    inputName.addEventListener("input", persist);
    inputLink.addEventListener("input", function () {
      persist();
      updateLinkDisplay();
    });
    inputStart.addEventListener("change", persist);
    inputEnd.addEventListener("change", persist);
    inputColor.addEventListener("input", function () {
      article.style.setProperty("--lesson-color", inputColor.value);
      persist();
    });

    btnDelete.addEventListener("click", function () {
      if (!confirm("Видалити цей урок?")) return;
      const schedule = getSchedule();
      if (schedule[day]) schedule[day].splice(index, 1);
      saveSchedule(schedule);
      renderLessons();
    });

    btnUp.addEventListener("click", function () {
      if (index <= 0) return;
      const schedule = getSchedule();
      const arr = schedule[day];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      saveSchedule(schedule);
      renderLessons();
    });

    btnDown.addEventListener("click", function () {
      const schedule = getSchedule();
      const arr = schedule[day];
      if (index >= arr.length - 1) return;
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      saveSchedule(schedule);
      renderLessons();
    });

    article.addEventListener("dragstart", onDragStart);
    article.addEventListener("dragend", onDragEnd);
    article.addEventListener("dragover", onDragOver);
    article.addEventListener("drop", onDrop);
    article.addEventListener("dragleave", onDragLeave);

    return article;
  }

  let draggedEl = null;
  function onDragStart(e) {
    draggedEl = e.target;
    e.target.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }
  function onDragEnd(e) {
    e.target.classList.remove("dragging");
    document.querySelectorAll(".lesson-block").forEach((el) => el.classList.remove("drag-over"));
    draggedEl = null;
  }
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const t = e.target.closest(".lesson-block");
    if (t && t !== draggedEl) t.classList.add("drag-over");
  }
  function onDragLeave(e) {
    const t = e.target.closest(".lesson-block");
    if (t) t.classList.remove("drag-over");
  }
  function onDrop(e) {
    e.preventDefault();
    const target = e.target.closest(".lesson-block");
    if (!target || !draggedEl || target === draggedEl) return;
    target.classList.remove("drag-over");
    const day = daySelect.value;
    if (!day) return;
    const fromIdx = parseInt(draggedEl.dataset.index, 10);
    const toIdx = parseInt(target.dataset.index, 10);
    if (fromIdx === toIdx) return;
    const schedule = getSchedule();
    const arr = schedule[day];
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    saveSchedule(schedule);
    renderLessons();
  }

  function renderLessons() {
    if (!lessonsArea) return;
    lessonsArea.innerHTML = "";
    const day = daySelect ? daySelect.value : "";
    const filter = getFilterText();

    if (!day) {
      showEmptyState(true, false, false);
      return;
    }

    const schedule = getSchedule();
    let lessons = schedule[day] || [];
    if (filter) {
      lessons = lessons.filter(function (l) {
        return (l.name || "").toLowerCase().includes(filter);
      });
    }

    if (lessons.length === 0) {
      showEmptyState(!filter, !!filter, true);
      return;
    }

    showEmptyState(false, false, true);
    lessons.forEach(function (lesson, i) {
      const originalIndex = schedule[day].indexOf(lesson);
      const block = buildLessonBlock(day, originalIndex, lesson);
      lessonsArea.appendChild(block);
    });
  }

  function loadLessons() {
    renderLessons();
  }

  function addLesson() {
    const day = daySelect ? daySelect.value : "";
    if (!day) {
      alert("Спочатку вибери день!");
      return;
    }
    const schedule = getSchedule();
    schedule[day].push({
      name: "",
      link: "",
      startTime: "",
      endTime: "",
      color: "",
    });
    saveSchedule(schedule);
    renderLessons();
  }

  function resetSchedule() {
    if (!confirm("Ти точно хочеш видалити весь розклад?")) return;
    localStorage.removeItem(STORAGE_KEY);
    if (daySelect) daySelect.value = "";
    if (lessonsArea) lessonsArea.innerHTML = "";
    showEmptyState(true, false);
    if (lessonFilter) lessonFilter.value = "";
  }

  function exportSchedule() {
    const schedule = getSchedule();
    const blob = new Blob([JSON.stringify(schedule, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "schedule-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importSchedule(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        const valid = validateSchedule(data);
        if (!valid) {
          alert("Невірний формат файлу.");
          return;
        }
        saveSchedule(valid);
        loadLessons();
        alert("Розклад успішно імпортовано.");
      } catch (_) {
        alert("Не вдалося прочитати файл. Перевір формат JSON.");
      }
    };
    reader.readAsText(file);
  }

  function initTheme() {
    const theme = localStorage.getItem("scheduleTheme") || "light";
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    const btn = $("themeToggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌓";
      btn.setAttribute("aria-label", theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("scheduleTheme", next);
    const btn = $("themeToggle");
    if (btn) {
      btn.textContent = next === "dark" ? "☀️" : "🌓";
      btn.setAttribute("aria-label", next === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    }
  }

  function markCurrentDay() {
    if (!daySelect) return;
    const idx = getCurrentDayIndex();
    const currentDayName = DAYS[idx];
    Array.from(daySelect.options).forEach(function (opt) {
      opt.classList.toggle("current-day", opt.value === currentDayName);
    });
  }

  function init() {
    initTheme();
    markCurrentDay();
    if (daySelect) {
      daySelect.addEventListener("change", loadLessons);
    }
    const addBtn = $("addLessonBtn");
    if (addBtn) addBtn.addEventListener("click", addLesson);
    const resetBtn = $("resetBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetSchedule);
    const exportBtn = $("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportSchedule);
    const importBtn = $("importBtn");
    if (importBtn) importBtn.addEventListener("click", function () {
      importFile.click();
    });
    if (importFile) importFile.addEventListener("change", function () {
      const file = importFile.files[0];
      importSchedule(file);
      importFile.value = "";
    });
    const themeBtn = $("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    if (lessonFilter) lessonFilter.addEventListener("input", renderLessons);

    loadLessons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
