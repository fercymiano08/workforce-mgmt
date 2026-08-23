# System Workflow Guide

> The complete, beginner-friendly walkthrough of the **AI-Enhanced Workforce Management System**.
> Every module, every screen, every flow — explained step by step, from the button you click down to the database row it creates.
>
> Pair this with **Database System Tutorial And Guideline.md** (table details) and the two `.drawio` flowchart references (visual diagrams).

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

# PART 1 — ORIENTATION

## 1. The Big Picture

```
┌──────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                          │
│                                                              │
│   React 19 + Vite + Tailwind CSS      http://localhost:5173  │
│   Draws every screen. Knows NOTHING about SQL.               │
└───────────────────────────┬──────────────────────────────────┘
                            │  HTTP requests carrying JSON
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      LARAVEL BACKEND                         │
│                                                              │
│   PHP API server                    http://127.0.0.1:8000    │
│   Routes → Middleware → Controllers → Services               │
│   Checks identity, checks permission, applies business rules │
└───────────────────────────┬──────────────────────────────────┘
                            │  SQL queries
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                       │
│                                                              │
│   workforce_mgnt @ 127.0.0.1:5432                            │
│   23 tables (14 business + 9 Laravel plumbing)               │
│   Remembers everything permanently                           │
└──────────────────────────────────────────────────────────────┘
```

> **One sentence:** the browser shows pages and sends requests; the backend checks *who you are*, checks *what you're allowed to do*, applies the business rules; the database stores the result forever.

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

> Note: the system was designed with an "HR Manager" role in mind, but in the current deployment the Administrator account performs all HR duties. There is currently no separate HR Manager account.

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
| 10 | Timesheets `HR_Manager/Timesheets.jsx` | Admin | Review and approve weekly hour totals |
| 11 | Reports `HR_Manager/Reports.jsx` | Admin | Build printable/CSV reports from live data |
| 12 | Analytics `HR_Manager/Analytics.jsx` | Admin | Deep charts: trends, punctuality, productivity |
| 13 | AI Decision Support `HR_Manager/AIDecisionSupport.jsx` | Admin | AI-generated insights + one-click decision queue |
| 14 | Settings `HR_Manager/Settings.jsx` | Admin | Company info, kiosk configuration, system options |
| 15 | Employee Dashboard `Employee/EmployeeDashboard.jsx` | Employee | Personal home: today's status, quick stats, ID card header |
| 16 | My Attendance `Employee/MyAttendance.jsx` | Employee | Own clock history and hours |
| 17 | My Schedule `Employee/MySchedule.jsx` | Employee | Upcoming assigned shifts |
| 18 | Leave `Employee/Leave.jsx` | Employee | Apply for leave, track status, see balances |
| 19 | My Timesheet `Employee/MyTimesheet.jsx` | Employee | Review own weekly hours and submit them |
| 20 | Profile / Settings `Employee/Settings.jsx` | Employee | Edit own contact info, change password |
| 21 | Kiosk Setup `KIOSK/KioskSetup.jsx` | Admin (device) | Configure and lock the entrance tablet into kiosk mode |
| 22 | Attendance Terminal `KIOSK/AttendanceTerminal.jsx` | Employees at door | The clock-in/clock-out device itself |

---

## 3. Anatomy Of One Request

What happens, in order, whenever any page loads data. Example: the Employee Dashboard loading attendance history.

| Step | Where | What happens |
|------|-------|--------------|
| 1 | `EmployeeDashboard.jsx` | Page mounts (opens) and calls `attendanceService.getByEmployeeId("EMP20260001")` |
| 2 | `services/api.js` | The service turns that into a real HTTP request: `GET http://127.0.0.1:8000/api/attendance/employee/EMP20260001`, attaching the logged-in user's **token** |
| 3 | `routes/api.php` | Laravel matches the URL to `AttendanceController@byEmployee`. **Middleware runs first**: is the token valid? Is this role allowed? |
| 4 | `AttendanceController.php` | Reads the employee ID, asks the model for the data |
| 5 | PostgreSQL | Runs roughly: `SELECT * FROM attendance WHERE employee_id = 'EMP20260001' ORDER BY date DESC` |
| 6 | Back up the chain | Rows become JSON → travel back → `api.js` receives them → React state updates → the UI renders |

Saving works the same way in reverse: form submit → `POST` request → controller validates input → `INSERT`/`UPDATE` query → success JSON → green toast appears on screen.

