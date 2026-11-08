# Complete System Workflow Guideline

> A single, exhaustive technical reference for the Workforce Management System: every module, every screen, every button, every toggle, and the exact server-side logic behind each one. Written after a full scan of the current codebase (frontend, backend, database, and live schema) — not a defense-prep document, a working reference for building, maintaining, and extending the system.

---

## 1. System Overview

**What it is:** a web-based workforce management system — attendance (via a facial-recognition kiosk), shift scheduling, leave management, overtime, semi-monthly timesheets, workforce analytics, AI decision support, reporting, notifications, and audit logging — built for Archon Nell Incorporated and designed to generalize to other small/medium e-commerce and industrial enterprises.

**Users:**
- **HR Admin** (`role: Administrator`) — the single operator account with full access to every administrative screen.
- **Employee** — self-service access to their own attendance, schedule, leave, overtime, timesheet, and profile.
- **Kiosk (Entrance Clocking-In Device)** — not a login/role. A locked-down browser screen at the entrance, unlocked by a 4-digit PIN, used only to clock in/out.

### 1.1 Definitive Route Map

This is the exact, complete route list from `frontend/src/App.jsx`. Nowhere else in this document should be read as implying a different path — if a route isn't in this table, it doesn't exist. Several routes are **role-switched**: one URL renders an entirely different page component depending on whether the signed-in user is an Administrator or an Employee (not tabs — a completely different component tree).

| Route | Renders | Notes |
|---|---|---|
| `/login` | Login | Public |
| `/forgot-password` | ForgotPassword | Public |
| `/reset-password` | ResetPassword | Public |
| `/kiosk` | AttendanceTerminal | Public (no login — PIN-gated) |
| `/kiosk-setup` | KioskSetup | Admin only |
| `/` | **Dashboard** (admin) or **EmployeeDashboard** (employee) | Role-switched (`HomeRoute`) |
| `/employees` | Employees | Admin only |
| `/employee-registration` | EmployeeRegistration | Admin only |
| `/attendance` | Attendance | Admin only — 4 internal tabs: Attendance Records, Overtime Requests, Early Clock Outs, Corrections |
| `/shifts` | Shifts | Admin only |
| `/timesheets` | Timesheets | Admin only |
| `/my-timesheet` | MyTimesheet | Employee only |
| `/leave` | **LeaveManagement** (admin) or **Leave** (employee) | Role-switched (`LeaveRoute`) |
| `/leave-types` | — | Redirects to `/settings?section=leaveRules` |
| `/my-attendance` | MyAttendance | Employee only — 4 internal tabs: Attendance History, Overtime Requests, Early Clock Outs, Corrections |
| `/my-schedule` | MySchedule | Employee only |
| `/analytics` | Analytics | Admin only |
| `/reports` | Reports | Admin only |
| `/audit-logs` | AuditLogs | Admin only |
| `/my-profile` | MyProfile | Employee only |
| `/help` | Help | Both roles — static FAQ + "About this project" page (team roster, adviser, course section, GitHub link, version) |
| `/notifications` | Notifications | Both roles |
| `/settings` | **HRSettings** (admin) or **EmployeeSettings** (employee) | Role-switched (`SettingsRoute`) |
| anything else | — | Redirects to `/` |

**There is no dedicated Overtime page, Early-Clock-Out page, or Corrections page, and there is no `/leave-management`, `/dashboard`, or `/employee-dashboard` route.** Overtime, Early Clock-Outs, and Corrections are internal tabs of the single Attendance page (admin) / My Attendance page (employee) — see §4. Leave, Dashboard, and Settings are single shared routes that render a different component per role, not tabs.

**Architecture:** one Laravel 13 (PHP 8.4) backend application, organized internally into 9 domains (Identity, Attendance, Scheduling, Time-off, Payroll, Communications, Configuration, Intelligence, Audit) — not split into separate services. One PostgreSQL database (`workforce_mgnt`, 31 tables: 22 business + 9 Laravel framework tables, built from 69 migrations). One React 19 + Vite + Tailwind CSS 4 frontend. This subsystem is itself one microservice inside a larger E-Commerce Enterprise platform under development by the same team; the earlier internal split into 8 separate services/databases was consolidated back into this single application after review.

**Hosting:**
- **Local development:** PowerShell scripts (`start-all.ps1` / `stop-all.ps1`) running PHP's built-in server directly, against a local PostgreSQL on port 5432.
- **Local Docker:** `docker compose up -d --build` — 4 containers (`postgres`, `app`, `scheduler`, `frontend`/nginx), database on host port 5433, isolated from the scripts' database.
- **Production (Render):** backend as a Docker web service (`workforce-api-nm7v.onrender.com`, built from `docker/backend.Dockerfile`, driven by `docker/backend-start.sh`), frontend as a static site (`workforce-management-qty0.onrender.com`). Database is a free, non-expiring **Aiven**-hosted PostgreSQL instance (migrated off Render's own free Postgres, which self-deletes 30 days after creation). Redeploys automatically on every push to `main`. Production email goes through Brevo SMTP on port 2525 (Render's free tier blocks ports 25/465/587).
- Opcache is explicitly enabled in the Docker image (`zz-opcache.ini`) because PHP's built-in server (`php -S`, used both in Docker and on Render) runs with opcode caching **off** by default — without it, every single request recompiles the entire framework from scratch, which was the dominant cause of kiosk lag under back-to-back clock-ins.

---

## 2. Authentication & Account Security

### 2.1 Login (`/login`)
- Email + password form. On success, the backend issues a Laravel Sanctum bearer token; the browser attaches it to every subsequent request's `Authorization` header.
- Passwords are bcrypt-hashed (never stored plain), minimum 8 characters with at least one uppercase letter, one lowercase letter, and one digit (`^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d@$!%*#?&._-]{8,}$`), enforced both client-side (live checklist) and server-side.
- **5 failed attempts → 60-second lockout** on that account, rate-limited.
- If the account has two-factor sign-in **on**, a correct password does **not** issue a token yet — see 2.3.
- The HR Admin account cannot use "Forgot password" — it is a fixed, reserved credential, not a real mailbox tied to one person.

