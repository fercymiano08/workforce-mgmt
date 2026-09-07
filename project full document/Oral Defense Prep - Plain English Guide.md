# Oral Defense Prep - Plain English Guide

> Written for ONE person: **you**, who has to stand in front of the panel and explain
> this system without freezing up. No heavy jargon. Read this 2-3 times and you will
> be able to *talk* about the system naturally - because it's the same story every time.
>
> Deeper detail lives in **System Workflow Guide.md** and **Database System Tutorial And Guideline.md**. Use this guide first.

---

## How To Use This Guide

- **Part 1-4** = the CORE story. Master these first. They cover ~80% of any question.
- **Part 5-6** = one-sentence "cheat sheets" for every module and security topic.
- **Part 7-8** = analogies + a demo-day script. Great for practicing out loud.

---

# PART 1 - The whole system in 5 sentences (MEMORIZE THESE)

1. **WorkForce Pro** is a web-based **workforce management system** built for a retail/BPO company called **Archon Nell Incorporated**.
2. It helps the company handle **attendance, schedules, leave, overtime, and timesheets** for all employees in one place.
3. There are **three users**: the **HR Manager** (who controls everything), the **Employee** (who checks and manages their own records), and the **Kiosk** (a touchscreen device at the entrance used for clocking in and out).
4. The system has two parts that talk to each other: a **frontend** (what you see in the browser) and a **backend** (the "brain" that stores data and makes decisions).
5. It also includes **smart features**: facial-recognition attendance, automatic schedule generation, analytics dashboards, and an **AI assistant** that helps HR make decisions.

> Say this in your own words. The panel just wants to hear that YOU understand the big picture.

---

# PART 2 - Who uses it (memorize these three)

**HR Manager** *(Administrator)*
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
- **Backend** *(Laravel)* - the "brain". Checks who you are, follows the rules, reads and writes data.
  → Like the *kitchen + manager*: they make decisions and do the real work.
- **Database** *(PostgreSQL)* - stores every record (employees, attendance, leave, etc.).
  → Like the *storage room / filing cabinet*.

**The flow (always):**
Browser (frontend) → sends a request to `http://localhost:8000/api/...` → Laravel backend checks the request → backend reads/writes PostgreSQL → backend sends back an answer (JSON) → frontend shows it on screen.

> If a panelist asks "how does data move?", this one sentence answers it.

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
- HR Manager (admin) account **cannot** reset via forgot-password (it's the reserved owner account).

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
5. Weekly, the system builds a **timesheet** (hours worked) which the employee can submit; HR can approve.
6. If they work extra hours, they can file an **overtime request**, which HR approves (can be done in bulk).

## Flow 4 - The "brain": Analytics + AI decision support (HR only)

**Plain story:**
1. The **Analytics** page shows dashboards: who's late, attendance rates, overtime summaries, etc.
2. The **AI Decision Support** page looks at that data and gives HR **suggestions** (e.g. "too many absences for this department", "overtime trending up").
3. When online, the app calls **Google Gemini** for the smart suggestions.
4. When **offline/no API key**, it **falls back to built-in rules** so it still works.
5. HR can also act directly ("mark all security events resolved") in one click.

---

# PART 5 - One-sentence cheat sheet for every module

Use these as quick talking points. Say each in ONE breath.

**Everyone uses:**
- **Login / Auth** - "The gateway. Logs people in, gives a token, and blocks attackers with a lockout."
- **Attendance** - "Who was present and when. Clock-in/out records for everyone, with alerts if something's wrong."
- **Leave** - "Time off requests. Employees file, HR approves/rejects, and balances are updated."
- **Overtime** - "Extra hours worked. Employees request, HR approves (even in bulk)."
- **Timesheets** - "A weekly summary of hours. Employees submit, HR approves."

**HR Manager only:**
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
| **Role-based access (RBAC)** | Employees and HR Manager see different menus. Admin-only routes are protected server-side. |
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
- HR Manager: `admin@workforcepro.com` / `Admin@123`
- Employee: `employee@workforcepro.com` / `Employee@123`
- Fercy (Employee): `fercy.miano84@gmail.com`
- Balderama (Employee): `randycapalar@gmail.com`

**30-second version (opening line):**
"This is WorkForce Pro, a workforce management system for Archon Nell Inc. It handles HR's daily work - registering employees, attendance by facial recognition, schedules, leave, overtime, and timesheets. There are three types of users: the HR manager, employees, and the kiosk device at the entrance. The system is a React frontend talking to a Laravel backend with a PostgreSQL database."

**2-minute tour (pick the extras that fit your demo):**
1. Log in as **HR Manager** → show the dashboard.
2. Open **Employees** → show the directory, note each employee has a login account.
3. Open **Analytics** → "this summarizes everything".
4. Open **AI Decision Support** → "the assistant flags problems in the data; HR can act in one click".
5. Switch to **Employee** login → show "My Attendance", "My Schedule", "My Leave".
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

**Q: What is the difference between an Employee and the HR Manager account?**
A: The HR Manager has full access and management rights; an Employee only sees and manages their own records. It's enforced on the backend, not just hidden in the menu.

**Q: How do you know a face matches?**
A: Each face is saved as a 128-number descriptor. The kiosk compares the new capture to the stored one; a distance below 0.6 means it's the same person.

**Q: What happens if there's no internet at the demo?**
A: Face recognition runs locally in the browser, AI falls back to rule-based mode, fonts and files are self-hosted, and all services (database, queue, cache) run locally. Only email/OTP and Gemini need the internet.

**Q: Why can't the admin reset their own password?**
A: The admin account is a fixed reserved credential. Employees use the OTP email flow; the admin account is deliberately protected from self-reset.

**Q: How do you prevent someone guessing passwords?**
A: Five failed attempts trigger a 60-second lockout, plus the password policy and bcrypt hashing.

**Q: Where is data stored?**
A: In a single PostgreSQL database with tables for users, employees, attendance, leave, schedules, timesheets, notifications, settings, security events, and more.

---

# PART 10 - Your study plan for the next few days

1. **Day 1:** Read Parts 1-4 twice. Say Part 1's 5 sentences out loud.
2. **Day 2:** Practice Part 4's flows and Part 5's cheat sheet out loud (one breath each).
3. **Day 3:** Run the demo yourself (login as HR, browse Employees/Analytics/AI, then as Employee). Play with the kiosk screen.
4. **Day 4:** Do the 2-minute tour script out loud. Have someone (or the mirror) quiz you with Part 9.
5. **Day before defense:** Skim the System Workflow Guide for any module you feel shaky on.

> The biggest secret: **the panel wants to hear you tell the story, not quote code.**
> Master the story and you've already passed.