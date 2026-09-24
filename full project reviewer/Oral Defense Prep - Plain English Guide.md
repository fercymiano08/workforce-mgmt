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
4. The system has a **frontend** (what you see in the browser) and a **backend built as one Laravel application with one database** — organized inside into 8 clear domains (identity, attendance, scheduling, leave/overtime, payroll, communications, configuration, and analytics/AI), because WorkForce Pro is itself just ONE microservice inside the bigger E-Commerce Enterprise platform the team is building.
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

**Key point to remember:** The kiosk does NOT log in with a username and password. It talks to the backend through its own special kiosk endpoints, unlocked by the kiosk PIN, which gives the device a signed, expiring token. That's why it's called a "device", not a role.

---

# PART 3 - How the app is built (the 3 layers)

Think of the system like a **restaurant**:

- **Frontend** *(React + Vite)* - draws every screen you see in the browser and knows nothing about databases.
  → Like the *waiters and the menu* shown to customers.
- **Backend** *(Laravel, one application)* - the "brain". Internally it's organized into 8 clear domains/folders (identity, attendance, scheduling, leave/overtime, payroll, communications, configuration, analytics/AI), but it's ONE app, checking who you are and following the rules for every request.
  → Like *one kitchen with 8 stations* - grill, salads, desserts, and so on - each station has its own job and its own recipes, but they all share the same pantry and the same head chef, instead of eight separate restaurants passing plates back and forth.
- **Database** *(PostgreSQL, one database - `workforce_mgnt`)* - stores every record in one shared database, with tables grouped by domain (employees, attendance, leave, timesheets, etc.).
  → Like *one filing room* with a clearly labeled cabinet per department, not eight separate locked rooms down the hall from each other.

**The flow (always):**
Browser (frontend) → sends a request to `/api/...` → the frontend's proxy (Vite in dev / nginx in Docker) forwards it to the one Laravel backend on port 8000 → a controller in the matching domain folder handles it, following that domain's rules → Eloquent models read/write the one PostgreSQL database → sends back an answer (JSON) → frontend shows it on screen.