> **Debugging rule of thumb:** find the page file → find which service function it calls in `api.js` → find the matching URL in `routes/api.php` → read that controller. That chain explains 95% of any behavior you see.

---

## 4. Rules That Apply Everywhere

These few global rules shape every module. Keep them in mind while reading Part 2.

### 4.1 Timezone Rule

All shift times, clock-ins, and clock-outs are **wall-clock times in Asia/Manila (UTC+8)**. The system never converts an employee's clock time to another timezone. Overnight shifts are handled so that hour math always comes out positive.

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

**Files:** `auth/Login.jsx`, `auth/ForgotPassword.jsx`, `auth/ResetPassword.jsx`, backend `AuthController.php`

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
Backend creates a one-time reset token
→ stores it in the `password_reset_tokens` table
        │
        ▼
User submits new password + token
        │
        ▼
POST /api/auth/reset-password
→ token checked and consumed
→ users.password updated (hashed)
→ old tokens invalidated
```

### Flow C — Change Password (while logged in)

Profile/settings page → `POST /api/auth/change-password` → verifies current password first → hashes and stores the new one.

### Tech Trail

- Endpoints: `/api/auth/login`, `/logout`, `/me`, `/forgot-password`, `/reset-password`, `/change-password`
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

> Why store a *descriptor* instead of just a photo? Comparing two descriptors (just numbers) is fast and happens right in the kiosk browser — no face image ever needs to leave the device during verification.

### Tech Trail

- Endpoints: `GET/POST /api/employees`, `GET/PUT/DELETE /api/employees/{id}`, `POST /api/employees/{id}/face`
- Tables: `employees` (center), `users` (login link)

---

## Module 3 — Kiosk Setup (Admin Configures The Device)

**What it is:** the admin screen that turns an ordinary tablet/PC at the entrance into a locked-down time clock.

**File:** `KIOSK/KioskSetup.jsx`, backend `SettingsController.php`, `KioskController.php`

### What You Can Do

| Setting | Purpose |
|---------|---------|
| Enable/disable Kiosk Mode | Locks the entrance device to ONLY the clock screen |
| Set a 4-digit kiosk PIN | Required to exit kiosk mode later (stored **hashed** in `settings.kiosk`) |
| Location / Device Name / Timezone | Labels the device and anchors time math |
| Verification Method | Face recognition vs other methods |
| Reset Kiosk | Wipes kiosk state back to defaults |

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

- Endpoints: `POST /api/kiosk/config`, `/api/kiosk/pin`, `/api/kiosk/reset` (admin), `GET /api/kiosk/config` (public read of safe fields), `POST /api/kiosk/verify-pin` (public)
- Tables: `settings` (kiosk JSON), `security_events`

---

## Module 4 — The Kiosk Terminal (Clock In / Clock Out)

**What it is:** the heart of the attendance system. The most security-critical flow in the product.

**Files:** `KIOSK/AttendanceTerminal.jsx`, `FaceRecognitionModal` component, backend `KioskController.php`

> The kiosk device is NOT a logged-in user — its endpoints under `/api/kiosk/...` are intentionally public. They are built to return **minimal fields only** (name, photo, department, today's schedule). Salaries, emails, phone numbers, addresses never cross these endpoints.

### The Full Clock-In Journey, Step By Step

| Step | Actor | What happens |
|------|-------|--------------|
| 1 | Employee | Types their employee ID on the keypad |
| 2 | Terminal | Looks up the ID → shows **"Is this you?"** with photo, name, department |
| 3 | Employee | Confirms identity |
| 4 | Terminal | Opens the camera and runs **face-api.js**: compares the live camera frame against the stored `face_descriptor`. All comparison happens **inside the browser** — fast and private |
| 5 | Terminal | Match? Continue. Mismatch? → see the security flow below |
| 6 | Terminal | Runs the **smart pre-checks** (next section) before recording anything |
| 7 | Terminal | Sends the verified result: `POST /api/kiosk/attendance` (clock-in) or `PUT /api/kiosk/attendance/{id}` (clock-out) |
| 8 | Backend | Final business rules: duplicate check, Late/On-Time computation, hours math |
| 9 | Database | One row written/updated in `attendance`; event noted in `security_events` |
| 10 | Terminal | Green success screen showing the recorded time and status — visible immediately afterward in the HR Attendance page and the employee's My Attendance |

### Smart Pre-Checks (Before Anything Is Recorded)

The terminal refuses or warns in several situations — this is what makes the kiosk "smart":

| Situation | Terminal behavior |
|-----------|-------------------|
| Already clocked in, pressing Clock In again | Blocked — suggests Clock Out instead |
| Clock Out pressed but no clock-in exists today | Blocked — suggests Clock In |
| **No shift scheduled today** | Clock-in refused — "check your schedule with HR" |
| Shift already ended | Clock-in refused — "contact HR" |
| More than **15 minutes late** | Warning shown: "this will be recorded as **Late**" → employee must acknowledge with "Clock In Anyway" |
| Clocking in more than **60 minutes early** | Gentle warning ("Very Early") → acknowledge to continue |
| **Clocking out before the shift ends** | Rejected outright — "please return to your post" (unless approved overtime extends the shift end — the terminal knows and allows it) |

### Face Mismatch → Strikes → Lockout

```
Face does not match the registered descriptor
        │
        ▼
