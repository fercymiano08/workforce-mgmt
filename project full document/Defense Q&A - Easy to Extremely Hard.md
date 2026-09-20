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

**Q4. How many backend services does the system have now?**
8: `core`, `intelligence`, `attendance`, `scheduling`, `timeoff`, `payroll`, `communications`, `configuration`.

**Q5. What port does each service run on?**
core 8000, intelligence 8001, attendance 8003, scheduling 8004, timeoff 8005, payroll 8006, communications 8007, configuration 8008. Frontend runs on 5173.

**Q6. What database does the system use?**
PostgreSQL — 8 separate databases now, one per service.

**Q7. What is an API?**
A defined set of URLs the frontend is allowed to call to ask a backend for data or tell it to do something.

**Q8. What is a token?**
A digital ID badge issued at login. The browser sends it on every request after that so the backend knows who's asking.

**Q9. In one sentence: monolith vs microservices?**
A monolith is one app with one database doing everything; microservices are many small independent apps, each with its own database, talking to each other over the network. We migrated from the first to the second.

**Q10. How do you start the whole system?**
Run `.\start-all.ps1` from the project root — it boots all 8 services and the frontend, and checks that each one answers on `/up`.

**Q11. What's the demo login?**
`admin@workforcepro.com` / `Admin@123` for Workforce Admin.

**Q12. How does facial recognition work, in one line?**
A face is turned into a 128-number "descriptor." At the kiosk, a new photo's descriptor is compared to the saved one; close enough (below a distance threshold) = match.

**Q13. What happens if there's no internet?**
Face recognition still works (it runs in the browser, not online). The AI falls back to a built-in rule-based engine instead of Google Gemini. Nearly everything else is unaffected.

**Q14. What technology renders the charts and AI insights?**
The `intelligence` microservice — its own Laravel app, own database, own port (8001).

**Q15. How are passwords stored?**
Hashed (scrambled one-way, via bcrypt) — never stored as plain readable text, not even the admin's.

---

## TIER 2 — MEDIUM (how & why, one short paragraph)

**Q16. Why did you migrate from monolith to microservices?**
It was a requirement from our adviser/department — the capstone had to demonstrate a microservices architecture, not just a single app. We built the monolith first to get every feature correct, then split it into 8 independent services one at a time (the "Strangler Fig" pattern), verifying each one with its own tests before moving to the next, instead of a risky one-shot rewrite.

**Q17. How does the frontend know which of the 8 services to call?**
The frontend never talks to a single "gateway." Its Vite dev server has a proxy configuration that looks at the URL prefix of every request — `/api/attendance/*` goes to port 8003, `/api/leaves/*` goes to port 8005, and so on — and forwards it straight to the owning service.

**Q18. Most services don't have a `users` table with passwords. How do they check who's logged in?**
Every service except `core` doesn't store passwords at all. When a request arrives with a token, that service calls `core`'s `GET /api/auth/me` over HTTP with that token, and `core` — the one source of truth for identity — replies with who the user is and their role. `core` is still central for identity; it's just no longer a gateway for anyone else's business data.

**Q19. Walk me through what happens when HR approves a leave request from the AI Decision Support page.**
The click sends a request to the `intelligence` service (`/api/analytics/ai/actions`). `intelligence` doesn't own leave data, so it calls the `timeoff` service's internal API directly (through a small internal client class) to actually update that leave request's status. `timeoff` makes the real change in its own database, and `intelligence` reports success back to the screen.

**Q20. What's the difference between "snapshot sync" and an "internal API call"?**
Snapshot sync is for data a service just needs to READ and display — a periodic job copies a read-only snapshot from the owning service into the local database (e.g. `attendance` keeps a synced copy of `employees` so it can show names). An internal API call is for anything that must happen immediately and correctly — e.g. actually approving a leave request — so instead of writing to a stale local copy, the service calls the real owner directly over HTTP.

**Q21. Why does the `attendance` service have its own copy of the `employees` table if `core` already owns it?**
Because `attendance` needs employee names/departments on almost every screen, and calling `core` over the network on every single page load would be slow and would mean attendance completely stops working the moment `core` is briefly unreachable. A locally synced, read-only copy solves both problems, at the cost of that copy being slightly out of date between syncs — an accepted trade-off.

