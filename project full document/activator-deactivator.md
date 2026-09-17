# How To Activate and Deactivate The System

> Workforce Management System — for VS Code terminal
> Current architecture: **8 independent Laravel microservices** + **1 React frontend**.

---

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
3. Waits a few seconds, then hits `/up` on every service and prints `UP`/`DOWN` per port so you know immediately if something didn't boot.
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

## Quick Check

| Symptom | Meaning |
|---------|---------|
| `start-all.ps1` prints `DOWN` for a port | Check `logs\svc-<name>.err.log` for that service — usually a DB connection issue or a port already used by something else |
| "can't be reached" in the browser | The frontend isn't running, or the specific service the page needs is `DOWN` |
| Page loads but one section errors | That section's owning service is down — see the port table above |
| Red error text in a terminal (manual mode) | Copy it and send it to the team |
