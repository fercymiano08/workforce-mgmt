# System Workflow Guide

> The complete, detailed reference for the **AI-Enhanced Workforce Management System**. Treat it as a dictionary you look things up in, not something to memorize front to back.
> Every module, every screen, every flow — explained step by step, from the button you click down to the database row it creates.
>
> **New to any of this?** Read `00 - Start Here - Absolute Beginner Guide.md` first — it explains frontend/backend/database, Laravel, APIs, and monolith-vs-microservices from zero. This guide assumes you already know those words.
>
> Pair this with **Database System Tutorial And Guideline.md** (table details) and the two `.drawio` flowchart references (visual diagrams).

> **TL;DR — read this file in 60 seconds:**
> 1. **The system, in one sentence:** face-verified clock-in/out at the door → attendance records → which feed schedules, leave, overtime, weekly timesheets, analytics, and an AI assistant that helps HR run things.
> 2. **The one rule that explains every screen:** the frontend never touches the database. It sends an API request straight to whichever of the **8 services** *owns* that data; that service checks *who you are* (via `core`), applies the rules, and reads/writes only its own database.
> 3. **If you only read two things:** the diagram in §1 and the clock-in journey in **Module 4**. Those two explain ~80% of the whole system.

---

## How To Read This Guide

| Symbol | Meaning |
|--------|---------|
| `[file.jsx]` | A frontend file — draws what you see |
| `[file.php]` | A backend file — decides and computes |
| `GET /api/...` | An API endpoint (a URL the frontend calls) |
| `table_name` | A PostgreSQL table |

Every module section follows the same pattern:

1. **What it is** — one plain sentence.
2. **Who uses it** — which role sees this screen.
3. **What you can do** — the features on the screen.
4. **The flow** — exactly what happens behind the scenes, step by step.
5. **Tech trail** — endpoints called and database tables touched.

---

# PART 0 — READ THIS FIRST (5 minutes)

> The absolute-beginner primer — the restaurant analogy, the 12-word glossary, and monolith-vs-microservices — already lives in **`00 - Start Here - Absolute Beginner Guide.md`**, written once, so it is **not repeated here**. If any word below is new to you, skim that file first (it takes ~15 minutes), then come back for the two tables that matter for running the system.

## 0.1 What actually runs on your laptop

**Nine programs** must be running at the same time — 8 independent Laravel services plus the frontend. One script starts them all (see **activator-deactivator.md**): `.\start-all.ps1` / `.\stop-all.ps1` at the project root.

| Program | Address | Owns |
|---------|---------|------|
| PostgreSQL database | `127.0.0.1:5432` | 8 separate databases, one per service (see table below) |
| `core` service | `127.0.0.1:8000` | auth, employees, departments, roles |
| `intelligence` service | `127.0.0.1:8001` | analytics + AI decision support |
| `attendance` service | `127.0.0.1:8003` | daily clock records + kiosk terminal |
| `scheduling` service | `127.0.0.1:8004` | shift templates + shift schedules |
| `timeoff` service | `127.0.0.1:8005` | leave + overtime requests |
| `payroll` service | `127.0.0.1:8006` | timesheets |
| `communications` service | `127.0.0.1:8007` | notifications |
| `configuration` service | `127.0.0.1:8008` | app settings + kiosk configuration |
| React frontend | `localhost:5173` | draws every screen |

You open `http://localhost:5173` in the browser. Vite's dev proxy (`frontend/vite.config.js`) looks at the `/api/...` prefix of every request and forwards it straight to the service that owns it — `/api/attendance*` → 8003, `/api/leaves*`/`/api/overtime*` → 8005, `/api/analytics*` → 8001, and so on. There is no single backend anymore; each service is its own process with its own database, and the frontend is the only piece that knows how to find all of them.

Each service is a full, independent Laravel app living at `backend/<name>/` (e.g. `backend/attendance/`), each with its own `vendor/`, `.env`, and `artisan`.

## 0.2 "What/How/Why" for the three big technologies

| Tech | What it is | How we use it | Why we picked it |
|------|-----------|---------------|------------------|
| **React** | A JavaScript library for building web screens | 24 page files under `frontend/src/pages/` | Fast, component-based, huge ecosystem; runs in any browser |
| **Laravel** | A PHP web framework | 8 independent Laravel apps under `backend/<name>/app/` — one per business domain | Secure by default (hashing, validation), clean structure, easy to run as separate services |
| **PostgreSQL** | A relational database (tables with rows/columns) | 8 databases (one per service), ~25 tables total, plus small "replica" copies of shared reference data (e.g. `employees`) inside services that need to read it without calling another service for every request | Reliable, handles relational + JSON data well, free |

> If a panelist asks "why PostgreSQL instead of MySQL?" — add: "PostgreSQL handles JSON columns and complex reporting cleanly, and it's what our team is consistent with. MySQL would also work; ours was a deliberate choice for reliability."

---

# PART 1 — ORIENTATION

## 1. The Big Picture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              YOUR BROWSER                                │
│           React 19 + Vite + Tailwind CSS   http://localhost:5173         │
│           Draws every screen. Knows NOTHING about SQL.                   │
└───┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┘
    │ /api/    │ /api/    │ /api/    │ /api/    │ /api/    │ /api/    │ /api/
    │ auth,    │ analytics│ attend-  │ shifts   │ leaves,  │ time-    │ notifi-
    │ employees│          │ ance,    │          │ overtime │ sheets   │ cations,
    │ ...      │          │ kiosk    │          │          │          │ settings
    ▼          ▼          ▼          ▼          ▼          ▼          ▼
┌────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────────┐
│ core   ││intelligen││attendance││scheduling││ timeoff  ││ payroll  ││communications │
│ :8000  ││ce  :8001 ││  :8003   ││  :8004   ││  :8005   ││  :8006   ││+configuration │
│        ││          ││          ││          ││          ││          ││ :8007 / :8008 │
└───┬────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└────┬─────┘└──────┬────────┘
    │SQL       │SQL        │SQL        │SQL        │SQL        │SQL          │SQL
    ▼          ▼           ▼           ▼           ▼           ▼             ▼
 workforce_ workforce_  workforce_  workforce_  workforce_  workforce_   workforce_comms
   mgnt      intel      attendance  scheduling   timeoff     payroll    /configuration
