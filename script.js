/**
 * Мій розклад уроків — головний скрипт
 * Синхронізація через Google Sign-In + Google Drive appDataFolder.
 * Без innerHTML для користувацького вводу.
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
  const DRIVE_DEBOUNCE_MS = 2500;
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const DRIVE_API = "https://www.googleapis.com/drive/v3";
  const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const SCHEDULE_FILENAME = "schedule.json";
  const TOKEN_STORAGE_KEY = "scheduleGoogleToken";
  const TOKEN_EXPIRY_KEY = "scheduleGoogleTokenExpiry";
  const FILE_ID_STORAGE_KEY = "scheduleDriveFileId";
  const TOKEN_VALID_MS = 55 * 60 * 1000;

  /** Google OAuth Client ID (можна перевизначити через window.GOOGLE_CLIENT_ID) */
  const GOOGLE_CLIENT_ID =
    typeof window.GOOGLE_CLIENT_ID !== "undefined"
      ? window.GOOGLE_CLIENT_ID
      : "198659847533-hlldfhhg99rksn642rv8jtnu0186og3v.apps.googleusercontent.com";

  const defaultSchedule = Object.fromEntries(DAYS.map(function (d) { return [d, []]; }));

  function getCurrentDayIndex() {
    var d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  }

  function isAllowedUrl(url) {
    if (!url || typeof url !== "string") return false;
    var t = url.trim();
    return t.indexOf("http://") === 0 || t.indexOf("https://") === 0;
  }

  function safeHref(url) {
    return isAllowedUrl(url) ? url.trim() : "#";
  }

  function escapeHtml(text) {
    if (text == null) return "";
    var div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
  }

  function normalizeLesson(raw) {
    var o = raw && typeof raw === "object" ? raw : {};
    return {
      name: typeof o.name === "string" ? o.name : "",
      link: typeof o.link === "string" ? o.link : "",
      startTime: typeof o.startTime === "string" ? o.startTime : "",
      endTime: typeof o.endTime === "string" ? o.endTime : "",
      color: typeof o.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.color) ? o.color : "",
    };
  }

  function validateSchedule(data) {
    if (!data || typeof data !== "object") return null;
    var out = {};
    for (var i = 0; i < DAYS.length; i++) {
      var day = DAYS[i];
      var arr = Array.isArray(data[day]) ? data[day] : [];
      out[day] = arr.map(normalizeLesson);
    }
    return out;
  }

  function getSchedule() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSchedule));
        return JSON.parse(JSON.stringify(defaultSchedule));
      }
      var parsed = JSON.parse(raw);
      var valid = validateSchedule(parsed);
      if (!valid) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSchedule));
        return JSON.parse(JSON.stringify(defaultSchedule));
      }
      return valid;
    } catch (_) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSchedule));
      return JSON.parse(JSON.stringify(defaultSchedule));
    }
  }

  function saveSchedule(data) {
    var valid = validateSchedule(data);
    if (valid) localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  }

  function getGoogleToken() {
    try {
      var token = localStorage.getItem(TOKEN_STORAGE_KEY) || "";
      var expiry = parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) || "0", 10);
      if (!token || Date.now() > expiry) return "";
      return token;
    } catch (_) {
      return "";
    }
  }

  function setGoogleToken(token, expiresInSeconds) {
    if (!token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    var expiry = Date.now() + (expiresInSeconds || 3600) * 1000 - TOKEN_VALID_MS;
    localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry));
  }

  function getDriveFileId() {
    return localStorage.getItem(FILE_ID_STORAGE_KEY) || "";
  }

  function setDriveFileId(id) {
    if (id) localStorage.setItem(FILE_ID_STORAGE_KEY, id);
    else localStorage.removeItem(FILE_ID_STORAGE_KEY);
  }

  function isGoogleConnected() {
    return !!getGoogleToken();
  }

  function setSyncStatus(text, isError) {
    var el = document.getElementById("syncStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "sync-status" + (isError ? " sync-status-error" : "");
  }

  function setSyncError(text) {
    var el = document.getElementById("syncError");
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }

  function clearDriveAuth() {
    setGoogleToken("");
    setDriveFileId("");
    setSyncError("");
  }

  var tokenClient = null;

  function initGoogleAuth() {
    if (typeof window.google === "undefined" || !window.google.accounts || !window.google.accounts.oauth2) return;
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: function (resp) {
          if (resp && resp.access_token) {
            setGoogleToken(resp.access_token, resp.expires_in);
            setSyncError("");
            setSyncStatus("Підключено. Завантаження з Drive…");
            driveEnsureFileAndLoad();
          } else {
            setSyncStatus("Вхід скасовано.", true);
          }
        },
      });
    } catch (_) {}
  }

  function googleConnect() {
    if (tokenClient) {
      tokenClient.requestAccessToken();
    } else {
      setSyncError("Google Sign-In ще не завантажено. Оновіть сторінку.");
    }
  }

  function googleDisconnect() {
    clearDriveAuth();
    setSyncStatus("");
    setSyncError("");
    updateSyncUI();
  }

  function driveAuthHeader() {
    var token = getGoogleToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function driveFindScheduleFile() {
    var token = getGoogleToken();
    if (!token) return Promise.resolve(null);
    var q = "name='" + SCHEDULE_FILENAME + "' and trashed=false";
    var url = DRIVE_API + "/files?spaces=appDataFolder&q=" + encodeURIComponent(q) + "&fields=files(id,name,modifiedTime)";
    return fetch(url, { headers: driveAuthHeader() })
      .then(function (res) {
        if (res.status === 401) {
          clearDriveAuth();
          setSyncError("Підключення втрачено. Увійдіть знову.");
          updateSyncUI();
          throw new Error("Unauthorized");
        }
        return res.json();
      })
      .then(function (data) {
        var files = data.files && data.files.length ? data.files : [];
        return files[0] || null;
      });
  }

  function driveCreateScheduleFile(contentJsonString) {
    var token = getGoogleToken();
    if (!token) return Promise.resolve(null);
    var boundary = "-------boundary_" + Date.now();
    var meta = JSON.stringify({ name: SCHEDULE_FILENAME, parents: ["appDataFolder"] });
    var body = "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n" + contentJsonString + "\r\n--" + boundary + "--";
    var url = DRIVE_UPLOAD + "/files?uploadType=multipart";
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "multipart/related; boundary=" + boundary,
      },
      body: body,
    })
      .then(function (res) {
        if (res.status === 401) {
          clearDriveAuth();
          setSyncError("Підключення втрачено. Увійдіть знову.");
          updateSyncUI();
          throw new Error("Unauthorized");
        }
        return res.json();
      })
      .then(function (file) {
        return file.id || null;
      });
  }

  function driveDownloadSchedule(fileId) {
    var token = getGoogleToken();
    if (!token || !fileId) return Promise.resolve(null);
    var url = DRIVE_API + "/files/" + fileId + "?alt=media";
    return fetch(url, { headers: driveAuthHeader() })
      .then(function (res) {
        if (res.status === 401) {
          clearDriveAuth();
          setSyncError("Підключення втрачено. Увійдіть знову.");
          updateSyncUI();
          throw new Error("Unauthorized");
        }
        return res.text();
      });
  }

  function driveUpdateSchedule(fileId, contentJsonString) {
    var token = getGoogleToken();
    if (!token || !fileId) return Promise.resolve();
    var url = DRIVE_UPLOAD + "/files/" + fileId + "?uploadType=media";
    return fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: contentJsonString,
    })
      .then(function (res) {
        if (res.status === 401) {
          clearDriveAuth();
          setSyncError("Підключення втрачено. Увійдіть знову.");
          updateSyncUI();
          throw new Error("Unauthorized");
        }
      });
  }

  function driveEnsureFileAndLoad() {
    var token = getGoogleToken();
    if (!token) return Promise.resolve();
    setSyncStatus("Завантаження з Drive…");
    driveFindScheduleFile()
      .then(function (file) {
        if (file && file.id) {
          setDriveFileId(file.id);
          return driveDownloadSchedule(file.id);
        }
        return driveCreateScheduleFile(JSON.stringify(getSchedule(), null, 2)).then(function (newId) {
          if (newId) {
            setDriveFileId(newId);
            setSyncStatus("Файл створено. Розклад синхронізується з Drive.");
          }
          return null;
        });
      })
      .then(function (content) {
        if (content) {
          try {
            var parsed = JSON.parse(content);
            var valid = validateSchedule(parsed);
            if (valid) {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
              setSyncStatus("Синхронізовано з Drive.");
              return valid;
            }
          } catch (_) {}
          setSyncStatus("Підключено. Розклад синхронізується з Drive.");
        }
        return null;
      })
      .then(function () {
        updateSyncUI();
        if (typeof loadLessons === "function") loadLessons();
      })
      .catch(function (e) {
        if (e.message !== "Unauthorized") {
          setSyncError("Помилка Drive: " + (e.message || "невідома"));
        }
        setSyncStatus("", true);
        updateSyncUI();
      });
  }

  var driveSaveTimer = null;

  function scheduleDriveSave(data) {
    if (!isGoogleConnected()) return;
    if (driveSaveTimer) clearTimeout(driveSaveTimer);
    driveSaveTimer = setTimeout(function () {
      driveSaveTimer = null;
      var fileId = getDriveFileId();
      if (!fileId) {
        driveEnsureFileAndLoad();
        return;
      }
      var content = JSON.stringify(data, null, 2);
      driveUpdateSchedule(fileId, content).then(function () {
        setSyncStatus("Збережено в Drive.");
      }).catch(function () {});
    }, DRIVE_DEBOUNCE_MS);
  }

  var saveDebounceTimer = null;

  function debouncedSave(data) {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(function () {
      saveSchedule(data);
      if (isGoogleConnected()) scheduleDriveSave(data);
      saveDebounceTimer = null;
    }, DEBOUNCE_MS);
  }

  function updateSyncUI() {
    var connected = isGoogleConnected();
    var signInBtn = document.getElementById("googleSignInBtn");
    var signOutBtn = document.getElementById("googleSignOutBtn");
    if (signInBtn) signInBtn.style.display = connected ? "none" : "inline-block";
    if (signOutBtn) signOutBtn.style.display = connected ? "inline-block" : "none";
    if (connected) {
      if (!document.getElementById("syncStatus").textContent) setSyncStatus("Підключено. Розклад синхронізується з Drive.");
    }
  }

  var $ = function (id) { return document.getElementById(id); };
  var daySelect = $("daySelect");
  var lessonsArea = $("lessonsArea");
  var emptyState = $("emptyState");
  var noResultsState = $("noResultsState");
  var lessonFilter = $("lessonFilter");
  var importFile = $("importFile");

  function getFilterText() {
    return (lessonFilter && lessonFilter.value) ? lessonFilter.value.trim().toLowerCase() : "";
  }

  var emptyStateText = $("emptyStateText");
  var EMPTY_NO_DAY = "Обери день тижня і натисни «Додати урок», щоб почати.";
  var EMPTY_NO_LESSONS = "У цьому дні немає уроків. Натисни «Додати урок», щоб додати перший!";

  function showEmptyState(show, noResults, hasDaySelected) {
    if (emptyState) {
      emptyState.hidden = !show || noResults;
      if (emptyStateText) emptyStateText.textContent = hasDaySelected ? EMPTY_NO_LESSONS : EMPTY_NO_DAY;
    }
    if (noResultsState) noResultsState.hidden = !noResults;
  }

  function buildLessonBlock(day, index, lesson) {
    var article = document.createElement("article");
    article.className = "lesson-block";
    article.dataset.day = day;
    article.dataset.index = String(index);
    article.draggable = true;
    if (lesson.color) article.style.setProperty("--lesson-color", lesson.color);

    var heading = document.createElement("h3");
    heading.textContent = "Урок " + (index + 1);
    article.appendChild(heading);

    var actions = document.createElement("div");
    actions.className = "lesson-actions";

    var btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn-delete";
    btnDelete.setAttribute("aria-label", "Видалити урок");
    btnDelete.textContent = "❌";
    actions.appendChild(btnDelete);

    var btnUp = document.createElement("button");
    btnUp.type = "button";
    btnUp.className = "btn-move";
    btnUp.setAttribute("aria-label", "Перемістити урок вгору");
    btnUp.textContent = "⬆";
    actions.appendChild(btnUp);

    var btnDown = document.createElement("button");
    btnDown.type = "button";
    btnDown.className = "btn-move";
    btnDown.setAttribute("aria-label", "Перемістити урок вниз");
    btnDown.textContent = "⬇";
    actions.appendChild(btnDown);

    article.appendChild(actions);

    var fieldName = document.createElement("div");
    fieldName.className = "lesson-field";
    var labelName = document.createElement("label");
    labelName.setAttribute("for", "lesson-name-" + day + "-" + index);
    labelName.textContent = "📘 Назва:";
    fieldName.appendChild(labelName);
    var inputName = document.createElement("input");
    inputName.id = "lesson-name-" + day + "-" + index;
    inputName.type = "text";
    inputName.placeholder = "Назва уроку...";
    inputName.value = lesson.name;
    fieldName.appendChild(inputName);
    article.appendChild(fieldName);

    var fieldLink = document.createElement("div");
    fieldLink.className = "lesson-field";
    var labelLink = document.createElement("label");
    labelLink.setAttribute("for", "lesson-link-" + day + "-" + index);
    labelLink.textContent = "🔗 Посилання:";
    fieldLink.appendChild(labelLink);
    var inputLink = document.createElement("input");
    inputLink.id = "lesson-link-" + day + "-" + index;
    inputLink.type = "url";
    inputLink.placeholder = "https://... Zoom або Meet";
    inputLink.value = lesson.link;
    fieldLink.appendChild(inputLink);
    article.appendChild(fieldLink);

    var timeRow = document.createElement("div");
    timeRow.className = "lesson-time-row";
    var fieldStart = document.createElement("div");
    fieldStart.className = "lesson-field";
    var labelStart = document.createElement("label");
    labelStart.setAttribute("for", "lesson-start-" + day + "-" + index);
    labelStart.textContent = "Початок:";
    fieldStart.appendChild(labelStart);
    var inputStart = document.createElement("input");
    inputStart.id = "lesson-start-" + day + "-" + index;
    inputStart.type = "time";
    inputStart.value = lesson.startTime || "";
    fieldStart.appendChild(inputStart);
    timeRow.appendChild(fieldStart);
    var fieldEnd = document.createElement("div");
    fieldEnd.className = "lesson-field";
    var labelEnd = document.createElement("label");
    labelEnd.setAttribute("for", "lesson-end-" + day + "-" + index);
    labelEnd.textContent = "Кінець:";
    fieldEnd.appendChild(labelEnd);
    var inputEnd = document.createElement("input");
    inputEnd.id = "lesson-end-" + day + "-" + index;
    inputEnd.type = "time";
    inputEnd.value = lesson.endTime || "";
    fieldEnd.appendChild(inputEnd);
    timeRow.appendChild(fieldEnd);
    article.appendChild(timeRow);

    var colorWrap = document.createElement("div");
    colorWrap.className = "lesson-color-wrap";
    var labelColor = document.createElement("label");
    labelColor.textContent = "Колір:";
    colorWrap.appendChild(labelColor);
    var inputColor = document.createElement("input");
    inputColor.type = "color";
    inputColor.value = lesson.color || "#2563eb";
    inputColor.setAttribute("aria-label", "Колір позначки уроку");
    colorWrap.appendChild(inputColor);
    article.appendChild(colorWrap);

    var linkWrap = document.createElement("p");
    linkWrap.className = "lesson-link-wrap";
    if (isAllowedUrl(lesson.link)) {
      var a = document.createElement("a");
      a.href = safeHref(lesson.link);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "🎥 Перейти на урок";
      linkWrap.appendChild(a);
    } else {
      var span = document.createElement("span");
      span.className = "no-link";
      span.textContent = "Посилання ще не додано";
      linkWrap.appendChild(span);
    }
    article.appendChild(linkWrap);

    function updateLinkDisplay() {
      linkWrap.textContent = "";
      var link = inputLink.value.trim();
      if (isAllowedUrl(link)) {
        var a2 = document.createElement("a");
        a2.href = safeHref(link);
        a2.target = "_blank";
        a2.rel = "noopener noreferrer";
        a2.textContent = "🎥 Перейти на урок";
        linkWrap.appendChild(a2);
      } else {
        var span2 = document.createElement("span");
        span2.className = "no-link";
        span2.textContent = "Посилання ще не додано";
        linkWrap.appendChild(span2);
      }
    }

    function persist() {
      var schedule = getSchedule();
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
      var schedule = getSchedule();
      if (schedule[day]) schedule[day].splice(index, 1);
      saveSchedule(schedule);
      if (isGoogleConnected()) scheduleDriveSave(schedule);
      renderLessons();
    });

    btnUp.addEventListener("click", function () {
      if (index <= 0) return;
      var schedule = getSchedule();
      var arr = schedule[day];
      var tmp = arr[index - 1];
      arr[index - 1] = arr[index];
      arr[index] = tmp;
      saveSchedule(schedule);
      if (isGoogleConnected()) scheduleDriveSave(schedule);
      renderLessons();
    });

    btnDown.addEventListener("click", function () {
      var schedule = getSchedule();
      var arr = schedule[day];
      if (index >= arr.length - 1) return;
      var tmp = arr[index];
      arr[index] = arr[index + 1];
      arr[index + 1] = tmp;
      saveSchedule(schedule);
      if (isGoogleConnected()) scheduleDriveSave(schedule);
      renderLessons();
    });

    article.addEventListener("dragstart", onDragStart);
    article.addEventListener("dragend", onDragEnd);
    article.addEventListener("dragover", onDragOver);
    article.addEventListener("drop", onDrop);
    article.addEventListener("dragleave", onDragLeave);

    return article;
  }

  var draggedEl = null;

  function onDragStart(e) {
    draggedEl = e.target;
    e.target.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }

  function onDragEnd(e) {
    e.target.classList.remove("dragging");
    var blocks = document.querySelectorAll(".lesson-block");
    for (var i = 0; i < blocks.length; i++) blocks[i].classList.remove("drag-over");
    draggedEl = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    var t = e.target.closest(".lesson-block");
    if (t && t !== draggedEl) t.classList.add("drag-over");
  }

  function onDragLeave(e) {
    var t = e.target.closest(".lesson-block");
    if (t) t.classList.remove("drag-over");
  }

  function onDrop(e) {
    e.preventDefault();
    var target = e.target.closest(".lesson-block");
    if (!target || !draggedEl || target === draggedEl) return;
    target.classList.remove("drag-over");
    var day = daySelect.value;
    if (!day) return;
    var fromIdx = parseInt(draggedEl.dataset.index, 10);
    var toIdx = parseInt(target.dataset.index, 10);
    if (fromIdx === toIdx) return;
    var schedule = getSchedule();
    var arr = schedule[day];
    var item = arr[fromIdx];
    arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    saveSchedule(schedule);
    if (isGoogleConnected()) scheduleDriveSave(schedule);
    renderLessons();
  }

  function renderLessons() {
    if (!lessonsArea) return;
    lessonsArea.innerHTML = "";
    var day = daySelect ? daySelect.value : "";
    var filter = getFilterText();

    if (!day) {
      showEmptyState(true, false, false);
      return;
    }

    var schedule = getSchedule();
    var lessons = schedule[day] || [];
    if (filter) {
      lessons = lessons.filter(function (l) {
        return (l.name || "").toLowerCase().indexOf(filter) !== -1;
      });
    }

    if (lessons.length === 0) {
      showEmptyState(!filter, !!filter, true);
      return;
    }

    showEmptyState(false, false, true);
    for (var i = 0; i < lessons.length; i++) {
      var lesson = lessons[i];
      var originalIndex = schedule[day].indexOf(lesson);
      var block = buildLessonBlock(day, originalIndex, lesson);
      lessonsArea.appendChild(block);
    }
  }

  function loadLessons() {
    renderLessons();
  }

  function addLesson() {
    var day = daySelect ? daySelect.value : "";
    if (!day) {
      alert("Спочатку вибери день!");
      return;
    }
    var schedule = getSchedule();
    schedule[day].push({
      name: "",
      link: "",
      startTime: "",
      endTime: "",
      color: "",
    });
    saveSchedule(schedule);
    if (isGoogleConnected()) scheduleDriveSave(schedule);
    renderLessons();
  }

  function resetSchedule() {
    if (!confirm("Ти точно хочеш видалити весь розклад?")) return;
    var empty = JSON.parse(JSON.stringify(defaultSchedule));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    if (daySelect) daySelect.value = "";
    if (lessonsArea) lessonsArea.innerHTML = "";
    showEmptyState(true, false, false);
    if (lessonFilter) lessonFilter.value = "";
    if (isGoogleConnected()) scheduleDriveSave(empty);
  }

  function exportSchedule() {
    var schedule = getSchedule();
    var blob = new Blob([JSON.stringify(schedule, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "schedule-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importSchedule(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var valid = validateSchedule(data);
        if (!valid) {
          alert("Невірний формат файлу.");
          return;
        }
        saveSchedule(valid);
        if (isGoogleConnected()) scheduleDriveSave(valid);
        loadLessons();
        alert("Розклад успішно імпортовано.");
      } catch (_) {
        alert("Не вдалося прочитати файл. Перевір формат JSON.");
      }
    };
    reader.readAsText(file);
  }

  function initTheme() {
    var theme = localStorage.getItem("scheduleTheme") || "light";
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    var btn = $("themeToggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌓";
      btn.setAttribute("aria-label", theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme");
    var next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("scheduleTheme", next);
    var btn = $("themeToggle");
    if (btn) {
      btn.textContent = next === "dark" ? "☀️" : "🌓";
      btn.setAttribute("aria-label", next === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему");
    }
  }

  function markCurrentDay() {
    if (!daySelect) return;
    var idx = getCurrentDayIndex();
    var currentDayName = DAYS[idx];
    var opts = daySelect.options;
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle("current-day", opts[i].value === currentDayName);
    }
  }

  function init() {
    initTheme();
    markCurrentDay();

    if (daySelect) daySelect.addEventListener("change", loadLessons);

    var addBtn = $("addLessonBtn");
    if (addBtn) addBtn.addEventListener("click", addLesson);

    var resetBtn = $("resetBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetSchedule);

    var exportBtn = $("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportSchedule);

    var importBtn = $("importBtn");
    if (importBtn) importBtn.addEventListener("click", function () {
      if (importFile) importFile.click();
    });
    if (importFile) importFile.addEventListener("change", function () {
      var file = importFile.files[0];
      importSchedule(file);
      importFile.value = "";
    });

    var themeBtn = $("themeToggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

    if (lessonFilter) lessonFilter.addEventListener("input", renderLessons);

    var syncToggle = $("syncToggle");
    var syncPanel = $("syncPanel");
    if (syncToggle && syncPanel) {
      syncToggle.addEventListener("click", function () {
        var open = !syncPanel.hidden;
        syncPanel.hidden = open;
        syncToggle.setAttribute("aria-expanded", open ? "false" : "true");
      });
    }

    var googleSignInBtn = $("googleSignInBtn");
    if (googleSignInBtn) googleSignInBtn.addEventListener("click", googleConnect);

    var googleSignOutBtn = $("googleSignOutBtn");
    if (googleSignOutBtn) googleSignOutBtn.addEventListener("click", googleDisconnect);

    updateSyncUI();
    loadLessons();

    if (typeof window.google !== "undefined" && window.google.accounts && window.google.accounts.oauth2) {
      initGoogleAuth();
    } else {
      window.addEventListener("load", function () {
        setTimeout(initGoogleAuth, 100);
      });
    }

    if (isGoogleConnected() && getDriveFileId()) {
      driveEnsureFileAndLoad();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