> If a panelist asks "how does data move?", this one sentence answers it. If they follow up with "so it's all one backend?" — yes, and that's intentional: Workforce Management is one team's domain with one consistent data model, so it's built as one cohesive, independently-deployable unit - a single microservice inside the larger E-Commerce Enterprise platform - organized internally by domain so the code stays easy to navigate, test, and hand off.

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
- Forgot password → a **6-digit code (OTP)** is emailed; valid **1 minute**, one-time use (then request a new one).
- Workforce Admin (admin) account **cannot** reset via forgot-password (it's the reserved owner account).

## Flow 2 - Attendance with facial recognition (the kiosk)

**Plain story:**
1. When a person is registered, the system captures their face and turns it into a **"face print"** - a special 128-number code that describes the face.
2. At the door, the kiosk camera captures the person's face again → the browser makes that same kind of face print on your own computer (no internet needed).
3. Backend compares the new face print to the saved one using a **distance score**.
   - Score below 0.6 → **match** → clock in/out recorded.
   - Score above 0.6 → **not a match** → a **security event** is logged for HR to review.
4. Wrong faces / failed PINs get recorded as **security events**, which the HR can see (and the AI assistant can flag).

**The attendance rules the kiosk enforces (memorize this table):**

| Situation | What the kiosk does |
|-----------|--------------------|
| No shift scheduled today | **Blocked** - "No Shift Scheduled Today" |
| Shift already over | **Blocked** - "Shift Over" |
| Clock in within 15 min of the shift start (up to and including 15:00) | **Present**, no popup |
| Clock in later than that | Popup **"You Are Late"** → can still "Clock In Anyway" → recorded **Late**, admins notified |
| Clock in before the shift starts | Popup "Clocking In Early" → can continue |
| Clock out before the shift end | Must **state a reason first** (reason picker) → recorded "Early Leave" |
| Clock out at/after the shift end | "Clocked Out" - success. If it is more than 15 min past the end with no approved overtime: amber **"Overtime Not Approved"** warning - the extra time is not counted (the day ends at the approved end) |
| Someone else's face | Red **"Identity Verification Failed"** warning, security event logged, **Workforce Admins alerted**, 3 strikes = 60 s lockout |

> **Key defense point:** these rules are enforced by the **server**, not just the screen. The server uses its own clock and looks up the shift itself, so a wrong tablet clock or a hand-made request can't fake an on-time punch. The popups just explain the rule to the employee first.

> **Also worth knowing:** the 15-minute number above is not hardcoded. Workforce Admin Settings has a **Time Manager** section where the admin configures, in one place, the late grace period, the no-show alert threshold, break-time rules, and the early-leave policy — these used to be fixed constants in the code and are now stored as system settings the admin can change.

**While scanning**, the camera shows a **face-shaped oval** with a sweeping scan band and dots that pulse over the face, and the oval turns green when identity is confirmed.

**Extra defense points:**
- The face-api models run **locally in the browser** (folder `public/models/`) → works **offline**.
- The whole task works even without internet - that matters for a demo.
- Face scanning is made faster by warming up the model while the modal opens (so the first real scan isn't slow) and by scanning one stable snapshot of the camera frame instead of repeating the same detection on the raw video.

## Flow 3 - An employee's everyday: schedule → clock in → leave → timesheet

**Plain story (one smooth sentence):**
1. HR **registers** the employee (start with basic info + a password + face).
2. HR **assigns a schedule** (the Standard Shift) - by hand, or with **+ Automated Shift**, where the rules build a draft and HR approves it.
3. Each day the employee **clocks in/out** (face at the kiosk).
4. If they can't come in, they **file a leave request**; HR **approves or rejects** it, and a "leave balance" is updated.
5. Weekly, the system builds a **timesheet** (hours worked). When the week ends the employee reviews and submits it (or the system submits it Monday noon); HR approves it, or rejects it with a reason, and approved ones go to payroll once. Employees can also open a live **"This Week"** timesheet and a **history** of past weeks right from the My Timesheet page.
6. If they work extra hours, they can file an **overtime request**, which HR approves (can be done in bulk).

## Flow 4 - The "brain": Analytics + AI decision support (HR only)

**Plain story:**
1. The **Analytics** page shows dashboards: who's late, attendance rates, overtime summaries, etc.
2. The **AI Decision Support** page looks at that data and gives HR **suggestions** (e.g. "too many absences for this department", "overtime trending up").
3. When online, the app calls **Google Gemini** for the smart suggestions.
4. When **offline/no API key**, it **falls back to built-in rules** so it still works.
5. HR can also act directly ("approve this leave", "resolve this security event") in one click - the intelligence domain performs the real action with the same in-process service classes the manual path uses (approving a leave checks the real `Leave` is still Pending, then updates it, in one database), then reports back.

---

# PART 5 - One-sentence cheat sheet for every module

Use these as quick talking points. Say each in ONE breath.

**Everyone uses:**
- **Login / Auth** - "The gateway. Logs people in, gives a token, and blocks attackers with a lockout."
- **Attendance** - "Who was present and when. Clock-in/out records for everyone, with alerts if something's wrong."
- **Leave** - "Time off requests. Employees file, HR approves/rejects, and balances are updated."
- **Overtime** - "Extra hours worked. Employees request, HR approves (even in bulk)."
- **Timesheets** - "A weekly summary of hours with a live 'This Week' popup and a history table. Employees submit after the week ends, HR approves or rejects with a reason."

**Workforce Admin only:**
- **Employees / Registration** - "The company directory. HR adds, edits, and removes employees, and each one automatically gets a login account."
- **Face Registration** - "Turns a person's face into a 128-number face print so the kiosk can recognize them."
- **Departments & Roles** - "The org chart - what departments exist and what job titles belong to them."
- **Analytics** - "Charts and dashboards summarizing attendance, overtime, etc."
- **AI Decision Support** - "An assistant that points out problems in the data and lets HR act on them."
- **Reports** - "Printable documents - weekly timesheet summaries, attendance summaries, and more."
- **Kiosk Setup/Controls** - "Configure the door device: name, location, PIN, active on/off."

**HR + Employee:**
- **Shifts & Schedules** - "When each employee works. HR can let the rules build a draft for up to 4 weeks, then review and approve it."
- **Notifications** - "Announcements and alerts, with read/unread tracking for each employee."
- **Settings** - "Company info and system preferences, including a Time Manager tab for grace period, no-show threshold, break rules and early-leave policy. HR can edit; employees see the formatting settings."

---

# PART 6 - Security, explained simply

These are the exact things the panel may probe. Say them confidently.

| Topic | Plain explanation |
|-------|-------------------|
| **Sanctum tokens** | The login "ID badge". Each badge belongs to one user and is revoked on logout. |
| **Password hashing (bcrypt)** | Passwords are scrambled before storage, so even the database can't reveal the original. |
| **Role-based access (RBAC)** | Employees and Workforce Admin see different menus. Admin-only routes are protected server-side. |
| **OTP reset** | Forgot password sends a 6-digit code that expires in 1 minute and works only once. |
| **Login lockout** | 5 wrong attempts = 60-second cool-down (stops guessing/brute-force). |
| **Password policy** | Min 8 + upper + lower + number (enforced on change, reset, and registration). |
| **Throttling** | Forgot-password and reset endpoints are throttled (limited requests per minute). |
| **Kiosk PIN** | A PIN is stored only as a SHA-256 hash (a one-way code), never in plain text. |
| **Kiosk device token** | The device has no login, but entering the kiosk PIN gives it a signed token that lasts until midnight (one PIN entry per day); without the token the kiosk endpoints answer 401. Even with it, it only sees minimal info (never salary, email, phone, address). |
| **Server-enforced attendance rules** | No shift / finished shift = refused, Present vs Late is computed from the *server's* clock, and an early clock-out must carry a reason - all checked on the backend, so the kiosk screen can't be bypassed. |
| **Face-mismatch alert** | A face that doesn't match the ID entered is logged as a security event AND every Workforce Admin gets a high-priority notification right away. |
| **Session token expiry** | An employee login token auto-expires in 3 minutes and is extended only by real activity (mouse/keys/touch), so walking away signs you out. Every request is checked against it in-process by the single backend — no separate identity hop to cache. |

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
"This is WorkForce Pro, a workforce management system for Archon Nell Inc. It handles HR's daily work - registering employees, attendance by facial recognition, schedules, leave, overtime, and timesheets. There are three types of users: the Workforce Admin, employees, and the kiosk device at the entrance. The system is a React frontend talking to one Laravel backend and one PostgreSQL database - internally organized into 8 clear domains, and built as one of the microservices inside our larger E-Commerce Enterprise platform."

**2-minute tour (pick the extras that fit your demo):**
1. Log in as **Workforce Admin** → show the dashboard.
2. Open **Employees** → show the directory, note each employee has a login account.
3. Open **Analytics** → "this summarizes everything".
4. Open **AI Decision Support** → "the assistant flags problems in the data; HR can act in one click".
5. Switch to **Employee** login → show "My Attendance", "My Schedule", "My Leave", and My Timesheet → click **"This Week"** to show the live popup and the history list beneath it.
6. Optional: open the **Kiosk** screen → walk through face/PIN clock-in.

**Kiosk demo checklist (each line is a different popup - pick 2-3):**
- An employee with **no shift today** tries to clock in → red **"No Shift Scheduled Today"**. *(Prepare: leave one employee unscheduled for today.)*
- An employee whose shift started **more than 15 minutes ago** → amber **"You Are Late"** → **Clock In Anyway** → green-amber "Clocked In (Late)"; the Admin's bell shows the late alert.
- An employee **within 15 minutes** of the start → straight to **"Clocked In Successfully"** (Present).
- **Clock out early** → the reason picker won't continue until a reason is chosen → "Clocked Out Early".
- Type someone else's ID and show your own face → red **"Identity Verification Failed"** → switch to the Admin account and show the **Face Mismatch** notification + the Security Events entry.
- Remember: the demo only shows the on-time / late / early popups for a shift that exists **today** - check the schedule beforehand.

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

**Q: Can an employee clock in when they have no shift, or after their shift ended?**
A: No. The server refuses it ("No Shift Scheduled Today" / "Shift Over"). It's checked on the backend, so it can't be bypassed from the kiosk screen.

**Q: What if someone clocks in late?**
A: Up to and including 15 minutes after the shift start is Present. After that the kiosk shows an "You Are Late" warning and still lets them clock in ("Clock In Anyway"); it's recorded as Late and the Workforce Admins are notified.

**Q: What if someone clocks in as another person?**
A: The face doesn't match, so the kiosk shows an "Identity Verification Failed" warning, logs a security event and alerts the Workforce Admins immediately. Three failed attempts lock the terminal for 60 seconds.

**Q: Why is the system slow on your laptop but fast in Docker?**
A: Every action makes several requests and each one boots the Laravel framework (about half a second on a low-power laptop CPU), locally run on PHP's built-in single-request server. We measured it. We cut the load in code (light employee lists, bounded notification batches, concurrent alert pushes, short timeouts on external calls) — and the pre-consolidation performance burden (identity hops to `core`, replica sync) is simply gone, since it's one in-process backend now. The remaining slowness is mostly the laptop (a low-power CPU, limited free RAM, running on battery) and the one-request-at-a-time local server, not a bug; Docker's multiple workers help.

**Q: Where is data stored?**
A: In **one** PostgreSQL database, `workforce_mgnt` — 31 tables: 22 business tables (users, employees, attendance, shifts, leaves, timesheets, notifications, security events, settings, AI insights...) plus 9 Laravel framework tables. The database used to be split into 8 separate databases, one per service, with synced read-only copies so services could see each other's data; after consolidation every table has exactly one copy, and any domain that needs another domain's data just queries the real table in the same database.

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

# PART 11 - Why This Is a Monolith Inside One Microservice (you WILL be asked this)

The "scariest" architecture question — and your answer is actually a strength, not a weakness, once you say it in the right order. Here's the honest before/after:

**The bigger picture first: the team is building an E-Commerce Enterprise platform, and THAT platform is what's organized as microservices** — separate subsystems like Orders, Inventory, Customers, and **Workforce Management**, each one its own independently-deployable service with its own database. **WorkForce Pro IS one of those microservices.** During development, we originally misread that requirement and split Workforce Management's own internals into 8 further "microservices" (auth, attendance, scheduling, leave, payroll, notifications, settings, analytics) — 8 separate Laravel apps, 8 databases, talking to each other over HTTP. On review, we caught that this was over-engineering: we were slicing up ONE bounded domain into pieces that all shared the same data model, for no real benefit. **We corrected it**: Workforce Management is now ONE Laravel application with ONE PostgreSQL database (`workforce_mgnt`), organized internally into 8 clear domains (identity, attendance, scheduling, time-off, payroll, communications, configuration, analytics/AI) as folders/namespaces — not separate deployments.

> Say it plainly if asked "so is this a monolith or microservices?": **"Both, correctly. At the platform level, we use microservices — Workforce Management is one of them. Inside Workforce Management, it's a single, cohesive application, because internally it's one domain, one team, one data model."**

## What our system looks like TODAY (one microservice, one app, one database)

```
                ┌──────────────────────────────────────────────────────────┐
                │                        BROWSER                           │
                │             React SPA  (localhost:5173)                  │
                │        HR pages · Employee pages · Kiosk pages           │
                └───────────────────────────┬────────────────────────────-─┘
                                             │  one proxy target
                                             ▼
                ┌──────────────────────────────────────────────────────────┐
                │        WORKFORCE MANAGEMENT — one Laravel app :8000      │
                │  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐        │
                │  │ Identity ││Attendance││Scheduling││ Time-off │  ...   │
                │  └──────────┘└──────────┘└──────────┘└──────────┘        │
                │   (8 domain folders: routes + controllers + models -    │
                │    grouped by topic, not separately deployed)           │
                └───────────────────────────┬──────────────────────────────┘
                                             ▼
                          ONE PostgreSQL database: workforce_mgnt

   ★ One process, one codebase, one deploy. No inter-service HTTP calls,
     no SERVICE_TOKEN, no cron job copying "replica" tables between
     services, no /api/internal/* endpoints. That entire layer of
     plumbing is gone because it was never solving a real problem here.
   ★ Docker Compose now starts 4 containers: postgres, app, scheduler,
     frontend. (It used to be 15: 8 services + 5 schedulers + postgres +
     frontend.) The "9 running processes" become 3: backend, scheduler,
     frontend - plus the one database.
   ★ At the PLATFORM level (the E-Commerce Enterprise system), Workforce
     Management is still exactly the kind of thing that should be its own
     microservice - it will talk to Orders/Inventory/Customers and whatever
     else the platform needs, as one unit, over the platform's own API
     boundary. That boundary is real. Splitting Workforce Management's
     OWN internals into 8 more pieces was not.
```

**The one-line truth (memorize this):**
> "Our E-Commerce Enterprise platform is organized as microservices, and Workforce Management is one of them - a single, independently-deployable Laravel application with its own database. Internally, it's organized into 8 clear domains as folders, not 8 separate deployments, because there's no reason to split a single team's domain with one consistent data model into pieces that just have to call each other over the network."

## Why we corrected the 8-way split (your honest engineering answer)

- **We caught it ourselves, during review** — that's iterative engineering working the way it's supposed to, not a failure. Good teams re-examine architecture decisions before they calcify, and we did that with days to spare instead of finding out the hard way after the defense.
- **Splitting Workforce Management into 8 services added cost with no benefit.** Nothing in this system needs independent scaling (attendance doesn't get 10x the traffic of payroll), a different release schedule (we ship them all together anyway), or a different team owning each piece (it's one team). Splitting it gave us 8 databases to keep in sync, a background job copying "replica" tables so services could see each other's data, and network calls between pieces of the SAME domain — pure overhead.
- **The real microservice boundary is one level up.** Workforce Management as a WHOLE is the right unit to separate from Orders, Inventory, Customers, and the other subsystems of the e-commerce platform — those genuinely are different domains, likely different teams, and could genuinely need independent scaling or release schedules. That's where the microservices pattern earns its keep.
- **The fix was mechanical, not a rewrite:** the 8 domains' routes, controllers, and models moved into one Laravel app's folders, the 8 databases merged into one (`workforce_mgnt`), and the inter-service HTTP glue (SERVICE_TOKEN, snapshot sync, `/internal/*` routes) was deleted because nothing needed it anymore.
- **Every business-rule test survived.** Consolidation only removed tests that existed purely to check the removed inter-service HTTP transport (e.g. "does service A correctly call service B's internal API"). Every test that checks an actual business rule (attendance rules, leave balances, payroll math, security lockouts, etc.) was kept, and the suite has grown since with new features (early-leave reasons, audit logging, timesheet history) to **310 tests, 1272 assertions, all passing today**.

## How the 8 domains stay organized without 8 databases

Inside the one Laravel app, each domain is just a folder grouping: its own routes file, its own controllers, its own Eloquent models - all pointed at the same `workforce_mgnt` database. Need attendance data while approving a leave request? It's a normal Eloquent relationship or a query in the same database - no HTTP call, no token, no waiting for a sync job. That's the entire "how do the pieces talk to each other" question now: they don't need to talk, because they're already in the same process reading the same tables.

## The one-line difference (memorize this)

> A monolith is **one app, one database, everything in one place**.
> Microservices are **many independently-deployable services, each owning its own data**.
> **Workforce Management is a monolith** - and that's correct, because it's ONE microservice inside the E-Commerce Enterprise platform, which IS built as many services. We don't need microservices inside our microservice.

## If anyone says "you have to use microservices" or "why aren't you microservices?"

> "We are - at the level where it matters. Our E-Commerce Enterprise platform is organized as microservices: Orders, Inventory, Customers, and Workforce Management are each their own independently-deployable service with its own database. Workforce Management is that service. Early in development we tried splitting Workforce Management's own internals into 8 more microservices, and during review we recognized that was over-engineering - it's one team's domain with one data model, and splitting it just added network calls, a sync job, and 8 databases without giving us anything we needed, like independent scaling. So we consolidated it back into one Laravel application with one database, organized internally into 8 clear domains. That's the correct shape: microservices between subsystems that are genuinely different domains, a cohesive application inside each one."

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
| **Face Registration** | Turns a face into a 128-number print | Stores `face_image` + `face_descriptor` JSON per employee in `employees`, in the one database; list responses omit both and the Edit modal fetches them on demand | Lets the kiosk verify identity without passwords or staff |
| **Attendance (kiosk)** | The clock-in/out terminal | Face match (< 0.6 distance) + server-enforced rules (shift required, Present ≤ 15 min / Late after, reason for early leave) → one row in `attendance` | Accurate, tamper-resistant attendance with zero manual work |
| **HR Attendance** | Fix/correct daily records | Approve, edit, delete rows; computed Late/Present/Absent | Keeps records honest; the audit trail source of truth |
| **Leave** | Time-off requests | Apply (Pending) → HR Approve/Reject → deducts balance → notify | Balances stay consistent; approved leave stops "Absent" flags |
| **Overtime** | Extra hours tracking | Same lifecycle as leave, PLUS reconciliation pushes approved OT into attendance + timesheets | Payroll numbers agree across every page |
| **Shifts/Schedules** | Who works when | Templates + generated/edited assignments in `shift_schedules` | Drives kiosk validation, Late/Present math, coverage analysis |
| **Timesheets** | Weekly hour summaries + a live "This Week" popup + full history | Auto-generated from attendance → "This Week" opens a live per-day breakdown; employee submits (or auto-submitted Monday noon) → HR approves / rejects with a reason → sent to payroll once; hours freeze after submitting | Payroll-friendly, auditable, no manual summing |
| **Dashboard** | Today's numbers at a glance | Reads cached aggregates + live counts | Manager sees the company in 5 seconds |
| **Analytics** | Deep trend charts | `AnalyticsService` pre-computes 6 JSON sections into `analytics` table | Instant chart loads; heavy math runs once |
| **Reports** | Printable/CSV outputs | Reads live data + formats via `reportHelpers.js` | Proof and paperwork done from one button |
| **AI Decision Support** | AI insights + one-click actions | Reads 30 days of data → Gemini if online, else rule engine → decision queue | Flags problems HR would miss; actions reuse normal endpoints |
| **Security Events** | Log of suspicious kiosk activity | `face_mismatch`/`pin_failed` stored Open → HR resolves/escalates | Buddy-punching is caught and reviewable |
| **Notifications** | In-app bell messages | Backend INSERTs a row; bell refreshes every 30 s while the tab is visible (newest 200) | People learn of approvals/leaves/SO immediately |
| **Kiosk Setup** | Configures the door device | PIN hash, location, verification method stored in `settings.kiosk` | The entrance behaves exactly how HR wants |
| **Settings/Profile** | App config (admin) + a separate My Profile page for employees | One settings row (JSON groups) incl. a **Time Manager** tab (late grace period, no-show alert threshold, break-time rules, early-leave policy — now admin-configurable, not hardcoded); Employee Settings = password + appearance only; My Profile edits contact info + photo with validation, salary and face template never sent | Flexible config; employees can't touch salary/department; Profile (who I am) is split from Settings (how the app behaves) |

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
6. How does data move? → Page → api.js → the frontend's proxy forwards it to the one Laravel backend on port 8000 → Controller in the matching domain folder → Eloquent → the one PostgreSQL database → JSON → screen.
7a. Is Docker used? → Yes, as an alternative way to run the whole system. Docker Compose starts 4 containers: PostgreSQL, the app (Laravel), a scheduler, and the frontend (nginx). No features changed (only a few small bug fixes found while testing); Docker only changes how it is built and started. It targets development/demonstration on one machine — no cloud, no HTTPS, no CI/CD yet.
7. Why so few running programs? → Frontend (5173) + one Laravel backend on port 8000 + one scheduler, all against one PostgreSQL database (5432). That's 3 processes plus the database — down from an earlier design with 8 separate services, because Workforce Management is one cohesive domain, not eight.
8. What is a token? → ID badge issued at login by the backend, shown on every request, validated by the same backend, destroyed at logout.
9. What is middleware? → Bouncer that checks token + role before the controller runs.
10. What is a migration? → Table-building recipe. What is a seeder? → Data-filling script. One Laravel app, one set of migrations and seeders, for the one database.
11. Monolith vs microservices? → Our E-Commerce Enterprise platform is organized as microservices, and Workforce Management is one of them — one Laravel application, one PostgreSQL database, independently deployable. Internally it's organized into 8 clear domains (identity, attendance, scheduling, time-off, payroll, communications, configuration, analytics/AI) as folders, not separate services, because it's one team's domain with one data model. We briefly split it into 8 separate services early on, caught that it was over-engineering during review, and consolidated it back — no inter-service HTTP, no shared-tables workaround needed anymore.
12. Why did we pick each tech? → React=fast UI, Laravel=secure backend, PostgreSQL=reliable relational database, Gemini=smart insights.

## Database (13-19)
13. How many tables? → 31 (22 business + 9 Laravel plumbing). The 22 business tables include the newest: `early_clock_outs` (early-leave reasons) and `audit_events` (the audit trail).
14. Which table is most important? → `employees` - everything links by `employee_id`.
15. What is a primary key? → Unique row ID (e.g. `EMP20260001`).
16. What is a foreign key? → A column pointing to another table's key (attendance.employee_id → employees.id).
17. What is a JOIN? → Combining two tables on their key to show related data together.
18. Why JSON columns? → Flexible config (leave_balances, kiosk, ai_resolved_insights).
19. How many employees/attendance rows are in the demo? → 10 seeded demo employees (plus the admin/employee demo accounts), with attendance rows generated from their schedules.

## Attendance rules (20-26)
20. When is someone Late? → Clock-in more than 15 min after shift start (08:15:01 or later for an 08:00 shift). The server decides, from its own clock.
21. When is someone Present? → Clock-in within the 15-min grace (08:15:00 is still on time).
22. When is someone Absent? → No clock-in + no approved leave + past 60-min grace.
23. What protects an on-leave employee from Absent? → Approved leave covering that date.
24a2. What happens if I work past 5 PM without an approved overtime request? → It is NOT counted: your day ends at 5:00 PM even if you tap out at 5:03, and the kiosk warns you at clock-out. The real punch is kept, so HR can still bring the time back by approving a request. Overtime is paid only for time that was approved AND worked (the smaller of the two, per day). You can file a request for a day in the past week and HR can still approve it.
24. What does the kiosk refuse? → No schedule today, shift already ended, already clocked in, approved leave. All enforced on the server.
24a. What does the kiosk do when someone is late? → Warns ("You Are Late") but lets them "Clock In Anyway"; recorded Late; admins notified.
24b. What happens on an early clock-out? → Never refused for a real reason, but a reason must be picked first (Feeling Unwell / Family Emergency / Personal Emergency / Other). It is treated as a CLAIM, not a fact: 2 free early clock-outs per 30 days, the 3rd is unexcused automatically; a sick claim needs a medical certificate within 48 hours or it becomes unexcused; the admins are alerted about EVERY early clock-out; 3 people using the same excuse the same day is flagged.
25. What happens on face mismatch? → Red warning + `face_mismatch` security event + a high-priority notification to every admin + 3 strikes → 60s lockout.
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
37. OTP reset? → 6-digit code by email, 1-minute expiry, one-time use. An inactive employee is signed out after 3 minutes (the login token itself expires; admins are not timed out).
38. Why can't admin self-reset? → It's the reserved owner account.
39. How is the kiosk secured if it has no login? → PIN unlock gives the device a signed, expiring token that every clock-in call must send; the PIN check is rate-limited; the token dies when the PIN changes; and the endpoints return minimal fields only (name, photo, dept, today's schedule) - never salary/email/phone/address.
40. Where is the kiosk PIN stored? → SHA-256 hash in settings.kiosk.
41. Frontend vs backend security? → Hiding buttons is convenience; the backend enforces real security.

## AI & analytics (42-47)
42. What does the AI read? → The last 30 days of real data (attendance, pending leaves/OT, shift coverage, open security events) via the same Eloquent models every other domain uses — one database, no HTTP hop, always live.
43. What are the two "brains"? → Google Gemini (online) or built-in PHP rule engine (offline).
44. What 4 things does AI return? → healthScore, insights, decisionQueue, source.
45. What actions can HR take in one click? → Approve/reject leave & OT, resolve security events.
46. Why cached analytics? → Heavy math runs once via AnalyticsService; charts stay instant.
47. What are the 5 analytics sections? → attendance_trend, department_productivity, leave_trend, overtime_summary, punctuality_score — computed by the AnalyticsService in the analytics domain, reading the same single database.

## People & registry (48-50)
48. Who are the demo logins? → admin@workforcepro.com/Admin@123 and employee@workforcepro.com/Employee@123.
49. Team members? → Fercy, Asniyah, John Paul, Florita, Kyle.
50. The client? → Archon Nell Inc., contact Nardz Olarte (QA/QC supervisor).
51. What does the timesheet "This Week" popup show? → A live, per-day breakdown of the current week (Date, Day, Status, Clock In, Clock Out, Break, Hours) with this week's totals — even before any timesheet is saved. It's an "Auto" record until the week is submitted.
52. What is "Timesheet History"? → The list below the My Timesheet summary card: every saved week (range, status, Regular/Overtime/Total hours, submitted date). Clicking a row reopens that week's full popup.

---

---

# PART 15 - Docker in one minute (you WILL be asked "what's Docker?")

**The idea:** Docker puts each part of the system in a sealed **container** so it runs identically on any computer. It changes *how the system is started*, not *what it does*.

**The 5 things to remember:**
1. **Image** = the packed recipe; **container** = that recipe running. (`Dockerfile` builds an image.)
2. **`docker-compose.yml`** = the conductor's sheet that starts all **4 containers** in order: 1 PostgreSQL, 1 Laravel backend (all 8 domains), 1 scheduler (same backend image, running the scheduled jobs), 1 frontend (React + nginx).
3. **One command** starts everything: `docker compose up -d --build`. It builds the images, creates the one `workforce_mgnt` database the first time, and runs the migrations.
4. **Data survives** in a volume (`down` keeps it, `down -v` erases it). Docker's database is **separate** from the local one the scripts use.
5. **Docker keeps a copy of the code** — after any change, rebuild with `--build`.

**Say this if asked:** *"Docker lets us start the whole system, all 4 parts, with one command on any laptop without installing PHP, Node or PostgreSQL. It doesn't change any feature. It's a demo/dev setup, not production hosting."*

**Full explanation, file by file:** `00 - Start Here - Absolute Beginner Guide.md` → Section 10. **How to run it:** `activator-deactivator.md` → Way 2.

---

## Newest Additions In One Breath (Say These Confidently)

- **Leave costs working days:** weekends, holidays and days off are not charged. The time-off domain counts the working days itself, in-process, from the same database the schedule uses, when the request is filed.
- **Absences are recorded automatically:** a nightly job marks a finished, scheduled day with no clock-in and no approved leave as Absent, so the numbers are honest.
- **Everything sensitive is audited:** sign-ins, failed sign-ins, password changes, overtime decisions, and any change to settings. Exporting a report or the audit log asks the administrator to type their password again.
- **Administrator's daily workflow:** the dashboard's "Needs your attention" panel, bulk leave approval with a team-impact view, reopenable overtime decisions, and a Notifications page.
- **Automated shift scheduling** is rule-based, not AI: it picks only eligible people (active, not on leave, not already scheduled, under the weekly hours limit), shares shifts fairly, shows a draft that HR can edit, and saves nothing until HR approves.

