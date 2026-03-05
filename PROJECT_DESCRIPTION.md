# Project Description: Мій розклад уроків (My Lesson Schedule)

**Document purpose:** Full technical and product description for handover to other specialists (developers, designers, QA, DevOps). Copy and share as needed.

---

## 1. Product overview

| Item | Description |
|------|-------------|
| **Name** | Мій розклад уроків (My Lesson Schedule) |
| **Type** | Static single-page web app (SPA): HTML + CSS + JavaScript. No build step, no backend. |
| **Language** | Ukrainian (UI and content). Code comments may be Ukrainian or English. |
| **Purpose** | Personal lesson schedule: manage lessons by weekday, store links (Zoom, Meet, etc.), start/end times, and optional color labels. Data can be kept only in the browser or synced across devices via GitHub Gist. |

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| **Markup** | HTML5, semantic tags (`<header>`, `<main>`, `<section>`, `<article>`), `lang="uk"` |
| **Styles** | Plain CSS, no preprocessors. CSS custom properties for light/dark theme. |
| **Script** | Vanilla JavaScript (ES5-style in an IIFE), no frameworks. Strict mode. |
| **Data (local)** | `localStorage`: keys `scheduleData`, `scheduleGistToken`, `scheduleGistId`, `scheduleTheme` |
| **Data (sync)** | GitHub Gist API (REST). One private Gist per user, one file: `schedule.json`. |
| **External libs (CDN)** | QRCode.js (qrcodejs) for generating QR; jsQR for decoding QR from camera/image. |

**No:** Node/npm build, package manager, TypeScript, React/Vue, or server-side code.

---

## 3. Repository / file structure

```
schedule-1/          (or schedule-app/ in docs)
├── index.html       # Single HTML entry; links to CSS and scripts
├── styles.css       # All styles (layout, theme, responsive, components)
├── script.js        # All app logic (schedule, sync, QR, export/import)
├── README.md        # User-facing readme (run, deploy, sync, export)
├── PROJECT_DESCRIPTION.md   # This file — for specialists
└── (optional) РЕКОМЕНДАЦІЇ.md  # Recommendations / notes in Ukrainian
```

Deployment uses these files as-is (e.g. root or a subfolder like `docs/`). No separate “app” subfolder required if files live in repo root.

---

## 4. Features (functional)

- **Days:** 7 weekdays (Понеділок … Неділя). User picks a day, then sees that day’s lessons.
- **Lessons per day:** List of lesson cards. Each lesson has:
  - Name (text)
  - Link (URL; only `http://` and `https://` accepted; opens in new tab with `rel="noopener noreferrer"`)
  - Start time / end time (HTML5 `type="time"`)
  - Optional color (color picker; left border on card)
- **CRUD:** Add lesson, delete lesson (with confirmation), reorder via buttons (up/down) or drag-and-drop.
- **Search/filter:** Text filter by lesson name (client-side, case-insensitive).
- **Current day:** The option for the current weekday is visually highlighted (e.g. `.current-day`).
- **Export:** Download current schedule as JSON file (e.g. `schedule-backup-YYYY-MM-DD.json`).
- **Import:** Choose a JSON file; validated and then replaces current schedule (and syncs to Gist if connected).
- **Reset:** “Скинути все” clears all schedule data (with confirmation); if Gist is connected, empty schedule is pushed to Gist.
- **Sync (GitHub Gist):**
  - User pastes a GitHub Personal Access Token (scope: gist) and clicks “Підключити за токеном”.
  - Schedule is stored in a single private Gist (one file: `schedule.json`). On load, if token exists, app fetches from Gist and overwrites local data.
  - On every change, local data is saved and, after debounce, pushed to Gist (PATCH). Gist ID is cached in `scheduleGistId`.
- **QR for sync:**
  - On a device that is already connected (has token), the app shows a QR code encoding that token.
  - On another device, user can “Сканувати QR з іншого пристрою”: open camera or upload image, decode with jsQR, and if the result looks like a GitHub token (`ghp_`, `gho_`, `github_pat_`), save it and load from Gist.
- **Theme:** Light/dark toggle (CSS variables, `data-theme` on `<html>`). Preference in `scheduleTheme` in localStorage.
- **Empty states:** Messages when no day selected, no lessons for the day, or no search results.

---

## 5. Data model

- **Schedule (in memory / localStorage / Gist):** One object. Keys = day names (Ukrainian). Values = arrays of lesson objects.

```json
{
  "Понеділок": [],
  "Вівторок": [
    {
      "name": "Математика",
      "link": "https://zoom.us/j/...",
      "startTime": "09:00",
      "endTime": "09:45",
      "color": "#2563eb"
    }
  ],
  "Середа": [],
  "Четвер": [],
  "П'ятниця": [],
  "Субота": [],
  "Неділя": []
}
```