**Q22. Why PostgreSQL instead of MySQL?**
Both would work. PostgreSQL handles JSON columns and complex reporting cleanly and is fully free — a deliberate choice for reliability, not a requirement.

**Q23. What is a JOIN, and do you still use them?**
Combining two tables on a shared key so you can pull related data together in one query — e.g. joining `attendance` to `employees` to show a name next to a clock-in. Still used freely WITHIN one service's own database. You cannot JOIN across two different services' databases — that's not physically possible once the data is split, which is exactly why snapshot sync exists.

**Q24. Why does the kiosk not require a login?**
The kiosk is a shared device at the entrance, not a personal account. It has no user login, but it isn't open either: entering the kiosk PIN makes the server issue a signed, expiring device token that every kiosk call must send (see Q57). Even with it, the endpoints return only minimal fields (name, photo, department, today's schedule) — never salary, email, phone, or address.

**Q25. How does the "AI brain" decide between Gemini and the rule-based fallback?**
It checks if there's internet AND a configured Gemini API key. If yes, it sends the real database data (never fabricated) to Gemini and asks for insights as structured JSON. If offline, no key, or Gemini's reply is invalid, it silently falls back to a deterministic PHP rule engine (fixed thresholds like "3+ lates this month = flag it") — so the feature never breaks, it just changes which "brain" answered, and the screen clearly labels which one you're looking at.

**Q26. What stops an Employee from seeing another employee's salary?**
Two layers: the frontend simply doesn't show admin-only pages to an Employee role (convenience, not real security), AND every backend route that returns sensitive data checks the caller's role and ownership before responding — even if someone bypassed the UI and called the API directly, the backend would refuse. Security is enforced server-side, never trusted from the browser alone.

---

## TIER 3 — HARD (trade-offs, failure scenarios, defend a design decision)

**Q27. What happens to the rest of the system if ONE service goes down — say, `communications`?**
Everything that doesn't depend on notifications keeps working completely normally — clocking in, approving leave, running payroll. The only symptom is that nobody gets a bell notification until `communications` comes back up, and any service trying to raise one over its internal API would get a failed call (which should be handled gracefully, not crash the caller). This is the actual point of microservices: a non-critical service failing doesn't take down the whole system, unlike a monolith where one crash can kill everything.

**Q28. If `core` goes down, what happens to the other 7 services?**
This is the honest weak point: every other service authenticates users by calling `core`'s `/api/auth/me` over HTTP. If `core` is down, NO service can verify who's logged in, so effectively the whole system becomes unusable for authenticated actions, even though the other 7 databases are perfectly fine. `core` is a **single point of failure for identity**. That's a real, known trade-off of this design — the honest answer if pushed is: "in a production system, you'd want `core`'s auth to be highly available (multiple instances behind a load balancer) precisely because everything else depends on it."

**Q29. You dropped foreign key constraints between tables that used to be linked. Isn't that a data integrity risk?**
Yes, and it was a deliberate trade-off, not an oversight. A replica table (like `attendance`'s local copy of `employees`) gets wiped and refilled by the sync job — a hard foreign key constraint would break that refresh the moment sync order didn't perfectly match. So referential integrity moved from the database layer to the application layer: the backend code validates IDs before writing, instead of PostgreSQL enforcing it automatically. It's a real cost of splitting one database into eight, and we'd flag it as a place we'd add more validation tests if we had more time.

**Q30. What if the snapshot sync fails or runs late — what does the user see?**
They'd see slightly stale reference data — e.g. an employee's department shown as their old one for a few minutes after HR changes it in `core`, until the next sync runs on the dependent service. The core, live-owned data (attendance records themselves, leave request statuses, etc.) is never stale, because those are only ever read/written directly by the service that owns them — only the supporting reference data (names, departments) can lag.

**Q31. Why not just use ONE shared PostgreSQL server with 8 separate schemas instead of 8 fully separate databases?**
We could have — schemas would give some separation with less operational overhead. We chose full separate databases because it's a stronger, clearer boundary: it makes it structurally impossible for one service's code to accidentally query another service's tables (different connection credentials entirely, not just a different schema search path), which better proves true service independence for the microservices requirement — and it's closer to how this would be deployed in the real world, where each service would likely have its own database server entirely.

**Q32. How do the internal, service-to-service endpoints stay secure? What stops an outsider from calling them?**
Every internal endpoint (under `/internal/*` on each service) requires a shared secret header (`SERVICE_TOKEN`) that only the 8 services know — it's not a user token, it's a machine-to-machine password. A request without the correct token is rejected before it reaches any real logic.

**Q33. What if that shared `SERVICE_TOKEN` leaked?**
Anyone with it could call internal endpoints directly and, e.g., force-approve leave requests or pull data snapshots. In production you'd want per-service tokens (not one shared secret for all 8) and network-level restrictions (internal endpoints not reachable from the public internet at all, only from other services' internal network) — we'd name this as a next hardening step, not pretend it's already solved.