Attempt blocked. Security event written:
type = 'face_mismatch', status = 'Open', employee_id attached
        │
        ▼
Strike counter increases. Repeat offenses →
terminal locks for 60 seconds (countdown shown)
        │
        ▼
Message explains: "Clocking in under another person's ID is a
security violation. Please see HR if you believe this is a mistake."
```

Every one of these events surfaces later in the **Security Events** area of AI Decision Support for HR to resolve or escalate (Module 17).

### Clock-Out Math

When clocking out, the terminal/backend computes and stores on the attendance row: `regular_hours`, `overtime`, `break_hours`, `total_hours` (using the same helper the timesheet generator uses — one source of truth).

### Tech Trail

- Endpoints: `GET /api/kiosk/employees` (directory of minimal fields), `GET /api/kiosk/schedule/{employeeId}` (today's shift), `GET /api/kiosk/attendance/{employeeId}` (today's record), `POST /api/kiosk/attendance`, `PUT /api/kiosk/attendance/{id}`, `POST /api/kiosk/log`
- Tables: `employees` (read minimal), `shift_schedules` (read today), `attendance` (write), `security_events` (write)

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

- See every past day: date, clock-in, clock-out, status (**Present / Late / Absent**), regular/OT/break/total hours
- Filter by period; spot patterns in your own punctuality
- Nudge yourself: a daily self-reminder if you forgot to clock out

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

- Endpoints: `GET /api/attendance/employee/{employeeId}`, `POST /api/attendance/remind-clock-out`
- Tables: `attendance` (read), `notifications` (write)

---

## Module 7 — Attendance Administration (HR Side)

**What it is:** the administrator's control room over everyone's daily records.

**File:** `HR_Manager/Attendance.jsx`

### What You Can Do

| Feature | Endpoint | Notes |
|---------|----------|-------|
| View all records, filter by date | `GET /api/attendance/date/{date}` | Whole company for one day |
| Manually add a record | `POST /api/attendance` | e.g., someone forgot both punches |
| Correct a record | `PUT /api/attendance/{id}` | Fix times/hours; audit-friendly |
| Remove a bad record | `DELETE /api/attendance/{id}` | |
| Run alert checks | `GET /api/attendance/alerts/check` | Flags anomalies like missed clock-outs |

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

### Tech Trail

- Tables: `attendance` (read/write), `shift_schedules`, `shift_definitions`, `leaves` (context for decisions)

---

## Module 8 — Shift Definitions & Scheduling

**What it is:** two connected pieces — the **templates** (what a shift is) and the **assignments** (who works which template on which day).

**Files:** `HR_Manager/Shifts.jsx`, backend `ShiftController.php`

### The Four Shift Templates (`shift_definitions`)

| Code | Name | Hours |
|------|------|-------|
| SHIFT001 | Morning | 06:00 – 14:00 |
| SHIFT002 | Mid | 10:00 – 18:00 |
| SHIFT003 | Night | 14:00 – 22:00 |
| SHIFT004 | Flexible | 08:00 – 17:00 |

> SHIFT004 *is* the office "8-to-5". Templates are reference data — every employee can read them; only the admin can build assignments.

### Flow A — Building A Week (Generate Wizard)

| Step | What happens |
|------|--------------|
| 1 | Admin picks a date range + which template(s) and employees |
| 2 | `POST /api/shifts/schedules/generate` |
| 3 | Backend loops the range × employees and inserts `shift_schedules` rows: `employee_id`, `employee_name`, `shift_id`, `date`, `status = 'Scheduled'` |
| 4 | Existing rows in the range are refreshed rather than duplicated (idempotent) |

### Flow B — Manual Adjustments

Single rows can be created (`POST /api/shifts/schedules`), edited (`PUT .../{id}`), or removed (`DELETE .../{id}`). Swaps are just edits.

### Flow C — Employee Sees Their Schedule

`GET /api/shifts/schedules/employee/{employeeId}` → My Schedule page renders upcoming shifts joined with template names/times/colors.

### Why Schedules Matter Everywhere Else

The schedule is not decoration. It drives: kiosk clock-in validation (Module 4), Late/Present computation (Module 7), timesheet expectations, and coverage analysis in Analytics/AI.

### Tech Trail

- Endpoints: `GET /api/shifts` (templates, any user); admin CRUD on `/api/shifts/schedules*`
- Tables: `shift_definitions` (read), `shift_schedules` (write/read)

---

## Module 9 — Leave Requests (Apply → Approve → Balance Deduction)

**What it is:** the full lifecycle of time-off: employee applies, admin decides, balances update, everybody gets notified.

**Files:** `Employee/Leave.jsx`, `HR_Manager/LeaveManagement.jsx`, backend `LeaveController.php`

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

### Tech Trail

- Endpoints: `POST /api/overtime`, `GET /api/overtime/employee/{id}`, `PATCH /api/overtime/{id}/status`, admin list/delete
- Tables: `overtime_requests`, `attendance`, `timesheets`, `notifications`

---

## Module 11 — Timesheets (The Weekly Cycle)

**What it is:** automatic weekly hour summaries built from attendance, then reviewed by the employee and finalized by HR.

**Files:** `Employee/MyTimesheet.jsx`, `HR_Manager/Timesheets.jsx`, backend `TimesheetController.php`, `TimesheetGenerationService.php`

### The Cycle

```
Week ends
   │
   ▼
