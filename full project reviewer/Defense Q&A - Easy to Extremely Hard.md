# Defense Q&A — Easy to Extremely Hard

> Read `00 - Start Here - Absolute Beginner Guide.md` FIRST if any of this feels unfamiliar — it explains every term used here.
> Work top to bottom. If you can answer everything through **Hard**, you will outperform most groups. **Extremely Hard** is for if you want to impress, or if you get a panelist who used to be a developer.
> Answers here are written the way YOU should say them — plain, honest, confident. Memorize the idea, not the exact words.

---

## TIER 1 — EASY (rapid-fire, one breath each)

**Q1. What is this system?**
A web-based workforce management system — handles attendance, schedules, leave, overtime, timesheets, and payroll reporting for a company, with an AI assistant for HR.

**Q2. What are the three layers of the system?**
Frontend (React — what you see), Backend (Laravel — the brain), Database (PostgreSQL — where data is stored).

**Q3. Who are the users?**
Workforce Admin/Administrator (full access), Employee (self-service only), and the Kiosk (a device, not a person — no login; it is unlocked with the kiosk PIN and then holds a signed, expiring device token).

**Q4. How many backend applications does the system have now?**
1 — a single Laravel application. Inside it, the code is organized into 8 clear domains (identity, attendance, scheduling, time-off, payroll, communications, configuration, intelligence), but they all run in the same app and share one database.

**Q5. What port does it run on?**
Backend: `8000`. Frontend: `5173`. That's it — the whole API lives at one address. (The old design had a different port per service — 8001, 8003–8008 — those are gone.)

**Q6. What database does the system use?**
One PostgreSQL database, `workforce_mgnt`. There used to be 8 separate databases, one per microservice, kept in sync with replica tables; we consolidated them into one before the defense.

**Q7. What is an API?**
A defined set of URLs the frontend is allowed to call to ask a backend for data or tell it to do something.

**Q8. What is a token?**
A digital ID badge issued at login. The browser sends it on every request after that so the backend knows who's asking.

**Q9. In one sentence: monolith vs microservices?**
A monolith is one app with one database doing everything; microservices are many small independent apps, each with its own database, talking to each other over the network. This subsystem is a monolith at its own level, and that's deliberate — the real microservices boundary sits one level up, in the E-Commerce Enterprise platform this system is part of.

**Q10. How do you start the whole system?**
Run `.\start-all.ps1` from the project root — it boots the backend (port 8000), its background scheduler and the frontend, then health-checks the backend's `/up`.

**Q11. What's the demo login?**
`admin@workforcepro.com` / `Admin@123` for Workforce Admin.

**Q12. How does facial recognition work, in one line?**
A face is turned into a 128-number "descriptor." At the kiosk, a new photo's descriptor is compared to the saved one; close enough (below a distance threshold) = match.

**Q13. What happens if there's no internet?**
Face recognition still works (it runs in the browser, not online). The AI falls back to a built-in rule-based engine instead of Google Gemini. Nearly everything else is unaffected.

**Q14. What technology renders the charts and AI insights?**
The **Intelligence domain** inside the one backend — its own folder, routes (`/api/analytics/*`), controller and service in the same Laravel app, sharing the same database as every other domain. Charts come from Recharts in the frontend; the insights come from Google Gemini (or the built-in rule fallback).

**Q15. How are passwords stored?**
Hashed (scrambled one-way, via bcrypt) — never stored as plain readable text, not even the admin's.

---

## TIER 2 — MEDIUM (how & why, one short paragraph)

**Q16. Why did the backend architecture change during development?**
It's an honest story we're proud of. We started by splitting this subsystem's internals into **8 separate Laravel apps, each with its own database** — copying the microservices pattern from the larger E-Commerce platform, but one level too deep. Reviewing it, we saw we had sliced **one bounded domain** (workforce management) into pieces that all shared the same data model; the split only added replica tables, sync jobs, network calls and a shared token, without buying independent scaling, teams or release schedules. So we **consolidated back** into one Laravel application and one database before the defense. The 8 domains kept their names and every business rule — only the deployment shape changed.

**Q17. How does the frontend know which backend to call?**
It doesn't juggle anything — there's one backend at `http://127.0.0.1:8000`. The Vite dev server's proxy forwards every `/api/*` request there; in Docker, nginx does the same. (In the old design each service had its own port and the proxy routed by URL prefix — `/api/attendance/*` to 8003, `/api/leaves/*` to 8005, and so on.)

**Q18. How does the backend know who's logged in?**
Laravel Sanctum validates the bearer token **once**, when the request enters the single backend; the user and role then flow through the app, and every route checks them as needed. There's one identity store in one database. (In the old design the other services had to call `core`'s `/api/auth/me` over HTTP on every request — that whole mechanism is gone.)