**Q34. Why did you extract `intelligence` (analytics/AI) FIRST, instead of some other service?**
Because nothing else in the system depends on it at runtime — HR can clock people in, approve leave, and run payroll even with the AI service completely down. It was the lowest-risk domain to prove the extraction pattern on before touching anything the whole demo depends on.

**Q35. Your services all run on one laptop right now. Is that really "distributed"?**
Physically, no — they're all on one machine for the demo, connected over `127.0.0.1` (localhost) instead of a real network. But architecturally, yes: each is a separate OS process, separate database, with no shared memory or shared database connection — the SAME code would work unchanged if each service ran on a different machine or cloud server, because they only ever talk over HTTP. That's the real test of "is this actually microservices" — not where it's deployed, but whether the services are coupled by code/database or only by network calls. Ours are only coupled by network calls.

---

## TIER 4 — EXTREMELY HARD (curveballs, architecture critique, honest weaknesses)

**Q36. Is this really microservices, or is it a "distributed monolith"?**
Fair challenge. A distributed monolith is when you split an app into separate processes but they still have to be deployed together and can't survive each other failing — which would defeat the purpose. Ours mostly avoids that: each service has its own database, its own tests, and can genuinely keep running if a sibling service goes down (proven in Q27). The one place it leans toward "distributed monolith" is identity (Q28) — every service hard-depends on `core` being reachable. That's a fair, honest limitation to name if asked directly, not something to hide.

