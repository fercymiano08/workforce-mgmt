# How To Activate and Deactivate The System

> Workforce Management System — for VS Code terminal
> Current architecture: **1 Laravel backend** + **1 React frontend** + **1 database**.
>
> **Who this is for:** the person who has to turn the whole system on and off (before a demo, at the start of a coding day). No programming needed — it's two copy-paste commands.

---

## Two Ways To Run The System (pick ONE — never both at once)

| | **Way 1: PowerShell scripts** (`start-all.ps1`) | **Way 2: Docker** (`docker compose`) |
|---|---|---|
| What it does | Starts PHP + the Vite dev server directly on your laptop | Starts the backend, its scheduler and the frontend each inside its own container |
| Needs | PHP, Composer, Node, local PostgreSQL | **Docker Desktop open** (whale icon in the tray) |
| Database it uses | Your local PostgreSQL (port 5432) | A separate PostgreSQL **inside Docker** (host port 5433) |
| Start / stop | `.\start-all.ps1` / `.\stop-all.ps1` | `docker compose up -d` / `docker compose down` |
| Address | http://localhost:5173 | http://localhost:5173 (same) |

**The two ways use the same ports (8000 and 5173), so run only ONE at a time.** If one is running, stop it first
(`.\stop-all.ps1` for Way 1, `docker compose down` for Way 2). Their databases are **separate**: an employee added in one
will not appear in the other.

### Way 2 in detail — Docker

Run these from the `Workforce MGNT` folder in the VS Code terminal (Docker Desktop must be running):

```
docker compose up -d --build    # FIRST time only: builds everything
docker compose up -d            # every other time: starts in under a minute
docker compose ps               # every line should say "healthy" or "Up"
docker compose down             # stop everything (your database data is KEPT)
docker compose down -v          # stop AND ERASE the Docker database (fresh empty system)
```

- Open **http://localhost:5173** and log in as the Workforce Admin (John Delgado). A brand-new Docker database contains
  **only** the admin, the 8 departments and the 33 job positions; add employees yourself.
- Secrets live in a file called `.env` in the project folder (git-ignored). If it is missing, copy `.env.docker.example`
  to `.env` and fill it in.
- **Something wrong?** `docker compose ps` shows which container is not healthy; `docker compose logs -f app`
  shows the backend's live log (`docker compose logs -f scheduler` for the background jobs, `docker compose logs -f frontend` for the frontend). In Docker Desktop: **Containers → workforce → click a container → Logs**.
- **⚠ Docker keeps a COPY of the code.** If you change code (or pull new commits), run `docker compose up -d --build` again — a plain `up -d` keeps running the old copy. Way 1 (the scripts) has no such rule.

**Which way should I use?**

| Situation | Use |
|-----------|-----|
| Coding, fixing bugs, checking a change quickly | **Way 1** (scripts) — your edits show up immediately |
| Demoing on another computer, or wanting a clean start | **Way 2** (Docker) — nothing to install but Docker Desktop |

Never both at once (same ports), and remember their databases are separate.

---

## Way 1 — The PowerShell Scripts

## Before Anything Else: Don't Double-Click The `.ps1` Files

`start-all.ps1` and `stop-all.ps1` are **scripts**, not programs you open — double-clicking them just opens the text inside in Notepad (that's Windows's default, safe behavior for script files, not a mistake on your part). You have to run them **from inside a terminal**. Two ways to get one open:

**Option A — From File Explorer (no VS Code needed):**
1. Open File Explorer, navigate into the `Workforce MGNT` folder (so you can see `start-all.ps1` in the file list).
2. Right-click on **empty white space** inside the folder (not on any file) → click **"Open in Terminal"**.
3. A terminal opens already pointed at the right folder. Continue to the sections below.

**Option B — From VS Code:**
1. With the project folder open in VS Code, go to the **Terminal** menu (top bar) → **New Terminal**.
2. Continue to the sections below.

**If you ever see a red error mentioning "execution policy" or "scripts is disabled on this system"** the first time you try to run one of these, paste this once and press `Y` if asked:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
This is a one-time fix per computer, not something you'll need to repeat.