**Q19. Walk me through what happens when HR approves a leave request from the AI Decision Support page.**
The click posts to `/api/analytics/ai/actions` with action `approve_leave`. There's no separate service to call, so the app: (1) verifies the request still exists **and is still Pending**, (2) updates the leave row's status to Approved with the approver's name via the same in-process logic the manual approval uses, and (3) returns success to the screen. One process, one database, no network hop in the middle.

**Q20. What was "snapshot sync" and an "internal API call"?**
Both belong to the old design and are gone now. Snapshot sync was a periodic job that copied a read-only copy of another service's table into your own so you could display it without a network call. An internal API call was an HTTP request to another service for something that had to happen immediately (e.g. the AI approving a leave). In the current monolith there is nothing to copy and nothing to call: one domain reads or writes the real model directly, in-process. If asked, present them as the problems the consolidation removed.

**Q21. Why does the Attendance domain need the `employees` table at all — isn't that identity's job?**
Identity **owns** it; Attendance just *reads* it. In the old design attendance kept a synced local copy so it could show names without calling `core` — that copy and its sync job are deleted. Now the Attendance controller queries the real `Employee` model, same process, same database: always live, never stale.

**Q22. Why PostgreSQL instead of MySQL?**
Both would work. PostgreSQL handles JSON columns and complex reporting cleanly and is fully free — a deliberate choice for reliability, not a requirement.

**Q23. What is a JOIN, and do you still use them?**
Combining two tables on a shared key so you can pull related data together in one query — e.g. joining `attendance` to `employees` to show a name next to a clock-in. Yes, freely: with one database, a single query can join across any of the 8 domains' tables (attendance + shifts + departments + timesheets in one statement). In the old separate-database design you couldn't join across services at all — that's exactly why replica tables existed. Removing that limit was a big reason we consolidated.

**Q24. Why does the kiosk not require a login?**
The kiosk is a shared device at the entrance, not a personal account. It has no user login, but it isn't open either: entering the kiosk PIN makes the server issue a signed, expiring device token that every kiosk call must send (see Q57). Even with it, the endpoints return only minimal fields (name, photo, department, today's schedule) — never salary, email, phone, or address.

**Q25. How does the "AI brain" decide between Gemini and the rule-based fallback?**
It checks if there's internet AND a configured Gemini API key. If yes, it sends the real database data (never fabricated) to Gemini and asks for insights as structured JSON. If offline, no key, or Gemini's reply is invalid, it silently falls back to a deterministic PHP rule engine (fixed thresholds like "3+ lates this month = flag it") — so the feature never breaks, it just changes which "brain" answered, and the screen clearly labels which one you're looking at.

**Q26. What stops an Employee from seeing another employee's salary?**
Two layers: the frontend simply doesn't show admin-only pages to an Employee role (convenience, not real security), AND every backend route that returns sensitive data checks the caller's role and ownership before responding — even if someone bypassed the UI and called the API directly, the backend would refuse. Security is enforced server-side, never trusted from the browser alone.

---

## TIER 3 — HARD (trade-offs, failure scenarios, defend a design decision)

**Q27. What happens if a part of the backend crashes during a request?**
The backend is one process, so a fatal error in one domain can take down the whole app — that's the honest trade-off of a monolith. In practice each API request is independent: one failing endpoint returns an error for that request while other requests keep being served, and the startup script / Docker restarts the backend if it ever dies. We accepted this when we consolidated: one process is simpler to operate, and at this scale a full crash is far less likely to cost us than keeping 8 services and 8 databases in sync.

**Q28. What happens if the backend goes down?**
Everything stops — login and every screen show connection errors. We say that plainly: it's one thing to monitor and restart (both `start-all.ps1` and Docker health-check `/up` and auto-start it), and a workforce subsystem at this scale doesn't need process-level failure isolation. The microservices boundary we actually rely on is one level up, inside the larger E-Commerce Enterprise platform this system is one service of.

**Q29. You don't enforce all foreign keys in PostgreSQL. Isn't that a data integrity risk?**
Most relationships are enforced by application code rather than hard SQL `FOREIGN KEY` constraints (PostgreSQL currently declares only a few, e.g. `roles.department_id → departments.id`) — an ordinary application-level design choice, not a workaround. Since the consolidation there are no replica tables being wiped and refilled, so we *could* add every constraint now, and adding the most important ones is on our improvement list. Values are still validated by the same server code before every write.

**Q30. Is there any data that can be slightly out of date?**
No. Every table has exactly one copy, read and written directly by the domain that uses it, in one database. In the old design, sync jobs could leave reference data (names, departments) a few minutes stale; that entire class of bug no longer exists.

**Q31. Why does the system use ONE database instead of several schemas or databases?**
We briefly ran 8 separate databases, one per domain, as mini-microservices. Reviewing it, we saw the split was the microservices pattern applied one level too deep — the workforce system is ONE bounded domain (itself just one service inside the larger E-Commerce platform). One database is the correct shape here: normal foreign keys, joins and transactions work across every domain with no replication lag and nothing to keep in sync.