GENERATION (automatic, idempotent)
   For every employee with completed attendance that week:
   sum regular_hours, overtime, break, total
   → INSERT/refresh one `timesheets` row
     id format TS001, TS002...
     week_start / week_end stamped
   │
   ▼
EMPLOYEE REVIEW
   Employee opens My Timesheet, checks the totals
   → submits it (their own row only): PATCH /api/timesheets/{id}/status
   → status becomes "Submitted", submitted_date = today
   (once submitted, the employee can no longer change it)
   │
   ▼
HR DECISION
   Admin reviews totals (including approved OT from Module 10)
   → Approved  → approved_by stamped, notification sent
   → Rejected  → comments required, notification sent
   │
   ▼
LOCKED
   Approved timesheets are final references for payroll reporting
```

### Guardrails

| Rule | Enforced by |
|------|-------------|
| Employee can only ever submit **their own** row, and only while it's still awaiting review | Controller checks caller vs row owner inline |
| Submitted rows freeze for employees | Status check before allowing changes |
| Admin can set any status | `admin` middleware group |
| Generation never duplicates | Idempotent refresh logic |

### Tech Trail

- Endpoints: admin `GET/POST/PUT/DELETE /api/timesheets*`; shared `GET /api/timesheets/employee/{id}`, `GET /api/timesheets/{id}`, `PATCH /api/timesheets/{id}/status`
- Tables: `timesheets`, `attendance` (source), `overtime_requests` (approved OT), `notifications`

---

## Module 12 — HR Dashboard & Analytics

**What it is:** the numbers layer. Dashboard = today's cockpit; Analytics = deep-dive charts.

**Files:** `HR_Manager/Dashboard.jsx`, `HR_Manager/Analytics.jsx`, backend `AnalyticsController.php`, `AnalyticsService.php`

### How It Works (Cached Stats Pattern)

```
AnalyticsService queries raw tables (attendance, leaves, overtime_requests...)
   │
   ▼
Computes six prepared sections, stored in the `analytics` table as JSON:
   attendance_trend          headcounts present/late/absent over time
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

### Who Creates Notifications (Creation Points)

| Event | Notification to |
|-------|-----------------|
| Leave submitted | HR |
| Leave approved/rejected | Employee |
| Overtime submitted | HR |
| Overtime approved/rejected | Employee |
| Timesheet approved/rejected | Employee |
| Clock-out reminder requested | Employee |
| Schedule published/changed | Affected employees (`schedule_change`) |
| Marked Late | Employee (`attendance_late`) |
| Security event activity | HR |