### 2.2 Forgot / Reset Password (`/forgot-password`, `/reset-password`)
- Employee enters their email → server emails a 6-digit one-time code.
- Code expires after **5 minutes** (`auth.password_reset_code.ttl`, config-driven), stored hashed like a password, works once.
- Throttled: `forgot-password` limited to 3/minute, `reset-password` to 6/minute.
- After the code is verified, the employee sets a new password (same password-policy regex as above).

### 2.3 Two-Factor Sign-In (optional, per-employee toggle — My Profile page)
- Off by default. Turned on/off from **My Profile → Sign-In Verification** card.
- **Turning on:** immediate, no confirmation needed.
- **Turning off:** requires re-entering the current password in a confirmation modal — prevents a stolen-but-unlocked, already-signed-in browser from silently disabling it.
- **When on:** after the password check succeeds, no token is issued yet. The server emails a fresh 6-digit code; the browser must submit it correctly before a session token is created. 5 wrong guesses on that code, or letting it expire, requires requesting a new one (`TWO_FACTOR_MAX_ATTEMPTS = 5`).
- Completely separate mechanism from the forgot-password flow — one recovers a lost password, the other adds a second check to an already-correct password.
- The HR Admin account is intentionally excluded — it's a shared operator account, not tied to one person's mailbox, so it must never risk being locked out by a mail problem.

### 2.4 Session Timeout
- An employee's login token is created with a short expiry and auto-extends only on real user activity (mouse/keyboard/touch) — not on background polling (e.g. notification checks). A browser left open, or a closed laptop lid, eventually has its token expire server-side.
- The frontend shows a "still there?" warning in the final seconds before auto-sign-out.
- Administrators are not subject to this timeout.

### 2.5 Role-Based Access Control (RBAC)
- Every administrator-only backend route sits behind the `admin` middleware — an Employee token calling it gets HTTP 403, enforced server-side regardless of what the frontend UI shows or hides.
- Shared routes (e.g. own leave requests) additionally check per-record ownership (`assertSelfOrAdmin`) — an Employee can only read/act on their own records.
- Hiding admin menu items from an Employee's UI is convenience only; the real gate is always server-side.

---

## 3. Employee Directory & Organization Structure

### 3.1 Employees (`/employees`, HR Admin only)
- Grid or table view toggle. Stat tiles: Total Employees, Active, Face Registered.
- Filters: search (name/position/email), Department, Role (scoped to the selected department), Employment Type, "Face not registered only" toggle.
- A Terminated employee is filtered out of this roster entirely (their row still exists in the database for reports/offboarding, but there is no UI control to "un-terminate" them).
- **Add Employee** → navigates to the full Employee Registration page (see 3.2). There is no bulk CSV/JSON import — it was removed because it created every account with one shared password and bypassed form validation; the registration form is the only path to create an account now.
- **View** → read-only profile modal (contact info, employment details, skills) with a "View Analytics" shortcut into that employee's Analytics detail popup.
- **Edit** → modal mirroring the registration form's fields (personal, contact, employment, facial recognition), plus a **Status** dropdown (Active / On Leave / Terminated). Setting Terminated clears the employee's upcoming shift schedule server-side, so a departed person doesn't accumulate false no-shows.
- **Delete** → confirmation modal; permanently removes the employee record and their login account. Cannot be undone.
- Re-registering a face from here (Update Photo / Register Face) saves immediately via the same endpoint registration uses, independent of the "Save Changes" button.