**Q32. How do the domains stay secure from each other?**
There are no internal endpoints and no service-to-service secrets anymore — nothing domain-internal is exposed over the network, so there is nothing for an outsider to call. A request is authenticated once by Laravel Sanctum when it enters the app, and each domain's routes then check the caller's role. As defense-in-depth, the public entrance still answers 404 for anything under `/api/internal`.

**Q33. What happened to the shared `SERVICE_TOKEN`?**
It's gone — deliberately. It only existed to authenticate machine-to-machine calls between the 8 old services. Since the consolidation there are no service-to-service HTTP calls, so there is no shared secret to leak, rotate or manage. If a panelist asks about inter-service secrets, the honest answer is: there are none, because there are no inter-service calls.

**Q34. Why does Intelligence still look like its own "service"?**
Because it's a cleanly separated **domain** inside the monolith: its own folder, routes (`/api/analytics/*`), controller, service and models, plus the Gemini API key in config. It only *reads* other domains' data and depends on nothing at runtime — which is exactly why it was the natural first thing to isolate, and why it keeps that boundary today. If we ever needed independent scaling or deployment, Intelligence would be the easiest module to lift out.

**Q35. Is it fair to say the system itself isn't "distributed" at all?**
Correct — and we say it without hedging. The subsystem being demoed is one application on one machine (or one backend container in Docker). The distribution lives at the parent-platform level: the E-Commerce Enterprise system is several independently-deployed subsystems (storefront, orders, payments, workforce management...), and Workforce Management is ONE of them — its own service, its own database. We deliberately did not split this one subsystem further; at this scale it would only add cost.

---

## TIER 4 — EXTREMELY HARD (curveballs, architecture critique, honest weaknesses)

**Q36. Is this really "microservices", or is it a monolith?**
Both answers are true at different zoom levels, and honesty here wins. At the level of the subsystem itself, it's a **monolith** — one Laravel app, one database, organized into 8 clear domains. At the level of the larger E-Commerce Enterprise platform, it's **one microservice among several**. We originally misread that requirement and split the subsystem's own internals into 8 further services; review showed that was over-engineering (one bounded domain, one team, one data model), so we consolidated back before the defense. The correct shape: microservices between genuinely different subsystems, one cohesive application inside each one.

**Q37. If you had to add a 9th domain tomorrow — say, a "Payslip PDF Export" — walk me through it.**
It's a proven, low-risk recipe: create the domain's folder (`app/Http/Controllers/Api`, `app/Services`), add its routes in `routes/services/payslips.php` and `require` it from `routes/api.php`, add its Eloquent model(s) and a migration, write feature tests — and it appears under the same `/api` with no new port, no new container, no new database. In the old design that meant a whole new Laravel app, its own `.env`, its own database and a new Vite-proxy entry.