**Q37. If you had to add a 9th service tomorrow — say, a "Payslip PDF Export" service — walk me through it.**
Scaffold a new Laravel app under `backend/` (there's already a `_templates/` folder with the boilerplate: `SnapshotSyncService`, client classes, replica migration patterns). Give it its own `.env`, its own database, its own port. Decide what data it needs to READ from others (probably employees + timesheets, via snapshot sync) and whether anything needs to call it back (probably not). Add its routes, wire the frontend's Vite proxy to send `/api/payslips/*` to its port. Write its tests. That's the exact recipe already proven 8 times over.

**Q38. Could a race condition happen in your snapshot sync?**
Potentially — if two sync runs overlapped (e.g. a slow sync still running when the next scheduled one starts), you could get a partially-refreshed replica table momentarily showing inconsistent data. We didn't specifically build overlap-prevention (like a lock file or "already running" check) into the sync command — that's a legitimate improvement we'd point to if asked "what would you add with more time."

**Q39. Why does a service ask `core` over HTTP on every request instead of caching the identity check?**
It used to — and we measured the cost: every authenticated request to every service waited on a round-trip to `core`, which was the biggest multiplier on page-load time. We fixed it: each service now keeps the result of `core`'s `/api/auth/me` in a short-lived cache (15 seconds, keyed by a hash of the token, successful lookups only), so a page that fires six API calls asks `core` once instead of six times. The honest trade-off: a revoked token or a changed role is honoured by the other services up to 15 seconds late, and if `core` is down the system still stops once the cache expires (Q28). For a real deployment we'd tune the lifetime and add explicit cache invalidation on logout.

**Q40. If you rebuilt this from scratch knowing what you know now, what would you do differently?**
Honest answers that show maturity: (1) design the internal API contracts and replica strategy BEFORE splitting, rather than discovering what each service needs mid-migration; (2) add the cross-service auth cache from day one (we added a 15-second one later, after measuring the slowdown, Q39); (3) use per-service tokens instead of one shared `SERVICE_TOKEN`; (4) add automated tests that specifically check cross-service flows (e.g. "does an approved leave in `timeoff` correctly show as not-absent in `attendance`"), not just each service's own isolated tests.

**Q41. What's missing for this to run safely in production with real users, not a demo?**
Good checklist to have ready: **containerization is now partly done** — the whole system runs under Docker Compose (one container per service), but only as a single-machine development/demo setup, so the remaining gap is production-grade hosting (PHP-FPM + nginx, images in a registry, a CI/CD pipeline); each service running multiple instances behind a load balancer (especially `core`, per Q28); centralized logging/monitoring across all 8 services instead of 8 separate log files; a real secrets manager instead of `.env` files; HTTPS everywhere; rate limiting on the internal APIs, not just the public login endpoints; and probably a message queue (like RabbitMQ or Redis queues) for things like notifications instead of a synchronous HTTP call, so a slow `communications` service can't slow down the service that's trying to notify someone.

**Q42. What testing strategy do you have — do you test that the services work TOGETHER, or only individually?**
Each of the 8 services has its own offline automated test suite (196 tests total, all passing) that verifies that service in isolation. What we do NOT have is automated "contract" or integration tests that boot multiple real services together and verify a full cross-service flow end-to-end automatically — right now that's verified manually (which we did before this defense). That's a fair gap to admit if asked directly: "our unit/feature test coverage per service is solid; true end-to-end integration testing across services is currently manual."

**Q43. Why is the demo's admin password printed in plain text by your startup script?**
It's a known, deliberate shortcut for local development convenience only — printing the demo credential so teammates don't have to dig for it. In any real deployment this would be removed entirely; demo/seed credentials should never be printed or committed, and production would use properly generated, unique credentials per environment, never a shared example password.

**Q44. What would happen if two services tried to update the SAME underlying real-world fact at the same time — e.g. `intelligence` approving overtime while HR is also approving the same request manually in `timeoff` directly?**
Honestly: whichever write lands last in `timeoff`'s database wins, silently. We checked this while preparing for the defense — `timeoff`'s user-facing endpoint DOES guard against double-processing (it checks the request is still "Pending" before letting an employee cancel it), but the **internal** endpoint that `intelligence` calls to apply an AI-queue approval does not currently re-check that the request is still "Pending" before overwriting its status. That's a real, honest gap — a textbook double-processing race condition — and the right fix is adding the same "must still be Pending" guard to the internal endpoint that already exists on the user-facing one. If a panelist finds this themselves, the strong answer is: *"Good catch — that's a real gap in our internal API validation, and the fix is a one-line status check, same pattern we already use elsewhere in the same controller."* Owning a real bug you found yourself lands better than pretending everything is airtight.

**Q45. Last one — sell me on why this architecture was worth the extra complexity for a school project.**
"It's not just extra complexity for its own sake — it's a physical, running demonstration of a pattern every large tech company actually uses in production, and we can prove properties a monolith can't: kill any one non-critical service and the rest keeps working, each domain has its own isolated, independently-testable codebase, and a team of 8 developers could work on 8 services in parallel without stepping on each other's code. We didn't just draw this on a diagram — we migrated a real, working system into it, verified every step with automated tests, and can demonstrate the failure-isolation live."

---

## How to use this the night before

---

## Bonus — the newest features (finished just before the defense, be ready for these)

**Q46. What does the "This Week" timesheet popup show?**
It's a live, un-submitted view of the current work week: a KPI row (Regular, Overtime, Break, and Total hours) plus a per-day table (Date, Day, Status badge, Clock In, Clock Out, Break, Hours), with today's row highlighted and a week-total footer. It's computed on the spot from the same attendance records the weekly timesheet is generated from, so it's labeled "Auto" until the employee actually submits it.

**Q47. What is "Timesheet History", and who can use it?**
It's the list under the My Timesheet summary card — every saved week with its date range, status badge, Regular/Overtime/Total hours, and submitted date. An employee clicks any row to reopen that week's full per-day breakdown, so past weeks are never lost or hidden after submission.

**Q48. You used to reject early clock-outs. What changed?**
The kiosk used to block any clock-out before the shift end ("please return to your post"). The rule now is: **no leaving without an explanation**, not **no leaving**. The terminal detects the early punch and requires a reason tap (Feeling Unwell, Family Emergency, Personal Emergency, Approved Leave, or Other) — Continue stays disabled until one is chosen, and the server independently refuses an early punch without a reason (`422 reason_required`), so it can't be skipped. It records the punch normally, stamps the attendance row `Early Leave`, and writes an immutable `early_clock_outs` snapshot with the reason, note, and `minutes_early`. Health/emergency reasons notify all admins immediately; approved-leave/other are silent. HR later classifies each one as Excused (Sick/Emergency/Early Leave) or **Unpaid** — unpaid early minutes are deducted from pay, excused are not. The employee can still edit their reason afterwards, but the punch HR judged never changes.

**Q49. Why not just let HR edit the punch instead?**
Because punches are the audit foundation of everything downstream — hours, overtime, timesheets, payroll. Rewriting the punch to "look normal" would silently falsify attendance history. An Early Leave record preserves the true punch *and* attaches an explanation. Classification (Excused/Unpaid) is a separate, reversible judgment, so pay decisions never require touching the punch itself.

**Q50. Is Docker part of your system? What exactly did it change?**
Yes — as an alternative way to run it. `docker compose up -d` starts 15 containers: one PostgreSQL server (8 databases), the 8 Laravel services, 5 scheduler containers (they run `snapshot:sync` every minute) and an nginx container that serves the built React app and routes `/api/*` to the right service. **No features or business rules changed** (only a few small bug fixes found along the way, see Q54) — Docker only changes how the system is built, started and isolated, so it now starts with one command and behaves the same on any machine.

**Q51. Is that "production deployment"? Do you have CI/CD, a domain or HTTPS?**
No, and we say so honestly. It is a development/demonstration setup on one machine. The API containers use PHP's built-in server (4 workers), there is no HTTPS or domain, no image registry and no CI/CD pipeline. For public hosting we would add a domain + HTTPS, PHP-FPM behind nginx, managed secrets, automated backups and a pipeline (the team is considering a VPS-based host such as Hostinger).

**Q52. Is the nginx container your API gateway?**
No. It routes by URL prefix (a reverse proxy, the same table as the Vite dev proxy) but does no authentication, rate limiting or request filtering. Every service still validates the token itself by asking `core`.

**Q53. Where are the passwords and secrets in the Docker setup? What happens to the data when you stop it?**
Secrets are in a git-ignored `.env` file, supplied to the containers as environment variables — not baked into images and not in the repository (only `.env.docker.example` is tracked). Data lives in a Docker volume, so `docker compose down` keeps it and `docker compose down -v` erases it.

**Q54. Did putting it in Docker find any problems?**
Yes, which is a good sign the test was worth doing: a missing import that would have crashed the Audit Logs page, invisible BOM characters in 7 services' bootstrap files, read-only cache folders copied from Windows, and a PostgreSQL start-up timing issue. All were fixed and re-tested (the full PHPUnit suite passed — it now has 196 tests; a from-scratch `down -v` + `up -d` produces a working system in about 80 seconds).

**Q55. How do you make sure an Employee can never do what a Workforce Admin can — and the reverse?**
On the **server**, not just in the menus. Every administrator route is behind the `admin` middleware, so an Employee token gets **403** (verified live against the running system for AI Decision Support, employees, audit logs, analytics, shift schedules and settings changes). Routes both roles can reach check ownership: an Employee can only read or file things under their own employee ID (`assertSelfOrAdmin`), and can only withdraw their own *pending* leave/overtime or submit their own *draft* timesheet. On the frontend, every admin page is wrapped admin-only and every "My …" page employee-only, but that is convenience — a role-boundary test in each service proves the server side (196 tests in total).

**Q56. Can an Employee approve their own leave by editing the request?**
Not any more, and we can say exactly why. While auditing role boundaries we found that the *create* endpoints saved whatever `status` the request contained, so a hand-made request with `status: "Approved"` would have been accepted. We wrote a failing test first, then fixed it: for an Employee the server now always saves **Pending** with no approver, and only an Administrator can decide it. This is a good example of testing finding a real defect.

**Q57. The kiosk has no login. Couldn't someone clock in a colleague with a script?**
Not without unlocking the device. Entering the kiosk PIN makes the server issue a signed token (valid 24 hours, voided the moment the PIN is changed) and every clock-in, directory, face-check and log call must send it; the PIN check itself is rate-limited to 10 attempts a minute, and failed attempts are recorded as security events by the server. Honest limits: someone who knows the PIN, or who is standing at the unlocked kiosk, can still use it, and the kiosk supports an employee-ID fallback; there is no face liveness check, and it is a local-network device, not internet-grade hardening.

**Q58. What exactly are the kiosk's clock-in rules?**
In order: (1) **no shift scheduled today → blocked**; (2) **shift already over → blocked**; (3) more than **15 minutes after the shift start → a "You Are Late" warning, but the employee can still "Clock In Anyway"**, recorded as **Late**, and the admins are notified; (4) before the start → "Clocking In Early" notice, can continue; (5) within the grace period — up to and including 15:00 after the start — recorded straight as **Present**, no popup. For clock-out: leaving before the shift end requires stating a **reason first** (recorded as Early Leave); at or after the end it just succeeds.

**Q59. Are those rules only on the kiosk screen? Couldn't someone skip them with a modified request?**
No — that's the point of the design. The `attendance` **server** enforces them: it takes the date and time from its own clock (in the kiosk's timezone), looks up the employee's scheduled shift itself, refuses no-shift and finished-shift punches (`422 no_shift` / `shift_over`), and computes **Present vs Late** itself — whatever status or time the terminal sends is ignored. The screen's popups only explain the rule to the employee first. Automated tests (`KioskGuardrailTest`) prove each rule, including the exact boundary: 08:15:00 is Present, 08:15:01 is Late.