### 3.2 Employee Registration (`/employee-registration`, HR Admin only)
- Multi-section form: Personal Information, Contact Information, Employment Information, Account Security, Facial Recognition.
- Employee ID is auto-generated (`EMP` + year + 4 random digits, checked for uniqueness) and not editable.
- Department → Position are cascading selects (Position options are filtered to the chosen Department's roles).
- Employment Type: `Regular`, `Probationary`, etc. (from `EMPLOYMENT_TYPES` constant). Status on this form is fixed to `Active` — there's no way to register someone as already Terminated.
- Account password set here directly by HR (not emailed) — same password policy as login.
- **Face registration is mandatory** — the "Create Employee Account" button is disabled until a face is captured. The capture modal explicitly states this is a workflow prototype, not a secure biometric authentication system.
- On success: a confirmation screen shows the new employee's ID, department, role, employment type (and probation end date if applicable, computed automatically from hire date — nobody sets it by hand), with a "Register Another Employee" shortcut that resets the form with a freshly generated ID.

### 3.3 My Profile (`/my-profile`, Employee)
"Who I am" — split deliberately from Settings ("how the app behaves for me").
- **Identity card:** avatar (editable — JPG/PNG/GIF, ≤2MB, auto-resized client-side to a 256px square before upload), name, position/department, status/employment-type/probationary badges, tenure ("With the company since...").
- **Employment** (read-only, HR-managed): Employee ID, Department, Position, Employment Type, Hire Date, Probation end date (if applicable), Manager.
- **Personal Details** (read-only, HR-managed): Full name, login email, date of birth, gender, blood group.
- **Contact Information** (the only employee-editable block): phone, address, emergency contact name + phone. Validated client- and server-side (phone pattern `^[0-9+()\-\s]{7,20}$`, address ≤255 chars). Unsaved changes show a sticky "You have unsaved changes" bar (Discard / Save) and warn on accidental tab close.
- **Leave Balances:** a progress bar per balance-requiring leave type, remaining/total days.
- **Sign-In Verification:** the 2FA toggle described in 2.3.
- **Kiosk Face Registration status:** green confirmation with registration date, or an amber warning that the employee cannot use the kiosk until HR registers their face.
- **Skills & Education:** read-only, shown only if present.

### 3.4 Employee Settings (`/settings`, Employee)
Only two sections: **Account** (change password, with a live requirements checklist) and **Appearance** (font size: Small/Medium/Large — a `localStorage`-only device preference, not saved server-side). A card links out to My Profile for anything else.

### 3.5 Departments & Roles
- Plain org-chart data: `departments` (id, name, head, head_id, employee_count, budget, location) and `roles` (id, department_id, name) — powers the Department → Position cascading dropdowns used in Employee Registration/Edit and Shift Assignment.
- No dedicated heavy admin screens for these beyond what's exposed through Settings → Company (employee/department counts) and the dropdowns themselves; managed via their own API endpoints (`DepartmentController`, `RoleController`).

---

## 4. Time & Attendance

Both the HR-facing page (`/attendance`) and the employee-facing page (`/my-attendance`) are a single page component with **4 internal tabs**, not 4 separate pages: **Attendance (Records/History) | Overtime Requests | Early Clock Outs | Corrections**. Switching tabs changes a `?tab=` query param, not the route. Overtime, Early Clock-Outs, and Corrections described below (§4.4–§4.6) live inside these two pages — there is no standalone page for any of them.

### 4.1 The Kiosk (`/kiosk`, no login — PIN-unlocked device)
**Unlocking:** tap the clock-in screen 5 times quickly → enter the secret 4-digit PIN → the server issues a signed, expiring device token (valid until midnight kiosk-local time). All kiosk API calls must carry this token; without it, kiosk endpoints return 401. The PIN check itself is rate-limited (10 attempts/minute); failed attempts are logged as security events.

**Identification:** employee ID entry with directory-based autocomplete/fallback, then a live face scan.

**Face matching (face-api.js, runs entirely in-browser, offline-capable):**
- A face is stored as a 128-number descriptor (`face_descriptor`) at registration.
- At the kiosk, a burst of frames is captured; the best-scoring frames (by detection confidence) are kept, up to a confidence threshold, with an early-exit once enough confident frames are collected.
- Match decision (`KioskController` constants): the **average** Euclidean distance across the captured frames must be **≤ 0.5** (`FACE_MATCH_THRESHOLD`) AND no single frame may exceed **0.55** (`FACE_FRAME_LIMIT`) — both conditions, not just one. A looser **0.6** (`FACE_SAME_SCAN_LIMIT`) is a separate same-scan consistency check (that successive frames within one scan are close enough to each other), not the identity-match threshold itself — a distinction every earlier version of this project's documentation got wrong by flattening all of this into "0.6 = match."
- **Liveness check:** eye-aspect-ratio blink detection across the frame burst (seeded from frames already captured during identity matching, falling back to a dedicated landmark-only burst if no blink was caught) — advisory only, not a hard gate, logged on the Kiosk Activity Logs.
- A mismatch → red "Identity Verification Failed" warning, a `face_mismatch` security event, and an immediate high-priority notification to every HR Admin. Repeated wrong faces (5) lock the terminal for 60 seconds, tracked server-side per kiosk so a refresh can't reset the count.

**Clock-in rules, in order (all enforced server-side, using the server's own clock — the screen's popups only explain the rule first):**
1. No shift scheduled today → **blocked** ("No Shift Scheduled Today").
2. Shift already over → **blocked** ("Shift Over").
3. Earlier than 30 minutes before shift start → **blocked**, with a message saying when the window opens.
4. Within the 30-minute early window → tap accepted, but paid hours still count only from the shift's official start (no credit for early arrival).
5. More than the configured grace period (default 15 min) after shift start → amber **"You Are Late"** warning, employee can still "Clock In Anyway" → recorded **Late**, HR Admins notified.
6. Within the grace period → recorded straight as **Present**, no popup.

**Clock-out rules:**
- Before the shift's effective end (shift end + any approved overtime) → must pick a reason first (Feeling Unwell / Family Emergency / Personal Emergency / Other) before the terminal will continue → recorded **Early Leave**.
- At/after the effective end → succeeds normally.
- More than the grace period past the end with **no approved overtime** → amber "Overtime Not Approved" warning; the extra time is not counted (the day's hours end at the approved end), and HR gets an "Unauthorized Overtime" alert.

**Early Clock-Out policy (enforced automatically, not just logged):**
- 2 free early outs per rolling 30 days; the 3rd is automatically marked unexcused.
- A "Feeling Unwell" (sick) reason needs a medical certificate uploaded within 48 hours or it auto-converts to unexcused.
- HR can override a classification, but the override is itself audited.
- Every early clock-out notifies HR Admins with the running count; 3 different employees citing the same reason on the same day triggers a pattern alert.
- Unexcused early-leave minutes are deducted from pay (`undertime_minutes`); excused ones are not.

**Holiday pay (automatic, no admin action needed per record):** a day's worked hours are sorted at count time into `regular_holiday_hours` (200% pay, a `regular`-type holiday) or `special_holiday_hours` (130%, `special_non_working`) instead of plain `regular_hours`. A `special_working` holiday is deliberately left alone — DOLE pays it exactly like an ordinary day, no premium.

**Lunch break:** deducted by duration, not clock time — once the person has worked the configured minimum hours (default 5), the configured lunch length (default 60 min) is subtracted automatically, however long lunch actually took. A shorter day loses nothing. Admin-configurable (Settings → Time Manager); 0 minutes turns the deduction off entirely. Changes apply only to days worked from then on.

### 4.2 HR Attendance page (`/attendance`, HR Admin) — 4 tabs

- **Tab: Attendance Records** — full attendance history with a calendar date-range filter (so the page never has to download the entire history for "this week" views). Approve/edit/delete rows; computed Present/Late/Absent status per row.
- **Tab: Overtime Requests** — the admin review queue: see every employee's overtime requests, Approve (optionally editing the hours down) or Reject (reason required). See §4.4 for the reconciliation math.
- **Tab: Early Clock Outs** — the list of early-leave punches with their reason codes, HR's excused/unexcused classification controls, and certificate status for sick claims. See §4.5 for the policy this enforces.
- **Tab: Corrections** — HR's review queue for employee-filed correction requests (`AttendanceAdjustmentController`). See §4.6.

### 4.3 My Attendance page (`/my-attendance`, Employee) — 4 tabs

- **Tab: Attendance History** — own clock history, filterable by "All / This Week / This Month."
- **Tab: Overtime Requests** — "My Overtime Requests" list plus a **"Request Overtime"** button that opens the filing modal (date, expected hours, reason). An employee can cancel their own request while it's still Pending.
- **Tab: Early Clock Outs** — the employee's own early-leave history and classification status.
- **Tab: Corrections** (`CorrectionsEmployee` component) — where an employee actually files a correction; see §4.6.

### 4.4 Overtime Management

- Employee files a request (date, expected hours, reason) from **My Attendance → Overtime Requests**. HR Admin reviews it from **Attendance → Overtime Requests**: Approve (can edit the approved hours down from what was requested) or Reject (reason required).
- **Reconciliation:** paid overtime is always the *smaller* of approved and actually worked, computed per day. Approved 2h but left on time → 0 paid. Approved 2h, worked 3h → 2h paid (capped at the approval). Approved 2h, worked 1h → 1h paid.
- An approved request extends that day's effective shift end for kiosk/attendance purposes — the "shift over" and "unauthorized overtime" checks both use the extended end, and the real punch time is preserved so a later approval can retroactively restore counted hours.
- A request can be filed for a day in the past week (older dates route through HR, who can record any date) — covers "worked late without asking first, then asked for it afterward."

### 4.5 Early Clock-Out Policy (enforced automatically, not just logged)
- 2 free early outs per rolling 30 days; the 3rd is automatically marked unexcused.
- A "Feeling Unwell" (sick) reason needs a medical certificate uploaded within 48 hours or it auto-converts to unexcused.
- HR can override a classification, but the override is itself audited.
- Every early clock-out notifies HR Admins with the running count; 3 different employees citing the same reason on the same day triggers a pattern alert.
- Unexcused early-leave minutes are deducted from pay (`undertime_minutes`); excused ones are not.

### 4.6 Attendance Corrections (`AttendanceAdjustmentController`)
For exactly two situations — "I worked past my shift" or "the kiosk failed to record a clock-in/out." The employee files this from **My Attendance → Corrections**, stating what happened and attaching 1–5 photos (≤3MB each, server-validated as real JPEG/PNG/WebP). The request sits against the kiosk's own recorded punch for that day. HR reviews it from **Attendance → Corrections**, side-by-side with the kiosk's own data, and either approves (typing the actual final time, which is then re-run through the same shift/overtime counting rules a live punch would use) or rejects with a reason. Only one open request per employee/day/reason type at a time.

### 4.7 Automatic Absence Marking
- Nightly job (`attendance:mark-absent`, 00:10 Manila, re-run at 12:00 as a safety net) writes an **Absent** record for any finished day that had a shift scheduled, no clock-in, and no approved leave. Never touches today (the shift may still happen), never overwrites an existing record, safe to re-run.

---

## 5. Shift & Schedule Management (`/shifts`, HR Admin)

- KPI tiles: Total Assignments, Scheduled, Working Today, Scheduled This Week.
- **Shift Types** cards: the shift templates that exist (standard practice is one Standard Shift, 08:00–17:00; the system supports more than one template, each with its own assignment count).
- **Monthly Coverage calendar:** full month grid (always complete weeks, Mon–Sun), each day showing a stacked-avatar preview of who's scheduled and a holiday badge (rate shown: 200% / 130% / "no premium") where applicable. Clicking a day opens a detail modal listing everyone scheduled that day, with a shortcut to assign a shift if nobody is.
- **Schedule Management table:** search (name/ID), Department filter, date filter, Status filter (Scheduled/Cancelled), grouped by date, newest first.
- **Assign Shift** (bulk by design — even a single person goes through the same bulk path): pick one or more employees via a Department → Role → Employee picker (multi-select), a shift, a date, optional notes. Each employee is checked **independently** server-side (not already scheduled that day, not on approved leave that day) — one person's conflict only skips them, never the whole batch; the result reports who was skipped and why, and everyone successfully booked gets a notification.
- **Edit** an existing single assignment: same modal, single-employee picker.
- **Delete** an assignment: confirmation modal, removes that one schedule row.
- There is no "Automated Shift" generation wizard — an earlier draft-and-approve rules engine for *who* goes on a shift was removed on review, since the company only ever has the one recurring shift; the real recurring task is just "assign these people, this shift, this date," which Assign Shift does directly.

---

## 6. Leave Management

### 6.1 The Rules Engine (`leave_types` table — admin-configured, not hardcoded)
10 active leave types, each carrying its own full rule set — gender eligibility, minimum tenure, pay type, balance requirement + accrual, advance-notice/retroactive windows, max consecutive days, proof requirement:

| Code | Name | Gender | Min. tenure | Pay type | Balance / accrual | Max consecutive (calendar days) | Proof |
|---|---|---|---|---|---|---|---|
| Vacation | Vacation Leave | Any | 6 mo | PaidWithBalance | 1.67 days/mo, 5-day carryover cap | 30 | No |
| Sick | Sick Leave | Any | 0 | PaidWithBalance | 0.83 days/mo, 5-day carryover cap | — | Past 2 days |
| Bereavement | Bereavement Leave | Any | 0 | PaidWithoutBalance | — | 5 | Always |
| Maternity | Maternity Leave | Female | 0 | PaidWithoutBalance | — | 105 (RA 11210) | Always |
| Paternity | Paternity Leave | Male | 0 | PaidWithoutBalance | — | 7 (RA 8187) | Always |
| Unpaid | Unpaid Leave | Any | 0 | Unpaid | — | 30 | No |
| SoloParent | Solo Parent Leave | Any | 0 | PaidWithoutBalance | — | 7 | Always |
| VAWC | VAWC Leave | Female | 0 | PaidWithoutBalance | — | 10 | Always |
| SpecialLeaveWomen | Special Leave for Women | Female | 6 mo | PaidWithoutBalance | — | 60 | Always |
| SIL | Service Incentive Leave | Any | 12 mo | PaidWithBalance | 0.42 days/mo, 5-day carryover cap | — | No |

- Sick is additionally `locked_to_today` — no advance filing, no backdating, same-day only, with its own retroactive-like grace handled through a separate flag (not the general retroactive window).
- Only 3 of the 10 types actually hold a running balance (Vacation, Sick, SIL). The rest are either paid-in-full-but-capped or fully unpaid.
- A deactivated type (`active = false`) disappears from the employee's apply dropdown immediately but is never deleted — historical requests keep resolving against the exact row they were filed under.
- An original generic "Special" leave type existed early on and was removed entirely once Vacation and Bereavement had their own distinct rules — it no longer exists in any form.

### 6.2 Leave Balance Ledger (`leave_balance_ledger`)
- **There is no stored "current balance" anywhere.** Balance for (employee, type) is always `SUM(days_delta)` over this append-only table, computed live by `LeaveLedger::currentBalance()`.
- Entry types: **Accrual** (the monthly scheduled job, `leave:accrue-monthly`, the only place new balance days are created), **Usage** (a negative entry written automatically the instant an Administrator approves a `PaidWithBalance` request), **Adjustment** (the only manual path — admin-only, via the ledger adjustment endpoint, refuses to save without a real reason of ≥5 characters, fully audited), **Expiration** (the carryover-cleanup command enforcing each type's `max_carryover_days` cap).
- Approving, then un-approving/editing/deleting an already-approved leave automatically writes a reversing ledger entry — nobody stays silently overcharged after a correction.
- `balance_after` on each row is a point-in-time display snapshot only, never read back as the source of truth.

### 6.3 Leave Pay Resolution (`LeavePayResolver`)
- Pay type (`PaidWithBalance` / `PaidWithoutBalance` / `Unpaid`) is never chosen by the employee or admin — it resolves automatically from the matched leave type's own config.
- A `PaidWithBalance` request that would exceed the available ledger balance is **not** hard-blocked: the employee is offered a paid-what's-left-plus-unpaid-the-rest split, shown as an explicit preview (exact days paid vs. unpaid) that they must accept (`acceptSplit: true`) before the request submits. Declining leaves the request unsubmitted with the shortfall shown.
- `pay_type`, `paid_days`, `unpaid_days` are snapshotted once on the `leaves` row at submission and never silently recalculated later — approval uses exactly those numbers even if the balance has since moved (an honest audit-trail note is added if the balance has drifted negative by then).

### 6.4 Apply for Leave (`/leave`, Employee)
- The type dropdown is fetched live from the eligibility endpoint, not hardcoded — every active type is shown, annotated per this specific employee: an ineligible type (wrong gender, insufficient tenure) renders **disabled** with the reason printed inline, rather than silently vanishing.
- Picking dates shows a live preview: working days the request will actually cost (weekends/holidays excluded), and the pay/split breakdown described above.
- Submission re-validates everything server-side regardless of what the UI already checked: eligibility → advance-notice/retroactive window → duplicate/overlap with an existing Pending or Approved request → at least one real working day in range → max-consecutive-day cap → proof requirement → pay/balance resolution.
- While Pending, the employee can withdraw/cancel their own request.

### 6.5 Leave Management (`/leave`, HR Admin — same route as the employee Apply screen, role-switched to a different component)
- The approval queue: review each Pending request, Approve or Reject (rejection requires a reason). Approving a `PaidWithBalance` request writes the ledger Usage entry at that moment, not at submission time.

### 6.6 Leave Rules Admin (`Settings → Company Configuration → Leave Rules`, formerly its own `/leave-types` page — that route now redirects here)
- Full CRUD table over `leave_types`: Code, Name, Applicable Gender, Min. Tenure, Pay Type, Requires Balance (+ Accrual Policy/Rate/Carryover cap if so), Advance Notice days, Max Consecutive days, "Locked to today only" toggle, "Can be filed retroactively" toggle (+ window days), "Requires supporting proof" toggle (+ threshold days).
- **Deactivate** (soft — never a hard delete) / **Reactivate** toggle per type, with a confirmation modal explaining the effect.
- Deliberately placed under Settings rather than on the Leave Management page: policy that defines what's allowed company-wide belongs in Settings; Leave Management stays purely the approval queue, since an admin never picks a rule while approving — the employee already filed against one.

### 6.7 Deliberately out of scope (named, not accidental gaps)
- Only one approver tier exists (Administrator) — no multi-level approval chain, because there's no second admin role to chain to.
- A short-balance request gets a consent-based split, never a negative balance or borrowing against next month's accrual.
- Eligibility checks gender and tenure, not employment type (e.g. probationary vs. regular) — that distinction would have shipped as inert config with nothing in the current data to demonstrate it against.
- A single leave event resolves to exactly one pay outcome, not a statutory multi-tier run (paid first N days, unpaid after) within one event.

---

## 7. Overtime Management

Fully covered in §4.4 — overtime is a tab inside the Attendance / My Attendance pages, not a module with its own page. See §4.4 for the filing flow, the approval queue, and the reconciliation math.

---

## 8. Timesheets

### 8.1 Generation
- Built automatically from completed, clocked-out attendance — nobody types hours in.
- **Semi-monthly periods: 1st–15th and 16th–end of month** (not weekly — this changed from the original weekly design; the `week_start`/`week_end` column names are a holdover from that earlier design, their meaning is now the semi-monthly period).
- The current, still-open period is a live "Ongoing Timesheet Record" with a pulsing "Live" badge, recomputed straight from attendance (polled every ~30s) rather than a saved snapshot — the underlying `Timesheet` row exists for its workflow status (Draft/Submitted/Approved), not as the source of the displayed hours.
- Stored figures: `regular_hours`, `regular_holiday_hours`, `special_holiday_hours`, `overtime_hours` (worked), `approved_ot_hours` (approved via requests), `paid_ot_hours` (the smaller of the two — the only overtime actually paid), `break_hours`, `late_minutes`, `undertime_minutes`, `total_hours`. There is no rate, salary, or money anywhere in this table — it is hours only; applying a rate is the external payroll system's job.

### 8.2 Lifecycle: Draft → Submitted → Approved/Rejected → Sent to payroll
- When a period ends, the employee reviews and submits it. If not submitted by **noon (Manila time) the day after the period ends**, the system auto-submits it on their behalf (marked `auto_submitted`), unless the period has zero hours (left alone).
- HR Admin's queue opens on "Waiting for review," surfacing warnings first (no clock-out, zero hours, overtime not fully paid, attendance changed after submission).
- **Approve** → stamped `reviewed_by`/`reviewed_at`.
- **Reject** (reason required) → employee sees the reason, HR or the employee fixes the underlying cause, resubmits.
- **Reopen** (reason required) → back to Draft, hours refreshed from current attendance.
- **Hours freeze once submitted.** A later attendance change doesn't silently rewrite what was reviewed — it only flags the row `needs_refresh`; an admin must explicitly reopen to pull in the new numbers.
- **Sent to payroll** once — downloaded as a file, marked sent, can never be reopened or sent again. No double payment is structurally possible.
- Every transition (who, when, why) is recorded in the timesheet's own `history` JSON timeline, visible as a timeline in the side panel, and separately in the audit log.

### 8.3 My Timesheet (`/my-timesheet`, Employee)
- "This Period" live popup: per-day breakdown (Date, Day, Status, Clock In, Clock Out, Break, Hours) for the current open period, labeled "Auto" until actually submitted.
- **Timesheet History** list below it: every saved period (date range, status badge, Regular/Overtime/Total hours, submitted date) — clicking a row reopens that period's full per-day breakdown.

### 8.4 Timesheets (`/timesheets`, HR Admin)
- Per-employee period summary cards, quick filters, sortable table; opening a row shows a side panel with the full day-by-day attendance for that period before Approve/Reject.

### 8.5 Scheduled jobs
- `timesheets:refresh` (every minute) — rebuilds the most recent 3 periods for anyone whose attendance/overtime just changed.
- `timesheets:auto-submit`, `timesheets:remind` (hourly) — auto-submits overdue periods; sends one-time reminder/review nudges.

---

## 9. Workforce Analytics (`/analytics`, HR Admin — "Analytics Overview" tab)

- One shared filter — **This Week / This Month / This Year** — drives every card on the page together, so nothing on screen is ever looking at a different window than the rest.
- **Top Performer** sits directly under the KPI strip (not a tab of its own): every **active** employee ranked by attendance + punctuality, named, sortable, top 3 highlighted as cards, the rest a real paginated/sortable table (10 per page). Clicking anyone — a row, the KPI tile, or the separate "Look up an employee" search — opens a popup with that person's own attendance rate, punctuality trend, leave usage/balances, overtime for the period, and a punctuality-based read (e.g. "Consistently punctual and present") that is explicitly **not** a performance evaluation (no visibility into output/quality/peer feedback, and the UI says so). Everyone active is ranked, full stop — an earlier version excluded anyone with fewer than 5 attendance records, which made real newly-hired accounts disappear from their own company's headcount; it now ranks everyone and labels thin data "Limited data so far" instead of hiding it.
- **Five charts below Top Performer** (there used to be a sixth, "Department Punctuality," reporting by department only — a panel review asked for exactly the opposite, a real named ranking, which is what Top Performer became; Department Punctuality was dropped once Top Performer existed):
  1. **Attendance Summary** — pie: present-on-time / present-late / early-leave / absent.
  2. **Attendance Rate** — ring + trend line: present days ÷ scheduled days, days covered by approved leave excluded from "scheduled."
  3. **Leave Trends** — stacked bar: approved leave days by type, per sub-period.
  4. **Overtime Hours** — line/dot: total overtime hours per period.
  5. **Leave Type Composition** — donut: approved leave requests only (pending/rejected/cancelled excluded, since they never actually happened).
- Every card carries a small ⓘ that states its own data source and exact formula in plain words — printed inline too when the page is exported/printed, so no number is ever a black box.
- **Export/Print** turns the whole page (charts, formulas, Top Performer table) into a printable handout via the browser's print dialog — not a raw CSV/data download.

---

## 10. AI Decision Support (`/analytics` — "AI Decision Support" tab)

- **The rules always decide; AI only writes.** A deterministic PHP rule engine reads the last 30 days of real data (attendance, pending leave/OT, shift coverage, open security events) and produces the findings and the **Workforce Health Score** — the page shows exactly how the score is calculated.
- Google Gemini, when internet + a working API key are available, turns each finding into plain-language wording and a recommendation. It cannot add, drop, or re-rate a finding, and any sentence containing a number not present in the underlying data is discarded outright.
- If Gemini is unavailable (no key, no internet, Google busy, free daily quota used up, or a slow response) — the exact same findings and score are shown with rule-written wording instead, with a banner stating why. The feature never goes blank and the numbers never depend on the AI.
- A cheap, **Gemini-free** version of the same score calculation (`healthScore()` endpoint) is what dashboard tiles poll frequently — the AI-backed endpoint is only hit when the Decision Support tab itself is opened or "Regenerate" is pressed, so routine polling never waits on or pays for a live model call.
- **One-click actions available from this queue**, each re-checking the record is still in a resolvable state before acting (so a race between two approvers can't double-resolve anything):
  - `approve_leave` / `reject_leave` (rejection requires a reason)
  - `approve_overtime` / `reject_overtime` (rejection requires a reason)
  - `resolve_security_event` / `flag_security_event` (escalates to all admins as high-priority)
  - `resolve_insight` / `unresolve_insight` (dismiss/restore one AI finding without acting on it)
  - `resolve_all_security` (bulk-clears every open security event at once)
- Every action here writes the identical audit trail a manual approval from Leave Management / Overtime / Security Events would write, tagged `via: AI Decision Support`.

---

## 11. Reports (`/reports`, HR Admin)

13 report types across 5 categories, each generated on demand from the live database (nothing pre-computed or cached):

| Category | Reports |
|---|---|
| **Attendance** | Daily Time Record (DTR), Monthly Attendance Summary, Department Attendance Breakdown, Absenteeism Trend Report |
| **Leave** | Leave Utilization Report, Pending Leave Requests |
| **Timesheet & Payroll** | Weekly Timesheet Summary *(label predates the semi-monthly change — it reports the current semi-monthly period's figures, not a literal week)*, Overtime Analysis Report |
| **Shift** | Shift Coverage Report, Employee Shift Distribution |
| **Workforce** | Consolidated Workforce Summary, Workforce Headcount Report, Employee Turnover Analysis |

- Every report takes a date range; most also accept employee, department, and/or status filters.
- **Known implementation gap:** the department filter value is passed from the UI into `buildReport()` but is not actually read inside the function for most report cases — the filter control exists but doesn't fully narrow results yet.
- The 10 most recently generated reports are kept in a saved history on the page so the same report doesn't need regenerating twice in a session.
- Output: on-screen preview, print, or CSV export.

---

## 12. Notifications

- **Bell dropdown** (every page, both roles): newest ~200 notifications, polled every 30 seconds while the tab is visible (polling pauses in a background tab), unread badge count read from a dedicated server endpoint so the number only ever means "actionable now."
- **Full Notifications page** (`/notifications`): complete history in one place, not just the dropdown's recent few. Tabs: **All / Unread / Important** (important = `priority: high`), grouped by day (Today / Yesterday / older dates), with search, pagination (12/page), per-item delete, and "Mark all as read."
- Notification types cover: leave (requested/approved/rejected/cancelled), overtime (same four), shift assignment, schedule change/generation, attendance (late, clock-in, clock-out, incomplete, absent, unauthorized OT), early clock-out (incl. pattern alerts, auto-unpaid, certificate-required, proof-submitted), security (`security_face_mismatch`), staffing shortage, timesheet (submitted/approved/rejected/reminder), employee added, system announcements.
- A nightly job (`notifications:prune`) deletes anything older than 30 days, for both admin and employee bells, so the unread badge stays meaningfully "now," not a growing backlog.

---

## 13. Audit Logs & Security

### 13.1 Audit Logs (`/audit-logs`, HR Admin)
- A permanent, append-only record of who did what and when — entries can never be edited or deleted, including by administrators.
- KPI tiles: Total events (under current filters), Today, Last 7 days, People involved.
- Filters: free-text search, Area (plain-language names mapped from internal service/domain names, e.g. "core" → "Employees & Accounts"), Period (All time / Today / Last 7 / Last 30 / custom date range).
- Every row renders as a one-sentence plain-English description ("Fercy Miano approved Juan's Vacation leave request") built from the raw event code, never the raw code itself.
- Clicking a row opens a detail panel: full "before → after" field diff for updates, the full recorded fields for creations, who/when/IP address/device, and a collapsible raw-JSON "Technical details (for IT)" block.
- **Export CSV** — immediate, no re-confirmation step (removed; the page is already admin-only and the export only re-reads rows the viewer can already see).
- Logged event families include: employee CRUD + face registration, leave/overtime/timesheet/attendance create-update-status-delete, settings changes, and the full auth trail (login, failed login, lockout, logout, password changed/reset-requested/reset, password re-confirmation for exports).

### 13.2 Security Events
- `security_face_mismatch` (buddy-punching attempt at the kiosk) and failed-PIN events are written automatically and surface in the AI Decision Support queue (see §10) for Resolve/Flag/Resolve-all actions, in addition to the Audit Log.

### 13.3 Sensitive-action re-confirmation
- Exporting a report or the audit log asks the administrator to re-enter their password; the server verifies it and records who confirmed it and for what. The HR Admin account uses its password for this rather than an emailed code, since it's a fixed operator account, not a personal mailbox.

---

## 14. Settings

Two clearly separated scopes in the navigation: **Company Configuration** (organization-wide, HR Admin only) and **My Account** (this signed-in user's own password/appearance — identical component shared with the Employee Settings page).

### 14.1 Company → Company Details
- Name, phone, email, website, street/city/province/zip. Saved to the single company settings row (shared across the whole system — there is only one company on record).
- A live "Company Overview" card shows current employee and department counts.

### 14.2 Company → Time Manager
- **Attendance Grace Periods:** late grace period (0–120 min, default 15) — how late is still "On Time" at clock-in, and also how much unapproved time past shift-end is tolerated before it's flagged unauthorized overtime; no-show alert threshold (0–240 min, default 60) — a separate timer that pages HR with a "Possible No-Show" alert if a scheduled person still hasn't clocked in.
- **Unpaid Lunch Break:** lunch length in minutes (0–180, default 60) and the minimum hours worked before it's deducted (0–12, default 5, half-hour steps). Setting length to 0 disables the deduction. Changes apply only to days worked after the change.
- The early-leave policy itself (30-day window, 2 free outs, sick-certificate deadline) is intentionally **not** exposed here — it stays a fixed default enforced by `EarlyLeavePolicy`, separate from these two admin-tunable cards.

### 14.3 Company → Leave Rules
The full leave-type rules engine CRUD described in §6.6.

### 14.4 Company → Regional
- Language (5 options: English, Filipino, Japanese, Chinese Simplified, Spanish — a per-browser preference via `LanguageContext`, not saved server-side), Date Format (4 options), Time Format (12h/24h). Date/time format are company-wide settings that change how every user sees dates across the app; language is local to the browser.

### 14.5 My Account
- **Change Password:** current + new + confirm, live requirement checklist (length, uppercase, lowercase, digit, confirmation match), same policy as everywhere else.
- **Appearance:** font size only (Small/Medium/Large). There is no dark-mode toggle — one existed previously and was removed deliberately (no dark styling was ever built for it, so all it did was make native browser controls follow the phone's own dark-mode setting with no visual consistency gained).

### 14.6 Kiosk configuration
Kiosk device settings (location, device name, time zone, PIN) live on their own dedicated **Kiosk Management** screen (§15), not under Settings.

---

## 15. Kiosk Management (`/kiosk-setup`, HR Admin)

Four tabs:

### 15.1 Overview
- Live status hero (on/off, countdown to automatic midnight lockout) with Enable/Disable buttons (both PIN-gated).
- Stat tiles: clocked-in vs. scheduled count, late-but-not-clocked-in list, today's real security alert count (wrong PIN or face mismatch), a readiness checklist (PIN set, employees missing a registered face, camera/face-model availability).
- "Last activity" strip (most recent clock-in/out, relative time).
- A plain-language "How the device is unlocked" explainer (5 taps → PIN → auto-off at midnight).
- Refreshes every 15 seconds; shows "Connection lost — retrying" if a poll fails rather than silently going stale.

### 15.2 Activity
- Full kiosk event timeline (clock-ins/outs, security events, maintenance/log entries), refreshed every 10 seconds.

### 15.3 Settings
- Location, device name, time zone (drives shift/lateness/midnight-unlock calculations for this kiosk), and a fixed, non-editable "Employee + Facial Recognition" verification-method display. A live device preview panel reflects the in-progress (unsaved) form values. Save is disabled until something actually changed.

### 15.4 Maintenance
- "Check for updates" (version display, cosmetic), "Reboot kiosk" (confirmation → fullscreen request + page reload), and a destructive **"Reset all kiosk data"** (clears settings, PIN, and the entire activity log — confirmation-gated, cannot be undone).

---

## 16. Dashboards

### 16.1 HR Dashboard (`/`, Admin — root route, role-switched)
- Live KPIs: pending leave, timesheets awaiting approval, present-today count, a 30-second-polling **System Health %** tile (the same Workforce Health Score as AI Decision Support, but via the cheap non-AI endpoint — see §10).
- An animated **Database Health** graph — a genuinely live, timed `SELECT 1` round-trip against Postgres on every ~10-second poll, not a decorative animation; watching it for 30 seconds is enough to see the number actually move.
- `< >` week-navigable attendance chart, a pending-timesheets "View → Approve/Reject" modal, a Decision Support summary, department headcount, upcoming birthdays/anniversaries, and quick-action tiles.
- A "Needs your attention" panel surfacing items across modules that require an admin decision right now.

### 16.2 Employee Dashboard (`/`, Employee — same root route, role-switched)
- Status badges (department/position/employment type, Probationary if under 180 days, a 30-day New Hire flag), a KPI row (Hours This Week, Leave Balance, Attendance Rate, Pending Requests), a `< >` week-navigable attendance chart, 6 quick-action tiles (My Attendance, Leave, My Timesheet, My Schedule, My Profile, Settings), a My Timesheet summary widget, recent leave requests with an Apply Leave shortcut, an overtime-requests chart (by week, last 6 weeks), a self-service Punctuality-Based Read (the same read admins see in Top Performer, scoped to the signed-in employee only), and a recent-notifications feed.

### 16.3 Universal Search (topbar, both roles)

A single search box in the topbar, backed entirely by server-side logic (`GlobalSearch` service) so the "who may see what" rule lives in exactly one place:
- **Administrator** sees matches across People (employees), Attendance, Leave, Overtime, Early Clock-Outs, Corrections, Timesheets, Shifts, Notifications, and the Audit trail — everyone's records.
- **Employee** sees the same kinds of record, but only their own rows, and never the employee directory or the audit trail.
- The query is split on spaces; **every word must match at least one searchable column** of a candidate row (e.g. "late sep" finds a row that is both Late and in September). A recognized month name/abbreviation also matches that month's dates (so "sep 24" and "2026-09-24" both work). Each result group is capped at 5 rows.
- Each result links directly into the right page/tab with a pre-filled search (e.g. clicking an overtime result opens `/attendance?tab=overtime&search=...` for an admin, `/my-attendance?tab=overtime` for an employee).

---

## 17. Database Schema Reference

One PostgreSQL database, `workforce_mgnt`, 31 tables total: 22 business tables + 9 Laravel framework tables (`migrations`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `sessions`, `password_reset_tokens`, `personal_access_tokens`), built from 69 migration files.

**People & Organization:** `users`, `employees`, `departments`, `roles`.
**Time & Attendance:** `attendance`, `early_clock_outs`, `attendance_adjustments`, `overtime_requests`.
**Leave:** `leaves`, `leave_types`, `leave_balance_ledger`.
**Scheduling:** `shift_definitions`, `shift_schedules`, `schedule_settings`, `holidays`.
**Payroll:** `timesheets`.
**System support:** `notifications`, `security_events`, `two_factor_challenges`, `audit_events`, `settings`, `analytics`.

Key columns worth knowing (not exhaustively listed elsewhere in this document):
- `attendance`: `regular_holiday_hours`, `special_holiday_hours`, `late_minutes`, `undertime_minutes`, `is_rest_day`, `actual_clock_out` (the real tap-out time, kept separately from the counted `clock_out` so a later overtime approval can restore time).
- `timesheets`: same holiday/late/undertime columns rolled up per period, plus `paid_ot_hours`, workflow columns (`submitted_at`, `auto_submitted`, `reviewed_at`, `status_reason`, `needs_refresh`, `history` JSON timeline).
- `leaves`: `pay_type`, `paid_days`, `unpaid_days` — snapshotted once at submission by `LeavePayResolver`.
- `leave_types`: full rules engine columns per §6.1, including `locked_to_today`.
- `leave_balance_ledger`: `entry_type`, `days_delta`, `balance_after` (display-only snapshot), `reference_id`, `performed_by`.
- Only a few hard SQL `FOREIGN KEY` constraints exist (`roles.department_id → departments.id`, `two_factor_challenges.user_id → users.id`); most relationships are enforced at the application layer — a deliberate, ordinary design choice, not an oversight.
- `attendance_employee_date_unique` is a real unique constraint on `(employee_id, date)` — the actual guard against a double clock-in under concurrent kiosk requests, backed up by exception handling in the controller for a clean error instead of a 500.

---

## 18. Scheduled Background Jobs (full list)

| Command | Schedule | Purpose |
|---|---|---|
| `attendance:check-alerts` | every minute | No-show, incomplete-record, unauthorized-overtime, staffing-shortage alerts (each once/day) |
| `attendance:recount-hours` | every minute | Re-counts recent days after an overtime approval/withdrawal |
| `timesheets:refresh` | every minute | Rebuilds the last 3 periods after a punch/overtime/correction change |
| `demo:refresh --spare-today` | 00:05 Manila — **only if `REFRESH_DEMO_DAILY=true`** in env (off by default) | Rolls forward demo employees' schedules/attendance/leave/overtime so the demo never looks stale — runs before `mark-absent` on purpose |
| `attendance:mark-absent` | 00:10 & 12:00 Manila (two separate schedule entries, same command) | Writes Absent for finished days with a shift, no clock-in, no approved leave |
| `timesheets:auto-submit`, `timesheets:remind` | hourly | Auto-submits overdue periods; sends one-time reminders/nudges |
| `early-outs:expire-certificates` | hourly | An overdue sick-leave certificate auto-converts the early-out to unexcused |
| `leave:accrue-monthly` | monthly, 1st at 00:15 Manila | Grants each active, Monthly-accrual, balance-requiring leave type's rate to every eligible employee |
| `leave:expire-carryover` | yearly, Jan 1 at 00:20 Manila | Enforces each type's `max_carryover_days` cap |
| `notifications:prune` | 02:00 Manila | Deletes notifications older than 30 days |

---

## 19. Known Implementation Notes (documented honestly, not hidden)

- **Reports "Weekly Timesheet Summary"** label predates the semi-monthly change; the data it reports is correct for the current period, only the name is a holdover.
- **Reports department filter** is passed through from the UI but not fully read inside `buildReport()` for most report cases yet.
- **My Profile's leave-balance progress-bar colors** are keyed to an old type-name list (`Vacation`, `Sick`, `Emergency`, `Special`, `Funeral`, `Unpaid`) that predates the current 10-type system; any type not in that list (including most of the current ones) falls back to a plain gray bar — cosmetic only, the balance numbers themselves are correct.
- **`employees.leave_balances` JSON column** still physically exists on the table but nothing reads or writes it anymore — dead weight from before the ledger design, not the source of truth for anything.
- **`schedule_settings.max_weekly_hours`** is a holdover from the removed "Automated Shift" draft-and-approve wizard — still a real column, read by nothing, since Assign Shift's multi-select has no weekly-hours cap of its own.