**Q38. Could the old snapshot-sync race condition happen now?**
No — snapshot sync was deleted during the consolidation. There are no replica tables left to refresh, so the "two sync runs overlap and produce a half-refreshed copy" failure mode is gone entirely. (Companies running read replicas in production do still need overlap-prevention; it just isn't relevant to a single database.)

**Q39. Why does a page that fires many API calls feel fast if each one rebuilds the app?**
In the old design every request to every service re-checked identity with `core` over HTTP, which was the biggest multiplier on response time; we shipped a 15-second cache to stop pages hammering it. After the consolidation that class of hop is gone: the one backend validates the token once per request, in-process, with data it already has — there is no cross-process round trip to cache. Session security is handled by short-lived, auto-extending tokens (see the session-timeout note at the end).

**Q40. If you rebuilt this from scratch knowing what you know now, what would you do differently?**
Honest answers that show maturity: (1) start with the single-domain monolith and **not** pre-split the subsystem into 8 services — the consolidation cost us real development time; (2) define the 8 domain boundaries up front so the folders stay clean without enforcement; (3) declare the most important foreign keys from day one, which only became fully feasible once there was one database; (4) write end-to-end integration tests for the kiosk clock-in flow against a seeded database, not just per-domain feature tests.

**Q41. What's missing for this to run safely in production with real users, not a demo?**
Containerization is done as a **demo** setup (Docker Compose: database, backend, scheduler, frontend), but production hosting is the real gap: PHP-FPM behind nginx instead of PHP's built-in server, HTTPS and a domain, an image registry and a CI/CD pipeline, a real secrets manager instead of `.env` files, centralized logging, backups, and probably a queue so notification pushes never slow a request. With one backend, scaling means more workers or more instances behind the same database rather than "add a container per service."

**Q42. What testing strategy do you have — do you test that the pieces work TOGETHER?**
The backend has a single automated suite of **310 PHPUnit tests** (1272 assertions) covering every domain's business rules — attendance rules, leave balances, overtime pay math, kiosk guardrails, role boundaries — all passing. There are no cross-service integration tests to write, because there are no separate services: "integration" is an ordinary in-process join of models, which the feature tests already exercise end-to-end at the API level. The kiosk flow is verified manually against the running system before demos.

**Q43. Why is the demo's admin password printed in plain text by your startup script?**
It's a known, deliberate shortcut for local development convenience only — printing the demo credential so teammates don't have to dig for it. In any real deployment this would be removed entirely; demo/seed credentials should never be printed or committed, and production would use properly generated, unique credentials per environment, never a shared example password.

**Q44. What prevents two paths from approving the SAME request at the same time — e.g. the AI approving overtime while HR is also approving it?**
Both paths now go through the same in-process logic, so the same guard applies: an approval (manual or via `/api/analytics/ai/actions`) only succeeds if the request **is still Pending** — the AI controller re-checks the status right before it resolves (the `Leave`/`OvertimeRequest` must be `Pending`), so the second approver gets "not found or already resolved." In the old design the AI wrote through a separate internal endpoint that did not re-check Pending — a genuine race we had identified — so closing that single weak spot (status check first, then update, in-process) was deliberate.

**Q45. Last one — sell me on why the architecture ended up shaped this way.**
"Two things. First, boundary hygiene still matters: the backend is organized into 8 clear domains — own routes, own controllers, own services, own tests — so a team can't turn one app into code spaghetti. Second, we can prove this was a decision, not an accident: we DID run this subsystem as 8 separately-deployed services with 8 databases, measured what the split cost (replica sync jobs, network hops, a shared service token, per-service cache hacks) and what it bought us (nothing we needed), and consolidated back before the defense — because the real microservices boundary sits one level up, where Workforce Management is itself one of several genuine services in the E-Commerce Enterprise platform. 'We tried it, we measured it, we reversed it' is a stronger answer than a diagram on a slide."

---

## How to use this the night before

---

## Bonus — the newest features (finished just before the defense, be ready for these)

**Q46. What does the "This Week" timesheet popup show?**
It's a live, un-submitted view of the current work week: a KPI row (Regular, Overtime, Break, and Total hours) plus a per-day table (Date, Day, Status badge, Clock In, Clock Out, Break, Hours), with today's row highlighted and a week-total footer. It's computed on the spot from the same attendance records the weekly timesheet is generated from, so it's labeled "Auto" until the employee actually submits it.

**Q47. What is "Timesheet History", and who can use it?**
It's the list under the My Timesheet summary card — every saved week with its date range, status badge, Regular/Overtime/Total hours, and submitted date. An employee clicks any row to reopen that week's full per-day breakdown, so past weeks are never lost or hidden after submission.

**Q48. You used to reject early clock-outs. What changed?**
The kiosk used to block any clock-out before the shift end ("please return to your post"). The rule now is: **no leaving without an explanation**, not **no leaving**. The terminal detects the early punch and requires a reason tap (Feeling Unwell, Family Emergency, Personal Emergency, or Other) — Continue stays disabled until one is chosen, and the server independently refuses an early punch without a reason (`422 reason_required`), so it can't be skipped. It records the punch normally, stamps the attendance row `Early Leave`, and writes an immutable `early_clock_outs` snapshot with the reason, note, and `minutes_early`. Health/emergency reasons notify all admins immediately; approved-leave/other are silent. HR later classifies each one as Excused (Sick/Emergency/Early Leave) or **Unpaid** — unpaid early minutes are deducted from pay, excused are not. The employee can still edit their reason afterwards, but the punch HR judged never changes.

**Q49. Why not just let HR edit the punch instead?**
Because punches are the audit foundation of everything downstream — hours, overtime, timesheets, payroll. Rewriting the punch to "look normal" would silently falsify attendance history. An Early Leave record preserves the true punch *and* attaches an explanation. Classification (Excused/Unpaid) is a separate, reversible judgment, so pay decisions never require touching the punch itself.

**Q50. Is Docker part of your system? What exactly did it change?**
Yes — as an alternative way to run it. `docker compose up -d --build` starts **4 containers**: one PostgreSQL server (a single `workforce_mgnt` database), the backend Laravel app (all 8 domains in one app), a scheduler container running the same image with `php artisan schedule:work` (the auto-scheduling and nightly jobs), and an nginx container that serves the built React app and proxies `/api/*` to the backend. **No features or business rules changed** (only a few small bug fixes found along the way, see Q54) — Docker only changes how the system is built, started and isolated, so it now starts with one command and behaves the same on any machine.

**Q51. Is that "production deployment"? Do you have CI/CD, a domain or HTTPS?**
No, and we say so honestly. It is a development/demonstration setup on one machine. The API containers use PHP's built-in server (4 workers), there is no HTTPS or domain, no image registry and no CI/CD pipeline. For public hosting we would add a domain + HTTPS, PHP-FPM behind nginx, managed secrets, automated backups and a pipeline (the team is considering a VPS-based host such as Hostinger).

**Q52. Is the nginx container your API gateway?**
No. It routes by URL prefix (a reverse proxy — the same table as the Vite dev proxy) but does no authentication, rate limiting or request filtering. The backend itself still validates the token on every request.

**Q53. Where are the passwords and secrets in the Docker setup? What happens to the data when you stop it?**
Secrets are in a git-ignored `.env` file, supplied to the containers as environment variables — not baked into images and not in the repository (only `.env.docker.example` is tracked). Data lives in a Docker volume, so `docker compose down` keeps it and `docker compose down -v` erases it.

**Q54. Did putting it in Docker find any problems?**
Yes. Going from the local-scripts mode to containers exposed real gaps: a missing import that would have crashed the Audit Logs page, invisible BOM characters in some bootstrap files, read-only cache folders copied from a Windows checkout, and a PostgreSQL start-up timing issue (the app container started before the database was ready). All were fixed and re-tested (the full PHPUnit suite passed — 310 tests; a from-scratch `down -v` + `up -d --build` produces a working system in about 80 seconds).

**Q55. How do you make sure an Employee can never do what a Workforce Admin can — and the reverse?**
On the **server**, not just in the menus. Every administrator route is behind the `admin` middleware, so an Employee token gets **403** (verified live against the running system for AI Decision Support, employees, audit logs, analytics, shift schedules and settings changes). Routes both roles can reach check ownership: an Employee can only read or file things under their own employee ID (`assertSelfOrAdmin`), and can only withdraw their own *pending* leave/overtime or submit their own *draft* timesheet. On the frontend, every admin page is wrapped admin-only and every "My …" page employee-only, but that is convenience — a role-boundary test in each domain proves the server side (part of the 310-test suite).

**Q56. Can an Employee approve their own leave by editing the request?**
Not any more, and we can say exactly why. While auditing role boundaries we found that the *create* endpoints saved whatever `status` the request contained, so a hand-made request with `status: "Approved"` would have been accepted. We wrote a failing test first, then fixed it: for an Employee the server now always saves **Pending** with no approver, and only an Administrator can decide it. This is a good example of testing finding a real defect.

**Q57. The kiosk has no login. Couldn't someone clock in a colleague with a script?**
Not without unlocking the device. Entering the kiosk PIN makes the server issue a signed token (valid until midnight kiosk time, so it lasts the working day however early it was unlocked, and voided the moment the PIN is changed) and every clock-in, directory, face-check and log call must send it; the PIN check itself is rate-limited to 10 attempts a minute, and failed attempts are recorded as security events by the server. Honest limits: someone who knows the PIN, or who is standing at the unlocked kiosk, can still use it, and the kiosk supports an employee-ID fallback; there is no face liveness check, and it is a local-network device, not internet-grade hardening.

**Q58. What exactly are the kiosk's clock-in rules?**
In order: (1) **no shift scheduled today → blocked**; (2) **shift already over → blocked**; (3) more than **15 minutes after the shift start → a "You Are Late" warning, but the employee can still "Clock In Anyway"**, recorded as **Late**, and the admins are notified; (4) before the start → "Clocking In Early" notice, can continue; (5) within the grace period — up to and including 15:00 after the start — recorded straight as **Present**, no popup. For clock-out: leaving before the shift end requires stating a **reason first** (recorded as Early Leave); at or after the end it just succeeds. None of these numbers are hardcoded any more — the late grace period, the no-show alert threshold, break-time rules and the early-leave policy are all admin-configurable in one place, Workforce Admin Settings → **Time Manager**; the values above are just today's defaults.

**Q59. Are those rules only on the kiosk screen? Couldn't someone skip them with a modified request?**
No — that's the point of the design. The `attendance` **server** enforces them: it takes the date and time from its own clock (in the kiosk's timezone), looks up the employee's scheduled shift itself, refuses no-shift and finished-shift punches (`422 no_shift` / `shift_over`), and computes **Present vs Late** itself — whatever status or time the terminal sends is ignored. The screen's popups only explain the rule to the employee first. Automated tests (`KioskGuardrailTest`) prove each rule, including the exact boundary: 08:15:00 is Present, 08:15:01 is Late.