```
Each box is its **own Laravel app, own process, own PostgreSQL database** — 8 independent services, no shared database, no single "backend" anymore. Every service also exposes a small **internal API** under `/internal/*` (guarded by a shared service token, not a user token — see `EnsureServiceAuthenticated` middleware) so services can reach across for things that must happen immediately — e.g. when HR approves a leave request from the AI Decision Support queue, `intelligence` calls `timeoff`'s internal API directly (`TimeoffClient`) to flip the request's status, instead of writing to a database it doesn't own.

> **One sentence:** the browser sends every request straight to the service whose URL prefix matches it (the frontend's Vite proxy is the router, not a backend gateway); each service checks *who you are* by validating the token against `core`, applies its own business rules, and reads/writes only its own database.

> **Microservices note (important for the defense):** this used to be a **Strangler Fig migration** — one Laravel monolith with an API Gateway, with `intelligence` extracted first as a standalone proof of concept. That extraction is now **complete for all 8 domains**: every remaining module (attendance, scheduling, timeoff, payroll, communications, configuration, plus identity/auth in `core`) has been pulled out into its own Laravel app with its own database, exactly the way `intelligence` was. There is no more API Gateway and no more monolith — `core` is now just the auth + employee-directory service, not a router for the other seven.

### How services that need each other's data stay in sync

Two mechanisms, used for different needs:

1. **Snapshot replication (`SnapshotSyncService` + `php artisan snapshot:sync`, in each service's `app/Services/`)** — services that mostly *read* another service's reference data (e.g. `attendance` needs employees and leave records to compute Late/Absent/On-Leave) keep a local, read-only **replica table**, refreshed from the owning service over HTTP. Fast local reads, slightly stale by design (a sync interval, not real-time) — this is why `attendance` has its own local `Leave` model even though `timeoff` owns leave requests.
2. **Internal API clients (e.g. `NotificationClient`, `ConfigurationClient`, `PayrollClient`, `TimeoffClient`, `AttendanceClient` — each service only has the clients it actually needs, living in that service's own `app/Services/`)** — for anything that must be current and correct *right now*, a service calls the owning service's `/internal/*` API directly over HTTP, authenticated with a shared service token, instead of writing through a replica. Example: any service that needs to raise a notification calls `communications`' internal API through its own `NotificationClient` rather than writing to a `notifications` table it doesn't own.

### Keeping It Fast And Safe (Performance & Reliability Rules)

Splitting one app into eight means every request can turn into several network calls. These rules keep that from making the system slow or fragile. They were added after profiling the running system, so each one answers a real symptom.

| Rule | What it does | Why it exists / honest trade-off |
|------|--------------|-----------------------------------|
| **Identity is cached for 15 seconds** | `EnsureServiceAuthenticated` (in every service except `core`) remembers the answer of `core`'s `/api/auth/me` for 15 s, keyed by a hash of the token | Before, *every* request to *every* service waited on a round-trip to `core`, which is the biggest multiplier on page-load time. Trade-off: a revoked token or changed role is honoured by the other services up to 15 s late. If `core` is down, requests still fail once the cache expires |
| **Replicas carry the face *descriptor*, never the photo** | `core` strips `face_image` from its snapshot and from employee pushes; only the 128-number `face_descriptor` is copied to other services | A registered face photo is ~40 KB. Copied to 5 services every minute it would grow with headcount (100 employees ≈ 4 MB per sync). Only `core` ever displays the photo |
| **The employee list is light** | `GET /api/employees` leaves out `faceImage` / `faceDescriptor`; `GET /api/employees/{id}` returns them. The Edit modal fetches them on demand for the one employee being edited | Same reason — a page load should not download every employee's photo |
| **Replica pushes run concurrently** | Employee pushes (`core`) and shift-schedule pushes (`scheduling`) use Laravel's `Http::pool`, so all target services are called at once | Sequential pushes added every slow target's timeout to the request of the admin who clicked Save |
| **Notification batches are bounded** | The attendance alert scan looks up "already flagged today" with **one** query, and sends new alerts as one concurrent batch capped at **15 per scan**; the rest follow on the next scan (the "already flagged" check prevents duplicates) | Before, each absent employee cost an unindexed query plus a blocking HTTP call — a busy morning could exceed PHP's 30 s request limit |
| **Short timeouts on non-critical calls** | Notification and audit calls: 1 s to connect, 3 s total. The early-leave policy reads the *local* settings replica first instead of calling `configuration` | A notification is never worth making someone wait at the kiosk |
| **Mail can't hang a request** | SMTP has an 8 s timeout (`MAIL_TIMEOUT`); the AI (Gemini) call defaults to 15 s (`GEMINI_TIMEOUT`) | PHP kills any request after 30 s. A dead mail host or slow AI must fail fast, not turn into a 500 |
| **The database enforces one-per-day** | A unique index on ttendance (employee_id, date) and shift_schedules (employee_id, date) means two simultaneous requests can never create a duplicate, even under Docker's multiple workers (an application check alone can be beaten by a race). The app turns the database's refusal into a friendly message | The admin's manual *Add attendance* had no duplicate check at all before this |
| **Working-day logic uses Manila time** | Services run in UTC, but shifts and attendance are Manila wall-clock. The no-show alert scan now uses the company's clock (LocalTime), so a missing 8 AM person is flagged at 9 AM, not ~5 PM | Comparing a Manila shift start with a UTC 
ow() made the alert fire 8 hours late |
| **Tests never touch the live system** | The test suites force every replica-push address to empty and every cross-service client into local mode (with guard tests) | Running the tests used to push test employees/schedules into the running services |
| **Lists are bounded** | Notification lists return the newest 200; `GET /api/attendance` accepts optional `?from=&to=` and the HR Dashboard asks for only the last 35 days | The bell is polled every 30 s by every open tab |
| **Duplicate requests are collapsed in the browser** | The shared HTTP client (`services/http.js`) will not send a second identical create/update/delete (same method, URL and body) while the first is still in flight — the caller just receives the first response. On top of that the shared `Button` locks itself while its action is running, and the server refuses duplicates for leave (overlapping dates), overtime (same day) and shift assignment (same day) | A slow response can never turn a double click, an Enter repeat or a spammed button into two records. Proven by an automated script (5 identical POSTs → the server receives 1) |
| **Face scanning is warmed up and lean** | The three face-api networks are all warmed with a throw-away pass while the page/modal opens (registration and the kiosk preload the ~7 MB of models early); detection tries a 160 px input first and 320 px as the fallback (was 224/416); redundant re-detection was removed; the result flash and retry pause were shortened | The first scan used to pay a multi-second shader-compile cost and two heavier detection passes. Honest note: these are targeted fixes to the known slow spots; the actual speed still depends on the kiosk's GPU/CPU |
| **The frontend never waits forever** | Every API call has a 45 s timeout; notification polling pauses while the browser tab is hidden and catches up when it becomes visible | A hung service now ends in an error message instead of an endless spinner |

> **Why can the demo laptop still feel slower than Docker?** In "Way 1" (`start-all.ps1`) each service runs on PHP's built-in `php artisan serve`, which handles **one request at a time**, and **every request boots the whole Laravel framework again** (measured on the demo laptop: ~0.5 s per cold request — about 0.1 s to load the code, 0.55 s to boot Laravel, 0.15 s to connect to PostgreSQL). One button click can involve several requests across several services, and the first request after starting is the slowest (nothing is cached yet). The laptop matters too: a low-power CPU, low free RAM and running on battery all slow PHP a lot. We tested moving the project folder out of OneDrive and it made **no difference**. Docker mode uses 4 workers per service. For the smoothest demo: plug in the charger, close heavy apps, set `APP_DEBUG=false` and `LOG_LEVEL=warning` in each `backend/<name>/.env` — or run the Docker version (see `activator-deactivator.md`).

### The Golden Rule Of This Architecture

> **Pages never touch the database. Ever.**
> Every piece of data on screen traveled this road:
> `Page → api.js service → HTTP request → Laravel route → Controller → SQL → back again as JSON`.

---

## 2. Who Uses The System (Roles)

There are three roles. Each role logs in through the same login page but lands on a completely different workspace.

| | **Administrator** | **Employee** |
|---|---|---|
| Purpose | Runs the whole company | Self-service for their own work life |
| Logs in with | Email + password | Email + password |
| Sees sidebar | Full management menu | Personal menu only |

> Note: the system exposes exactly one operator role - the **Workforce Admin** (role value `Administrator`). All HR duties (employees, schedules, leave, overtime, payroll, kiosk, settings) are performed by that single account.

### Page Map — Every Screen In The System

| # | Screen (page file) | Role | One-line purpose |
|---|--------------------|------|------------------|
| 1 | Login `auth/Login.jsx` | Everyone | Enter email + password, get a session token |
| 2 | Forgot Password `auth/ForgotPassword.jsx` | Everyone | Request a reset token |
| 3 | Reset Password `auth/ResetPassword.jsx` | Everyone | Set a new password using that token |
| 4 | HR Dashboard `HR_Manager/Dashboard.jsx` | Admin | Company overview: stats cards, charts, quick glance at everything |
| 5 | Employees `HR_Manager/Employees.jsx` | Admin | Company directory: view, search, edit, archive employees |
| 6 | Employee Registration `HR_Manager/EmployeeRegistration.jsx` | Admin | Add a brand-new employee + create their login account |
| 7 | Attendance `HR_Manager/Attendance.jsx` | Admin | See and correct everyone's daily clock records |
| 8 | Leave Management `HR_Manager/LeaveManagement.jsx` | Admin | Approve / reject leave requests |
| 9 | Shifts `HR_Manager/Shifts.jsx` | Admin | Manage shift templates + build weekly schedules |
| 10 | Timesheets `HR_Manager/Timesheets.jsx` | Admin | Review each employee's week (summary cards, quick filters, sortable table), open a side panel with the day-by-day attendance, then approve or reject — one by one or in bulk |
| 11 | Reports `HR_Manager/Reports.jsx` | Admin | Build printable/CSV reports from live data |
| 12 | Analytics `HR_Manager/Analytics.jsx` | Admin | Deep charts: trends, punctuality, productivity |
| 13 | AI Decision Support `HR_Manager/AIDecisionSupport.jsx` | Admin | AI-generated insights + one-click decision queue |
| 14 | Settings `HR_Manager/Settings.jsx` | Admin | Company info, kiosk configuration, system options |
| 15 | Employee Dashboard `Employee/EmployeeDashboard.jsx` | Employee | Personal home: today's status, quick stats, ID card header |
| 16 | My Attendance `Employee/MyAttendance.jsx` | Employee | Own clock history and hours |
| 17 | My Schedule `Employee/MySchedule.jsx` | Employee | Upcoming assigned shifts |
| 18 | Leave `Employee/Leave.jsx` | Employee | Apply for leave, track status, see balances |
| 19 | My Timesheet `Employee/MyTimesheet.jsx` | Employee | Review own weekly hours and submit them |
| 20 | My Profile `Employee/MyProfile.jsx` | Employee | Identity, employment, leave balances, face registration status; edit own phone/address/emergency contact/photo |
| 21 | Settings `Employee/Settings.jsx` | Employee | Change password (live requirements checklist) and appearance only |
| 22 | Kiosk Setup `KIOSK/KioskSetup.jsx` | Admin (device) | Configure and lock the entrance tablet into kiosk mode |
| 23 | Attendance Terminal `KIOSK/AttendanceTerminal.jsx` | Employees at door | The clock-in/clock-out device itself |

---

## 3. Anatomy Of One Request

What happens, in order, whenever any page loads data. Example: the Employee Dashboard loading attendance history.

| Step | Where | What happens |
|------|-------|--------------|
| 1 | `EmployeeDashboard.jsx` | Page mounts (opens) and calls `attendanceService.getByEmployeeId("EMP20260001")` |
| 2 | `services/api.js` | The service turns that into a real HTTP request: `GET /api/attendance/employee/EMP20260001`, attaching the logged-in user's **token** |
| 3 | Vite dev proxy (`vite.config.js`) | Sees the `/api/attendance*` prefix and forwards the request to **the `attendance` service directly**, `http://127.0.0.1:8003` — no gateway, no hop through `core` |
| 4 | `attendance` service's own `routes/api.php` → `routes/services/attendance.php` | Laravel matches the URL to `AttendanceController@byEmployee`. **Middleware runs first**: is the token valid (`attendance` asks `core`'s `/api/auth/me` to check)? Is this role allowed? |
| 5 | `AttendanceController.php` (inside `backend/attendance/`) | Reads the employee ID, asks the model for the data |
| 6 | PostgreSQL — `workforce_attendance` | Runs roughly: `SELECT * FROM attendance WHERE employee_id = 'EMP20260001' ORDER BY date DESC` |
| 7 | Back up the chain | Rows become JSON → travel back → `api.js` receives them → React state updates → the UI renders |

> **Docker mode:** when the system runs with `docker compose`, the same routing is done by **nginx inside the `frontend` container** (`docker/nginx.conf`, identical prefix table, container names such as `http://core:8000` instead of `127.0.0.1`). It is a reverse proxy only — no authentication, rate limiting or filtering — so it is still **not** an API gateway.

Every API call is routed straight to its owning service by the **Vite dev proxy** (not a backend gateway — there is no gateway anymore):
`/api/auth*`, `/api/employees*`, `/api/departments*`, `/api/roles*`, `/api/profile*` → **`core`** (:8000) · `/api/attendance*` + `/api/kiosk*` → **`attendance`** (:8003) · `/api/shifts*` → **`scheduling`** (:8004) · `/api/leaves*` + `/api/overtime*` → **`timeoff`** (:8005) · `/api/timesheets*` → **`payroll`** (:8006) · `/api/analytics*` (including `/ai/insights` and `/ai/actions`) → **`intelligence`** (:8001) · `/api/notifications*` → **`communications`** (:8007) · `/api/settings*` → **`configuration`** (:8008). Anything unmatched falls back to `core`.

> **How each service checks "who are you":** every service except `core` has no `users` table of its own to check passwords against. Instead, its auth middleware takes the bearer token off the request and calls **`core`'s** `GET /api/auth/me` over HTTP to resolve it into a user + role. `core` is still the single source of truth for identity — it's just no longer a gateway for anyone else's data.

> **`intelligence`'s AI actions used to write through `core` — they don't anymore:** approving a leave, approving overtime, or resolving a security event from the AI Decision Support queue used to require a special-cased hop back to `core` because those write to tables `intelligence` doesn't own. Now `intelligence` calls the owning service's **internal API** directly through a dedicated client (`TimeoffClient` for leave/overtime, `AttendanceClient` for security events, `ConfigClient` for settings) — see the sync/clients note in Part 1. `/api/analytics/ai/actions` goes to `intelligence` (:8001) like every other analytics route, full stop.

> **Debugging rule of thumb:** find the service from the URL prefix above → `cd backend/<name>` → find the route in `routes/services/<name>.php` (or `routes/internal.php` if it's a service-to-service call) → read that controller, usually delegating to a `Services/` class. That chain explains 95% of any behavior you see. If the data looks stale rather than wrong, check whether that field comes from a **replica** (synced periodically) instead of the owning service's live table.

---

## 4. Rules That Apply Everywhere

These few global rules shape every module. Keep them in mind while reading Part 2.

### 4.1 Timezone Rule

All shift times, clock-ins, and clock-outs are **wall-clock times in Asia/Manila (UTC+8)**. The system never converts an employee's clock time to another timezone. Hour math always comes out positive.

### 4.2 Security Is Checked Twice

Every protected action is guarded on **both** sides:

1. **Frontend guard** — the sidebar hides links the role shouldn't see (convenience).
2. **Backend guard** — `routes/api.php` marks admin-only routes with `->middleware('admin')`, and controllers re-check ownership inline (real security).

> Hiding a button in the UI is *not* security. Even if someone forged a request directly at the API, the backend still refuses.

### 4.3 Never Trust The Frontend Alone

Validation happens in the browser (instant feedback: "end date cannot be before start date") **and again** in the Laravel controller before anything touches the database.

### 4.4 The Token

After login, the backend issues a personal access token (stored in the `personal_access_tokens` table). The frontend attaches it to every request. No valid token → `401 Unauthorized` → redirected to login. Logout destroys the token.

---

# PART 2 — EVERY MODULE, EVERY FLOW

---

## Module 1 — Authentication (Login, Logout, Password Reset)

**What it is:** the front door. Proves who you are and gives you a session.

**Files:** `auth/Login.jsx`, `auth/ForgotPassword.jsx`, `auth/ResetPassword.jsx`, `components/common/IdleSessionGuard.jsx`, backend `AuthController.php`

### Flow A — Logging In

| Step | What happens |
|------|--------------|
| 1 | User enters email + password, clicks Sign In |
| 2 | Frontend calls `POST /api/auth/login` |
| 3 | Backend looks up the email in the `users` table |
| 4 | Password check: the stored password is a **hash** (scrambled fingerprint), never readable text. The typed password is hashed the same way and the two fingerprints are compared |
| 5 | Match → backend creates a token in `personal_access_tokens` and returns `{ token, user }` — including the user's **role** |
| 6 | Frontend saves the session (`AuthContext`) and redirects: Administrator → HR Dashboard, Employee → Employee Dashboard |
| 7 | From now on, every request automatically carries the token |

Wrong password → error message, nothing stored.

### Flow B — Forgot / Reset Password

```
User clicks "Forgot password?"
        │
        ▼
POST /api/auth/forgot-password   (email address)
        │
        ▼
Backend creates a one-time 6-digit code (stored hashed) and emails it
→ stores it in the `password_reset_tokens` table
→ the code is valid for ONE MINUTE only: after 60 seconds it is useless
  and the user has to ask for a new code (the screen shows a live
  countdown and a "Send a new code" button)
        │
        ▼
User submits new password + code
        │
        ▼
POST /api/auth/reset-password
→ token checked and consumed
→ users.password updated (hashed)
→ old tokens invalidated
```

### Flow B2 — Session Timeout (Employees: 3 Minutes Of Inactivity)

An **employee** who is completely inactive for **3 minutes** is signed out automatically. Administrators are never timed out. It is enforced by the **server**, not just by the screen:

```
Employee logs in → the token is created with an expiry (now + 3 min)
        │
        ▼
While the person really uses the system (mouse, keys, touch, scroll):
the browser calls POST /api/auth/keep-alive  (at most once per 10 s)
→ the server pushes the token's expiry to "now + 3 min"
        │
        ▼
Background requests (notification polling) do NOT extend it
        │
        ▼
Inactive for 2 min 30 s → a "Are you still there?" warning with a 30-second
countdown ("Stay signed in" keeps the session)
        │
        ▼
3 minutes with no activity → the token expires: the browser signs out and the
login page says "You were signed out after 3 minutes of inactivity"
Every service refuses the expired token (they all verify it with core)
```

Because the expiry lives in the token, closing the laptop lid or leaving a tab open cannot leave a session alive. (Logins made before this rule keep working until the person signs in again.)

### Flow B3 — Sensitive Actions Leave A Trail

* **Sign-ins and password events are audited** (core writes them): `auth.login`, `auth.login_failed`, `auth.login_locked` (5 failed tries), `auth.logout`, `auth.password_changed`, `auth.password_reset_requested`, `auth.password_reset`.
* **Exports ask for the password again.** Exporting a report (CSV / Excel / PDF) or the audit log opens "Confirm it's you"; the server checks the password (`POST /api/auth/confirm-password`, 5 wrong tries per minute) and records `auth.export_confirmed` (or `auth.confirm_failed`) with what it was for. We use the password rather than an emailed code because the administrator account is a fixed login, not a real mailbox.
* **Other changes now audited too:** overtime requested / decided / reopened / withdrawn / deleted (`overtime.*`), and any change to the company / system / kiosk settings (`settings.updated`, with the before and after of what changed).

### Flow C — Change Password (while logged in)

Profile/settings page → `POST /api/auth/change-password` → verifies current password first → hashes and stores the new one.

### Tech Trail

- Endpoints: `/api/auth/login`, `/logout`, `/me`, `/keep-alive`, `/forgot-password`, `/reset-password`, `/change-password`
- Tables: `users`, `password_reset_tokens`, `personal_access_tokens`, `sessions`

---

## Module 2 — Employee Records (Directory, Registration, Profiles)

**What it is:** the company's people database. The `employees` table is the **central entity** — almost every other module hangs off an `employee_id`.

**Files:** `HR_Manager/Employees.jsx`, `HR_Manager/EmployeeRegistration.jsx`, backend `EmployeeController.php`

### What You Can Do (Admin)

| Action | How |
|--------|-----|
| Browse/search the directory | Cards grid with prominent blue monospace **employee ID badges**, department and position chips |
| View full profile | "View Profile" modal — personal info, salary, emergency contact, leave balances, face registration state |
| Register a new employee | Employee Registration form |
| Edit any record | Edit modal/form |
| Archive/remove | Delete action |
| Enroll their face for kiosk verification | Upload/register face → stores photo + mathematical descriptor |

### Flow A — Registering A New Employee

| Step | What happens |
|------|--------------|
| 1 | Admin fills the form: First/Last name, Email, Phone, Department, Position, Employment Type, Status, Hire Date, Salary, Gender, Date of Birth, Home Address, etc. |
| 2 | Frontend validates (required fields, email format, salary is a number) |
| 3 | `POST /api/employees` (admin-only route) |
| 4 | Backend validates everything **again** |
| 5 | Backend generates the next sequential **employee ID** (format `EMP2026xxxx`) |
| 6 | Row inserted into `employees`. If a login account is created, a matching row goes into `users` linked by `employee_id` |
| 7 | Success toast → new card appears in the directory instantly |

### Flow B — Editing / Viewing

Same endpoints, different verbs: `GET /api/employees/{id}` loads one record into the form; `PUT /api/employees/{id}` saves changes; `DELETE /api/employees/{id}` archives. Every change is validated server-side before writing.

### Flow C — Face Enrollment

| Step | What happens |
|------|--------------|
| 1 | Admin opens the face registration control on an employee record |
| 2 | `POST /api/employees/{id}/face` uploads the photo |
| 3 | Backend stores: `face_image` (the photo), `face_descriptor` (JSON — a 128-number mathematical fingerprint of the face), `face_registered = true`, `face_registered_at` timestamp |
| 4 | From this moment the kiosk can verify this person by face (Module 4) |

**While capturing**, the camera view shows a **face-shaped guide** (an oval with the surroundings dimmed). When the photo is taken it plays a **scan animation** — a sweeping light band and pulsing landmark dots over the face — while the browser computes the descriptor, then shows "Analyzing face…" until the result is ready. The animation uses only CSS transform/opacity, so the browser keeps it moving on the graphics thread even while face-api is busy calculating. (`components/attendance/FaceScanOverlay.jsx`, shared with the kiosk.)

> Why store a *descriptor* instead of just a photo? Comparing two descriptors (just numbers) is fast and happens right in the kiosk browser — no face image ever needs to leave the device during verification.
>
> **Where the photo lives:** only in `core`. The other services receive the descriptor (they need it to check faces) but **not** the photo, and the employee list omits both; the Edit modal fetches them for one employee on demand (see *Keeping It Fast And Safe* in Part 1).

### Tech Trail

- Endpoints: `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/{id}`, `POST /api/employees/{id}/face`
- Tables: `employees` (center), `users` (login link)

---

## Module 3 — Kiosk Setup (Admin Configures The Device)

**What it is:** the admin screen that turns an ordinary tablet/PC at the entrance into a locked-down time clock.

**File:** `KIOSK/KioskSetup.jsx` (page) with `components/kiosk/` (`KioskStatusHero`, `KioskStatTiles`, `KioskWaitingList`, `KioskReadiness`, `KioskActivityTimeline`, `KioskPreview`), backend `SettingsController.php`, `KioskController.php`

**Kiosk Management is a live control room** with four tabs:
* **Overview:** a status card (kiosk live or in setup mode, a live countdown to the end of today's unlock at midnight, the enable/disable button); four tiles for today (clocked in against scheduled, clocked out, **not clocked in**, **security alerts** = wrong PINs and face mismatches, not successful unlocks); the last clock event; a **Waiting to clock in** list (scheduled, shift started, no clock-in, not on leave, with minutes late); and a **Readiness check** (PIN set, kiosk on, employees without a registered face with a link to fix them, and a button that tests this device's camera and face models). It refreshes every 15 seconds and shows "Connection lost - retrying" if the server stops answering.
* **Activity:** the log as a timeline grouped by day, with filters (all, clock-ins and outs, security, system) and search; real alerts are highlighted in red.
* **Settings:** location, device name and time zone, with a live preview of the kiosk screen and a Save button that is only enabled when something changed.
* **Maintenance:** reboot, update check and a separate danger zone for resetting all kiosk data.

The activity log names employees, so it is **not** part of the public kiosk config: `GET /api/kiosk/logs` (administrator only) serves it, and `GET /api/kiosk/overview` (administrator only) computes today's numbers on the server in the kiosk's time zone.

### What You Can Do

| Setting | Purpose |
|---------|---------|
| Enable/disable Kiosk Mode | Locks the entrance device to ONLY the clock screen |
| Set a 4-digit kiosk PIN | Required to exit kiosk mode later (stored **hashed** in `settings.kiosk`) |
| Location / Device Name / Timezone | Labels the device and anchors time math |
| Verification Method | Face recognition vs other methods |
| Reset Kiosk | Wipes kiosk state back to defaults |

> **If the server is slow or fails** while enabling the kiosk, saving settings or resetting, the screen now shows a clear message ("The server took too long or failed to respond…") and lets you retry, instead of spinning forever.

### Flow — Entering And Leaving Kiosk Mode

```
ENABLE:
Admin sets PIN → POST /api/kiosk/config + /api/kiosk/pin
→ settings.kiosk JSON updated
→ terminal now boots straight into the clock screen

EXIT (deliberate):
On the terminal, tap anywhere 5 times quickly
→ PIN prompt appears
→ correct PIN → POST /api/kiosk/verify-pin → unlocks
→ wrong PIN → attempt logged to security_events as 'pin_failed'
```

### Tech Trail

- Endpoints: `POST /api/kiosk/config`, `/api/kiosk/pin`, `/api/kiosk/reset`, `GET /api/kiosk/logs`, `GET /api/kiosk/overview` (admin), `GET /api/kiosk/config` (public read of safe fields, no activity log), `POST /api/kiosk/verify-pin` (public, rate-limited to 10/min; on success returns a signed **device token** valid until midnight). Every other kiosk endpoint (employee directory, face check, log, clock-in/out) needs that token in the `X-Kiosk-Token` header
- Tables: `settings` (kiosk JSON), `security_events`

---

## Module 4 — The Kiosk Terminal (Clock In / Clock Out)

**What it is:** the heart of the attendance system. The most security-critical flow in the product.

**Files:** `KIOSK/AttendanceTerminal.jsx`, `FaceRecognitionModal` component, backend `KioskController.php`

> The kiosk device is NOT a logged-in user, so it uses a **device token** instead of a login: entering the kiosk PIN makes the server issue a signed token (valid until midnight kiosk time, void the moment the PIN changes) that the terminal sends as `X-Kiosk-Token`. Without it, the directory, face check, log and clock-in endpoints all answer `401 kiosk_locked`; clock-ins are also refused (`423`) while the kiosk is switched off. Only `GET /kiosk/config` and the (rate-limited) PIN check are open. The endpoints return **minimal fields only** (name, photo, department, today's schedule) — salaries, emails, phone numbers and addresses never cross them. Failed PIN attempts are logged as security events by the server itself.

> **The server is the authority, the terminal only explains.** Every attendance rule below is enforced by the `attendance` service (`KioskController`), not just by the screen. The server takes the **date and time from its own clock** (in the kiosk's timezone), looks up the employee's shift itself, and works out **Present / Late** itself — the terminal's clock and its `status` field are ignored. So a wrong tablet clock or a hand-made request cannot record an on-time arrival that never happened. The terminal's popups exist so the employee gets a clear explanation *before* the server would refuse or flag the punch.

### The Full Clock-In Journey, Step By Step

| Step | Actor | What happens |
|------|-------|--------------|
| 1 | Employee | Types their employee ID on the keypad |
| 2 | Terminal | Looks up the ID → shows **"Is this you?"** with photo, name, department |
| 3 | Employee | Confirms identity |
| 4 | Terminal | Opens the camera and runs **face-api.js**: compares the live camera frame against the stored `face_descriptor`. All comparison happens **inside the browser** — fast and private |
| 5 | Terminal | Match? Continue. Mismatch? → see the security flow below |
| 6 | Terminal | Runs the **smart pre-checks** (next section) before recording anything |
| 7 | Terminal | Sends the request: `POST /api/kiosk/attendance` (clock-in) or `PUT /api/kiosk/attendance/{id}` (clock-out) |
| 8 | Backend | **Enforces the rules itself**: duplicate check, approved-leave check, **a scheduled shift must exist**, the **shift must not be over**, then computes the time and **Present/Late** from the server clock; hours math on clock-out; an early clock-out **must carry a reason** |
| 9 | Database | One row written/updated in `attendance`; a Late arrival also notifies the admins |
| 10 | Terminal | Green success screen showing the recorded time and status — visible immediately afterward in the HR Attendance page and the employee's My Attendance. If the server refused the punch, the terminal shows the server's own reason in a **"Clock-In Not Allowed"** popup instead |

### Smart Pre-Checks (Before Anything Is Recorded)

The checks run **in this order** — the first one that applies wins. Steps 1–3 are also enforced by the server, so the terminal can never be used to skip them.

| # | Situation | Terminal popup | Employee can continue? |
|---|-----------|----------------|------------------------|
| 0 | Already clocked in, pressing Clock In again | "Already Clocked In Today" — suggests Clock Out | No |
| 0 | Clock Out pressed but no clock-in exists today | "No Clock-In Found" — suggests Clock In | No |
| 0 | Approved leave covers today | "On Approved Leave" | No |
| 0 | The schedule could not be loaded (network hiccup) | "Schedule Unavailable" — nothing is recorded, never guesses a shift | No — try again |
| 1 | **No shift scheduled today** (or the schedule is not in `Scheduled` status) | "No Shift Scheduled Today" — "check your schedule with HR" | **No — blocked** |
| 2 | **Shift already ended** (scheduled end + approved overtime) | "Shift Over" — "contact HR" | **No — blocked** |
| 3 | Later than **15 minutes** after shift start | "You Are Late" — says how many minutes after the start; recorded as **Late**; admins are notified | **Yes** — "Clock In Anyway" |
| 4 | Before the shift starts | "Clocking In Early" ("Very Early" if more than 60 min) | **Yes** — "Clock In Anyway" |
| 5 | Within the grace period (start … start + 15 min, **inclusive**) | No popup — recorded straight as **Present** | — |
| — | **Clocking out before the shift ends** | Early Clock Out **reason picker** — Continue stays disabled until a reason is chosen (Module 4a). Approved overtime extends the shift end, so clocking out at the adjusted end is a normal clock-out | Yes, with a reason |

> **History note (good to know for the defense):** the "no shift → blocked" rule is the original design. For a short time the terminal checked *lateness first* and fell back to a default 08:00 start when there was no shift — so at 9:30 pm an employee with no shift was told they were "810 minutes late" and the punch was accepted. That was fixed by (a) restoring the correct order above and (b) moving the rules to the server. It is covered by automated tests (`KioskGuardrailTest`).

### Face Mismatch → Warning → Alert → Strikes → Lockout

```
Face does not match the registered descriptor
        │
        ▼
Terminal shows "Identity Verification Failed" (red): clocking in under
another person's ID is a security violation; the attempt was logged and
the Workforce Admin has been alerted.
        │
        ▼
The server (from the kiosk log call) does TWO things:
  1. writes a security event: type = 'face_mismatch', status = 'Open', employee_id attached
  2. sends every Workforce Admin a HIGH-priority notification
     (type 'security_face_mismatch', "Face Mismatch at Kiosk", deep-links to AI Decision Support)
        │
        ▼
Strike counter increases. After 3 strikes the terminal locks for
60 seconds (countdown shown).
```

Every one of these events also surfaces in the **Security Events** area of AI Decision Support for HR to resolve or escalate (Module 15).

### The Kiosk's Popup Catalog (Every Warning In One Place)

The terminal has one popup component with four tones. Use this table to explain "what does the kiosk say when…?"

| Tone | Title | When | Buttons |
|------|-------|------|---------|
| Red (danger) | Identity Verification Failed | Face does not match the ID entered | I Understand |
| Red | No Shift Scheduled Today | No `Scheduled` shift for today | Back to Home |
| Red | Shift Over | Now is past the scheduled end (+ approved overtime) | Back to Home |
| Red | On Approved Leave | Approved leave covers today | Back to Home |
| Red | Clock-In / Clock-Out Not Allowed | The server refused the punch (shows the server's exact reason, e.g. "state a reason first") | Back to Home |
| Red | Attendance Not Recorded | A real network/server failure — nothing was saved | Try Again / Cancel |
| Amber (warning) | You Are Late | More than 15 min after shift start | Clock In Anyway / Cancel |
| Amber | Schedule Unavailable | The schedule could not be loaded | Back to Home |
| Amber | Overtime Not Approved | Clocking **out** more than 15 min past the (approved) shift end with no approved overtime covering it — the extra time is **not counted** (the day ends at the approved end) | Clock Out / Go Back |
| Red/Amber banner | Early-out allowance | On the early clock-out reason screen: "1 of 2 used", or "this one will be recorded as UNEXCUSED" once used up; extra line for *Feeling Unwell* (certificate within 48 h) | — |
| Blue (info) | Clocking In Early / Very Early | Before the shift start | Clock In Anyway / Cancel |
| Screens | Already Clocked In Today · No Clock-In Found | Duplicate / missing punch | Suggests the right action |
| Screen | Terminal locked (60 s countdown) | 3 face-mismatch strikes | — |
| Success | Clocked In Successfully (green) · Clocked In (Late) (amber) · Clocked In (Early) (blue) · Clocked Out (green) · Clocked Out Early (amber) | After a recorded punch | auto-returns to the start screen |

While the face is being scanned, the camera view shows the same **face-shaped oval with a sweeping scan band and landmark dots**, turning green when identity is confirmed (`FaceScanOverlay.jsx`).

### Clock-Out Math

When clocking out, the **server** (not the kiosk screen) works out four numbers and stores them on the attendance row — **always from the actual punches, never from the schedule** (clock in 10:00 today means the 08:00–10:00 hour is simply not credited):

| Stored value | What it is |
|--------------|-----------|
| `total_hours` | (counted clock-out − clock-in), minus the **unpaid lunch** when enough was worked (see below) |
| `overtime`   | counted time **past 17:00** (only possible with an approved overtime request) |
| `regular_hours` | total − overtime |
| `break_hours` | the deducted lunch, in hours |

**How the lunch break works.** It is deducted **by duration, not by clock time**, the way most enterprise time systems do it: once the person has worked at least the **minimum hours (default 5)**, the **lunch length (default 60 minutes)** is taken off the day — whenever lunch was really taken. A shorter day (a sick early leave at 12:30, a half day) loses nothing. Nobody has to clock out for lunch. HR can change both numbers (or set the length to 0 to switch it off) on **Settings → Early Leave → Unpaid Lunch Break**; a change applies to days worked from then on, and days already counted keep the lunch they were counted with. This matches the Philippine Labor Code idea that a meal break of at least 60 minutes is unpaid.

The same helper (`ShiftHours`) computes these when a day is re-counted after an overtime approval — one source of truth, so attendance history and weekly timesheets always agree.

### Module 4a — Clocking Out Early (Early Leave)

Clocking out before the scheduled shift end is **allowed** — it just has to be explained **first**. The clock-out is never refused for a real reason (someone who is sick must not be trapped at the door), but **no reason = no clock-out**: the picker's Continue button stays disabled until a reason is chosen, and the server enforces it too (an early punch without a reason is answered `422 reason_required` and nothing is saved). Clocking out at or after the scheduled end needs no reason and simply succeeds. The terminal turns an early punch into a reviewable record.

| Step | Actor | What happens |
|------|-------|--------------|
| 1 | Terminal | Detects clock-out time < scheduled end (shift end + approved overtime) |
| 2 | Terminal | Shows how many free early clock-outs the person has already used (e.g. "1 of 2 in the last 30 days"; red "this one will be UNEXCUSED" once they are used up), then the reason picker — one tap required: **Feeling Unwell / Family Emergency / Personal Emergency / Other**; a short note is optional. Choosing *Feeling Unwell* adds: "needs a medical certificate within 48 hours" |
| 3 | Employee | Taps **Clock Out Early** |
| 4 | Backend | Records the punch normally, then stores an early-out snapshot: `ECO-…` row with `reason_code`, `note`, **`minutes_early`** (absolute minutes before shift end) |
| 5 | Backend | Attendance row status → **`Early Leave`** |
| 6 | Backend | **Verifies what it can** (`EarlyLeaveEnforcer`, see below) — the punch itself is never refused |
| 7 | Database | The punch snapshot in `early_clock_outs` is immutable — like every punch, it cannot be silently edited away |

#### Why the reason alone is not trusted

A kiosk cannot tell whether "I'm sick" is true — and every employee sees the same steps. So the reason is treated as a **claim**, and the system makes false claims costly and visible:

| Control | What it does |
|---------|--------------|
| **Free allowance** | Each employee gets **2 free early clock-outs per rolling 30 days** (both editable in Settings). The **3rd is marked UNEXCUSED (Unpaid) automatically, at the punch** — no waiting for HR. Only *earlier* early-outs count against you, so "2 free" means two |
| **Proof for SICK** | A *Feeling Unwell* claim becomes `CERTIFICATE_REQUIRED` with a deadline of **48 hours** (Settings → *Certificate Deadline*). The employee uploads a photo/PDF in My Attendance → Early Clock Outs. If the deadline passes with nothing attached, an hourly job (`early-outs:expire-certificates`) marks it **unexcused automatically** and tells both sides. HR **cannot** excuse a sick early-out without a certificate on file, unless they use *Override* (audited) |
| **Alert on every early clock-out** | All Workforce Admins are notified for **every** early clock-out — including *Other* — with the running count ("early clock-out #2 in 30 days, within the free allowance of 2"). High priority once the allowance is exceeded, so a person can follow up the same day |
| **Copycat detection** | If **3 employees** leave early on the same day citing the same reason, the admins get a "Possible Early-Leave Pattern" alert |
| **Only verifiable reasons** | *Approved Leave* is no longer offered (a day with approved leave has no clock-in at all, so it can never be true at the kiosk); the server also refuses it |

**Follow-up, two sides:**

- **Employee** — My Attendance has an **Early Clock Outs** tab: date, clocked-out time, scheduled end, time lost, reason, classification, and proof status (*Certificate required — due …*). The employee can edit the reason/note and **attach a medical certificate** (`PUT /api/attendance/early-outs/{id}/reason`).
- **HR** — the Attendance page has an **Early Clock Outs** tab with a pending-count badge. HR reviews each one (with the certificate download link) and **classifies** it: `Excused (Sick)` / `Excused (Emergency)` / `Excused (Early Leave)` / `Unpaid`.

> **Honest note on pay:** payroll pays the hours actually clocked, so the missing hours after an early leave are not paid either way. The classification is the attendance/discipline record (and, for *Excused (Sick)*, it drafts a Sick-leave request); it does not currently add or remove pay by itself.

### Tech Trail

- Endpoints: `GET /api/kiosk/employees` (directory of minimal fields), `GET /api/kiosk/employees/{employeeId}` (single-employee fallback lookup, also resolves a bare numeric suffix), `GET /api/kiosk/schedule/{employeeId}` (today's shift), `GET /api/kiosk/attendance/{employeeId}` (today's record), `POST /api/kiosk/attendance`, `PUT /api/kiosk/attendance/{id}`, `POST /api/kiosk/log`
- Early leaves: `GET /api/attendance/early-outs`, `GET /api/attendance/early-outs/employee/{employeeId}`, `GET /api/attendance/early-outs/pending`, `PUT /api/attendance/early-outs/{id}/reason`, `POST /api/attendance/early-outs/{id}/classify`
- Server answers to remember: `422 {reason: 'no_shift'}`, `422 {reason: 'shift_over'}`, `422 {reason: 'on_approved_leave'}`, `422 {reason: 'reason_required'}`, `422 {reason: 'reason_not_verifiable'}` (Approved Leave as a reason), `422 {reason: 'proof_required'}` (HR excusing a sick claim with no certificate), `409` duplicate clock-in, `423` kiosk switched off, `401 kiosk_locked` missing/expired device token. The terminal shows the server's message for any of these.
- Tables: `employees` (read minimal), `shift_schedules` (read today), `attendance` (write), `early_clock_outs` (write), `security_events` (write)
- Automated tests: `KioskGuardrailTest` (no shift, 9:30 pm with no shift, cancelled schedule, shift over, approved-overtime window, 08:15:00 = Present vs 08:15:01 = Late, server clock wins, reason required, clock-out at end needs none, face-mismatch alert), `EarlyClockOutTest`, `KioskDeviceTokenTest`

---

## Module 5 — Employee Dashboard

**What it is:** the employee's personal home page after login.

**File:** `Employee/EmployeeDashboard.jsx`

### What You See

| Element | Meaning |
|---------|---------|
| Header identity card | Avatar + big blue monospace **employee ID badge** + department/position chips + green badge "Identity verified via facial recognition" |
| Today's status | Whether you've clocked in/out today, current hours |
| Quick stats | Hours this week, pending requests, remaining leave days |
| Shortcuts | Jump to My Attendance, Leave, Schedule, Timesheet |

### Flow

Opens → fires several parallel GET requests (own attendance history via `/api/attendance/employee/{id}`, own schedule via `/api/shifts/schedules/employee/{id}`, leave balances via `/api/leaves/balances/{id}`, unread notifications count) → renders. Nothing is written by this page; it's pure reading.

> Administrators opening employee-style self pages get empty data — expected, because admins have **no employee record** by design.

---

## Module 6 — My Attendance (Employee)

**What it is:** the employee's personal clock-history ledger.

**File:** `Employee/MyAttendance.jsx`

### What You Can Do

- See every past day: date, clock-in, clock-out, status (**Present / Late / Absent / Early Leave**), regular/OT/break/total hours
- Filter by period; spot patterns in your own punctuality
- Nudge yourself: a daily self-reminder if you forgot to clock out
- **Early Clock Outs tab:** every early-out with its date, clocked-out time, scheduled end, time lost, reason and classification — and the ability to **edit the reason/note** you gave at the kiosk (`PUT /api/attendance/early-outs/{id}/reason`)

### The "Remind Me To Clock Out" Flow

```
End of day, employee notices they never clocked out
        │
        ▼
POST /api/attendance/remind-clock-out
        │
        ▼
Backend checks: one nudge per person per day (prevents spam)
        │
        ▼
Creates a notification reminding the employee
```

> Can an employee fix a missing clock-out themselves? No — records are corrected by the Administrator through the HR Attendance page (Module 7). That keeps the audit trail honest.

### Tech Trail

- Endpoints: `GET /api/attendance/employee/{employeeId}`, `POST /api/attendance/remind-clock-out`, `GET /api/attendance/early-outs/employee/{employeeId}`, `PUT /api/attendance/early-outs/{id}/reason`
- Tables: `attendance` (read), `early_clock_outs` (read/write), `notifications` (write)

---

## Module 7 — Attendance Administration (HR Side)

**What it is:** the administrator's control room over everyone's daily records.

**File:** `HR_Manager/Attendance.jsx`

**Absent days are recorded automatically.** A day that is over, where the person had a scheduled shift, never clocked in and had no approved leave, is written as an **Absent** record by `attendance:mark-absent` (00:10 Manila time, again at noon as a safety net; only finished days, only once per person/day). Before this, the Absent numbers on the dashboards, analytics and AI only counted records typed in by hand. The page's Absent card therefore shows **yesterday**.

**Overtime decisions can be reopened.** An approved or rejected overtime request has a **Reopen** button that puts it back in the queue (the hours that count change accordingly); every decision and reopening is written to the Audit Logs.

### What You Can Do

| Feature | Endpoint | Notes |
|---------|----------|-------|
| View all records, filter by date | `GET /api/attendance/date/{date}` | Whole company for one day |
| Manually add a record | `POST /api/attendance` | e.g., someone forgot both punches |
| Correct a record | `PUT /api/attendance/{id}` | Fix times/hours; audit-friendly |
| Remove a bad record | `DELETE /api/attendance/{id}` | |
| View a date window | `GET /api/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD` | Optional window; with no parameters it returns everything. The HR Dashboard asks only for the last 35 days |
| Run alert checks | `GET /api/attendance/alerts/check` | Runs when the HR dashboard loads. Flags no-shows, un-closed clock-ins from earlier days, unauthorized overtime and staffing shortage. Efficient by design: one query for "already flagged today", one name lookup per group, alerts sent as one concurrent batch (max 15 per scan — the rest follow on the next scan) |
| **Review & classify early clock-outs** | `GET /api/attendance/early-outs`, `POST /api/attendance/early-outs/{id}/classify` | One tab; pending badge shows health/emergency cases waiting |

The **Early Clock Outs tab** (badge = count of `Pending Review`) lists every early-out with employee, date, time lost, the reason the employee gave at the kiosk, and current classification. HR opens one and picks `Excused (Sick)` / `Excused (Emergency)` / `Excused (Early Leave)` / `Unpaid` — unpaid early time is deducted from pay, excused is not. The employee can still edit their reason afterwards, but the punch snapshot that HR judged never changes.

### Late/Absent Logic (How Statuses Are Born)

```
Shift scheduled to start 08:00 (from shift_definitions / shift_schedules)
        │
        ├── clock-in ≤ 08:00 + 15 min grace      → status "Present"
        ├── clock-in > grace                     → status "Late"
        └── no clock-in and no approved leave,
            past the 60-minute absence grace     → status "Absent"
```

An employee with an **Approved leave** covering today is marked on-leave rather than absent.

**Who decides Present vs Late?** The `attendance` **server**, at the moment of the kiosk punch, using its own clock and the employee's scheduled shift start: on time up to and **including** 15 minutes after the start (08:15:00 is still Present), Late from 08:15:01. There is no fallback start time — an employee with no scheduled shift cannot clock in at all, so they can never be marked Late by a guess.

### Tech Trail

- Tables: `attendance` (read/write), `shift_schedules`, `shift_definitions`, `leaves` (context for decisions)

---

## Module 8 — Shift Definitions & Scheduling

**What it is:** two connected pieces — the **templates** (what a shift is) and the **assignments** (who works which template on which day).

**Files:** `HR_Manager/Shifts.jsx`, `components/scheduling/EmployeePicker.jsx` (Department → Role → Employee picker), `components/scheduling/ScheduleRulesModal.jsx`, backend `ShiftController.php`, `ScheduleGenerator.php`, `ScheduleRulesController.php`, `AutoGenerateSchedules.php`

### The Active Shift Templates (`shift_definitions`)

| Code | Name | Hours |
|------|------|-------|
| SHIFT004 | Standard Shift | 08:00 – 17:00 |

> **There is exactly ONE shift: the 8-to-5 Standard Shift** (this is how the client's company actually works). Templates are reference data — every employee can read them; only the admin can build assignments.
>
> **Overtime is not a shift.** There is deliberately no "Overtime Shift" (5–9 PM) template — nobody can be *scheduled* for overtime. Overtime only happens when an employee's day is **extended**: an approved overtime request moves that day's effective end from 5:00 PM to 5:00 PM + the approved hours (Module 10). A migration removes the old Overtime template from any database that still has it.
>
> **The template can never be missing.** Nothing can be scheduled without it (the Assign form would have nothing to pick, and schedule generation is refused). There is no screen to create or delete templates, so a migration (`ensure_default_shift_definitions`) puts SHIFT004 in place on any database that lacks it — fresh install, Docker start, or a database whose demo seed was never run — and never touches existing rows. The Shifts page also says so plainly if the list is ever empty, instead of showing an empty dropdown.
>
> **One shift per person per day.** Assigning a second shift to someone who already has one that day is refused with a message naming the existing assignment; running the automated generator twice creates nothing new the second time (it reports the days as "already scheduled").

### Flow A — Generating Schedules (Preview → Publish → Undo)

One engine (`ScheduleGenerator`) serves both the admin's **Automated Shift Assign** dialog (its Generate wizard) and the **automatic weekly job**. It works in two separate steps, so nothing is created until someone decides:

| Step | What happens |
|------|--------------|
| **Plan** | The engine works out what *would* be created and everything skipped, and why. The wizard's step 3 (**Review**) shows it: shifts to create, skipped for *already scheduled / approved leave / holidays / day off*, days below minimum coverage, and shifts per day. **Nothing is written.** |
| **Publish** | `POST /api/shifts/schedules/generate` creates the shifts and records the run as a **batch** (`BAT001`...), notifies each employee, warns the admins about shortages, writes an **audit** entry, and copies the new shifts to the other services. |
| **Undo** | *Automation & rules → History → Undo* removes the shifts that batch created **that have not happened yet** (shifts on days already passed stay, because attendance may rely on them) and tells the employees. |

**Who gets scheduled on which day** — the rules, in this order: an employee's **own work pattern**, else their **department's pattern**, else the **usual days** (Monday–Friday unless changed). Nobody is scheduled on a **holiday**, on **approved leave**, or twice on the same day. **Coverage rules** (a minimum number of scheduled people per department per day) never block anything: they produce warnings.

### Flow A2 — Automatic Scheduling (the "automated" part)

Switched on under **Shifts → Automation & rules → Automatic** (it is OFF by default). A scheduled job (`schedules:auto-generate`, checked hourly) does the following **by itself**, once per week, at the chosen day and hour (default **Friday 5:00 PM**, Manila time):

1. Takes the coming week (or the next 1–4 weeks, as configured).
2. Schedules **every active employee** on their work days — skipping holidays, approved leave and shifts that already exist.
3. Records it as a batch (created by "System"), notifies the employees, and sends the admins one summary: *"42 shifts created for 10 employees; skipped: 3 for approved leave, 1 for holidays. 1 day is below minimum coverage. Review or undo it on the Shifts page."*

A week that already has an automatic run — even one that was undone — is never re-created by the next hourly check.

| Setting (Automation & rules) | What it controls |
|------------------------------|------------------|
| **Automatic** | On/off, the day and hour it runs, how many weeks ahead, the usual work days, the shift used |
| **Work patterns** | Which days a department or one employee works (e.g. Retail Mon–Sat, or one person Tue–Sat) |
| **Holidays** | A company calendar of days nobody is scheduled (starter list of Philippine holidays, editable) |
| **Coverage** | Minimum scheduled people per department per day |
| **History** | Every generation (manual or automatic) with Undo |

Every one of these changes is written to the audit log (schedule assigned / moved / deleted, generation, undo, rule changes).

### Flow B — Manual Adjustments

Single rows can be created (`POST /api/shifts/schedules`), edited (`PUT .../{id}`), or removed (`DELETE .../{id}`). Swaps are just edits.

### Flow C — Employee Sees Their Schedule

`GET /api/shifts/schedules/employee/{employeeId}` → My Schedule page renders upcoming shifts joined with template names/times/colors.

### Why Schedules Matter Everywhere Else

The schedule is not decoration. It drives: kiosk clock-in validation (Module 4), Late/Present computation (Module 7), timesheet expectations, and coverage analysis in Analytics/AI.

### Leave Blocks Scheduling

An employee with **approved leave** on a date cannot be given a shift that day: creating or moving a schedule onto such a date is refused by the server (422), and the no-show alert check skips people on approved leave. Shifts created *before* the leave was approved are not auto-cancelled (HR removes them).

### Tech Trail

- Endpoints: `GET /api/shifts` (templates, any user); admin CRUD on `/api/shifts/schedules*`
- Tables: `shift_definitions` (read), `shift_schedules` (write/read)

---

## Module 9 — Leave Requests (Apply → Approve → Balance Deduction)

**What it is:** the full lifecycle of time-off: employee applies, admin decides, balances update, everybody gets notified.

**Files:** `Employee/Leave.jsx`, `HR_Manager/LeaveManagement.jsx`, backend `LeaveController.php`, `SchedulingClient.php` (time-off) and `WorkingDays.php` (scheduling)

### Leave Costs Working Days, Not Calendar Days

A leave request is charged in **working days**: the days the person's work pattern says they work (their own pattern, else their department's, else the usual days), **minus company holidays**. A Friday-to-Monday leave costs **2** days of balance, not 4. While the employee picks dates the form shows the live cost ("This will use 2 working days of your balance (4 calendar days; weekends, holidays and days off are not counted)"). The server does the counting: time-off asks the scheduling service (`POST /api/internal/working-days`) when the request is filed, stores the result in `leaves.days`, refuses a range with no working day at all, and checks the balance against it. If scheduling cannot be reached, Monday-Friday is used so an outage never blocks a request. Old requests keep their calendar-day cost (backfilled).

### The Administrator's Queue (Leave Management)

The page opens on **Pending Approvals**. Tick several requests and **Approve / Reject selected** in one go. Each pending row warns "N teammates also off", and the detail window shows **Team impact**: which colleagues of the same department are off or waiting on the same days, and how much of the team that is (30% or more turns red).

### Leave Statuses (The Life Of A Request)

```
            ┌──────────► Cancelled (employee withdrew it while Pending)
            │
Pending ────┤
            │
            └──────────► Approved   (balance deducted)
                    or
                         Rejected   (balance untouched, comments explain why)
```

### Flow A — Employee Applies

| Step | What happens |
|------|--------------|
| 1 | Fill form: **leave type** (vacation, sick, emergency, maternity/paternity, etc.), **start date**, **end date**, **reason** |
| 2 | Frontend validates: end ≥ start, reason required; the page also shows current **balances** fetched from `/api/leaves/balances/{employeeId}` |
| 3 | `POST /api/leaves` — the payload says whose request it is; the backend verifies the caller may only file as themselves |
| 4 | Backend re-validates and inserts into `leaves`: `status = 'Pending'`, `applied_date = today`, `employee_name` snapshotted |
| 5 | Notification created for HR: "new leave request" |
| 6 | Request appears in the employee's list with a **Pending** pill |

**Guardrails on applying (enforced by the server; the form mirrors them):**

- **No past dates for employees.** The date pickers grey out every day before today, and the server refuses a start date before today (`422`). An Administrator may still record a past absence on someone's behalf.
- **No duplicate / overlapping requests.** A new request whose dates overlap one that is still **Pending or Approved** is refused with a message naming the existing request. A **Cancelled** or **Rejected** request does not block a new one.
- **No double submit.** The Submit button locks with a spinner as soon as it is clicked and stays locked until the server answers (this is built into the shared `Button` component, so **every** button whose click calls the server behaves the same). If the request fails, the form stays open with everything typed in, and the message says why.

Cancel path: while still Pending, the employee can cancel it via `PATCH /api/leaves/{id}/status` with `Cancelled` — the dual-rule endpoint allows *only* that specific combination for non-admins.

### Flow B — HR Decides

| Step | What happens |
|------|--------------|
| 1 | Pending queue on Leave Management (and inside AI Decision Support's decision queue) |
| 2 | HR clicks Approve or Reject → `PATCH /api/leaves/{id}/status` or `PUT /api/leaves/{id}` |
| 3 | **If Approved:** backend deducts the days from `employees.leave_balances` (JSON column holding per-type remaining days) |
| 4 | Row updated: `status`, `approved_by`, `comments` |
| 5 | Notification created for the employee: approved/rejected |
| 6 | Bonus effect: approved leave dates protect the employee from being marked **Absent** in attendance (Module 7) |

> Notice how ONE approval touches THREE tables: `leaves` (status), `employees` (balance), `notifications` (message). That's normal and healthy.

### Tech Trail

- Endpoints: `POST /api/leaves`, `GET /api/leaves/employee/{id}`, `GET /api/leaves/balances/{id}`, `PATCH /api/leaves/{id}/status`, admin `GET /`, `PUT /{id}`, `DELETE /{id}`
- Tables: `leaves`, `employees.leave_balances`, `notifications`

---

## Module 10 — Overtime Requests

**What it is:** same lifecycle as leave, but for extra hours — plus a special reconciliation step that pushes approved OT into attendance and timesheets.

**Files:** `Employee` overtime UI within dashboard/requests, `HR_Manager` approvals, backend `OvertimeRequestController.php`, `OvertimeReconciliationService.php`

### Flow

| Step | What happens |
|------|--------------|
| 1 | Employee files: **date**, **expected_hours**, **reason** → `POST /api/overtime` → row with `status='Pending'`, `requested_date=today` |
| 2 | HR reviews (queue includes suggestions surfaced by the AI module) → approve/reject via `PATCH /api/overtime/{id}/status` |
| 3 | On approval the backend stamps `approved_by`, `approved_at`, and copies `approved_hours = expected_hours` |
| 4 | **Reconciliation runs:** `OvertimeReconciliationService` finds attendance rows for that employee/day and adjusts `overtime` hours; timesheets pick up `approved_ot_hours` |
| 5 | Notifications fired to the employee either way |
| 6 | Employee may **cancel** their own request while Pending (same dual-rule pattern as leave) |

Why reconciliation matters: without it, approved OT would live only in a request row and payroll numbers would disagree across pages. Reconciliation keeps `attendance.overtime`, `timesheets.approved_ot_hours`, and the request row telling the same story.

### How Overtime Is Actually Paid (Approved AND Worked)

Overtime is any time worked past the shift end (5:00 PM), but it is **paid only when it was approved — and only for the time actually worked**. Per day:

```
paid overtime  =  the SMALLER of  (overtime really worked that day)  and  (overtime approved for that day)
```

**How the day's hours are decided (server-side).** The server, not the kiosk screen, works out the hours. A day counts from clock-in to clock-out but **never past the end of the shift plus approved overtime**, so clocking out at 5:03 PM with no approval is recorded as 5:00 PM and adds no overtime. The real punch time is kept separately (`actual_clock_out`). A scheduled job (`attendance:recount-hours`, every minute) re-counts recent days, so **approving a request afterwards brings the minutes back** and cancelling it removes them again. Staying more than 15 minutes past the end with no approval also sends HR an "Unauthorized Overtime" alert.

| Situation | Worked past 5 PM | Approved | Paid OT |
|-----------|------------------|----------|---------|
| Stayed late **without** asking | 2 h | 0 | **0 h** — not counted at all (the record ends at 5:00 PM); HR is alerted if it was more than 15 min |
| Approved for 2 h, used all of it | 2 h | 2 h | 2 h |
| Approved for 2 h, left on time | 0 h | 2 h | **0 h** (an unused approval is not paid) |
| Approved for 2 h, stayed 3 h | 3 h | 2 h | **2 h** (capped at the approval) |
| Approved for 2 h, stayed 1 h | 1 h | 2 h | 1 h |

- Each weekly timesheet keeps three numbers: `overtime_hours` (worked), `approved_ot_hours` (approved) and **`paid_ot_hours`** (payable — the only overtime that counts). The HR Timesheets screen shows "**Xh not paid**" beside unapproved time, and the employee's timesheet shows "Xh paid · Yh not approved".
- **The kiosk warns the employee at clock-out**: if they clock out more than 15 minutes after the (approved) end with no approval covering it, an amber **"Overtime Not Approved"** popup says the extra time will **not be counted** unless HR approves it. The punch is still accepted — nobody is trapped at the door.
- **Approval can come after the fact.** An employee who worked late without asking can file a request for **any day in the past 7 days** (older dates go through HR, who can record any date). HR then decides; if approved, the timesheet is recalculated and the time becomes payable.

### Tech Trail

- Endpoints: `POST /api/overtime`, `GET /api/overtime/employee/{id}`, `PATCH /api/overtime/{id}/status`, admin list/delete
- Tables: `overtime_requests`, `attendance`, `timesheets`, `notifications`

---

## Module 11 — Timesheets (The Weekly Cycle)

**What it is:** automatic weekly hour summaries built from attendance, then reviewed by the employee and finalized by HR.

**Files:** `Employee/MyTimesheet.jsx`, `HR_Manager/Timesheets.jsx`, `components/timesheets/WorkflowParts.jsx`, backend `TimesheetController.php`, `TimesheetWorkflow.php`, `TimesheetGenerationService.php`, `AutoSubmitTimesheets.php`, `RemindAboutTimesheets.php`

### The Cycle (Draft → Submitted → Approved → Sent to payroll)

```
DURING THE WEEK
   Every clock-out refreshes the employee's timesheet (status Draft, hours counted by the server)
   │
   ▼  Sunday 23:59 (Manila) — the week is FINISHED
EMPLOYEE SUBMITS   (only possible once the week is over)
   Monday: the employee gets a "your timesheet is ready" notification
   → submits it → status "Submitted", submitted_at / submitted_by recorded
   → NOT submitted by Monday 12:00 PM? The system submits it for them ("auto-submitted");
     weeks with no hours are left alone
   │
   ▼
ADMIN REVIEWS   (the admin's queue opens on "Waiting for review")
   Warnings shown first: no clock-out, zero hours, overtime not fully paid, attendance changed after submission
   → Approve                       → status "Approved", reviewed_by / reviewed_at stamped
   → Reject (a REASON is required) → status "Rejected"; the employee sees the reason, fixes the cause
                                     (e.g. HR corrects attendance) and resubmits
   → Reopen (a REASON is required) → back to "Draft", hours refreshed from the latest attendance
   Nobody reviewed it for 2 days? The admins get one nudge.
   │
   ▼
SENT TO PAYROLL   (admin: "Send to payroll")
   Approved timesheets are downloaded as a file and marked as sent — each week goes only once,
   so it can never be paid twice. After that it can no longer be reopened.
```

**Every step is written to the timesheet's history** (who, when, and the reason), which the side panel shows as a timeline.

### Guardrails

| Rule | Enforced by |
|------|-------------|
| Only a **finished week** can be submitted, approved or rejected | `TimesheetWorkflow` (server) |
| Legal moves only: Draft/Rejected → Submitted (employee) · Submitted → Approved / Rejected (admin) · Submitted/Approved → Draft = reopen (admin) — nothing else | `TimesheetWorkflow` + `updateStatus` |
| Employee can only submit **their own** row; the admin cannot submit for them | Controller checks caller vs owner |
| Rejecting and reopening **need a reason** (at least a few words) | `TimesheetWorkflow` |
| **Hours are frozen once submitted.** If attendance changes afterwards the hours stay as reviewed, the row is flagged "changed after submission" and the admin reopens it to refresh | `TimesheetGenerationService` (`needs_refresh`) |
| **Hours cannot be typed in or edited** — they come from attendance; the admin can only add a note | `TimesheetController::update` |
| A submitted or approved timesheet **cannot be deleted**; a timesheet **sent to payroll cannot be reopened** | Controller / workflow (409) |
| Generation never duplicates | Idempotent refresh logic |
| A change made elsewhere (a punch, an overtime approval) reaches the timesheet within a minute or two: the payroll service rebuilds the last 6 weeks from its copy of attendance right after the copy refreshes | Scheduled command `timesheets:refresh` (every minute) |
| Unsubmitted finished weeks are submitted automatically at **Monday 12:00 PM (Manila)**; reminders and review nudges are sent once | Scheduled commands `timesheets:auto-submit`, `timesheets:remind` (hourly) |
| Compliance is visible: on-time submissions %, average time to review, number auto-submitted | Admin Timesheets page |

> **What a timesheet actually contains — hours, not money.** The row stores `regular_hours`, `overtime_hours` (what was *actually clocked*), `approved_ot_hours` (what was *approved via requests* — a reconciliation control, see Module 10), `break_hours`, and `total_hours`. There is **no rate, salary, or amount anywhere** — this system's job is to produce a trustworthy weekly block of *payable time*; multiplying it by a rate is the external payroll management system's step.

### Tech Trail

- Endpoints: admin `GET/POST/PUT/DELETE /api/timesheets*`; shared `GET /api/timesheets/employee/{id}`, `GET /api/timesheets/{id}`, `PATCH /api/timesheets/{id}/status`
- Tables: `timesheets`, `attendance` (source), `overtime_requests` (approved OT), `notifications`

---

## Module 12 — HR Dashboard & Analytics

**What it is:** the numbers layer. Dashboard = today's cockpit; Analytics = deep-dive charts.

**Files:** `HR_Manager/Dashboard.jsx`, `HR_Manager/Analytics.jsx`, backend `AnalyticsController.php`, `AnalyticsService.php`

**"Needs your attention"** sits at the top of the administrator's dashboard: four tiles (leave requests, overtime requests, early clock-outs, timesheets waiting for approval) with a count each and a link straight to the right page. When all four are zero it says "Nothing is waiting for you".

### What Each Attendance Status Means (One Record = One Status)

| Status | Meaning | Counts as "attended"? |
|--------|---------|-----------------------|
| **Present** | Clocked in on time (within 15 minutes of the start) | Yes |
| **Late** | Clocked in more than 15 minutes after the start | Yes |
| **Early Leave** | Left before the shift ended (replaces Present/Late on that day) | Yes |
| **Absent** | No clock-in and no approved leave | No |
| **On Leave** | Approved leave covers the day | Not counted against anyone |

**"Present" is a group with two parts: On Time and Late** (everyone who came in, whichever way). The dashboard draws it as **one Present bar split into two colours** — green On Time, amber Late — and the Present Today card shows the total with "X on time · Y late" underneath. **Early Leave stays its own category** (it is about leaving, not arriving), as do Absent and On Leave. Nothing is counted twice, and the stored status values are unchanged. The attendance rate is *attended ÷ (attended + absent)*, so approved leave never lowers it and someone who left early still counts as having come to work.

### How It Works (Cached Stats Pattern)

```
AnalyticsService queries raw tables (attendance, leaves, overtime_requests...)
   │
   ▼
Computes six prepared sections, stored in the `analytics` table as JSON:
   attendance_trend          headcounts present/late/early-leave/absent over time + attendance rate
   department_productivity   per-department comparison
   leave_trend               leave usage over time
   overtime_summary          OT volume and distribution
   punctuality_score         on-time percentage per employee/dept
   payroll_discrepancy       mismatches worth investigating
   │
   ▼
Dashboard/Analytics pages just fetch these prepared JSON blobs
(GET /api/analytics or /api/analytics/{section}) and draw charts
```

Why cached? Chart pages stay instant — heavy aggregation runs once through the service instead of on every page load.

### Tech Trail

- Endpoints: `GET /api/analytics`, `GET /api/analytics/{section}` (admin)
- Tables: `analytics` (read/write cache), everything else read-only sources

---

## Module 13 — Reports

**What it is:** read-only report builder — turn live data into printable documents or CSV exports.

> **Data leaves the system in only a few controlled places:** the Reports page (CSV / Excel / PDF), the timesheets "Send to payroll" file (each approved week only once), and the Audit Logs export. Other pages (Attendance, Analytics, Timesheets) no longer have their own export buttons, and employees can only print their own attendance and timesheets (Print / PDF).

**File:** `HR_Manager/Reports.jsx`, helpers in `utils/reportHelpers.js`

### Flow

| Step | What happens |
|------|--------------|
| 1 | Pick a report type (e.g., Attendance Report: columns Employee, Date, Clock In, Clock Out, Status, Regular Hrs, OT Hrs) |
| 2 | Pick filters (date range, department...) |
| 3 | Frontend fetches the relevant data through existing services |
| 4 | `reportHelpers.js` formats rows/columns/subtitles consistently |
| 5 | Preview renders → Print (browser print with print-specific CSS in `index.css`) or CSV download |

No writes happen here. Reports are a lens over the same tables everything else uses.

---

## Module 14 — AI Decision Support (The Two Brains)

**What it is:** the flagship module. It reads the last 30 days of real workforce activity and produces a health score, insights, and an actionable decision queue — using **Google Gemini** when available, or a built-in PHP rule engine when not.

**Files:** `HR_Manager/AIDecisionSupport.jsx`, backend `AIDecisionSupportController.php`, `AIDecisionSupportService.php`

### The Complete Flow

```
HR opens the page
        │
        ▼
GET /api/analytics/ai/insights                    (admin only)
        │
        ▼
STEP 1 — GATHER REAL DATA (PostgreSQL, last 30 days):
   attendance per employee (Present/Late/Absent counts)
   pending leave requests
   pending overtime requests
   shift coverage
   open security events (face_mismatch, pin_failed counts)
        │
        ▼
STEP 2 — CHOOSE A BRAIN
        │
        ├── Internet up AND GEMINI_API_KEY set?
        │        │
        │        YES → send structured JSON to Google Gemini API
        │              → Gemini returns natural-language insights as strict JSON
        │              → result marked  source: "ai"
        │              → invalid/unparseable reply? fall through ↓
        │
        └── NO (offline / no key / bad reply)
                 → run the built-in PHP rule engine
                   (deterministic thresholds, e.g.
                    repeated lates → warning,
                    open security events → attention)
                 → result marked  source: "rule-based"
        │
        ▼
STEP 3 — UNIFIED RESPONSE
   { healthScore, insights[], decisionQueue[], source }
   Both brains emit the SAME shape — the frontend doesn't care who answered
        │
        ▼
STEP 4 — RENDER
   Health score ring + insight cards + decision queue
   Source badge tells the truth about which engine ran:
     purple  "Powered by Gemini AI"    (source = ai)
     amber   "Gemini unavailable"      (online but API failed)
     red     "Offline"                 (no network at all)
```

### The Decision Queue (Insights → Actions)

Each insight can carry a suggested action. HR clicks once; the frontend calls `POST /api/analytics/ai/actions` with an `action` + target key. The controller executes real operations:

| Action | What the backend actually does |
|--------|-------------------------------|
| `approve_leave` / `reject_leave` | Same code path as LeaveManagement: validates the request is still Pending, updates status/approver/comments, deducts balance if approved, notifies employee |
| `approve_overtime` / `reject_overtime` | Updates the overtime request incl. `approved_hours`/`approved_at`, triggers reconciliation, notifies employee |
| `resolve_security_event` | Finds the event, requires it to still be `Open`, stamps `Resolved` + `resolved_by` + `resolved_at`, notifies |

### Memory — So Dismissed Insights Stay Dismissed

Resolved insight keys are saved into `settings.ai_resolved_insights` (JSON). Next time insights generate, anything already handled isn't nagged about again. The AI has a memory of what you've already dealt with.

### Two Honest Guarantees

1. **The AI never invents data.** It only receives what the database returned; it interprets, it doesn't imagine numbers.
2. **The system never depends on Gemini.** Kill the internet mid-demo and the page still works, clearly labeled as rule-based.

---

## Module 15 — Security Events

**What it is:** the audit log of anything suspicious at the kiosk, plus its resolution workflow.

**Table anatomy (`security_events`)**

| Column | Meaning |
|--------|---------|
| `type` | e.g., `face_mismatch`, `pin_failed` |
| `message` | Human-readable summary |
| `detail` | JSON evidence snapshot |
| `employee_id` | Who was involved (nullable) |
| `status` | `Open` → `Resolved` (or escalated for attention) |
| `resolved_at` / `resolved_by` | Audit stamp when closed |

### Lifecycle

```
Suspicious attempt at kiosk (wrong face / wrong PIN)
        │
        ▼
Event inserted, status = Open
        │
        ▼
For a face mismatch, every Workforce Admin ALSO gets an immediate
high-priority notification (bell + Notifications page, type
'security_face_mismatch') that deep-links here — they don't have to
wait until someone opens the security section
        │
        ▼
Surfaces in AI Decision Support security section
(counts feed the health score too)
        │
        ├── Resolve  → status Resolved + who/when stamped
        └── Escalate → flagged for further attention
```

Open events raise the system's concern level; resolving them restores the score. Nothing is ever silently deleted.

---

## Module 16 — Notifications

**What it is:** the system's internal mail. Any workflow that affects you drops a message; the bell icon shows the count.

**Files:** bell component in the layout, `constants/notificationTypes.js`, backend `NotificationController.php`

**Notifications page (`/notifications`, both roles):** the bell shows the newest 8; **See all notifications** opens the full page, with All / Unread / Important tabs, search, grouping by day, mark-all-read, delete and click-to-open.

**Who sees what:** the admins share one inbox (notifications with no employee attached). An employee sees **every** notification addressed to them — outcomes, reminders, shift changes, clock-in/out confirmations, certificate deadlines — and never the admins' or another employee's. The bell refreshes every 30 seconds while the tab is open; a failed refresh keeps what is already shown.

### Who Creates Notifications (Creation Points)

| Event | Notification to |
|-------|-----------------|
| Leave submitted | HR |
| Clock-in / clock-out (normal) | The employee only, low priority — "You clocked out at 5:00 PM. 8 hours counted." Not sent to HR, so the bell stays quiet |
| Late arrival, staying 15+ min past the end with no approval | HR |
| Leave approved/rejected | Employee |
| Overtime submitted | HR |
| Overtime approved/rejected | Employee |
| Timesheet approved/rejected | Employee |
| Clock-out reminder requested | Employee |
| Schedule published/changed | Affected employees (`schedule_change`) |
| Clocked in Late at the kiosk | HR — all admins (`attendance_late`) |
| **Every** early clock-out | HR — all admins (`early_clock_out`, deep-links to the Early Clock Outs tab), with the running count; high priority once the free allowance is exceeded |
| Early clock-outs past the free allowance / sick certificate overdue | Employee **and** HR (`early_leave_auto_unpaid`) |
| A SICK early clock-out needs proof | Employee (`early_leave_certificate_required`, with the deadline); HR when the proof is uploaded (`early_leave_proof_submitted`) |
| 3 employees leave early the same day with the same reason | HR (`early_clock_out_pattern`, high priority) |
| **Face mismatch at the kiosk** (someone clocking in as another person) | HR — all admins, **high priority** (`security_face_mismatch`, deep-links to AI Decision Support) |
| No-show / un-closed clock-in / unauthorized overtime / staffing shortage (dashboard alert scan) | HR — all admins (`attendance_absent`, `attendance_incomplete`, `attendance_unauthorized_ot`, `staff_shortage`) |

### Anatomy Of One Notification Row

`type` (icon/color mapping lives in `notificationTypes.js`), `title`, `message`, `timestamp`, `read` (true/false), `priority` (low default), `action_url` (deep-link), optional `employee_id`.

### Flow

```
Something happens → backend INSERTs a notification row
        │
        ▼
Bell refreshes every 30 s (only while the browser tab is visible,
and immediately when the tab is shown again)  → badge number
        │
        ▼
Open dropdown → GET /api/notifications/employee/{myId}
(both list endpoints return the newest 200)
        │
        ├── click one  → POST /api/notifications/{id}/read (+ navigate to action_url)
        └── "mark all" → POST /api/notifications/read-all
```

---

## Module 17 — Settings & Profile

**What it is:** app-wide configuration in one place, plus each user's personal preferences.

**Files:** `HR_Manager/Settings.jsx`, `Employee/Settings.jsx`, `Employee/MyProfile.jsx`, backend `SettingsController.php`

### The Single Settings Row

The `settings` table holds **one row** with grouped JSON columns — it is application configuration, not per-user data:

| Group | Holds |
|-------|-------|
| `company` | Company name/info shown across the app |
| `kiosk` | Kiosk mode state, PIN hash, location, device name, timezone, verification method |
| `system` | Date/time formats and other app-wide behavior |
| `ai_resolved_insights` | Memory of dismissed AI insights (Module 14) |

Reading is open to any authenticated user (employees need the `system` group for formatting); **writing is admin-only** (`PUT /api/settings`).

### Kiosk Endpoints Recap (Admin Device Controls)

`POST /api/kiosk/config` · `POST /api/kiosk/pin` · `POST /api/kiosk/reset`

### Employee Self-Service Profile

Profile and Settings are separate pages. **My Profile** (`/my-profile`) answers "who am I"; **Settings** answers "how the app behaves for me" (password + appearance).

`GET /api/profile` loads your own record with **salary, face photo and face template hidden**; `PUT /api/profile` updates only phone, address, emergency contact/phone and the profile photo. Phones must match digits/+/()/-/spaces (7–20 chars), the photo must be a small image (data URL under ~500 KB), otherwise the server answers 422 with per-field messages. You cannot change your own salary, department, or employment status — those belong to the admin. The old "My Pay Record" page and its payroll endpoint were removed; payroll keeps only timesheets.

---

## Module 18 — Network Awareness (Small But Nice)

The frontend watches connectivity via a dedicated hook (`useNetworkStatus.js`):

- Topbar shows a green **Online** / red **Offline** badge in real time
- Pages that need external services (like AI) show contextual banners
- When the connection returns, the UI recovers automatically

It's honest UX: the app tells you what it can and cannot reach right now.

---

# PART 3 — REFERENCE

## 19. Module ↔ Database Map

Which tables each module touches (R = read, W = write). This map is logical — it hasn't changed since the microservices split, because every table still conceptually belongs to exactly one module. What changed is *where* the row physically lives: `employees`, for example, is the real table inside `core`'s `workforce_mgnt` database, but `attendance`, `scheduling`, `timeoff`, `payroll`, and `intelligence` each keep their own **read-only replica** of it (synced via `SnapshotSyncService`) so they don't have to call `core` on every request. An `R` in a service that doesn't own the table almost always means "reads its local replica," not "reaches across the network."

| Module | users | employees | departments | roles | shift_def | shift_sched | attendance | leaves | ot_req | timesheets | notifications | sec_events | settings | analytics |
|--------|:----:|:---------:|:-----------:|:-----:|:---------:|:-----------:|:----------:|:------:|:------:|:----------:|:-------------:|:----------:|:--------:|:---------:|
| Auth | RW | R | | | | | | | | | | | | |
| Employees/Registration | W | RW | R | R | | | | | | | | | | |
| Kiosk Setup | | | | | | | | | | | W | RW | RW | |
| Kiosk Terminal | | R | | | R | R | RW | R | | | | W | | |
| Employee Dashboard | | R | | | R | R | R | R | R | R | R | | | |
| My Attendance | | R | | | | | R | | | | W | | | |
| HR Attendance | | R | | | R | R | RW | R | | | | | | |
| Shifts | | R | | | R | RW | | | | | | | | |
| Leave (both sides) | | RW | | | | | R | RW | | | RW | | | |
| Overtime (both sides) | | | | | | | RW | | RW | RW | RW | | | |
| Timesheets | | R | R | | | | R | | R | RW | RW | | | |
| Dashboard/Analytics | | R | R | | | | R | R | R | | | | | RW |
| Reports | | R | | | | | R | R | R | R | | | | |
| AI Decision Support | | R | | | | | R | RW | RW | | W | RW | RW | R |
| Security Events | | R | | | | | | | | | W | RW | | |
| Notifications | | | | | | | | | | | RW | | | |
| Settings/Profile | W | RW | | | | | | | | | | | RW | |

## 20. Status Vocabulary (Cheat Sheet)

| Area | Possible values | Who can move them |
|------|-----------------|-------------------|
| Attendance daily status | `Present` · `Late` · `Absent` · `Early Leave` | Computed by the **server** at the kiosk punch (15-min grace, inclusive; 60-min absent grace); admin can correct manually |
| Early clock-out record | Reason `provided` by employee at kiosk; classification `Pending Review` → `Excused (Sick)` / `Excused (Emergency)` / `Excused (Early Leave)` / `Unpaid` | Employee edits own reason; Admin classifies — punch snapshot is immutable |
| Leave request | `Pending` → `Approved` / `Rejected`; employee may `Cancel` while Pending | Employee: apply/cancel own. Admin: approve/reject |
| Overtime request | `Pending` → `Approved` / `Rejected`; `Cancel` while Pending | Same split as leave |
| Timesheet | Generated awaiting review → `Submitted` (by employee) → `Approved` / `Rejected` (by admin) | Employee: submit own once. Admin: finalize |
| Shift assignment | `Scheduled` | Admin manages |
| Security event | `Open` → `Resolved` / escalated-flagged | Admin resolves |
| Employee record | `Active` (default) etc. | Admin |

## 21. Magic Numbers Worth Memorizing

| Number | Meaning |
|--------|---------|
| 15 min | Grace period after shift start before a clock-in counts as Late |
| 60 min | Absence grace before "no show" becomes Absent; also the "very early" threshold for warnings |
| 60 sec | Kiosk lockout duration after repeat face-mismatch strikes |
| 30 days | Lookback window the AI analyzes |
| 5 taps | Secret rhythm to summon the kiosk PIN prompt |
| 1/day | Rate limit on self "remind me to clock out" nudges |
| 3 strikes | Face mismatches before the terminal locks |
| 0.6 | Face-match distance threshold (below = same person) |
| 15 s | How long a service reuses `core`'s "who is this token?" answer |
| 15 alerts | Most no-show/overtime alerts one dashboard scan sends |
| 2 per 30 days | Free early clock-outs per rolling window — the 3rd is unexcused automatically (editable in Settings) |
| 48 hours | Deadline to upload a medical certificate for a SICK early clock-out (editable in Settings) |
| 3 employees | Same reason, same day = "possible early-leave pattern" alert |
| 7 days | How far back an employee can file an overtime request for a day already worked |
| 200 | Newest notifications returned per list |
| 35 days | Attendance window the HR Dashboard requests |
| 1 s / 3 s | Connect / total timeout for notification and audit calls |
| 45 s | Frontend request timeout (the servers cut requests off at ~30 s) |

## 22. File Map — Where Everything Lives

```
Workforce MGNT/
├── full project reviewer/               ← docs (you are here)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── auth/                 Login, ForgotPassword, ResetPassword
│   │   │   ├── HR_Manager/           Dashboard, Employees, EmployeeRegistration,
│   │   │   │                         Attendance, LeaveManagement, Shifts,
│   │   │   │                         Timesheets, Reports, Analytics,
│   │   │   │                         AIDecisionSupport, Settings
│   │   │   ├── Employee/             EmployeeDashboard, MyAttendance, MySchedule,
│   │   │   │                         Leave, MyTimesheet, Settings
│   │   │   └── KIOSK/                KioskSetup, AttendanceTerminal
│   │   ├── components/               shared UI: layout, modals, tables, FaceRecognitionModal,
│   │   │                             attendance/FaceScanOverlay (face-shaped scan animation)
│   │   ├── hooks/useNetworkStatus.js online/offline detection
│   │   ├── services/api.js           ★ ALL backend communication lives here
│   │   │   services/http.js          shared axios client (token, kiosk token, 45 s timeout)
│   │   │   services/faceMatchService.js  face-api.js: model load + warm-up + descriptor
│   │   ├── context/                  AuthContext (session), Toast, Theme
│   │   ├── constants/                notificationTypes, colors...
│   │   ├── utils/                    reportHelpers, helpers (timezone-safe math)
│   │   └── App.jsx                   URL → page routing map
│   ├── vite.config.js                ★ THE ROUTER — proxies each /api/* prefix
│   │                                     to the service port that owns it
│   └── package.json
├── backend/                           ★ 8 INDEPENDENT LARAVEL APPS — one per domain,
│   │                                     each with its own vendor/, .env, artisan
│   ├── core/                  :8000  auth, employees, departments, roles
│   │   ├── app/Http/Controllers/Api/ AuthController, EmployeeController,
│   │   │                             DepartmentController, RoleController,
│   │   │                             InternalApiController
│   │   ├── routes/api.php            entry point → routes/services/{auth,identity}.php
│   │   ├── routes/internal.php       /internal/* — SERVICE_TOKEN-guarded, called by peers
│   │   ├── app/Support/ServiceRegistry.php   service catalog (php artisan services:list)
│   │   └── database/migrations/      users, employees, departments, roles, ...
│   ├── intelligence/           :8001  analytics + AI decision support
│   │   ├── app/Http/Controllers/Api/ AnalyticsController, AIDecisionSupportController
│   │   ├── app/Services/             AnalyticsService, AIDecisionSupportService,
│   │   │                             SnapshotSyncService, AttendanceClient,
│   │   │                             TimeoffClient, ConfigClient, NotificationClient
│   │   ├── app/Http/Middleware/      SyncSnapshot (refreshes the local replica),
│   │   │                             EnsureServiceAuthenticated (asks core who this token is)
│   │   └── database/migrations/      its own schema + replica tables
│   ├── attendance/              :8003  attendance records + the kiosk terminal
│   ├── scheduling/               :8004  shift templates + shift schedules
│   ├── timeoff/                   :8005  leave requests + overtime requests
│   ├── payroll/                   :8006  timesheets
│   ├── communications/       :8007  notifications
│   ├── configuration/          :8008  settings + kiosk configuration
│   └── _templates/                    scaffolding used to stamp out a new service
│          scaffold.ps1, SnapshotSyncService.php, *Client.php, replicas/*.php
│          (copied into a new service and customized — not run directly)
│
│   Every service above follows the same internal shape:
│      app/Http/Controllers/Api/     its own controllers
│      app/Services/                 business logic + any *Client.php it needs to
│                                     call other services, + SnapshotSyncService
│                                     if it keeps replica tables
│      app/Models/                   its own tables + read-only replica models
│      routes/api.php                entry point for this service
│      routes/services/<name>.php    the actual user-facing routes (svc.auth + admin
│                                     middleware)
│      routes/internal.php           /internal/* machine-to-machine routes
│      database/migrations/          this service's own schema
│      tests/                        this service's own offline test suite
│      .env                          DB credentials for ITS OWN database, plus
│                                     AUTH_SERVICE_URL, SERVICE_TOKEN, SVC_AUTH_MODE
├── docker-compose.yml               Docker: the conductor's sheet for all 15 containers (see Start Here §10)
├── docker/                          Docker recipes: backend.Dockerfile (all 8 services), frontend.Dockerfile,
│                                     nginx.conf (the /api routing table), backend-entrypoint.sh (runs migrations),
│                                     postgres-init/ (creates the 8 databases)
├── .env.docker.example              template for the git-ignored .env that holds Docker's secrets
├── start-all.ps1                     boots all 8 services + the frontend, health-checks /up
└── stop-all.ps1                      stops everything start-all.ps1 started
```

## 23. The Universal Debugging Recipe

When something looks wrong on any screen:

```
1. WHICH PAGE?    Find the .jsx file (Section 22 map).
2. WHICH CALL?    Search that file's service call in frontend/src/services/api.js
                  → note the exact HTTP method + URL.
3. WHICH SERVICE? Match the URL prefix to a service using vite.config.js's proxy
                  map (Part 1, Section 3) — that tells you the port AND the
                  backend/<name>/ folder to open. There is no gateway anymore:
                  the prefix maps straight to one Laravel app.
4. READ LOGIC.    cd backend/<name> → open routes/services/<name>.php to find the
                  controller → read the controller, usually delegating to a
                  Services/ class.
5. STALE, NOT WRONG? If the data looks outdated rather than incorrect, check
                  whether that field comes from a replica table (synced
                  periodically via SnapshotSyncService) instead of the owning
                  service's live table.
6. CHECK DATA.    Verify the actual rows in pgAdmin, in THAT service's database
                  (see Database System Tutorial And Guideline.md) — remember each
                  service has its own database now, not one shared one.
```

Nine times out of ten the bug is one of: stale frontend state (refresh), wrong role permissions (403), validation rejecting input (check the toast/network tab), a service that's simply not running (check `start-all.ps1`'s health check), or unexpected data shapes in the table.

---

## Summary Card

> **Frontend** draws screens, validates for convenience, never touches SQL — and its Vite dev proxy is the only thing that knows where all 8 services live.
> **`core` (:8000)** is the identity service: auth, employees, departments, roles. Every other service asks `core` "who owns this token?" over HTTP instead of keeping its own password table.
> **The other 7 services** (`intelligence`, `attendance`, `scheduling`, `timeoff`, `payroll`, `communications`, `configuration`) are equally real microservices — own process, own port, own PostgreSQL database, own tests. None of them share a database with each other or with `core`.
> **Cross-service data** moves one of two ways: periodic **snapshot replication** for read-mostly reference data (e.g. `attendance`'s local copy of `Leave`), or a direct **internal API call** through a dedicated `*Client` class when the write has to happen right now (e.g. `intelligence` approving a leave through `TimeoffClient`, any service raising a notification through `NotificationClient`).
>
> **Kiosk** verifies faces in-browser, and its rules are enforced by the `attendance` **server** (no shift or finished shift = refused; up to 15 min after start = Present, later = Late with a warning; leaving early needs a reason). A face mismatch is logged and alerts the Workforce Admins.
> **Performance rules** keep the split system fast: a 15-second identity cache, replicas that carry the face *descriptor* but not the photo, concurrent replica pushes, bounded lists, short timeouts on non-critical calls (Part 1, *Keeping It Fast And Safe*).
> **Requests** (leave/OT) follow one pattern: apply → Pending → decide → notify (+ balance/reconciliation side effects) — now spanning `timeoff`, `attendance`, and `communications` instead of one app.
> **Timesheets** are born automatically from attendance and end locked after HR approval — `payroll` pulls attendance data via replica, not a live cross-database join.
> **AI** (`intelligence`) reads a replicated snapshot of workforce data, answers with whichever brain is available (Gemini or the rule-based fallback), acts on other services through their internal APIs, and remembers what you've resolved.
