# Database System Tutorial And Guideline

> Complete guide to the PostgreSQL database powering the Workforce Management System of **Archon Nell Incorporated**.
>
> If "primary key", "foreign key", or "JOIN" don't mean anything to you yet, read `00 - Start Here - Absolute Beginner Guide.md` first.
>
> **Who this is for:** anyone who needs to understand the data layer or open pgAdmin. **How to skim it:** read §1 Overview → §4 concepts → §5 table names; the connection details (§2), pgAdmin walkthrough (§7), and SQL cheat sheet (§8) are for when you'll actually use the database.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Connection Details](#2-connection-details)
3. [The Tools](#3-the-tools)
4. [Database Concepts You Need To Know](#4-database-concepts-you-need-to-know)
5. [All 31 Tables Explained (22 business + 9 framework)](#5-all-31-tables-explained-22-business--9-framework)
6. [Relationships Map](#6-relationships-map)
7. [pgAdmin 4 Walkthrough](#7-pgadmin-4-walkthrough)
8. [Essential SQL Queries (Cheat Sheet)](#8-essential-sql-queries-cheat-sheet)
9. [Indexes — What They Are](#9-indexes--what-they-are)
10. [Restoring The Database From Backup](#10-restoring-the-database-from-backup)
11. [Rules and Warnings](#11-rules-and-warnings)

---

## 1. Overview

| Property | Value |
|----------|-------|
| Database Engine | PostgreSQL 18 |
| Database Name | **One database: `workforce_mgnt`** (the system was originally split into 8 databases, one per microservice; it was consolidated back into a single Laravel monolith + single database before the defense — see the note below) |
| Total Tables | 31 tables in `workforce_mgnt`: 22 "business" tables + 9 Laravel framework tables. Every table has exactly **one** copy — there are no more read-only replica tables and nothing to keep in sync |
| Managed By | One flat set of Laravel 13 migrations (`backend/app/database/migrations/`) + pgAdmin 4 |
| Runs On | Local machine (`127.0.0.1:5432`), one PostgreSQL server hosting the one database |
| Runs On (Docker) | The `postgres` container, published on the host at **`127.0.0.1:5433`**, hosting the same single database (data in the `pgdata` Docker volume). It is a **separate** server from the local one on 5432; the password is in the git-ignored `.env` |

The database stores everything the system knows: employee records, attendance history, leave requests, shift schedules, timesheets, security events, and app configuration — all in one place, grouped by domain.

> **Why one database?** The Workforce Management System is itself just one microservice inside a larger E-Commerce Enterprise platform under development. Splitting *its own* internals into 8 further microservices/databases was applying the pattern one level too deep, and it was corrected before the defense. With one database, normal foreign keys and joins work directly across every domain — e.g. a timesheet query can join straight to `attendance` and `employees` in a single SQL statement — with no replication lag and no risk of a replica going stale.

The 22 business tables are grouped below by domain. This is a **logical grouping only** — there is no schema or database boundary between them; every table lives in the same `workforce_mgnt` database and can be joined to any other with a normal SQL `JOIN`.

| Domain | Tables |
|--------|--------|
| Identity | `users`, `employees`, `departments`, `roles`, `audit_events` |
| Attendance | `attendance`, `early_clock_outs`, `security_events` |
| Scheduling | `shift_definitions`, `shift_schedules`, `work_patterns`, `holidays`, `coverage_rules`, `schedule_settings`, `schedule_batches`, `schedule_batch_items` |
| Time-off | `leaves`, `overtime_requests` |
| Payroll | `timesheets` |
| Communications | `notifications` |
| Configuration | `settings` |
| Intelligence | `analytics` |

---

## 2. Connection Details

The one Laravel app has a single `.env` at `backend/app/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=workforce_mgnt
DB_USERNAME=postgres
DB_PASSWORD=<your-database-password>   # set in backend/app/.env, never committed
```

To inspect the data from pgAdmin 4 or `psql`, connect to the same server (`127.0.0.1:5432`, same username/password) and open the `workforce_mgnt` database.

---

## 3. The Tools

| Tool | What It Does |
|------|--------------|
| **pgAdmin 4** | Visual browser for the database server — view tables, edit data, run queries, generate ERDs. One connection, one database (`workforce_mgnt`) to expand. |
| **Laravel migrations** | PHP files in `backend/app/database/migrations/` — one flat folder that defines every table in code |
| **psql** | PostgreSQL's command-line client (already installed) — pass `-d workforce_mgnt` to query it |
| **pg_dump** | Command that exports the database to a `.sql` file — one dump covers everything |

**How they fit together:** the app's Laravel migrations create every table in the one `workforce_mgnt` database. The app reads and writes that database directly — no replicas, no sync jobs. pgAdmin lets humans look inside it. `pg_dump` backs it up in one shot.

---

## 4. Database Concepts You Need To Know

### Table
A grid of rows and columns, like an Excel sheet. Each row = one record (e.g., one employee). Each column = one attribute (e.g., first_name).

### Primary Key (PK)
The unique ID of a row. No two rows share it. Example: `employees.id` = `EMP20260001`.

### Foreign Key (FK)
A column that points to another table's primary key. Example: `attendance.employee_id` points to `employees.id`. This is how tables "link" to each other.

### Relationship Types
- **One-to-One:** one user account ↔ one employee profile
- **One-to-Many:** one employee → many attendance records
- Drawn as crow's foot notation in ERDs: `1 ----*`

### JSON Columns
Some columns (like `settings.kiosk`) store flexible structured data as JSON instead of fixed columns. Good for config; not ideal for things you need to search or join on.

---

## 5. All 31 Tables Explained (22 business + 9 framework)

> The tables below are described once, logically — each still means the same thing it always did, and every one lives as a single, real copy in the one `workforce_mgnt` database (see the domain grouping in Section 1). Table shapes (columns, types, relationships) are unchanged from the earlier multi-database design.

### Core Business Tables (22) — 20 appear in the original ERD; `early_clock_outs` and `audit_events` were added later

#### People & Organization

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Login accounts for the Workforce Admin and Employees | `id`, `employee_id`, `email`, `password`, `role`, `role_label` |
| `employees` | Full employee profiles including face photo + descriptor for kiosk recognition | `id`, `first_name`, `last_name`, `department`, `position`, `face_image`, `face_descriptor`, `leave_balances` |
| `departments` | Company departments | `id`, `name`, `head`, `budget`, `employee_count` |
| `roles` | Job titles per department — powers the Position dropdown | `id`, `department_id` (FK), `name` |

#### Time & Attendance

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance` | One row per employee per day: clock in/out, hours, status (an `Absent` row is written automatically after a finished day with a shift, no clock-in and no approved leave). The kiosk writes `date`, `clock_in` and the Present/Late `status` from the **server's** clock and the employee's scheduled shift | `id`, `employee_id` (FK), `date`, `clock_in`, `clock_out` (the COUNTED end of the day - never past the shift end plus approved overtime), `actual_clock_out` (the real tap-out, kept so a later overtime approval can restore time), `total_hours`, `status` |
| `early_clock_outs` | One row per early clock-out: the reason the employee gave at the kiosk, minutes lost, proof (medical certificate) and its deadline `proof_due_at`, and the Excused/Unpaid classification - set automatically at the punch when the free allowance is used up or a sick certificate is overdue, otherwise by HR (immutable punch snapshot) | `id`, `attendance_id`, `employee_id`, `reason_code`, `minutes_early`, `proof_due_at`, `classification` |
| `timesheets` | Weekly hour summaries that move Draft → Submitted → Approved / Rejected → sent to payroll. `overtime_hours` = worked, `approved_ot_hours` = approved, `paid_ot_hours` = payable (per day the smaller of the two). Workflow columns: `submitted_at`, `submitted_by`, `auto_submitted`, `reviewed_at`, `status_reason` (why it was rejected or reopened), `needs_refresh` (attendance changed after it was locked), `reminded_at`, `nudged_at`, `exported_at` (sent to payroll), and `history` (JSON timeline of every step) | `id`, `employee_id` (FK), `week_start`, `week_end`, `regular_hours`, `overtime_hours`, `paid_ot_hours`, `status` |
| `overtime_requests` | OT applications: expected vs approved hours | `id`, `employee_id` (FK), `expected_hours`, `approved_hours`, `status` |

#### Leave

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `leaves` | Leave applications with approval workflow. `days` = the WORKING days the request costs (work pattern minus holidays, counted in-process by the same app when it is filed) | `id`, `employee_id` (FK), `leave_type`, `start_date`, `end_date`, `days`, `status` |

> Note: leave balances are stored as a JSON column inside `employees.leave_balances`, not a separate table.

#### Scheduling

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `shift_definitions` | The single shift template (Standard Shift 08:00–17:00). Overtime is not a shift - it extends this one when an overtime request is approved | `id`, `name`, `start_time`, `end_time` |
| `shift_schedules` | Who works which shift on which date | `id`, `employee_id` (FK), `shift_id` (FK), `date`, `status` |
| `schedule_settings` | The one row of automatic-scheduling settings: on/off, the day and hour it runs, weeks ahead, the usual work days, the shift | `auto_enabled`, `run_day`, `run_hour`, `weeks_ahead`, `default_work_days` |
| `work_patterns` | Which weekdays a department or one employee works (overrides the usual days) | `scope` (department / employee), `scope_key`, `work_days` |
| `holidays` | Days nobody is scheduled | `date` (unique), `name` |
| `coverage_rules` | The minimum scheduled people per department per day | `department` (unique), `min_staff` |
| `schedule_batches` / `schedule_batch_items` | Every generation (manual or automatic) and which shifts it created, so it can be reviewed and undone | `source`, `created_by`, `start_date`, `end_date`, `status` / `batch_id`, `schedule_id` |

#### System Support

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notifications` | In-app alerts shown in the bell dropdown | `id`, `title`, `message`, `employee_id` (nullable FK), `read` |
| `security_events` | Buddy-punching attempts: face mismatches, failed PINs. A face mismatch also creates an admin notification (`security_face_mismatch`) | `id`, `type`, `message`, `employee_id` (nullable FK), `status` |
| `audit_events` | Append-only audit trail: who did what, when, with before/after snapshots (read-only in the admin UI) | `id`, `service`, `event`, `entity_type`, `actor`, `before`, `after` |
| `settings` | Single-row app config: company info, kiosk PIN hash, AI memory | `company`, `kiosk`, `ai_resolved_insights` |
| `analytics` | Cached dashboard statistics | `attendance_trend`, `punctuality_score`, etc. |

### Laravel Framework Tables (9) — auto-generated, ignore in documentation

`migrations`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `sessions`, `password_reset_tokens`, `personal_access_tokens`

---

## 6. Relationships Map

```
employees  1 --- 1  users               users.employee_id
employees  1 --- *  attendance          attendance.employee_id
employees  1 --- *  leaves              leaves.employee_id
employees  1 --- *  overtime_requests   overtime_requests.employee_id
employees  1 --- *  timesheets          timesheets.employee_id
employees  1 --- *  shift_schedules     shift_schedules.employee_id
employees  1 --- *  notifications       notifications.employee_id (nullable)
employees  1 --- *  security_events     security_events.employee_id (nullable)
attendance 1 --- 0..1 early_clock_outs  early_clock_outs.attendance_id (also employee_id)
departments 1 -- *  roles               roles.department_id
shift_definitions 1 - * shift_schedules shift_schedules.shift_id
```

**Logical links (no hard foreign key):**
- `departments.name` matches text in `employees.department`
- `roles.name` matches text in `employees.position`

**`employees` is the central entity** — every module connects to it via `employee_id`.

> **Note:** these relationships are still mostly enforced by application logic rather than hard PostgreSQL `FOREIGN KEY` constraints (checked with `pg_constraint` — only `roles.department_id → departments.id` declares one), which is an ordinary application-level design choice, not a workaround for anything. Now that everything lives in one `workforce_mgnt` database again, every relationship above is a normal, live `JOIN` — no cross-database boundary, no replica tables, and nothing to sync.

---

## 7. pgAdmin 4 Walkthrough

### First-Time Setup
1. Install pgAdmin 4 from https://www.pgadmin.org/download/pgadmin-4-windows/
2. Open it (launches as a local web app — normal).
3. Set a **master password** (this protects saved DB passwords — pick anything).

### Connecting To The Database Server
1. Left sidebar → double-click **Servers** → **PostgreSQL 18**
2. Enter the database password (the one set in `backend/app/.env` as `DB_PASSWORD`)
3. Expand **Databases** — you'll see `workforce_mgnt`, the one database the whole app uses
4. Navigate into it → **Schemas → public → Tables**

### Everyday Operations

| Task | How |
|------|-----|
| View all rows | Right-click a table → **View/Edit Data → All Rows** |
| See table structure | Right-click a table → **Properties → Columns** |
| Run custom SQL | Click the database → **Tools → Query Tool** → type SQL → press F5 |
| See indexes/FKs | Expand table node in sidebar → Indexes / Constraints |
| Generate ERD | Right-click database → **ERD For Database** |

---

## 8. Essential SQL Queries (Cheat Sheet)

Run these in Query Tool (Tools → Query Tool):

```sql
-- See all employees
SELECT id, first_name, last_name, department, position, status
FROM employees;

-- Count total attendance records
SELECT COUNT(*) FROM attendance;

-- Today's clock-ins
SELECT e.first_name, e.last_name, a.clock_in, a.clock_out, a.status
FROM attendance a
JOIN employees e ON e.id = a.employee_id
WHERE a.date = CURRENT_DATE;

-- Pending leave requests
SELECT employee_name, leave_type, start_date, end_date
FROM leaves
WHERE status = 'Pending';

-- Security events (buddy-punching attempts)
SELECT type, message, created_at
FROM security_events
ORDER BY created_at DESC
LIMIT 20;
```

**JOIN explained:** the query above combines `attendance` rows with their matching `employee` names by matching `attendance.employee_id` to `employees.id`. That's the practical use of a foreign key.

---

## 9. Indexes — What They Are

An index is a sorted shortcut that lets PostgreSQL find rows fast without scanning the whole table.

Your system already has useful ones:

| Index | On | Why |
|-------|----|-----|
| `users_email_unique` | users.email | Login lookups + no duplicate emails |
| `attendance_employee_id_date_index` | attendance (employee_id, date) | Fast "was this employee here today?" check at the kiosk |
| `leaves_employee_id_index` | leaves.employee_id | Fast "show my leave requests" |

You never create indexes manually here — Laravel migrations defined them. In pgAdmin you can see them under each table's **Indexes** node.

---

## 10. Restoring The Database From Backup

One schema reference file lives in this folder: **`database schema.sql`** — a schema-only dump of the single `workforce_mgnt` database, regenerated directly from the live server with a real `pg_dump` (not hand-written, so it's guaranteed accurate as of its date). It's one flat dump now, not one section per microservice.

The fastest, most current way to rebuild the database from scratch, though, is to let the app's own migrations do it — that's exactly what `start-all.ps1` assumes is already done, and what you'd run after a fresh `git clone`:

### Option A — Command Line (recommended: rebuilds everything from Laravel migrations)
```powershell
cd backend\app
php artisan migrate:fresh --seed
```
This drops and rebuilds every table in `workforce_mgnt` and re-seeds demo data in one command — the schema lives in code (`backend/app/database/migrations/`), not in a `.sql` file, so this is more reliable than restoring a dump and is how you'd genuinely recover from a corrupted database.

### Option B — Restore structure only, from the reference file
```powershell
createdb -U postgres workforce_mgnt
psql -U postgres -d workforce_mgnt -f "database schema.sql"
```
Useful for quickly inspecting or sharing the schema without touching a real database — it will NOT reseed demo data (use Option A for that).

Note: both restore STRUCTURE only. Live data, if any, lives on the original machine and isn't captured by either option — this is a schema dump (`--schema-only`), not a full backup.

---

## 11. Rules and Warnings

1. **Never edit production rows directly in pgAdmin while the system is running** — use the app instead.
2. **Schema changes go through Laravel migrations**, never by hand-editing tables in pgAdmin.
3. **Don't share the .env file publicly** — it contains the DB password.
4. **The schema-only dump is safe to share** — it contains no personal data.
5. If the database ever gets corrupted beyond repair, migrations can rebuild everything:
   ```powershell
   php artisan migrate:fresh --seed
   ```

---

## 12. Panel Questions About The Database (with ready answers)

> Memorize these in YOUR OWN words. They tie directly to the demo you'll show.

| Likely question | Ready answer (plain) |
|----------------|----------------------|
| Why PostgreSQL and not MySQL? | Both work; PostgreSQL handles JSON columns and complex reporting cleanly, and it's genuinely free. Our team chose it for reliability. |
| How many tables did you design? | 22 logical business tables + 9 Laravel framework tables = 31 tables, all in one database, `workforce_mgnt`. |
| Why one database instead of splitting it up? | The Workforce Management System is itself one microservice inside a larger E-Commerce Enterprise platform we're building. Splitting its own internals into 8 further microservices/databases applied the pattern one level too deep, so we consolidated back into one Laravel app and one database before the defense. One database means normal foreign keys and joins work directly across every domain — e.g. a timesheet query can join straight to `attendance` and `employees` — with no replication lag and no risk of a stale replica. |
| Which table is the most important? | `employees` — it's the center. Attendance, leaves, overtime, schedules, and timesheets all point back to it by `employee_id`, as a direct join against the one real `employees` table. |
| How do your tables connect to each other? | Normal SQL — a `JOIN` on the shared key (usually `employee_id`), or a foreign key like `roles.department_id → departments.id`. Everything is in the same database, so there's no cross-service call or sync job involved. |
| Do you use foreign key constraints? | Mostly enforced at the application layer rather than with hard `FOREIGN KEY` constraints (only `roles.department_id` declares one) — a normal design choice for this app, not a workaround for anything. Because everything lives in one database, every relationship in Section 6 is still a live, ordinary `JOIN`. |
| What is a JOIN? | Combining two tables on their key, e.g. join `attendance` to `employees` so a report shows the person's name next to each clock-in. |
| Why JSON columns? | For flexible data that doesn't deserve its own table: `employees.leave_balances`, `settings.kiosk`, `settings.ai_resolved_insights`. |
| How is the database created? | One Laravel app with one flat set of migrations (`backend/app/database/migrations/`) builds every table, and one `DatabaseSeeder` (fed by JSON mock files) fills in demo data: `cd backend/app && php artisan migrate:fresh --seed`. |
| What is an index for? | A shortcut to find rows faster, e.g. `attendance(employee_id, date)` makes the kiosk's "was this person here today?" instant. |
| Where is the password stored? | In `backend/app/.env` as DB settings, not in code — `.env` is gitignored so secrets never reach GitHub. |
| What would happen if a table were deleted? | Re-run `php artisan migrate:fresh --seed` inside `backend/app` to rebuild the whole database and re-fill it with demo data. |

> Strong closing line about the DB: **"Everything still hangs off `employee_id` conceptually, and now it's literal too — the 22 business tables all live in one `workforce_mgnt` database, so attendance, leaves, schedules, timesheets, and analytics can all be joined directly against `employees` with a normal SQL `JOIN`, no sync jobs or cross-service calls required."**

---
