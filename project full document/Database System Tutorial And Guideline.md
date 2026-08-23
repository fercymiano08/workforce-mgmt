# Database System Tutorial And Guideline

> Complete guide to the PostgreSQL database powering the Workforce Management System of **Archon Nell Incorporated**.

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
| Database Name | `workforce_mgnt` |
| Total Tables | 23 (14 business + 9 Laravel framework) |
| Managed By | Laravel 13 migrations + pgAdmin 4 |
| Runs On | Local machine (`127.0.0.1`) |

The database stores everything the system knows: employee records, attendance history, leave requests, shift schedules, timesheets, security events, and app configuration.

---

## 2. Connection Details

These values live in `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=workforce_mgnt
DB_USERNAME=postgres
DB_PASSWORD=postgre
```

Use these same values when connecting from pgAdmin 4 or any other client.

---

## 3. The Tools

| Tool | What It Does |
|------|--------------|
| **pgAdmin 4** | Visual browser for the database — view tables, edit data, run queries, generate ERDs |
| **Laravel migrations** | PHP files in `backend/database/migrations/` that define table structures in code |
| **psql** | PostgreSQL's command-line client (already installed) |
| **pg_dump** | Command that exports the database to a `.sql` file |

**How they fit together:** Laravel migrations CREATE the tables. The app reads/writes them. pgAdmin lets humans look inside. `pg_dump` backs it all up.

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

### Core Business Tables (14) — these appear in the ERD

#### People & Organization

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Login accounts for Admin, HR Manager, AND Employees | `id`, `employee_id`, `email`, `password`, `role`, `role_label` |
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
| `shift_definitions` | Shift templates (Morning 06:00–14:00, Flexible 08:00–17:00, etc.) | `id`, `name`, `start_time`, `end_time` |
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

---

## 7. pgAdmin 4 Walkthrough

### First-Time Setup
1. Install pgAdmin 4 from https://www.pgadmin.org/download/pgadmin-4-windows/
2. Open it (launches as a local web app — normal).
3. Set a **master password** (this protects saved DB passwords — pick anything).

### Connecting To The Database
1. Left sidebar → double-click **Servers** → **PostgreSQL 18**
2. Enter password: `postgre`
3. Navigate: **Databases → workforce_mgnt → Schemas → public → Tables**

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

The file `workforce_mgnt_schema.sql` in this folder contains the full structure.

### Option A — Command Line
```powershell
createdb -U postgres workforce_mgnt
psql -U postgres -d workforce_mgnt -f workforce_mgnt_schema.sql
```

### Option B — pgAdmin 4
1. Right-click **Databases → Create → Database** → name it `workforce_mgnt`
2. Click the new database once
3. **Tools → Query Tool**
4. Open the .sql file (folder icon) or paste contents
5. Press **F5**

Note: this restores STRUCTURE only (empty tables). Live data lives on the original machine.

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
