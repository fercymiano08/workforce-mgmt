# WorkForce Pro — Backend API

One Laravel 13 application (PHP 8.3+) with one PostgreSQL database. It serves the JSON API used by the
React frontend in `../../frontend`; it has no web pages of its own.

## Layout

| Path | What lives there |
|---|---|
| `routes/api.php` | Mounts one route file per domain from `routes/services/` (auth, identity, attendance, scheduling, time-off, payroll, communications, configuration, intelligence, audit) |
| `app/Http/Controllers/Api` | One controller per area (attendance, kiosk, leave, shifts, timesheets, AI decision support, …) |
| `app/Services` | Business rules shared by controllers and commands (timesheet generation, working days, break/early-leave policy, notifications, audit logging, AI insights) |
| `app/Console/Commands` | Background jobs, scheduled in `routes/console.php` (mark absences, recount hours, auto-generate schedules, timesheet submit/remind/refresh, expire early-out certificates) |
| `database/migrations` | The full schema |
| `database/seeders`, `database/mock` | The admin account plus optional demo data (`SEED_DEMO_DATA`) |
| `tests/Feature` | API tests, including role-boundary tests for every domain |

## Run it locally

```bash
composer install
cp .env.example .env        # then set DB_* (PostgreSQL) and optionally GEMINI_API_KEY
php artisan key:generate
php artisan migrate --seed
php artisan serve           # API on http://localhost:8000
php artisan schedule:work   # background jobs (separate terminal)
```

From the project root, `start-all.ps1` starts the API, the scheduler and the frontend together, and
`docker compose up -d --build` runs the whole stack in containers instead.

## Demo data before a presentation

The demo employees (the ones in `database/mock/employees.json` and `database/demo/core.json`) cannot use the
kiosk, so their shifts slowly turn into automatic absences. The day before presenting, run:

```bash
php artisan demo:refresh            # rebuilds their last 4 weeks up to today (--weeks=N for more)
```

It rebuilds their schedules, attendance and timesheets through the system's own rules (Monday-Saturday work
days, holidays and approved leave skipped, Present/Late by the kiosk's grace rule, hours counted like the
kiosk counts them, timesheets moved through the real workflow). Employees registered through the system are
never touched. Back up first: `pg_dump -U postgres -d workforce_mgnt -f ../../db-backups/before-demo.sql`.

## Tests

```bash
php artisan test
```

Tests run against an in-memory SQLite database, so they never touch real data.
