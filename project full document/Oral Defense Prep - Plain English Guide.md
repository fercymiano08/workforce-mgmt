# Oral Defense Prep - Plain English Guide

> Written for ONE person: **you**, who has to stand in front of the panel and explain
> this system without freezing up. No heavy jargon. Read this 2-3 times and you will
> be able to *talk* about the system naturally - because it's the same story every time.
>
> **Never touched code before, or the words "microservices"/"Laravel"/"API" mean nothing to you yet?** Read `00 - Start Here - Absolute Beginner Guide.md` FIRST — it explains every term this guide assumes you already know. Then come back here.
>
> Deeper detail lives in **System Workflow Guide.md** and **Database System Tutorial And Guideline.md**. Tiered practice questions (easy → extremely hard) live in **Defense Q&A - Easy to Extremely Hard.md**. Use this guide first.

---

## How To Use This Guide

- **Part 1-4** = the CORE story. Master these first. They cover ~80% of any question.
- **Part 5-6** = one-sentence "cheat sheets" for every module and security topic.
- **Part 7-8** = analogies + a demo-day script. Great for practicing out loud.
- **Only have 10 minutes?** Read Part 1 (the 5 sentences) + Part 5 (module cheat sheet) — that's the whole project, compressed.

---

# PART 1 - The whole system in 5 sentences (MEMORIZE THESE)

1. **WorkForce Pro** is a web-based **workforce management system** built for a retail/BPO company called **Archon Nell Incorporated**.
2. It helps the company handle **attendance, schedules, leave, overtime, and timesheets** for all employees in one place.
3. There are **three users**: the **Workforce Admin** (who controls everything), the **Employee** (who checks and manages their own records), and the **Kiosk** (a touchscreen device at the entrance used for clocking in and out).
4. The system has a **frontend** (what you see in the browser) and a **backend built as 8 independent microservices**, each owning one domain (auth, attendance, scheduling, leave/overtime, payroll, notifications, settings, and analytics/AI) and its own database.
5. It also includes **smart features**: facial-recognition attendance, automatic schedule generation, analytics dashboards, and an **AI assistant** that helps HR make decisions.

> Say this in your own words. The panel just wants to hear that YOU understand the big picture.

---

# PART 2 - Who uses it (memorize these three)

**Workforce Admin** *(Administrator)*
- The boss / HR personnel.
- Can do **everything**: register employees, manage schedules, approve leave and overtime, see analytics and reports, use the AI assistant.
- Say it as: *"The person in charge. Full access."*

**Employee**
- A regular worker (e.g. Fercy, Balderama).
- Can log in, clock in/out, file leave, and check their own schedule, attendance, and timesheet.
- Say it as: *"Each worker. Sees only their own stuff."*

**Kiosk**
- A physical entrance device (touchscreen), **not a person** - it has no login.
- Used to clock in/out by **face or PIN**.
- Say it as: *"The door terminal. It's a device, not an account."*

**Key point to remember:** The kiosk does NOT log in with a username and password. It talks to the backend with its own special (public) endpoints. That's why it's called a "device", not a role.

---

# PART 3 - How the app is built (the 3 layers)

Think of the system like a **restaurant**:

- **Frontend** *(React + Vite)* - draws every screen you see in the browser and knows nothing about databases.
  → Like the *waiters and the menu* shown to customers.
- **Backend** *(Laravel, ×8)* - the "brain", split into 8 independent services by domain. Each one checks who you are, follows its own rules, reads and writes only its own data.
  → Like *eight small kitchens*, each cooking one kind of dish, instead of one giant kitchen doing everything.
