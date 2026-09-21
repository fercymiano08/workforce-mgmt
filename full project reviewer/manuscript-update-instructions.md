# Manuscript Update Instructions (for DeepSeek)

> **How to use this file:** paste it into DeepSeek together with the manuscript text (or the section you are working on), then say:
> *"Apply every change in this file to the manuscript. Give me the corrected text for each location, ready to paste."*

---

## 1. Your Role and Rules

You are helping revise the capstone manuscript **"Design and Development of an AI-Enhanced Workforce Management System for E-Commerce Enterprise"**. The software was improved after the manuscript was written, so a few statements are now out of date. This file lists exactly what to change.

**Follow these rules:**

1. Change **only** the locations listed in Sections 3, 4 and 5. Leave everything else untouched, including all citations, references and the literature review.
2. Keep the manuscript's academic, third-person tone and its existing heading numbers. Do not add new chapters or renumber anything.
3. For each location, output: the **section number**, the **old text** (short quote so it can be found), and the **new text** to paste in.
4. Use only the facts in Section 2. **Do not invent** features, numbers or names. If something is not in this file, do not add it.
5. If a sentence becomes empty after a removal, delete the whole bullet or sentence and fix the punctuation.

---

## 2. Facts That Are True Today (Source of Truth)

| Topic | Fact |
|-------|------|
| Architecture | React frontend + **8** Laravel microservices (core, intelligence, attendance, scheduling, time-off, payroll, communications, configuration), each with its own PostgreSQL database. Docker Compose runs 15 containers (unchanged). |
| Automated tests | **311** automated PHPUnit tests across the 8 services, all passing. The frontend is checked with ESLint and a production build. |
| Timesheet workflow | Timesheets are built automatically from attendance. The employee submits after the week ends (or the system auto-submits at Monday 12:00 PM); the Workforce Admin approves, or rejects / reopens with a required reason; approved timesheets are sent to payroll once. Only a finished week can be reviewed; hours are frozen after submission and cannot be edited; every step is kept in a history and the audit log. |
| Payroll service | Produces **weekly timesheets only**. It does **not** produce pay statements. The "My Pay Record / Pay Statement" page and its endpoint were **removed**. |
| Timesheet figures | Each weekly timesheet records regular hours, overtime worked, overtime approved, and **payable overtime** (`paid_ot_hours`). |
| Overtime pay rule | Overtime is payable only for hours that were **both approved and actually worked**. Per day it is the **smaller** of hours worked past 17:00 and hours approved. The server counts a working day only up to the end of the shift plus approved overtime, so time past 17:00 with no approval is not counted at all (clocking out at 17:03 is recorded as 17:00); the real punch is kept so a later approval can restore the time. |
| Automatic scheduling | Off by default; when switched on by the admin, a scheduled job prepares the coming week by itself at a chosen day and hour (default Friday 5:00 PM, Manila time): every active employee on their own work days (an employee or department work pattern, else Monday to Friday), skipping holidays, approved leave and shifts that already exist. The admins get a summary. The manual Generate Schedule wizard shows a preview before anything is saved; every generation is a batch that can be undone; coverage rules (minimum staff per department per day) produce warnings; all changes are audited. |
| Shifts | The company has **one shift**: the **Standard Shift, 08:00 to 17:00**. Overtime is **not** a separate shift; it is an extension of the standard shift when an overtime request is approved (the day's end becomes 17:00 plus approved hours). |
| Attendance statuses | Each attendance record has exactly **one** status: **Present** (clocked in within 15 minutes of the start), **Late** (more than 15 minutes after the start), **Early Leave** (left before the shift ended), **Absent**, or **On Leave**. Reports and charts show **Present as one group split into On Time and Late** (one bar in two colours); Early Leave, Absent and On Leave are separate categories, and nothing is counted twice. |
| Unpaid lunch break | Deducted automatically **by duration**: once a person has worked at least 5 hours (configurable), 60 minutes (configurable) are taken off the day, whenever lunch was taken. A shorter day loses nothing. There are no break punches. HR sets the numbers on the Settings page; changes apply only to days worked afterwards. |
| Kiosk rules (enforced by the server) | A clock-in is refused when the employee has no shift today, the shift has already ended, the employee is on approved leave, or is already clocked in. Times use Philippine (Manila) time. |
| Early clock-out | A reason is mandatory. Each employee has **2 free early departures per 30 days**; beyond that the record is unpaid until reviewed. A "sick" claim needs proof (medical certificate) within **48 hours**. The Workforce Admin classifies the record (excused or unpaid). |
| Leave rules | Past dates are blocked. Overlapping or duplicate requests are refused (button lock, server check, and database rule). **Approved leave blocks scheduling** on those days and stops the no-show (absent) alert. |
| Leave in working days | A leave request is charged in **working days**: the days the person's work pattern says they work, minus company holidays, counted by the scheduling service when the request is filed and stored on the request. A Friday-to-Monday leave costs 2 days. The form shows the live cost, and a range with no working day is refused. |
| Absent days | A finished day where the person was scheduled, never clocked in and had no approved leave is recorded automatically as **Absent** (a job at 00:10 Manila time), so the absence figures on dashboards and reports are complete. |
| Audit and export control | Sign-ins, failed sign-ins, lock-outs, password changes, overtime decisions and every change to system settings are written to the audit log. Exporting a report or the audit log requires the administrator to type their password again; the confirmation is recorded. |
| Administrator workspace | The dashboard opens with a **Needs your attention** panel (leave, overtime, early clock-outs, timesheets waiting), leave requests can be approved in bulk with a team-impact view, decided overtime can be reopened, and a **Notifications** page lists everything sent to a user. |
| Session timeout | An **employee** who is inactive for **3 minutes** is signed out automatically (a warning with a 30-second countdown appears first). It is enforced by the server: the employee's login token expires 3 minutes after the last real activity, and only real activity (not background refreshes) extends it. Administrators are never timed out. |
| Password recovery | One-time six-digit code emailed to the employee, stored hashed, valid for **one minute**, single use (after that a new code must be requested). |
| Audit trail | Records: employee records (created, updated, deleted, face registered), attendance corrections and deletions, leave (created, updated, decision, deleted), timesheet changes, and early clock-out reason updates and classifications. Append-only (entries cannot be edited or deleted). The Audit Logs page shows a plain-language timeline with filters, a detail panel and CSV export. |
| Employee self-service | A separate **My Profile** page (view identity, employment, leave balances, kiosk face registration status; edit own phone, address, emergency contact and photo, with validation; salary and face data are never shown). **Settings** for employees contains only password change and appearance. |

---

## 3. MUST FIX (the manuscript currently says something that is no longer true)

### 3.1 Remove the "Pay Statement" feature (mentioned in 6 places)

**(a) Section 1.3.2 Scope of Project, In-Scope list — delete the entire bullet**

- Old text starts with: *"Self-Service Pay Statement: A read-only weekly pay statement estimate for employees based on approved timesheets, using configurable placeholder deductions. This does not constitute actual payroll processing."*
- New text: *(delete the whole bullet)*

**(b) Section 1.3.2, Out-of-Scope list**

- Old: *"The system will not include automated payroll processing, statutory tax computation, or financial accounting. It provides only a simplified, read-only pay statement estimate based on approved timesheets."*
- New: *"The system will not include automated payroll processing, statutory tax computation, or financial accounting. It stops at approved weekly timesheets, which record regular hours, overtime worked, overtime approved, and payable overtime hours for use in a separate payroll process."*

**(c) Section 1.5 Significance and Relevance, "For Employees and Workers"**

- Old fragment: *"...visibility into their schedules, leave balances, overtime status, and pay estimates, increasing satisfaction..."*
- New fragment: *"...visibility into their schedules, leave balances, and overtime status, increasing satisfaction..."*

**(d) Section 2.4.1 Microservices Architecture**

- Old fragment: *"a payroll service for timesheets and pay statements"*
- New fragment: *"a payroll service for weekly timesheets"*

**(e) Appendix A.12 Known Issues and Troubleshooting**

- Old sentence: *"The pay statement uses placeholder deductions rather than statutory tax tables."*
- New sentence: *"The system does not compute salaries or deductions; it produces approved timesheets, including payable overtime hours, for a separate payroll process."*

**(f) Wording that mentions "pay computation" (three places) — soften to match the timesheet-only design**

- Section 1.6 Definition of Terms, *Overtime Reconciliation*, and Section 3.4.1 *Overtime Reconciliation*: replace *"supporting accurate pay computation"* / *"support accurate pay computation"* with *"supporting accurate payable-hours computation"* / *"support accurate payable-hours computation"*.
- Section 3.2.2 *Service Layer Pattern*: replace *"early-leave policy, pay computation, analytics"* with *"early-leave policy, payable-overtime computation, analytics"*.

### 3.2 Password recovery code lifetime

- **Section 2.4.6 Cybersecurity.**
- Old fragment: *"password recovery uses a one-time six-digit code that expires after ten minutes and is stored only in hashed form"*
- New fragment: *"password recovery uses a one-time six-digit code that expires after one minute and is stored only in hashed form"*

### 3.3 Number of automated tests (3 places)

Replace the "over one hundred" wording with the current figure.

- **Section 3.1.4 Toolstack:** *"(over 100 tests across the eight services)"* → *"(311 tests across the eight services)"*
- **Section 3.3 Development, Operations, and QA Methodology:** *"Across the eight services there are over one hundred automated tests."* → *"Across the eight services there are 311 automated tests."*
- **Section 3.3.3 Testing Strategy:** *"Across the eight services, there are over one hundred automated tests that cover the core business rules of each domain."* → *"Across the eight services, there are 311 automated tests that cover the core business rules of each domain."*

---

## 4. SHOULD UPDATE (still true, but incomplete)

Add the sentence(s) at the end of the named bullet in **Section 1.3.2 In-Scope**. Use the same wording in the matching objective in the objectives list of the same section where one exists.

**4.1 Shift and Schedule Management** — add:
> *"The company operates a single standard shift (08:00 to 17:00). Overtime is not a separate shift; it extends the standard shift only when an approved overtime request exists."*

**4.2 Overtime Management** — add:
> *"Overtime is payable only for hours that were both approved and actually worked; per day, the payable amount is the smaller of the hours worked past 17:00 and the hours approved. Time after the end of the shift with no approved overtime is not counted; the real clock-out is kept so a later approval can bring it back."*

**4.3 Time and Attendance Management** — add:
> *"The server enforces the attendance rules: a clock-in is refused when the employee has no shift that day, the shift has already ended, or the employee is on approved leave. An employee who clocks in within 15 minutes of the shift start is recorded as Present; later than that, as Late. Leaving early requires a stated reason; each employee has two free early departures per 30 days, and a sick-leave claim must be supported by a medical certificate within 48 hours."*

**4.4 Leave Management** — add:
> *"Requests for past dates are blocked, and overlapping or duplicate requests are refused. Approved leave prevents shift assignment on those days and suppresses the no-show alert."*

---

## 5. OPTIONAL (only if space allows)

**5.1 Role-Based User Management** — add:
> *"Employees have a self-service profile page where they can view their employment details and leave balances and update their own contact information and photo; salary and biometric data are never displayed to the employee."*

**5.2 System Accountability** — add:
> *"The Audit Logs page presents entries as a plain-language timeline that can be filtered by area and period and exported as CSV. Entries are append-only and cannot be edited or deleted."*

**5.3 Workforce Analytics (Section 1.3.2 and the matching 2.7 Process Phase text)** — add:
> *"Each attendance record carries exactly one status (Present, Late, Early Leave, Absent or On Leave), and the dashboards count each status separately; the attendance rate is computed as days attended divided by days attended plus days absent, so approved leave does not lower it."*

---

## 6. Do NOT Change

- The 8-service architecture, the 15 Docker containers, the five interface languages, Sanctum authentication, the shared-secret internal API, the kiosk PIN and 60-second failed-attempt lockout, and the AI Decision Support description (language model with rule-based fallback).
- All references, citations, the literature review and the theoretical framework.
- The Abstract, unless it mentions a pay statement (check; if it does, apply 3.1).

---

## 7. Figures That Need Re-Exporting (a person must do this in draw.io)

DeepSeek cannot edit images. These figures in the manuscript are pictures and should be replaced with exports of the updated files in the project folder `full project reviewer/`:

| Figure | Source file | What changed |
|--------|-------------|--------------|
| Entity Relationship Diagram of All Owning Tables | `workforce mgt erd flowchart reference.drawio` | Added the `early_clock_outs` and `audit_events` tables, and the `paid_ot_hours` column on timesheets. |
| Process / BPMN flow figures (clock-in, leave, overtime, timesheet, shift scheduling) | `workforce mgt bpmn flowchart reference.drawio` | Labels updated to the latest rules; each page has a yellow "LATEST RULES" note. |

---

## 8. Output Format Requested from DeepSeek

For every change, reply in this exact shape so it is easy to paste:

```
Location: <section number and title>
Old text: "<short quote>"
New text: "<full replacement text>"
```

At the end, list any location where you were **not sure** the old text existed, so it can be checked by hand.