### Anatomy Of One Notification Row

`type` (icon/color mapping lives in `notificationTypes.js`), `title`, `message`, `timestamp`, `read` (true/false), `priority` (low default), `action_url` (deep-link), optional `employee_id`.

### Flow

```
Something happens → backend INSERTs a notification row
        │
        ▼
Bell polls GET /api/notifications/unread-count  → badge number
        │
        ▼
Open dropdown → GET /api/notifications/employee/{myId}
        │
        ├── click one  → POST /api/notifications/{id}/read (+ navigate to action_url)
        └── "mark all" → POST /api/notifications/read-all
```

---

## Module 17 — Settings & Profile

**What it is:** app-wide configuration in one place, plus each user's personal preferences.

**Files:** `HR_Manager/Settings.jsx`, `Employee/Settings.jsx`, backend `SettingsController.php`

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

`GET /api/profile` loads your own record; `PUT /api/profile` updates your contact details (phone, address, emergency contact...). You cannot change your own salary, department, or employment status — those belong to the admin.

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

Which tables each module touches (R = read, W = write):

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
| Attendance daily status | `Present` · `Late` · `Absent` | Computed by the system (15-min grace, 60-min absent grace); admin can correct manually |
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

## 22. File Map — Where Everything Lives

```
Workforce MGNT/
├── project full document/            ← docs (you are here)
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
│   │   ├── components/               shared UI: layout, modals, tables, FaceRecognitionModal
│   │   ├── hooks/useNetworkStatus.js online/offline detection
│   │   ├── services/api.js           ★ ALL backend communication lives here
│   │   ├── context/                  AuthContext (session), Toast, Theme
│   │   ├── constants/                notificationTypes, colors...
│   │   ├── utils/                    reportHelpers, helpers (timezone-safe math)
│   │   └── App.jsx                   URL → page routing map
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── Http/Controllers/Api/     AuthController, EmployeeController,
│   │   │                             AttendanceController, KioskController,
│   │   │                             LeaveController, OvertimeRequestController,
│   │   │                             ShiftController, TimesheetController,
│   │   │                             NotificationController, AnalyticsController,
│   │   │                             AIDecisionSupportController,
│   │   │                             DepartmentController, RoleController,
│   │   │                             SettingsController
│   │   ├── Services/                 AIDecisionSupportService, AnalyticsService,
│   │   │                             TimesheetGenerationService,
│   │   │                             OvertimeReconciliationService
│   │   └── Models/                   one per table
│   ├── routes/api.php                ★ every endpoint listed here
│   ├── database/migrations/          table definitions
│   ├── tests/                        automated checks (137 tests)
│   └── .env                          secrets: DB credentials, GEMINI_API_KEY
└── start.bat                         one-click launcher
```

## 23. The Universal Debugging Recipe

When something looks wrong on any screen:

```
1. WHICH PAGE?    Find the .jsx file (Section 22 map).
2. WHICH CALL?    Search that file's service call in services/api.js
                  → note the exact HTTP method + URL.
3. WHICH ROUTE?   Find the URL in backend/routes/api.php
                  → note which controller + whether it's admin-gated.
4. READ LOGIC.    Open the controller → the business rules are right there,
                  usually delegating heavy lifting to a Service class.
5. CHECK DATA.    Verify the actual rows in pgAdmin
                  (see Database System Tutorial And Guideline.md).
```

Nine times out of ten the bug is one of: stale frontend state (refresh), wrong role permissions (403), validation rejecting input (check the toast/network tab), or unexpected data shapes in the table.

---

## Summary Card

> **Frontend** draws screens, validates for convenience, never touches SQL.
> **Backend** is the gatekeeper and brain: authenticates tokens, enforces roles twice, applies every business rule, orchestrates Gemini.
> **Database** remembers everything: 14 business tables + 9 plumbing tables.
>
> **Kiosk** verifies faces in-browser, refuses impossible punches, logs anything suspicious.
> **Requests** (leave/OT) follow one pattern: apply → Pending → decide → notify (+ balance/reconciliation side effects).
> **Timesheets** are born automatically from attendance and end locked after HR approval.
> **AI** reads real data, answers with whichever brain is available, acts through the same endpoints humans use, and remembers what you've resolved.
