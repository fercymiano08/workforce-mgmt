# How To Activate and Deactivate The System

> Workforce Management System — for VS Code terminal
> Current architecture: **8 independent Laravel microservices** + **1 React frontend**.
>
> **Who this is for:** the person who has to turn the whole system on and off (before a demo, at the start of a coding day). No programming needed — it's two copy-paste commands.

---

## Two Ways To Run The System (pick ONE — never both at once)

| | **Way 1: PowerShell scripts** (`start-all.ps1`) | **Way 2: Docker** (`docker compose`) |
|---|---|---|
| What it does | Starts PHP + the Vite dev server directly on your laptop | Starts every part inside its own container |
| Needs | PHP, Composer, Node, local PostgreSQL | **Docker Desktop open** (whale icon in the tray) |
| Database it uses | Your local PostgreSQL (port 5432) | A separate PostgreSQL **inside Docker** (host port 5433) |
| Start / stop | `.\start-all.ps1` / `.\stop-all.ps1` | `docker compose up -d` / `docker compose down` |
| Address | http://localhost:5173 | http://localhost:5173 (same) |

**The two ways use the same ports (8000–8008 and 5173), so run only ONE at a time.** If one is running, stop it first
(`.\stop-all.ps1` for Way 1, `docker compose down` for Way 2). Their databases are **separate**: an employee added in one
will not appear in the other.

### Way 2 in detail — Docker

Run these from the `Workforce MGNT` folder in the VS Code terminal (Docker Desktop must be running):

```
docker compose up -d --build    # FIRST time only: builds everything (more than 10 minutes on this laptop)
docker compose up -d            # every other time: starts in 1–2 minutes
docker compose ps               # every line should say "healthy" or "Up"
docker compose down             # stop everything (your database data is KEPT)
docker compose down -v          # stop AND ERASE the Docker database (fresh empty system)
```

- Open **http://localhost:5173** and log in as the Workforce Admin (John Delgado). A brand-new Docker database contains
  **only** the admin, the 8 departments and the 33 job positions; add employees yourself.
- Secrets live in a file called `.env` in the project folder (git-ignored). If it is missing, copy `.env.docker.example`
  to `.env` and fill it in.
- **Something wrong?** `docker compose ps` shows which container is not healthy; `docker compose logs -f core`
  (replace `core` with the service name) shows its live log. In Docker Desktop: **Containers → workforce → click a container → Logs**.
- Docker uses about **500 MB** of memory in total once running.

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

1. Starts all 8 microservices, each on its own port (`core` 8000, `intelligence` 8001, `attendance` 8003, `scheduling` 8004, `timeoff` 8005, `payroll` 8006, `communications` 8007, `configuration` 8008).
2. Starts the React frontend (`npm run dev`, Vite — usually `5173`, or `5174` if `5173` is busy).
3. Waits until every service is actually listening on its port, then hits `/up` on each one **with retries** (so a service that's still warming up on its first request is never reported `DOWN`), and prints `UP` / `DOWN` per port so you know immediately if something didn't boot.
4. If a port is already occupied (e.g. you never stopped a previous run), it skips that service instead of erroring — the health check at the end still tells you the true state.

Logs for each service land in `.\logs\svc-<name>.out.log` / `.err.log`, and the frontend's in `.\logs\frontend.out.log` / `.err.log` — check these first if a service shows `DOWN`.

Then open your browser to **http://localhost:5173** (or `5174`).

Demo login: `admin@workforcepro.com` / `Admin@123`

---

## Deactivating The System (1 Step, Recommended)

```powershell
.\stop-all.ps1
```

This finds whatever process is listening on each of the 8 service ports (and the frontend's 5173/5174) and stops it — you don't need to hunt down 9 terminal tabs by hand.

---

## Manual Mode (If You Need One Service At A Time)

Useful for debugging a single service without restarting everything. Each service is a fully independent Laravel app under `backend/<name>/`:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\backend\core"
php -d max_execution_time=0 artisan serve --port=8000
```

Swap `core`/`8000` for any of: `intelligence`/`8001`, `attendance`/`8003`, `scheduling`/`8004`, `timeoff`/`8005`, `payroll`/`8006`, `communications`/`8007`, `configuration`/`8008`.

Frontend, same as before:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\frontend"
npm run dev
```

**LEAVE EACH TERMINAL OPEN** while its process is running. To stop a manually-started one, `Ctrl + C` in its terminal (or just run `stop-all.ps1`, which stops anything on those ports regardless of how it was started).

---

## Why 8 Services Instead Of 1

Each service owns its own database and can be started, stopped, and debugged independently:

| Service | Port | Owns |
|---------|------|------|
| `core` | 8000 | auth, employees, departments, roles — the system of record |
| `intelligence` | 8001 | analytics + AI decision support (Gemini or rule-based) |
| `attendance` | 8003 | daily clock records + the kiosk terminal endpoints |
| `scheduling` | 8004 | shift templates + shift schedules |
| `timeoff` | 8005 | leave requests + overtime requests |
| `payroll` | 8006 | timesheets |
| `communications` | 8007 | notifications |
| `configuration` | 8008 | app settings + kiosk configuration |

If you only start `core` and forget the rest, the login page and directory still work, but every other screen will show connection errors — that's expected: each screen now talks straight to the service that owns its data (see `System Workflow Guide.md` for the full request map).

---

## If The System Feels Slow (Way 1 Only)

Running the scripts on a normal laptop is slower than Docker, for reasons that have nothing to do with the code: each service runs on PHP's built-in server, which answers **one request at a time**, and every page load fires several requests at once. If a page or the face scan feels sluggish:

1. **Restart everything once**: `.\stop-all.ps1` then `.\start-all.ps1`. Wait until every port shows `UP` before opening the browser.
2. **Turn debug mode off** in each `backend/<name>/.env` (all 8): `APP_DEBUG=false` and `LOG_LEVEL=warning`. Debug mode writes a lot to the log on every request.
3. **Keep the project out of OneDrive** (for example `C:\dev\Workforce MGNT`). OneDrive syncing makes Laravel's many small file reads much slower on Windows.
4. **Turn on PHP's opcache for the command line.** Open PHP's `php.ini` (run `php --ini` to see where it is) and set `opcache.enable_cli=1`, then restart the services.
5. **Or just use Docker (Way 2)** — it runs each service with several workers and avoids all of the above.

**A page that spins forever** now ends with an error message after 45 seconds instead of hanging — that means one service is stuck or down. Run `.\start-all.ps1` and read which port shows `DOWN`.

**Before a demo:** the kiosk clock-in only works for an employee who has a **shift scheduled today** (see `System Workflow Guide.md`, Module 4). Check the Shifts page first, or the kiosk will correctly say "No Shift Scheduled Today".

---

## Quick Check

| Symptom | Meaning |
|---------|---------|
| `start-all.ps1` prints `DOWN` for a port | Check `logs\svc-<name>.err.log` for that service — usually a DB connection issue or a port already used by something else |
| "can't be reached" in the browser | The frontend isn't running, or the specific service the page needs is `DOWN` |
| Page loads but one section errors | That section's owning service is down — see the port table above |
| Red error text in a terminal (manual mode) | Copy it and send it to the team |
