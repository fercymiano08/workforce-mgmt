# WorkForce Pro — Frontend

React 19 + Vite + Tailwind CSS single-page app for the three user roles:

- **HR / Administrator** (`src/pages/HR_Manager`): dashboard, employees, shifts, attendance, leave, timesheets, analytics, reports, AI decision support, audit logs, settings
- **Employee** (`src/pages/Employee`): own dashboard, schedule, attendance, timesheet, leave, profile
- **Kiosk** (`src/pages/KIOSK`): the entrance attendance terminal with face verification (models in `public/models`) and PIN fallback

API calls go through `src/services/`. In development, Vite proxies `/api` to the backend on `http://127.0.0.1:8000`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 (the backend must be running) |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | ESLint |
| `npm run smoke:setup` | Once per machine: downloads a headless Chrome into `.smoke-browser/` for the smoke test (git-ignored) |
| `npm run smoke` | Opens the running system in a real browser, visits every page for a role (and opens windows such as + Automated Shift), and reports crashes, console errors and failed API calls (screenshots go to `scripts/smoke-output/`). Run it after every larger change. |

Every production build carries a version stamp (`dist/version.json`). A tab that was open during an update shows
"WorkForce Pro was updated — Reload", and if it crashes on the old code it reloads into the new version by itself.