---

## Activating The System (1 Step, Recommended)

Open a terminal in VS Code at the project root and run:

```powershell
.\start-all.ps1
```

This single script:

1. Starts the backend on port `8000` (`php artisan serve`).
2. Starts the background scheduler (`php artisan schedule:work`) — the jobs that expire early-leave certificates, mark absent days, run automatic scheduling and drive the timesheet workflow.
3. Starts the React frontend (`npm run dev`, Vite — usually `5173`, or `5174` if `5173` is busy).
4. Waits until the backend is actually listening on its port, then hits `/up` **with retries** (so a backend still warming up on its first request is never reported `DOWN`), and prints `UP` / `DOWN` so you know immediately if it didn't boot.
5. If the port is already occupied (e.g. you never stopped a previous run), it skips starting it again instead of erroring — the health check at the end still tells you the true state.

Logs land in `.\logs\backend.out.log` / `.err.log`, `.\logs\scheduler.out.log` / `.err.log`, and the frontend's in `.\logs\frontend.out.log` / `.err.log` — check these first if something shows `DOWN`.

Then open your browser to **http://localhost:5173** (or `5174`).

Demo login: `admin@workforcepro.com` / `Admin@123`

---

## Deactivating The System (1 Step, Recommended)

```powershell
.\stop-all.ps1
```

This finds whatever process is listening on port 8000 (and the frontend's 5173/5174) and stops it, plus the background scheduler — you don't need to hunt down terminal tabs by hand.

---

## Manual Mode (If You Need To Run A Piece By Itself)

Useful for debugging without restarting everything:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\backend\app"
php artisan serve --port=8000
```

For the background jobs, in a second terminal:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\backend\app"
php artisan schedule:work
```

Frontend, in a third terminal:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\frontend"
npm run dev
```

**LEAVE EACH TERMINAL OPEN** while its process is running. To stop a manually-started one, `Ctrl + C` in its terminal (or just run `stop-all.ps1`, which stops anything on those ports regardless of how it was started).

---

## Why One Backend Instead Of Several

The Workforce Management System is one subsystem of a larger E-Commerce Enterprise platform — it is itself just one microservice within that bigger system. Internally, it doesn't need to be split any further: one Laravel application, organized into clear domains (identity, attendance, scheduling, time-off, payroll, communications, configuration, intelligence), backed by one database. That gives the same clear boundaries between areas of the code without the operational cost of running and keeping in sync 8 separate processes and databases for a single subsystem.

If the backend is down, the login page and every screen will show connection errors — there's only the one process to check now, not eight.

---

## If The System Feels Slow (Way 1 Only)

1. **Restart everything once**: `.\stop-all.ps1` then `.\start-all.ps1`. Wait until the port shows `UP` before opening the browser.
2. **Turn debug mode off** in `backend\app\.env`: `APP_DEBUG=false` and `LOG_LEVEL=warning`. Debug mode writes a lot to the log on every request.
3. **Plug in the charger and close heavy apps** (browser tabs, games). On a low-power laptop, running on battery (especially below ~20%, when Windows' battery saver slows the CPU) and low free RAM are the biggest things you control.
4. **Or just use Docker (Way 2)** — it runs the backend with several workers.

**A page that spins forever** now ends with an error message after 45 seconds instead of hanging — that means the backend is stuck or down. Run `.\start-all.ps1` and read whether the port shows `DOWN`.

**Before a demo:** the kiosk clock-in only works for an employee who has a **shift scheduled today** (see `System Workflow Guide.md`). Check the Shifts page first, or the kiosk will correctly say "No Shift Scheduled Today".

---

## Quick Check

| Symptom | Meaning |
|---------|---------|
| `start-all.ps1` prints `DOWN` for port 8000 | Check `logs\backend.err.log` — usually a DB connection issue or the port already used by something else |
| "can't be reached" in the browser | The frontend isn't running, or the backend is `DOWN` |
| Page loads but a section errors | The backend is up but something in that domain failed — check `logs\backend.err.log` |
| Red error text in a terminal (manual mode) | Copy it and send it to the team |
