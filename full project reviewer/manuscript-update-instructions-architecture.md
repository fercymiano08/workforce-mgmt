# Manuscript Update Instructions -- Architecture Correction (for DeepSeek)

> **How to use this file:** paste it into DeepSeek together with the manuscript text (or the section you are working on), then say:
> *"Apply every change in this file to the manuscript. Give me the corrected text for each location, ready to paste."*

Use this file together with (after) `manuscript-update-instructions.md`. That file corrects feature-level facts; this one corrects the **architecture** description, which changed more fundamentally.

---

## 1. Your Role and Rules

You are helping revise the capstone manuscript **"Design and Development of an AI-Enhanced Workforce Management System for E-Commerce Enterprise"**. The system's backend was rebuilt after the manuscript was written: it is no longer split into 8 internal microservices. This file lists exactly what to change and why.

**Follow these rules:**

1. Change **only** the locations listed in Section 3. Leave everything else untouched, including all citations, references and the literature review.
2. Keep the manuscript's academic, third-person tone and its existing heading numbers. Do not add new chapters or renumber anything.
3. For each location, output: the **section number**, the **old text** (short quote so it can be found), and the **new text** to paste in.
4. Use only the facts in Section 2. **Do not invent** features, numbers or names.
5. If a sentence becomes empty after a removal, delete the whole bullet or sentence and fix the punctuation.

---

## 2. Facts That Are True Today (Source of Truth)

| Topic | Fact |
|-------|------|
| Why this changed | The Workforce Management System is one subsystem of a larger E-Commerce Enterprise platform the team is building. That larger platform is what is organized as microservices, with each subsystem (Workforce Management, and its sibling subsystems) being **one** microservice in that architecture. Splitting the Workforce Management System's own internals into 8 further microservices was a misapplication of the pattern one level too deep, discovered during development, and corrected before the defense. |
| Architecture (now) | React frontend + **one** Laravel backend application (a single codebase, a single deployable process) + **one** PostgreSQL database. The backend itself is the Workforce Management System's contribution as one microservice within the larger E-Commerce Enterprise system; internally it is a conventional layered monolith (Controllers → Services → Eloquent Models). |
| Domains inside the one backend | Identity (employees, departments, roles, auth), Attendance (attendance, early clock-outs, security events, the kiosk), Scheduling (shifts, schedules, automatic scheduling, holidays, work patterns, coverage rules), Time-off (leaves, overtime), Payroll (weekly timesheets), Communications (notifications), Configuration (settings), and Intelligence (analytics, AI Decision Support). Each is a distinct set of routes, controllers and Eloquent models inside the one application, not a separate service. |
| Docker Compose | Now **4** containers: PostgreSQL, the backend, its scheduler (`php artisan schedule:work`, for the background jobs below), and the frontend. Previously 15 (8 API services + 5 schedulers + Postgres + frontend). |
| Database | **One** PostgreSQL database (`workforce_mgnt`). Previously 8 separate databases, one per microservice, with 7 of them holding read-only replicas of tables another service owned, kept in sync by a background job every minute. That replication layer no longer exists: every table has exactly one copy, read and written directly by the domain that uses it. |
| Automated tests | **307** automated PHPUnit tests (up from 324 across 8 services -- the drop is entirely tests that existed only to exercise the removed inter-service HTTP transport, e.g. "a peer service must present a shared token"; every test of an actual business rule was kept). The frontend is still checked with ESLint and a production build. |
| Background jobs | Still scheduled exactly as before (certificate expiry, absence marking, automatic scheduling, timesheet auto-submit/reminders), just run by one scheduler process instead of five. |
| Inter-service authentication / SERVICE_TOKEN | No longer exists. There are no service-to-service HTTP calls, so there is nothing to authenticate between services. A request is authenticated once, by Laravel Sanctum, when it enters the one application. |
| What did NOT change | Every business rule, validation, workflow and permission described elsewhere in the manuscript (attendance, leave, overtime, timesheet, scheduling, kiosk, audit, AI Decision Support) is unchanged -- only how the backend is packaged and deployed changed. |

---

## 3. Locations to Change

### 3.1 Section 2.4.1 (or wherever the backend architecture is introduced)

Replace the description of "8 Laravel microservices, each with its own database" with the single-backend description from the table above. If the section explains *why* microservices were chosen, replace that justification with: the system is itself one microservice inside the larger E-Commerce Enterprise platform being developed; internally it is organized as a layered monolith (Controllers → Services → Models) grouped by the same domains (identity, attendance, scheduling, time-off, payroll, communications, configuration, intelligence), which keeps the benefits of clear domain boundaries without the operational cost of running and synchronizing 8 separate databases and processes for a single subsystem.

Where the phrase "a payroll service for weekly timesheets" (already corrected by the other instructions file) or similar per-domain "service" language appears, "service" may be kept **only** if it clearly means "a group of related routes/controllers inside the backend", not a separately deployed process. If the sentence's meaning depends on separate deployment, reword it to say "domain" or "module" instead of "service".

### 3.2 Any Docker / deployment figure or count

Wherever "15 Docker containers" or "8 microservices" is stated as a fact (not as history), replace with "4 Docker containers: the database, the backend, its scheduler, and the frontend" and "one Laravel backend application."

### 3.3 Section 3.1.4 Toolstack / Section 3.3 Development, Operations, and QA Methodology / Section 3.3.3 Testing Strategy (test counts)

These were already updated by `manuscript-update-instructions.md` to say "324 tests across the eight services." Update again to: **"307 automated tests"** and remove "across the eight services" (there is now one application, not eight). Example: *"Across the eight services there are 324 automated tests."* -> *"The backend has 307 automated tests."*

### 3.4 Any SERVICE_TOKEN / inter-service authentication description

Wherever the manuscript describes a shared machine-to-machine token or service-to-service authentication (e.g. in a Cybersecurity or Architecture section), delete that description. Authentication is now a single step: Laravel Sanctum validates the bearer token once, when the request reaches the backend.

### 3.5 Any ERD / architecture diagram caption

If a caption or in-text reference says the ERD or architecture diagram shows "8 databases" or "microservice boundaries", change it to describe one database with the domains as logical groupings of tables, not separate schemas. (The diagram files themselves are handled in Section 4 below -- this only concerns the manuscript's *text*.)

---

## 4. Do NOT Change

- Every functional/behavioral fact already covered by `manuscript-update-instructions.md` (timesheet workflow, overtime rules, kiosk rules, leave rules, audit trail, AI Decision Support, etc.) -- none of that changed.
- All references, citations, the literature review and the theoretical framework.
- The description of the **larger** E-Commerce Enterprise system as microservices -- that part was always correct and stays. Only the description of *this subsystem's own internals* changes.

---

## 5. Figures That Need Re-Exporting (a person must do this in draw.io)

The ERD's tables and columns are unchanged (no schema changes came from this consolidation beyond what `manuscript-update-instructions.md` already lists) -- only the *database boundary lines*, if the diagram drew one box per microservice database, need to be removed so it reads as one database. The BPMN process flows are unaffected (they describe business processes, not deployment topology) and need no changes.

---

## 6. Output Format Requested from DeepSeek

For every change, reply in this exact shape so it is easy to paste:

```
Location: <section number and title>
Old text: "<short quote>"
New text: "<full replacement text>"
```

At the end, list any location where you were **not sure** the old text existed, so it can be checked by hand.