**Q60. A bug: an employee with no shift clocked in at 9:30 pm and was told they were late. What happened?**
A real regression that we found, fixed and locked in with tests — a good story to own. An earlier change put the "late" check *before* the "no shift" check and made the terminal fall back to a default 08:00 start when nothing was scheduled, so at 9:30 pm it said "810 minutes late" and accepted the punch. The server also trusted whatever the terminal sent. The fix was two-part: restore the correct order (no shift → shift over → late → early), and move every rule to the server so the screen can never be the only guard. The bad record and its alert were removed, and `KioskGuardrailTest` (11 tests) now covers exactly this case.

**Q61. What happens if someone tries to clock in as a colleague?**
The browser's face check fails, so the kiosk shows a red **"Identity Verification Failed"** warning explaining it's a security violation. The server logs a `face_mismatch` security event **and immediately sends every Workforce Admin a high-priority notification** ("Face Mismatch at Kiosk", linking to AI Decision Support). Three failed attempts lock the terminal for 60 seconds. Honest limit: there is no liveness detection, so a photo held up to the camera is not specifically detected.

**Q62. The system felt slow. What did you find and what did you change?**
We profiled it rather than guessing. Findings: every service call re-checked identity with `core`; face photos (~40 KB each) were being copied to five services every minute; replica pushes and alert notifications were sent one after another; some lists had no limit; and the local setup itself is slow (PHP's built-in single-request server, a OneDrive-synced folder, debug mode on). Changes: a 15-second identity cache, replicas carry only the face descriptor, concurrent pushes, one-query alert scan with a capped concurrent batch, newest-200 notification lists, an optional date window for attendance, short timeouts on non-critical calls, a 45-second frontend timeout, and background tabs stop polling. We also warm up the face model and dropped a redundant detection pass. Honest note: we cut the load in code, but the local single-threaded server is an environment limit — Docker (4 workers per service) avoids it.

**Q63. How does the face-scan animation work, and why is it smooth even while the browser is busy?**
The camera view shows a face-shaped oval with a light band sweeping over it and landmark dots pulsing. The face model (face-api.js) runs on the browser's main thread, which normally freezes animations while it computes. We built the animation only from CSS `transform` and `opacity`, which the browser hands to the graphics thread, so it keeps moving. We also let the screen paint one frame before the heavy calculation starts.

**Q64. What are the honest limitations of the new attendance rules?**
(1) Shifts that run past midnight aren't fully supported: the terminal and server look at *today's* schedule, so a clock-out after midnight can't find its clock-in — this was already true before. (2) An approved overtime request on a day with **no shift** doesn't count as a shift, so it can't be used to clock in. (3) The 15-second identity cache means a revoked login can work briefly in other services. (4) There is still no liveness check on the face scan. Each is named here on purpose — owning known limits lands better than pretending the system is airtight.

---

## How to use this the night before

1. Cover the answer column, read the question, say your answer OUT LOUD.
2. If you freeze on a Hard/Extremely Hard one — that's fine, that's literally why this tier exists. Re-read it once, move on, come back to it tomorrow morning.
3. Have a teammate quiz you out of order — questions land differently when you don't know which one's coming.
4. If the panel asks something not on this list: it's okay to say *"that's a great question, let me think about that for a second"* — pausing to think is normal and better than guessing wrong confidently.