**Q60. A bug: an employee with no shift clocked in at 9:30 pm and was told they were late. What happened?**
A real regression that we found, fixed and locked in with tests — a good story to own. An earlier change put the "late" check *before* the "no shift" check and made the terminal fall back to a default 08:00 start when nothing was scheduled, so at 9:30 pm it said "810 minutes late" and accepted the punch. The server also trusted whatever the terminal sent. The fix was two-part: restore the correct order (no shift → shift over → late → early), and move every rule to the server so the screen can never be the only guard. The bad record and its alert were removed, and `KioskGuardrailTest` (11 tests) now covers exactly this case.

**Q61. What happens if someone tries to clock in as a colleague?**
The browser's face check fails, so the kiosk shows a red **"Identity Verification Failed"** warning explaining it's a security violation. The server logs a `face_mismatch` security event **and immediately sends every Workforce Admin a high-priority notification** ("Face Mismatch at Kiosk", linking to AI Decision Support). Three failed attempts lock the terminal for 60 seconds. Honest limit: there is no liveness detection, so a photo held up to the camera is not specifically detected.

**Q62. The system felt slow. What did you find and what did you change?**
We profiled it rather than guessing, and the single biggest cost was that every request re-checked identity with `core` over HTTP (we had to cache it). Also: face photos (~40 KB each) were being copied to five replica tables every minute; notification pushes and data sync went one after another; some lists had no limit; and the local setup itself is slow (PHP's built-in single-request server — every request re-boots Laravel, about half a second on this low-power laptop; debug mode on). Moving the project out of OneDrive made no difference. Fixes: a 15-second identity cache (later deleted as unnecessary), replicas carried only the face descriptor, concurrent pushes, a one-query alert scan with a capped concurrent batch, newest-200 notification lists, an optional date window for attendance, short timeouts on non-critical calls, a 45-second frontend timeout, and background tabs stop polling. The consolidation itself removed the biggest cost — cross-service identity hops are now in-process. Honest note: we cut the load in code, but the local single-threaded server is an environment limit — Docker avoids it (the backend runs `php -S` with `PHP_CLI_SERVER_WORKERS`, 4 by default and configurable, so several requests are served at once instead of one at a time).

**Q63. How does the face-scan animation work, and why is it smooth even while the browser is busy?**
The camera view shows a face-shaped oval with a light band sweeping over it and landmark dots pulsing. The face model (face-api.js) runs on the browser's main thread, which normally freezes animations while it computes. We built the animation only from CSS `transform` and `opacity`, which the browser hands to the graphics thread, so it keeps moving. We also let the screen paint one frame before the heavy calculation starts.

**Q64. What are the honest limitations of the new attendance rules?**
(1) Shifts that run past midnight aren't fully supported: the backend and kiosk look at *today's* schedule, so a clock-out after midnight can't find its clock-in — this was already true before. (2) An approved overtime request on a day with **no shift** doesn't count as a shift, so it can't be used to clock in. (3) There is still no liveness check on the face scan. (4) The system has no health check on the kiosk device itself — if the screen hangs, that's only caught when someone reports it. Each is named here on purpose — owning known limits lands better than pretending the system is airtight.

**Q65. There is only one shift (8–5). What is "overtime" then, and can you schedule someone for it?**
Overtime is not a shift. The client has exactly one shift, the 8-to-5 Standard Shift, so it is the only shift template in the system (the old 5–9 PM "Overtime Shift" template was removed and can never be assigned). Overtime is time added to the end of the day: when an overtime request is approved, that day's effective end becomes 5:00 PM plus the approved hours, and the kiosk, the "shift over" check and the early-leave check all use that extended end.

**Q66. What if an employee just stays past 5 PM without asking? Doesn't that make overtime requests pointless?**
No — it is the other way round: staying without approval earns nothing. Payroll pays overtime only for time that was **approved and actually worked** (per day, the smaller of the two). The server counts a day only up to the end of the shift (5:00 PM, or later when overtime was approved), so unapproved minutes never appear in the hours: clocking out at 5:03 PM is recorded as ending at 5:00 PM. The real punch time is kept privately, so a later approval can bring the time back, and staying more than 15 minutes over with no approval alerts HR as "Unauthorized Overtime". The kiosk also warns the employee at clock-out so nobody stays believing the hours count. If it was a genuine emergency, the employee can file a request for a day in the past week and HR can approve it afterwards — then it becomes payable.

**Q67. Doesn't an approved request just pay you the approved hours even if you left at 5?**
It used to — we found and fixed that. Paid overtime is now the smaller of approved and worked: approved 2 hours but left on time pays 0; approved 2 and worked 3 pays 2. It is covered by automated tests.

**Q68. An employee sees a colleague clock out "sick" and copies the steps with a fake excuse. How do you stop that?**
A kiosk cannot verify "I'm sick", so we don't trust the reason — we verify what can be verified. Each employee has 2 free early clock-outs per 30 days and the 3rd is unexcused automatically at the punch. A sick claim must be backed by a medical certificate within 48 hours or it becomes unexcused automatically, and HR cannot excuse it without proof unless they explicitly override (audited). Every early clock-out alerts the admins with the running count, so someone can follow up the same day, and three people citing the same reason on the same day triggers a pattern alert. "Approved Leave" was removed as a reason because it can never be true at the kiosk. Honest limit: the person still loses the missing hours' pay and gets an attendance record, but we can't read minds — an employee with a fake certificate would need HR to catch it.

**Q69. Why not just block early clock-outs unless a supervisor approves?**
Because someone who is genuinely ill or has an emergency must never be trapped at the terminal. So the punch is always accepted, and the consequence (excused vs unexcused) is decided by rules and by HR afterwards. That is safer and fairer than gatekeeping at the door.

**Q70. In simple words, what is Docker and why does your system use it?**
Docker packs each part of the system — the database, the backend application and the frontend — together with everything it needs into a sealed "container", so it behaves the same on any computer. Normally our system needs several programs installed, configured and started in the right order; Docker turns that into one command (`docker compose up -d --build`). It does not change any feature — it changes how the system is built, started and isolated.

**Q71. What's the difference between an image and a container?**
An image is the frozen, ready-to-run package built from a recipe (a Dockerfile); a container is an image that is running. Like a recipe versus the dish being cooked: one image can be started as many containers.

**Q72. You have 8 domains — do you have 8 Dockerfiles?**
No, two. `backend.Dockerfile` is the recipe for the backend application (and the scheduler reuses the same image, just with a different command — `php artisan schedule:work` instead of the built-in server). The frontend has its own Dockerfile (a two-stage build: Node builds the React files, nginx serves them). That's 2 Dockerfiles for 4 containers.

**Q73. What are the 4 containers?**
1 PostgreSQL (holding the single `workforce_mgnt` database), 1 backend (the Laravel app, all 8 domains, running PHP's built-in server inside the container, `php -S`), 1 scheduler (the same image running `php artisan schedule:work` for the auto-scheduling and nightly jobs) and 1 frontend (React + nginx, which also proxies `/api/*` to the backend).

**Q74. Where does the data live when you stop Docker? What does `down -v` do?**
In a Docker *volume* (`pgdata`), stored outside the containers, so `docker compose down` keeps everything. `docker compose down -v` also deletes the volume — a completely empty fresh system. The Docker database is also separate from the local PostgreSQL the scripts use, so data added in one mode does not appear in the other.

**Q75. I changed the code but the Docker version didn't change. Why?**
Because Docker copied the code into the image when it was built. A running container uses that copy, so after code changes you rebuild with `docker compose up -d --build`. The scripts mode reads your files live, so it doesn't have this rule.

**Q76. Inside Docker, the frontend calls the backend at `http://app:8000`, not `127.0.0.1`. Why?**
Each container has its own private network address, so `127.0.0.1` would mean "myself". Docker gives every container a name that other containers can use, like an internal phone book, so `app` always finds the backend wherever it is running. The nginx container uses the same name in its routing table.

**Q77. Is nginx in your Docker setup an API gateway?**
No. It is a reverse proxy: it serves the React files and forwards each `/api/...` request to the backend at `http://app:8000`, exactly like the Vite dev proxy. It does no authentication, rate limiting or filtering — the backend validates the token itself.

**Q78. Is this production-ready?**
No, and we say so. It is a development/demonstration setup on one machine: PHP's built-in server rather than PHP-FPM, no HTTPS or domain, no image registry, no CI/CD, database port exposed on the laptop, secrets in a local `.env`. For real hosting we would add a domain with HTTPS, PHP-FPM behind nginx, managed secrets, backups and a deployment pipeline.
---

## How to use this the night before

1. Cover the answer column, read the question, say your answer OUT LOUD.
2. If you freeze on a Hard/Extremely Hard one — that's fine, that's literally why this tier exists. Re-read it once, move on, come back to it tomorrow morning.
3. Have a teammate quiz you out of order — questions land differently when you don't know which one's coming.
4. If the panel asks something not on this list: it's okay to say *"that's a great question, let me think about that for a second"* — pausing to think is normal and better than guessing wrong confidently.

### How does a timesheet get from the employee to payroll, and what stops it being changed or paid twice?

The system builds each week's timesheet from the clock-outs, so nobody types hours in. When the week ends the employee reviews and submits it (if they do not, the system submits it at Monday noon and marks it "auto-submitted"). The admin then approves it, or rejects it with a reason, or reopens it with a reason. Only a finished week can be reviewed, and the server refuses any move that is not allowed (for example approving a draft). Once submitted, the hours are frozen: if attendance changes later the row is only flagged, so what the admin reviewed cannot change quietly. Approved timesheets are sent to payroll once — they are marked as sent, cannot be reopened, and can never be sent (paid) twice. Every step, with who and why, is kept in the timesheet's history and in the audit log.

### Your scheduling is called "automated". What is actually automatic about it?

The **rules do the tedious work; a person approves the result.** "Automated" here means rule-based automation, **not AI**, and it does not run by itself. The admin clicks **+ Automated Shift**, picks a period (a start date and 1–4 weeks) and how many employees each day needs, optionally filtered by department and position. The shift is always the **Standard Shift** (8:00 AM–5:00 PM), the only shift the company works. For each working day the system (1) builds the **eligible pool** — active, matching the filters, not on approved leave, not already scheduled that day and still under the weekly hours limit; (2) **ranks by fairness**, fewest shifts so far in the draft first; (3) assigns the **top N**, so nobody is booked twice. The admin sees the draft as a table — with who is on leave, who already has a shift, who hit the hours limit, and how many people cover each day — can **edit** any cell, and only then presses **Approve**. Nothing is saved before that. Approving saves the shifts, notifies each employee and writes an audit entry. So the admin's job moves from "build the schedule" to "review the schedule the system built".

### How is an employee's session protected if they walk away from the computer?

Two layers. In the browser, an employee who does nothing for **3 minutes** sees a "still there?" warning for the last 30 seconds and is then signed out. The real protection is on the **server**: an employee's login token is created with a 3-minute expiry, and the browser extends it only while the person is actually using the system (mouse, keys, touch). Background requests such as notification polling do not extend it, so a session left open — or a laptop lid closed — dies by itself, and the backend refuses the expired token. Administrators are not timed out. The same care applies to password recovery: the emailed reset code is valid for **one minute** and is stored hashed, so a stale code is useless.

### Why does a leave request cost fewer days than the dates on the calendar?

Because leave is charged in **working days**. When a request is filed, the time-off domain counts the days in that range the person actually works — the company's usual work days, Monday to Saturday — minus the company holidays that fall in it. This runs **in-process** against the same data the schedule uses, so there is no network call and no "scheduling is unreachable" fallback anymore. A Friday-to-Monday leave is 3 days (Friday, Saturday, Monday), not 4 - Sunday is never charged - and a range with no working day at all is refused. The count is stored on the request (`leaves.days`) and used for the balance check, so the number the employee saw while picking dates is the number that is deducted.

### How do absences get recorded if the person never touched the kiosk?

A person who does not clock in produces no event, so a nightly job does it: `attendance:mark-absent` runs at 00:10 Manila time (and again at noon as a safety net). For every finished day it finds shifts with no attendance record and no approved leave and writes an **Absent** record. It never touches today (the shift may still come), never overwrites an existing record and can be run repeatedly without creating duplicates. This is what makes the Absent figures on the dashboard, analytics and AI honest.

### Can an administrator quietly take data out of the system, or change rules without a trace?

No. Exporting a report or the audit log asks for the administrator's password again (the server checks it and records who confirmed it and for what), and sign-ins, failed sign-ins, lock-outs, password changes, overtime decisions (including reopening one) and every change to the company / system / kiosk settings are written to the append-only audit log with the before and after values. We use the password rather than an emailed code because the administrator is a fixed account, not a real mailbox.

### The kiosk config endpoint is public. Does it leak anything?

It used to include the kiosk activity log, which names employees and shows clock times, and that was a leak: anyone who could reach the endpoint could read it. We fixed it. The public config now carries only the safe fields (device name, location, time zone, whether the kiosk is on, whether a PIN is set). The log and the daily overview are served by administrator-only endpoints, and a test asserts that the public response contains no log and no employee name.

### What does the administrator see on the Kiosk Management screen?

A live overview, refreshed every 15 seconds: whether the kiosk is on and a countdown to the end of today's unlock, how many people have clocked in against how many were scheduled, who is scheduled and late but has not clocked in, how many real security alerts (wrong PIN or face mismatch) happened today, and a readiness check (PIN set, employees without a registered face, camera and face models on the device). The numbers are computed on the server in the kiosk's own time zone, so they match what the attendance rules enforce.

### Can someone outside call the backend's internal endpoints through the website?

No. There is no separate internal API. In the earlier split design the services talked to each other with a shared secret token on private routes and the public entrance answered **404** for anything under `/api/internal`; after consolidation, all that machinery was deleted. There is one `/api` surface, everything in it is subject to the same authentication and authorization as any other route, and there is no `/api/internal` path at all.

### If an administrator corrects a punch, who calculates the hours?

The server. When a clock-in or clock-out is corrected, the server recounts the hours from the shift with the same rule as the kiosk (only to the end of the shift plus approved overtime, lunch by duration) and ignores any hours sent along with the correction. The real punch is kept, so a later overtime approval still works.

### What happens if an employee clocks in early? Do they get paid for the extra time?

Two rules, both enforced by the server. First, the kiosk opens a **30-minute window** before the shift: someone who taps in earlier is refused with a friendly message saying when it opens. Second, inside the window the tap is recorded as it happened, but **paid hours count from the shift start**, so 20 minutes of early arrival adds nothing. This mirrors what we already do at the end of the day, where time after the shift counts only when an overtime request was approved. Real enterprise systems handle it the same way: record the real punch, pay from the scheduled start, and pay early time only when it is approved.

### How does an employee tell which row is "today" in their schedule and attendance?

Every screen marks it the same way: the row for today has a blue tint, a blue bar on its left edge and a small "Today" pill beside the date (a leave in progress shows "On leave today"). It is deliberately not colour-only, so it is readable for colour-blind users and in print. "Today" is worked out in the kiosk's time zone (Manila), the same day the server uses to decide shifts and attendance, so a phone set to another time zone still highlights the correct row.