- **Lesson object:** `name`, `link`, `startTime`, `endTime`, `color`. All strings. `color` must be `#rrggbb` or empty; otherwise normalized to empty.
- **Validation:** On load (localStorage or Gist), `validateSchedule()` ensures correct days and `normalizeLesson()` for each entry. Corrupted data falls back to default empty schedule and is re-saved.

---

## 6. Security

- **XSS:** No user-controlled data is written with `innerHTML`. Lesson blocks are built with `createElement` and `textContent`. `escapeHtml()` exists for any future need.
- **Links:** Only `http://` and `https://` allowed (`isAllowedUrl()`). External links use `target="_blank"` and `rel="noopener noreferrer"`.
- **Token:** Stored in localStorage; used only in fetch requests to GitHub Gist API. Not sent to any other server. User is responsible for token scope (gist only recommended).
- **CORS:** All network requests are to `https://api.github.com/gists` (and Gist file content); no custom backend.

---

## 7. Accessibility (a11y)

- Labels: `<label for="...">` for day select, filter, and each lesson field.
- Buttons: Icon buttons have `aria-label` (e.g. delete, move up/down, theme toggle).
- Sections: `aria-labelledby` / `aria-label` where useful. Headings for screen readers can be `.visually-hidden` if needed.
- Modal: Scan QR dialog has `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Close via button, backdrop click, or Escape.
- Focus: Modal is focusable (`tabindex="-1"`) and receives focus when opened for Escape handling.

---

## 8. Responsive design

- Layout: Centered content, `max-width: 480px` for main column; lesson cards `max-width: 420px`, width 100%.
- Breakpoint: `@media (max-width: 480px)` for smaller padding, font sizes, and controls.
- Touch: Buttons and inputs sized for touch. No hover-only critical actions.

---

## 9. Performance and code quality

- **Debounce:** Local saves (and Gist push) debounced (e.g. 400 ms local, 2000 ms Gist) to avoid excessive writes on fast typing.
- **No global pollution:** App logic runs inside an IIFE; no globals except what the QR/jsQR CDN scripts expose.
- **Separation:** Data (get/save/validate), DOM (build lesson block), and UI (render, init) are clearly separated. Key logic commented.

---

## 10. Dependencies (CDN)

Loaded in `index.html` before `script.js`:

- **QRCode (generate):**  
  `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js`  
  Usage: `new QRCode(containerElement, { text: string, width?, height? })` or `new QRCode(containerElement, text)`.
- **jsQR (decode):**  
  `https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js`  
  Usage: `jsQR(imageData.data, width, height)` returns `{ data: string }` or null.

If these fail to load, QR generation or scan will not work; rest of app still works (token paste, export/import, local schedule).

---

## 11. Browser / environment requirements

- Modern browser with ES5+ (e.g. Chrome, Firefox, Safari, Edge).
- **localStorage** and **fetch** required.
- **Camera (optional):** `navigator.mediaDevices.getUserMedia` for live QR scan; HTTPS required (e.g. GitHub Pages). If unavailable, “Завантажити фото QR” still works.
- **GitHub:** User needs a GitHub account and a Personal Access Token with `gist` scope for sync.

---

## 12. How to run locally

1. Clone or download the repo.
2. Open `index.html` in a browser (double-click), or serve the folder:
   - `python -m http.server 8000` then open `http://localhost:8000`
   - or `npx serve .`
3. No install or build step.

---

## 13. How to deploy

Static hosting only. Point the server at the folder containing `index.html`, `styles.css`, `script.js`.

- **GitHub Pages:** Repo → Settings → Pages → source = branch (e.g. main), folder = root or `docs` → save. Site at `https://<username>.github.io/<repo>/`.
- **Netlify / Cloudflare Pages:** Connect repo or upload folder; no build command; output directory = project root.

---

## 14. LocalStorage keys (reference)

| Key | Content |
|-----|---------|
| `scheduleData` | JSON string of full schedule (all days, all lessons). |
| `scheduleGistToken` | GitHub PAT for Gist (optional). |
| `scheduleGistId` | Cached Gist ID after first create/fetch (optional). |
| `scheduleTheme` | `"light"` or `"dark"` (optional). |

---

## 15. Contact / handover

- Product name: **Мій розклад уроків**
- Repo (example): `metra5360.github.io/schedule/` or same project in a `schedule` / `schedule-1` repo.
- This document: **PROJECT_DESCRIPTION.md** — give to developers, designers, QA, or DevOps for full context. README.md remains user-oriented (run, sync, export, deploy).
