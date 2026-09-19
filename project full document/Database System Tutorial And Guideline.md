# Database System Tutorial And Guideline

> Complete guide to the PostgreSQL database(s) powering the Workforce Management System of **Archon Nell Incorporated**.
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
5. [All 23 Tables Explained](#5-all-23-tables-explained)
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
| Database Names | **8 separate databases, one per microservice** (see table below) |
| Total Tables | 23 distinct business/table designs (14 originally "business" tables + 9 Laravel framework tables), now **replicated across services as needed** — so the raw row count of `information_schema.tables` per database is higher than 14, because a service keeps read-only local copies of tables it doesn't own |
| Managed By | 8 independent sets of Laravel 13 migrations (one per service) + pgAdmin 4 |
| Runs On | Local machine (`127.0.0.1:5432`), one PostgreSQL server hosting all 8 databases |

The database (now databases, plural) store everything the system knows: employee records, attendance history, leave requests, shift schedules, timesheets, security events, and app configuration — split by domain instead of living in one place.

| # | Database | Owning service | Port | Owns (real, writable tables) |
|---|----------|-----------------|------|-------------------------------|
| 1 | `workforce_mgnt` | `core` | 8000 | `users`, `employees`, `departments`, `roles`, `personal_access_tokens` |
| 2 | `workforce_intel` | `intelligence` | 8001 | `analytics` |
| 3 | `workforce_attendance` | `attendance` | 8003 | `attendance`, `security_events` |
| 4 | `workforce_scheduling` | `scheduling` | 8004 | `shift_definitions`, `shift_schedules` |
| 5 | `workforce_timeoff` | `timeoff` | 8005 | `leaves`, `overtime_requests` |
| 6 | `workforce_payroll` | `payroll` | 8006 | `timesheets` |
| 7 | `workforce_communications` | `communications` | 8007 | `notifications` |
| 8 | `workforce_configuration` | `configuration` | 8008 | `settings` |

> **Every database also contains read-only replica copies** of a few tables it needs but doesn't own — most commonly `users` and `employees` (nearly every service needs to show a name), and sometimes more depending on the service's job (e.g. `attendance`'s DB also carries a local `leaves` replica so it can tell Present vs On-Leave without calling another service on every request). Those replica tables are refreshed by `SnapshotSyncService` / `php artisan snapshot:sync` — they are NOT the source of truth, and writing to them directly would just get overwritten on the next sync.

---

## 2. Connection Details

Each service has its own `.env` at `backend/<name>/.env`. They all share the same PostgreSQL server and credentials — only `DB_DATABASE` changes:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=workforce_mgnt        # ← this line differs per service, see the table in Section 1
DB_USERNAME=postgres
DB_PASSWORD=<your-database-password>   # set in backend/<name>/.env, never committed
```

To inspect a specific service's data from pgAdmin 4 or `psql`, connect to the same server (`127.0.0.1:5432`, same username/password) and pick the database name that matches the service from the table above.

---

## 3. The Tools

| Tool | What It Does |
|------|--------------|
| **pgAdmin 4** | Visual browser for the database server — view tables, edit data, run queries, generate ERDs. One connection, expand any of the 8 databases under it. |
| **Laravel migrations** | PHP files in each service's own `backend/<name>/database/migrations/` that define ITS tables in code |
| **psql** | PostgreSQL's command-line client (already installed) — pass `-d <database_name>` to pick which of the 8 you're querying |
| **pg_dump** | Command that exports a database to a `.sql` file — run once per database if you need to back up all 8 |

**How they fit together:** each service's own Laravel migrations CREATE that service's tables in that service's database. Each service's app reads/writes only its own database directly, plus its own replica tables via sync. pgAdmin lets humans look inside any of the 8. `pg_dump` backs each one up individually.

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

## 5. All 23 Tables Explained

> The tables below are described once, logically — each still means the same thing it always did. What's different post-migration is **where the real, writable copy lives** (see the "Owning service" column and the DB table in Section 1). If a service isn't listed as the owner, any copy it has is a read-only replica.

### Core Business Tables (14) — these appear in the ERD

#### People & Organization

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Login accounts for the Workforce Admin and Employees | `id`, `employee_id`, `email`, `password`, `role`, `role_label` |
| `employees` | Full employee profiles including face photo + descriptor for kiosk recognition | `id`, `first_name`, `last_name`, `department`, `position`, `face_descriptor`, `leave_balances` |
| `departments` | Company departments | `id`, `name`, `head`, `budget`, `employee_count` |
| `roles` | Job titles per department — powers the Position dropdown | `id`, `department_id` (FK), `name` |

#### Time & Attendance

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `attendance` | One row per employee per day: clock in/out, hours, status | `id`, `employee_id` (FK), `date`, `clock_in`, `clock_out`, `total_hours` |
| `timesheets` | Weekly hour summaries submitted for approval | `id`, `employee_id` (FK), `week_start`, `week_end`, `regular_hours`, `status` |
| `overtime_requests` | OT applications: expected vs approved hours | `id`, `employee_id` (FK), `expected_hours`, `approved_hours`, `status` |

#### Leave

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `leaves` | Leave applications with approval workflow | `id`, `employee_id` (FK), `leave_type`, `start_date`, `end_date`, `status` |

> Note: leave balances are stored as a JSON column inside `employees.leave_balances`, not a separate table.

#### Scheduling

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `shift_definitions` | Shift templates (Flexible 08:00–17:00, Overtime 17:00–21:00) | `id`, `name`, `start_time`, `end_time` |
| `shift_schedules` | Who works which shift on which date | `id`, `employee_id` (FK), `shift_id` (FK), `date`, `status` |

#### System Support

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `notifications` | In-app alerts shown in the bell dropdown | `id`, `title`, `message`, `employee_id` (nullable FK), `read` |
| `security_events` | Buddy-punching attempts: face mismatches, failed PINs | `id`, `type`, `message`, `employee_id` (nullable FK), `status` |
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
departments 1 -- *  roles               roles.department_id
shift_definitions 1 - * shift_schedules shift_schedules.shift_id
```

**Logical links (no hard foreign key):**
- `departments.name` matches text in `employees.department`
- `roles.name` matches text in `employees.position`

**`employees` is the central entity** — every module connects to it via `employee_id`.

> **Post-migration note:** these relationships are now enforced by **application logic and snapshot sync**, not by a PostgreSQL `FOREIGN KEY` constraint — checked with `pg_constraint`, none of the 8 databases declare real FK constraints any more, even between a table and its own local replica (e.g. `workforce_attendance`'s `attendance.employee_id` isn't a hard FK to its local `employees` replica). This is deliberate: a replica table gets wiped and refilled on every sync, and a hard FK would break the moment sync order didn't match insert order. Referential integrity is now the app's job (validating IDs before writing) instead of the database's — a real trade-off of the split worth naming honestly if a panelist asks about it.

---

## 7. pgAdmin 4 Walkthrough

### First-Time Setup
1. Install pgAdmin 4 from https://www.pgadmin.org/download/pgadmin-4-windows/
2. Open it (launches as a local web app — normal).
3. Set a **master password** (this protects saved DB passwords — pick anything).

### Connecting To The Database Server
1. Left sidebar → double-click **Servers** → **PostgreSQL 18**
2. Enter the database password (the one set in `backend/core/.env` as `DB_PASSWORD`)
3. Expand **Databases** — you'll see all 8 (`workforce_mgnt`, `workforce_intel`, `workforce_attendance`, `workforce_scheduling`, `workforce_timeoff`, `workforce_payroll`, `workforce_communications`, `workforce_configuration`), one connection covers all of them
4. Navigate into whichever one owns the data you want (see the table in Section 1) → **Schemas → public → Tables**

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

One schema reference file lives in this folder: **`database schema microservices structure.sql`** — a schema-only dump of **all 8 databases**, regenerated directly from the live server (not hand-written, so it's guaranteed accurate as of its date), one clearly-labeled section per service (`core`, `intelligence`, `attendance`, `scheduling`, `timeoff`, `payroll`, `communications`, `configuration`). Open it and search for `-- DATABASE: workforce_mgnt` (or whichever database you want) to jump straight to that service's tables.

The fastest, most current way to (re)build ALL 8 databases from scratch, though, is to let each service's own migrations do it — that's exactly what `start-all.ps1` assumes is already done, and what you'd run after a fresh `git clone`:

### Option A — Command Line (recommended: rebuilds all 8 from Laravel migrations)
```powershell
foreach ($svc in 'core','intelligence','attendance','scheduling','timeoff','payroll','communications','configuration') {
  Push-Location "backend\$svc"
  php artisan migrate:fresh --seed
  Pop-Location
}
```
This drops and rebuilds every table in every one of the 8 databases and re-seeds demo data, per service — the schema lives in code (`database/migrations/`), not in a `.sql` file, so this is more reliable than restoring a dump and is how you'd genuinely recover from a corrupted database.

### Option B — Restore structure only, from the reference file
Open `database schema microservices structure.sql`, copy just the section you need (from its `-- DATABASE: <name>` header down to the next one), paste it into a new `.sql` file, then:
```powershell
createdb -U postgres workforce_mgnt
psql -U postgres -d workforce_mgnt -f that_section.sql
```
Useful for quickly inspecting or sharing one service's schema without touching a real database — it will NOT reseed demo data (use Option A for that).

Note: both restore STRUCTURE only. Live data, if any, lives on the original machine and isn't captured by either option — these are schema dumps (`--schema-only`), not full backups.

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
| How many tables did you design? | 14 logical business tables + 9 Laravel framework tables = 23 designs. Post-migration, those 23 are spread across **8 databases** (one per microservice), and several services keep read-only replicas of tables they don't own, so the physical table count per database varies. |
| Why 8 databases instead of 1? | Because we migrated to microservices — each service should own its data and be deployable/testable independently. One shared database would mean one service's migration could break seven others. |
| Which table is the most important? | `employees` — it's the center. Attendance, leaves, overtime, schedules, timesheets all point back to it by `employee_id`, whether as the owning row (in `core`) or a synced replica (everywhere else that needs it). |
| How do your tables connect across services now? | Two ways: a **snapshot sync** job that copies read-only reference data (like `employees`) into any service's local database on a schedule, or a direct **internal API call** when a write has to happen immediately (e.g. `intelligence` approving a leave calls `timeoff` directly). There is no live cross-database JOIN — that's not physically possible once data is in separate databases. |
| Did you lose foreign key constraints when you split the database? | Yes, and we did it deliberately — see Section 6. None of the 8 databases declare `FOREIGN KEY` constraints any more, even between a table and its own local replica, because a replica gets wiped and refilled on every sync and a hard FK would fight that. Referential integrity moved from the database layer to the application layer. |
| What is a JOIN? | Combining two tables on their key, e.g. join attendance to employees so a report shows the person's name next to each clock-in. Still used freely *within* one service's own database — just not across two different services' databases. |
| Why JSON columns? | For flexible data that doesn't deserve its own table: `employees.leave_balances`, `settings.kiosk`, `settings.ai_resolved_insights`. |
| How is the database created? | Each of the 8 services has its own Laravel migrations that build its own structure, and its own `DatabaseSeeder` (fed by that service's JSON mock files) that fills in demo data. Per service: `php artisan migrate:fresh --seed`, run inside `backend/<name>/`. |
| What is an index for? | A shortcut to find rows faster, e.g. `attendance(employee_id, date)` makes the kiosk's "was this person here today?" instant — each service indexes only its own tables. |
| Where is the password stored? | In each service's own `backend/<name>/.env` as DB settings, not in code — every `.env` is gitignored so secrets never reach GitHub. |
| What would happen if a table were deleted? | Re-run `php artisan migrate:fresh --seed` inside that one service's folder to rebuild just that service's database and re-fill it — the other 7 services are untouched, which is itself a demo point about isolation. |

> Strong closing line about the DB: **"Everything still hangs off `employee_id` conceptually, but the 14 business tables now live across 8 independently-owned databases instead of one — which is exactly what the microservices requirement asked for, and it's why analytics and AI now read from a synced snapshot instead of joining live tables directly."**

---
