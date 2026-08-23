# System Workflow Guide

> How the entire Workforce Management System works — from the screen you see, through the backend engine, down to the database and back.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Three Layers](#2-the-three-layers)
3. [Anatomy Of One Request (Step-By-Step)](#3-anatomy-of-one-request-step-by-step)
4. [Real Example 1 — Clocking In At The Kiosk](#4-real-example-1--clocking-in-at-the-kiosk)
5. [Real Example 2 — Applying For Leave](#5-real-example-2--applying-for-leave)
6. [Real Example 3 — The AI Decision Support Flow](#6-real-example-3--the-ai-decision-support-flow)
7. [Authentication — Who Are You?](#7-authentication--who-are-you)
8. [File Map — Where Everything Lives](#8-file-map--where-everything-lives)
9. [Data Flow Diagrams Per Module](#9-data-flow-diagrams-per-module)

---

## 1. The Big Picture

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                         │
│                                                            │
│   React + Vite (frontend)          http://localhost:5173   │
│   Pages, components, design                               │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTP requests carrying JSON
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     LARAVEL BACKEND                         │
│                                                            │
│   PHP API server                   http://127.0.0.1:8000   │
│   Routes → Controllers → Services                         │
│   Validates, decides, computes                             │
└──────────────────────┬──────────────────────────────────────┘
                       │  SQL queries
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL DATABASE                      │
│                                                            │
│   workforce_mgnt on 127.0.0.1:5432                         │
│   23 tables storing all data permanently                   │
└─────────────────────────────────────────────────────────────┘
```

**One sentence version:** the browser shows pages and sends requests; the backend checks permissions and applies business rules; the database stores and remembers everything.

---

## 2. The Three Layers

### Layer 1 — Frontend (`frontend/`)
Built with **React 19 + Vite + Tailwind CSS**.

| Piece | Role | Location |
|-------|------|----------|
| Pages | One file per screen | `src/pages/HR_Manager/`, `src/pages/Employee/`, `src/pages/KIOSK/` |
| Components | Reusable UI blocks (buttons, modals, tables) | `src/components/` |
| Services | The ONLY files that talk to the backend | `src/services/api.js` |
| Contexts | Logged-in user info, theme, language | `src/context/` |

**Key rule:** pages never talk to the database directly. They always go through `api.js` → HTTP → Laravel.

### Layer 2 — Backend (`backend/`)
Built with **Laravel 13 (PHP)**.

| Piece | Role | Location |
|-------|------|----------|
| Routes | The API's "receptionist" — maps URLs to controllers | `routes/api.php` |
| Controllers | Receive requests, check input, call the right logic | `app/Http/Controllers/` |
| Services | Business rules (AI analysis, scheduling math) | `app/Services/` |
| Migrations | Define table structures in code | `database/migrations/` |
| Tests | Automated quality checks | `tests/` |

### Layer 3 — Database
**PostgreSQL**, database name `workforce_mgnt`. See the *Database System Tutorial And Guideline* in this folder for full details.

---

## 3. Anatomy Of One Request (Step-By-Step)

What happens when any page loads data:

```
1. PAGE MOUNTS
   EmployeeDashboard opens. It calls:
   attendanceService.getByEmployeeId("EMP20260001")

2. SERVICE LAYER (frontend/src/services/api.js)
   Turns that into an HTTP request:
   GET http://127.0.0.1:8000/api/attendance/employee/EMP20260001

3. ROUTE MATCHING (backend/routes/api.php)
   Laravel finds the matching route and points it to
   AttendanceController@getByEmployee.
   Middleware first checks: is this user logged in?

4. CONTROLLER (backend/app/Http/Controllers/)
   Reads the employee ID from the URL,
   asks the database for the data.

5. DATABASE QUERY
   PostgreSQL runs something like:
   SELECT * FROM attendance WHERE employee_id = 'EMP20260001';

6. JSON RESPONSE TRAVELS BACK
   Controller wraps rows in JSON → HTTP response →
   api.js receives it → page stores it in React state →
   the UI renders the numbers you see.
```

The same pattern runs in reverse for saving: form submit → service POST request → route → controller validates → INSERT/UPDATE query → success JSON → toast notification on screen.

---

## 4. Real Example 1 — Clocking In At The Kiosk

The most security-critical flow in the system.

```
KIOSK SCREEN (AttendanceTerminal.jsx)
  ├─ 1. Employee types their ID → exact match lookup via API
  ├─ 2. "Is this you?" confirmation shows photo, name, department
  ├─ 3. FaceRecognitionModal opens camera
  │      └─ face-api.js compares live face vs stored face_descriptor
  │         (all comparison happens IN THE BROWSER)
  ├─ 4. Frontend calls POST /api/attendance/clock-in
  │      with employee_id + verification result
  ├─ 5. BACKEND applies business rules:
  │      ├─ Already clocked in today? → reject duplicate
  │      ├─ Shift start time known? → compute Late / On Time
  │      └─ Writes one row into `attendance`
  ├─ 6. If face mismatched 3 times:
  │      └─ Security event logged into `security_events`
  │         kiosk locks for 60 seconds
  └─ 7. Success screen + row visible instantly in HR Attendance page
```

**Why face matching happens in the browser:** speed and privacy. Only the final verified result is sent to the server.

---

## 5. Real Example 2 — Applying For Leave

```
EMPLOYEE SIDE (Leave.jsx)
  ├─ Fill form: type, dates, reason
  ├─ Validation BEFORE sending:
  │    end date must not be before start date
  ├─ POST /api/leaves
  └─ Row inserted into `leaves` with status = 'Pending'

BACKEND
  ├─ Validates again (never trust the frontend alone)
  ├─ Stores applied_date = today
  └─ Creates a notification row for HR

HR SIDE (AIDecisionSupport.jsx or Leave approval page)
  ├─ Pending request appears in the decision queue
  ├─ HR clicks Approve/Reject
  ├─ PUT /api/leaves/{id}
  ├─ Backend updates status, approved_by, comments
  ├─ employees.leave_balances (JSON) gets deducted if approved
  └─ Notification row created for the employee
```

Notice how ONE business action touches THREE tables: `leaves`, `employees`, `notifications`.

---

## 6. Real Example 3 — The AI Decision Support Flow

This module has TWO brains and picks whichever is available:

```
HR opens AI Decision Support page
  └─ GET /api/analytics/ai/insights

BACKEND (AIDecisionSupportService.php)
  ├─ STEP 1: Gather real data from PostgreSQL
  │    last 30 days of attendance, leaves, overtime,
  │    shift coverage, security events
  │
  ├─ STEP 2: Try Gemini AI
  │    ├─ Is GEMINI_API_KEY set in .env?
  │    ├─ Send the data as structured JSON to Google's API
  │    ├─ Gemini returns natural-language insights as JSON
  │    └─ source marked: 'ai'
  │
  ├─ STEP 3: Fallback if anything fails
  │    ├─ Pure PHP rules: thresholds like "late >= 3 → warning"
  │    └─ source marked: 'rule-based'
  │
  └─ STEP 4: Return unified JSON to the frontend

FRONTEND
  ├─ Purple badge "Powered by Gemini AI"     (if source = ai)
  ├─ Red badge "Offline"                     (if no internet)
  ├─ Amber badge "Gemini unavailable"        (if online but API failed)
  └─ Health score ring + insight cards render
```

**Important:** the AI never invents data. It only receives what the database returned and analyzes it.

---

## 7. Authentication — Who Are You?

Every protected request carries proof of identity:

```
LOGIN
  ├─ POST /api/login with email + password
  ├─ Backend checks `users` table (password is hashed)
  ├─ Returns a token + user object (role included)
  └─ Frontend stores session (AuthContext) + attaches token
     to every later request

EVERY REQUEST AFTER
  └─ Middleware reads token → identifies user → allows/blocks

ROLE-BASED ACCESS
  ├─ role = 'Administrator' → everything
  ├─ role = 'HR Manager'    → management pages
  ├─ role = 'Employee'      → self-service pages only
  └─ Enforced TWICE: sidebar hides links AND backend routes check role
```

---

## 8. File Map — Where Everything Lives

```
Workforce MGNT/
├── project full document/          ← you are here
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── HR_Manager/         Employees.jsx, Reports.jsx, AIDecisionSupport.jsx...
│   │   │   ├── Employee/           EmployeeDashboard.jsx, Leave.jsx, MyTimesheet.jsx...
│   │   │   ├── KIOSK/              AttendanceTerminal.jsx (clock device)
│   │   │   └── Auth/               Login.jsx
│   │   ├── components/             shared UI: modals, tables, topbar, sidebar
│   │   ├── services/api.js         ★ ALL backend communication lives here
│   │   ├── context/                AuthContext (who's logged in), Toast, Theme...
│   │   └── App.jsx                 URL routing map
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── Http/Controllers/       request handlers per module
│   │   └── Services/               AI logic, scheduling engine
│   ├── routes/api.php              ★ every API endpoint listed here
│   ├── database/migrations/        table definitions
│   └── .env                        secrets: DB password, GEMINI_API_KEY
└── start.bat                       one-click launcher
```

---

## 9. Data Flow Diagrams Per Module

```
ATTENDANCE   Kiosk → POST /attendance → rules check → attendance table
LEAVE        Leave.jsx → POST /leaves → leaves table → approval updates status
OVERTIME     Request form → POST /overtime → overtime_requests table
TIMESHEET    Auto-generated weekly rows ← attendance aggregation
SHIFTS       Shifts.jsx wizard → shift_schedules (+ shift_definitions templates)
REPORTS      Read-only: queries many tables → reportHelpers formats → print/CSV
ANALYTICS    Dashboards read cached stats from analytics table
AI SUPPORT   Reads 30 days of activity → Gemini or PHP rules → insight cards
SECURITY     Kiosk mismatches → security_events → AI queue → resolve/escalate
SETTINGS     Single settings row: company info, kiosk PIN hash, AI memory
NOTIFY       Actions create notification rows → bell dropdown displays them
```

---

## Summary Card

> **Frontend** draws the screens and never touches SQL.
> **Backend** is the gatekeeper: validates every request, enforces roles, applies business rules, talks to Gemini.
> **Database** remembers everything forever.
>
> When debugging: find the page → find its service call in `api.js` → find the matching route in `routes/api.php` → read the controller. That chain explains 95% of behavior.