- **Database** *(PostgreSQL, ×8)* - stores every record, but split one database per service (employees in `core`'s DB, attendance in `attendance`'s DB, leave in `timeoff`'s DB, etc.) instead of one shared database.
  → Like *eight separate filing cabinets*, each locked to its own department.

**The flow (always):**
Browser (frontend) → sends a request to `/api/...` → the frontend's router (Vite proxy) sends it to whichever of the 8 services owns that URL (e.g. `/api/attendance/*` → the attendance service on port 8003) → that service checks the request, reads/writes its own PostgreSQL database → sends back an answer (JSON) → frontend shows it on screen.

> If a panelist asks "how does data move?", this one sentence answers it. If they follow up with "doesn't that mean you have one big backend?" — no: there is no single backend anymore, there are 8, and the frontend's proxy config is the only thing that knows how to find all of them.

---

# PART 4 - The 4 core flows to master (YOUR WOW STORIES)

## Flow 1 - Logging in and identity

**Plain story:**
1. User types email + password on the login page.
2. Backend checks the password (stored in a scrambled/bcrypt form, never plain text).
3. If correct, the backend gives the browser a secret **"token"** (like an ID badge).
4. For every next request, the browser shows that badge (sends it in the header).
5. The backend looks at the token to know WHO you are and WHAT you're allowed to see.
6. Logging out deletes the badge.

**Extra defense points:**
- Wrong password → error. After **5 wrong attempts**, a **60-second cool-down** (lockout).
- Passwords must be **8+ characters with uppercase, lowercase, and a number**.
- Forgot password → a **6-digit code (OTP)** is emailed; valid **10 minutes**, one-time use.
- Workforce Admin (admin) account **cannot** reset via forgot-password (it's the reserved owner account).

## Flow 2 - Attendance with facial recognition (the kiosk)

**Plain story:**
1. When a person is registered, the system captures their face and turns it into a **"face print"** - a special 128-number code that describes the face.
2. At the door, the kiosk camera captures the person's face again → the browser makes that same kind of face print on your own computer (no internet needed).
3. Backend compares the new face print to the saved one using a **distance score**.
   - Score below 0.6 → **match** → clock in/out recorded.
   - Score above 0.6 → **not a match** → a **security event** is logged for HR to review.
4. Wrong faces / failed PINs get recorded as **security events**, which the HR can see (and the AI assistant can flag).

**Extra defense points:**
- The face-api models run **locally in the browser** (folder `public/models/`) → works **offline**.
- The whole task works even without internet - that matters for a demo.

## Flow 3 - An employee's everyday: schedule → clock in → leave → timesheet

**Plain story (one smooth sentence):**
1. HR **registers** the employee (start with basic info + a password + face).
2. HR **assigns a schedule** (shift times) - or auto-generates schedules for everyone.
3. Each day the employee **clocks in/out** (face at the kiosk).
4. If they can't come in, they **file a leave request**; HR **approves or rejects** it, and a "leave balance" is updated.
5. Weekly, the system builds a **timesheet** (hours worked) which the employee can submit; HR can approve. Employees can also open a live **"This Week"** timesheet and a **history** of past weeks right from the My Timesheet page.
6. If they work extra hours, they can file an **overtime request**, which HR approves (can be done in bulk).

## Flow 4 - The "brain": Analytics + AI decision support (HR only)

**Plain story:**
1. The **Analytics** page shows dashboards: who's late, attendance rates, overtime summaries, etc.
2. The **AI Decision Support** page looks at that data and gives HR **suggestions** (e.g. "too many absences for this department", "overtime trending up").
3. When online, the app calls **Google Gemini** for the smart suggestions.
4. When **offline/no API key**, it **falls back to built-in rules** so it still works.
5. HR can also act directly ("approve this leave", "resolve this security event") in one click - the Intelligence service performs the real action by calling the service that owns that data (e.g. the Time-Off service for leave, the Attendance service for security events) over its internal API, then reports back.

---

# PART 5 - One-sentence cheat sheet for every module

Use these as quick talking points. Say each in ONE breath.

**Everyone uses:**
- **Login / Auth** - "The gateway. Logs people in, gives a token, and blocks attackers with a lockout."
- **Attendance** - "Who was present and when. Clock-in/out records for everyone, with alerts if something's wrong."
- **Leave** - "Time off requests. Employees file, HR approves/rejects, and balances are updated."
- **Overtime** - "Extra hours worked. Employees request, HR approves (even in bulk)."
- **Timesheets** - "A weekly summary of hours with a live 'This Week' popup and a history table. Employees submit, HR approves."

**Workforce Admin only:**
- **Employees / Registration** - "The company directory. HR adds, edits, and removes employees, and each one automatically gets a login account."
- **Face Registration** - "Turns a person's face into a 128-number face print so the kiosk can recognize them."
- **Departments & Roles** - "The org chart - what departments exist and what job titles belong to them."
- **Analytics** - "Charts and dashboards summarizing attendance, overtime, etc."
- **AI Decision Support** - "An assistant that points out problems in the data and lets HR act on them."
- **Reports** - "Printable documents - weekly timesheet summaries, attendance summaries, and more."
- **Kiosk Setup/Controls** - "Configure the door device: name, location, PIN, active on/off."

**HR + Employee:**
- **Shifts & Schedules** - "When each employee works. HR can auto-generate a whole week of schedules."
- **Notifications** - "Announcements and alerts, with read/unread tracking for each employee."
- **Settings** - "Company info and system preferences. HR can edit; employees see the formatting settings."

---

# PART 6 - Security, explained simply

These are the exact things the panel may probe. Say them confidently.

| Topic | Plain explanation |
|-------|-------------------|
| **Sanctum tokens** | The login "ID badge". Each badge belongs to one user and is revoked on logout. |
| **Password hashing (bcrypt)** | Passwords are scrambled before storage, so even the database can't reveal the original. |
| **Role-based access (RBAC)** | Employees and Workforce Admin see different menus. Admin-only routes are protected server-side. |
| **OTP reset** | Forgot password sends a 6-digit code that expires in 10 minutes and works only once. |
| **Login lockout** | 5 wrong attempts = 60-second cool-down (stops guessing/brute-force). |
| **Password policy** | Min 8 + upper + lower + number (enforced on change, reset, and registration). |
| **Throttling** | Forgot-password and reset endpoints are throttled (limited requests per minute). |
| **Kiosk PIN** | A PIN is stored only as a SHA-256 hash (a one-way code), never in plain text. |
| **Public kiosk endpoints** | The device needs no login, but it can ONLY see minimal info (never salary, email, phone, address). |

**One killer closing line:**
> "Security is enforced on the **backend**, not the frontend - the frontend only *shows* what the backend allows. So even if someone edits the browser, they can't access anything they're not authorized to."

---

# PART 7 - Analogies glossary (memorize a few)

| Term | Analogy |
|------|---------|
| Token | An ID badge you carry; shown at every door. |
| bcrypt hashing | A scrambled egg - you can't un-scramble it. |
| OTP | A one-time door code that expires. |
| Rate limiting / lockout | An ATM that shuts its keypad after too many wrong PINs. |
| Face descriptor | A barcode made from your face. |
| 0.6 threshold | "How similar is close enough?" - like a passport-booth vs passport-photo match. |
| Role / RBAC | A key card that only opens your floor. |
| Frontend vs backend | Waiters & display (frontend) vs kitchen & manager (backend). |
| Database tables | File cabinets/sheets, one cabinet per thing (employees, attendance, etc.). |

---

# PART 8 - Demo-day script (practice out loud)

**Demo accounts (they exist in your database):**
- Workforce Admin: `admin@workforcepro.com` / `Admin@123`
- Employee: `employee@workforcepro.com` / `Employee@123`
- Fercy (Employee): `fercy.miano84@gmail.com`
- Balderama (Employee): `randycapalar@gmail.com`

**30-second version (opening line):**
"This is WorkForce Pro, a workforce management system for Archon Nell Inc. It handles HR's daily work - registering employees, attendance by facial recognition, schedules, leave, overtime, and timesheets. There are three types of users: the Workforce Admin, employees, and the kiosk device at the entrance. The system is a React frontend talking to 8 independent Laravel microservices, each with its own PostgreSQL database."

**2-minute tour (pick the extras that fit your demo):**
1. Log in as **Workforce Admin** → show the dashboard.
2. Open **Employees** → show the directory, note each employee has a login account.
3. Open **Analytics** → "this summarizes everything".
4. Open **AI Decision Support** → "the assistant flags problems in the data; HR can act in one click".
5. Switch to **Employee** login → show "My Attendance", "My Schedule", "My Leave", and My Timesheet → click **"This Week"** to show the live popup and the history list beneath it.
6. Optional: open the **Kiosk** screen → walk through face/PIN clock-in.

**Closing line:**
"The key wins of this project: attendance via facial recognition that works offline, one system for HR that replaces paper/Excel, and AI-assisted management decisions - all role-protected and secure."

**If a panelist asks "why did you pick these technologies?"**
- React/Vite + Tailwind → fast, modern web interface that runs in any browser.
- Laravel → a mature PHP backend with built-in security (auth, validation, hashing).
- PostgreSQL → a reliable relational database that fits structured HR data.
- Google Gemini (with offline fallback) → smart insights even when the internet is unavailable.

---

# PART 9 - Likely trap questions + one-line answers

**Q: What is the difference between an Employee and the Workforce Admin account?**
A: The Workforce Admin has full access and management rights; an Employee only sees and manages their own records. It's enforced on the backend, not just hidden in the menu.

**Q: How do you know a face matches?**
A: Each face is saved as a 128-number descriptor. The kiosk compares the new capture to the stored one; a distance below 0.6 means it's the same person.

**Q: What happens if there's no internet at the demo?**
A: Face recognition runs locally in the browser, AI falls back to rule-based mode, fonts and files are self-hosted, and all services (database, queue, cache) run locally. Only email/OTP and Gemini need the internet.

**Q: Why can't the admin reset their own password?**
A: The admin account is a fixed reserved credential. Employees use the OTP email flow; the admin account is deliberately protected from self-reset.

**Q: How do you prevent someone guessing passwords?**
A: Five failed attempts trigger a 60-second lockout, plus the password policy and bcrypt hashing.

**Q: Where is data stored?**
A: In 8 separate PostgreSQL databases, one per microservice — `core` holds users/employees/departments/roles, `attendance` holds attendance + security events, `scheduling` holds shifts, `timeoff` holds leave + overtime, `payroll` holds timesheets, `communications` holds notifications, `configuration` holds settings, and `intelligence` holds analytics + AI results. Services that need another service's data keep a small, periodically-synced read-only copy rather than sharing a database.

---

# PART 10 - Your study plan for the next few days

1. **Day 1:** Read Parts 1-4 twice. Say Part 1's 5 sentences out loud.
2. **Day 2:** Practice Part 4's flows and Part 5's cheat sheet out loud (one breath each).
3. **Day 3:** Run the demo yourself (login as HR, browse Employees/Analytics/AI, then as Employee). Play with the kiosk screen.
4. **Day 4:** Do the 2-minute tour script out loud. Have someone (or the mirror) quiz you with Part 9.
5. **Day before defense:** Skim the System Workflow Guide for any module you feel shaky on.

> The biggest secret: **the panel wants to hear you tell the story, not quote code.**
> Master the story and you've already passed.

---

# PART 11 - Monolith vs Microservices (you WILL be asked this)

The "scariest" architecture question. Your answer is strong and true, and it has a before/after:
**this system started as one Laravel monolith. We migrated it to 8 independent microservices using the Strangler Fig pattern — pulling one domain out at a time, verifying it with tests, then moving to the next. That migration is now COMPLETE: all 8 domains (auth/identity, analytics+AI, attendance, scheduling, time-off, payroll, communications, configuration) run as separate Laravel apps, each on its own port, each with its own PostgreSQL database, each independently testable and independently startable.**

> This matches the requirement from the higher department: microservices format. We didn't rewrite the system from scratch — we proved the domain boundaries first inside the monolith (each module already owned its own tables and routes), then physically lifted each one out into its own app + database, one at a time, the safest possible order. Every extraction was verified by that service's own automated test suite before moving to the next. All 118 tests across the 8 services are green.

## What our system looks like TODAY (Strangler Fig, complete)

```
                ┌──────────────────────────────────────────────────────────┐
                │                        BROWSER                           │
                │             React SPA  (localhost:5173)                  │
                │        HR pages · Employee pages · Kiosk pages           │
                └──┬────────┬────────┬────────┬────────┬────────┬────────┬─┘
                   │        │        │        │        │        │        │
                   ▼        ▼        ▼        ▼        ▼        ▼        ▼
              ┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐┌───────┐
              │ core  ││intel- ││attend-││sched- ││time-  ││payroll││comms +│
              │ :8000 ││ligence││ance   ││uling  ││off    ││:8006  ││config │
              │       ││:8001  ││:8003  ││:8004  ││:8005  ││       ││:8007/8│
              └───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘└───┬───┘
                  ▼        ▼        ▼        ▼        ▼        ▼        ▼
              8 separate PostgreSQL databases, one per service, no sharing

   ★ No service connects to another service's database. Cross-service data
     arrives only over HTTP: either a periodic snapshot sync (for reference
     data like employee names) or a direct internal API call (for anything
     that must happen right now, like posting a notification).
   ★ Every service checks "who is this token?" by asking core's Auth
     service over HTTP — core is the one remaining source of identity truth,
     but it is no longer a gateway for anyone else's data or business logic.
   ★ If ANY one service goes down, the others keep working. Kill Intelligence
     and time & attendance, leave, payroll still run fine. Kill Communications
     and nobody gets a notification, but clock-ins/leave/payroll are unaffected.
     That's independent failure, proven across the whole system, not just one service.
```

**The one-line truth (memorize this):**
> "We migrated this system from a single Laravel monolith to 8 independent microservices using the Strangler Fig pattern — one domain extracted and verified at a time. That migration is complete: every domain (identity, analytics/AI, attendance, scheduling, time-off, payroll, communications, configuration) is now its own Laravel app, its own port, its own database, with 118 automated tests passing across all 8, and the frontend's proxy config is the only thing that routes requests to the right one."

## Why we did it in this order (your honest engineering answer)

- **Strangler Fig = safe migration:** pull one service out, verify it, move to the next. We never rewrote the whole system in one leap.
- **We extracted Intelligence (analytics + AI) first** because nothing else depends on it at runtime — HR can still clock people in, take leave, and run payroll even if that service is down. It was the safest domain to prove the pattern on before touching anything load-bearing.
- **Then we worked through the remaining seven** the same way: attendance, scheduling, time-off, payroll, communications, and configuration, with identity staying behind in `core`. Each got its own app, own database, own tests, before we moved on.
- **The department's microservices requirement is now fully and physically demonstrated:** 8 processes, 8 databases, real inter-service HTTP (auth checks, snapshot syncs, internal API calls) — not a diagram, a running system.

## How services stay in sync without sharing a database

Two mechanisms, chosen per need:

1. **Snapshot replication** — for reference data a service mostly *reads* (e.g. `attendance` needs employee names and leave records to compute Late/Absent/On-Leave), that service keeps a small local read-only copy, refreshed from the owning service over HTTP (`SnapshotSyncService` + `php artisan snapshot:sync`).
2. **Internal API calls** — for anything that must be correct *right now* (e.g. `intelligence` approving a leave request from the AI decision queue, or any service raising a notification), the service calls the owning service's `/internal/*` API directly, authenticated with a shared service token, instead of writing to data it doesn't own.

## The one-line difference (memorize this)

> A monolith is **one app, one database, everything in one place**.
> Microservices are **many small apps, each with its own database, talking over the network**.
> We migrated from the first to the second: **8 apps, 8 databases**, coordinated by snapshot sync + internal APIs instead of shared tables.

## If anyone says "you'll have to use microservices" or "why aren't you microservices?"

> "We already are — fully. Every one of our 8 domains runs as its own Laravel app on its own port with its own database, and each talks to the others only over HTTP: a snapshot sync for reference data, or a direct internal API call when something has to happen immediately. We can stop any one service and the rest keep running — that's independent failure, and we can demonstrate it live. We migrated there using the Strangler Fig pattern: extract one domain, verify it with its own test suite, move to the next — so the system stayed working through the whole migration instead of one risky big-bang rewrite."

---

# PART 12 - What/how/why for EVERY module (the complete memory map)

Use this as a rapid-fire review. One line = one idea. Cover the right column, then try to say the left column in your own words.

## The universal flow (applies to EVERY module)

> **What:** every module is just "show data" or "change data".
> **How:** a page calls an API → Laravel checks who you are → controller runs a rule → database is read or written → JSON comes back → screen updates.
> **Why:** this one pattern means security and validation are always in the same place (the backend) - never trust the buttons you see.

## Module-by-module (What / How / Why)

| Module | What it does | How it works | Why it matters |
|--------|-------------|--------------|----------------|
| **Login/Auth** | Proves who you are | Email+password checked against a bcrypt hash → issues a token | Nobody else can act as you; every action is traceable |
| **Employees** | The company's people database | CRUD on the `employees` table; generates `EMP2026xxxx` IDs | THE central entity - every other module hangs off the employee ID |
| **Face Registration** | Turns a face into a 128-number print | Stores `face_image` + `face_descriptor` JSON per employee | Lets the kiosk verify identity without passwords or staff |
| **Attendance (kiosk)** | The clock-in/out terminal | Face match (< 0.6 distance) + smart pre-checks → one row in `attendance` | Accurate, tamper-resistant attendance with zero manual work |
| **HR Attendance** | Fix/correct daily records | Approve, edit, delete rows; computed Late/Present/Absent | Keeps records honest; the audit trail source of truth |
| **Leave** | Time-off requests | Apply (Pending) → HR Approve/Reject → deducts balance → notify | Balances stay consistent; approved leave stops "Absent" flags |
| **Overtime** | Extra hours tracking | Same lifecycle as leave, PLUS reconciliation pushes approved OT into attendance + timesheets | Payroll numbers agree across every page |
| **Shifts/Schedules** | Who works when | Templates + generated/edited assignments in `shift_schedules` | Drives kiosk validation, Late/Present math, coverage analysis |
| **Timesheets** | Weekly hour summaries + a live "This Week" popup + full history | Auto-generated from attendance → "This Week" opens a live per-day breakdown; employee submits → HR approves → locked | Payroll-friendly, auditable, no manual summing |
| **Dashboard** | Today's numbers at a glance | Reads cached aggregates + live counts | Manager sees the company in 5 seconds |
| **Analytics** | Deep trend charts | `AnalyticsService` pre-computes 6 JSON sections into `analytics` table | Instant chart loads; heavy math runs once |
| **Reports** | Printable/CSV outputs | Reads live data + formats via `reportHelpers.js` | Proof and paperwork done from one button |
| **AI Decision Support** | AI insights + one-click actions | Reads 30 days of data → Gemini if online, else rule engine → decision queue | Flags problems HR would miss; actions reuse normal endpoints |
| **Security Events** | Log of suspicious kiosk activity | `face_mismatch`/`pin_failed` stored Open → HR resolves/escalates | Buddy-punching is caught and reviewable |
| **Notifications** | In-app bell messages | Backend INSERTs a row; bell polls unread count | People learn of approvals/leaves/SO immediately |
| **Kiosk Setup** | Configures the door device | PIN hash, location, verification method stored in `settings.kiosk` | The entrance behaves exactly how HR wants |
| **Settings/Profile** | App config + self-service edits | One settings row (JSON groups); profile edits by owner only | Flexible config; employees can't touch salary/department |

---

# PART 13 - Nuclear study session (do this TODAY, then teach back tonight)

> Goal: finish today with the story memorized. Tomorrow is only polish + demo.

| Hour | What to do | How to check yourself |
|------|-----------|----------------------|
| Now | Read Part 2 (roles) + Part 4 (4 flows) twice out loud | Close the file: say the 4 flows from memory |
| +30 min | Read Part 12 module map twice | Cover the table: name What/How/Why for all 17 modules |
| +60 min | Read Part 7 analogies + Part 11 (monolith) | Make your own analogy for: token, bcrypt, OTP, face print |
| +90 min | Read Part 6 security + Part 9 traps | Answer all 6 trap questions WITHOUT looking |
| +2h | Open the app, walk the 2-minute demo tour (Part 8) | Can you do it while talking? If not, redo it |
| Tonight | Have someone quiz you with Part 12 + 13 Q&A | Any wrong answer → re-read that module + say it again |

---

# PART 14 - The 50-question rapid-fire quiz (answer every one)

## Big picture (1-5)
1. What is WorkForce Pro? → A web workforce management system for Archon Nell Inc.
2. Name the 5 focus modules → Time&Attendance, Shift&Schedule, Leave, Timesheet, Analytics.
3. Name the three "users" → Workforce Admin, Employee, Kiosk (device).
4. What are the 3 tech layers? → React frontend, Laravel backend, PostgreSQL database.
5. What was the client problem? → Paper/Excel HR work: attendance, schedules, leave, timesheets was slow and error-prone.

## Architecture (6-12)
6. How does data move? → Page → api.js → Vite proxy routes by URL prefix → the owning microservice's Laravel route → Controller → its own SQL database → JSON → screen.
7. Why nine running programs? → Frontend (5173) + 8 microservices, each on its own port: core (8000), intelligence (8001), attendance (8003), scheduling (8004), timeoff (8005), payroll (8006), communications (8007), configuration (8008) — all against PostgreSQL (5432), one database per service. `start-all.ps1` boots all 9 and health-checks them.
8. What is a token? → ID badge issued at login by `core`, shown on every request, validated by whichever service receives it by asking `core` over HTTP, destroyed at logout.
9. What is middleware? → Bouncer that checks token + role before the controller runs, in every service.
10. What is a migration? → Table-building recipe. What is a seeder? → Data-filling script. Each service has its own set of both, for its own database.
11. Monolith vs microservices? → We migrated from one Laravel monolith to 8 independent microservices using the Strangler Fig pattern — one domain extracted and test-verified at a time. That migration is now complete: identity/auth, analytics+AI, attendance, scheduling, time-off, payroll, communications, and configuration each run as their own Laravel app, own port, own database. Cross-service data moves via snapshot sync (read-mostly reference data) or internal API calls (anything that must happen immediately) — never a shared database.
12. Why did we pick each tech? → React=fast UI, Laravel=secure backend (×8, one per domain), PostgreSQL=reliable relational DB (×8), Gemini=smart insights.

## Database (13-19)
13. How many tables? → 23 (14 business + 9 Laravel plumbing).
14. Which table is most important? → `employees` - everything links by `employee_id`.
15. What is a primary key? → Unique row ID (e.g. `EMP20260001`).
16. What is a foreign key? → A column pointing to another table's key (attendance.employee_id → employees.id).
17. What is a JOIN? → Combining two tables on their key to show related data together.
18. Why JSON columns? → Flexible config (leave_balances, kiosk, ai_resolved_insights).
19. How many employees/attendance rows are in the demo? → 12 employees, 190 attendance rows.

## Attendance rules (20-26)
20. When is someone Late? → Clock-in more than 15 min after shift start.
21. When is someone Present? → Clock-in within the 15-min grace.
22. When is someone Absent? → No clock-in + no approved leave + past 60-min grace.
23. What protects an on-leave employee from Absent? → Approved leave covering that date.
24. What does the kiosk refuse? → No schedule, shift ended, early clock-out, already clocked in.
25. What happens on face mismatch? → Blocked + `face_mismatch` security event + strikes → 60s lockout.
26. How does the face match work? → 128-number descriptor compared; distance < 0.6 = match; runs in-browser (offline).

## Leave & timesheet (27-33)
27. Leave statuses? → Pending → Approved/Rejected; employee can Cancel while Pending.
28. What happens on leave approval? → Balance deducted + notification + protects from Absent.
29. What is reconciliation (OT)? → Approved OT hours copied into attendance + timesheet so payroll agrees.
30. How is a timesheet born? → Auto-generated from that week's attendance rows.
31. Who submits/approves timesheets? → Employee submits own; HR approves/rejects.
32. Can an employee fix a missing clock-out? → No - only HR corrects records.
33. What's a "remind me to clock out"? → A self-nudge, max 1 per person per day.

## Security (34-41)
34. How are passwords stored? → bcrypt hash (one-way scramble), never readable.
35. Login lockout? → 5 wrong attempts → 60-second cool-down.
36. Password policy? → 8+ chars, uppercase, lowercase, digit.
37. OTP reset? → 6-digit code by email, 10-minute expiry, one-time use.
38. Why can't admin self-reset? → It's the reserved owner account.
39. Why are kiosk endpoints public but safe? → Minimal fields only (name, photo, dept, today's schedule) - never salary/email/phone/address.
40. Where is the kiosk PIN stored? → SHA-256 hash in settings.kiosk.
41. Frontend vs backend security? → Hiding buttons is convenience; the backend enforces real security.

## AI & analytics (42-47)
42. What does the AI read? → A snapshot of the last 30 days (attendance, pending leaves/OT, shift coverage, open security events) that its own service pulls over HTTP from the core and keeps in its own database.
43. What are the two "brains"? → Google Gemini (online) or built-in PHP rule engine (offline).
44. What 4 things does AI return? → healthScore, insights, decisionQueue, source.
45. What actions can HR take in one click? → Approve/reject leave & OT, resolve security events.
46. Why cached analytics? → Heavy math runs once via AnalyticsService; charts stay instant.
47. What are the 6 analytics sections? → attendance_trend, department_productivity, leave_trend, overtime_summary, punctuality_score, payroll_discrepancy — all computed by the separate Intelligence service on its own database.

## People & registry (48-50)
48. Who are the demo logins? → admin@workforcepro.com/Admin@123 and employee@workforcepro.com/Employee@123.
49. Team members? → Fercy, Asniyah, John Paul, Florita, Kyle.
50. The client? → Archon Nell Inc., contact Nardz Olarte (QA/QC supervisor).
51. What does the timesheet "This Week" popup show? → A live, per-day breakdown of the current week (Date, Day, Status, Clock In, Clock Out, Break, Hours) with this week's totals — even before any timesheet is saved. It's an "Auto" record until the week is submitted.
52. What is "Timesheet History"? → The list below the My Timesheet summary card: every saved week (range, status, Regular/Overtime/Total hours, submitted date). Clicking a row reopens that week's full popup.

---