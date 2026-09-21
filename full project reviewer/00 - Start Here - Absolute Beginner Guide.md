# Start Here — The Absolute Beginner Guide

> Written for: **you**, the team leader, the night before you have to sound like you understand a system an AI helped build.
> Assumption: you have never written code, never heard "Laravel", and the word "microservices" makes your stomach drop.
> Goal: by the end of this file, you can explain this project in your own words, badly-but-correctly, without freezing.

You are not an idiot for not knowing this yet. Nobody is born knowing what a "backend" is. The panel does not expect you to be a senior engineer — they expect you to understand **what your own team built and why**. That is 100% learnable in one evening. Let's go slowly.

---

## 1. The three things every app like this is made of

Every website/app you've ever used — Facebook, a school portal, a food delivery app — is built from the same three pieces. Yours is no different.

| Piece | Plain definition | In YOUR project, it's called | Where it lives |
|-------|-------------------|-------------------------------|-----------------|
| **Frontend** | The part you SEE and CLICK. Buttons, forms, tables, colors. | React (a tool for building screens) | the `frontend/` folder |
| **Backend** | The part you DON'T see. It decides what's allowed, does the math, talks to the database. | Laravel (a tool for building backends), split into **8 small backends** now instead of 1 | the `backend/` folder (8 subfolders, one per service) |
| **Database** | Where information is permanently saved — every employee, every clock-in, every leave request. | PostgreSQL | not a folder — it's a separate program running on the computer, holding the actual rows of data |

**The one sentence that explains 90% of this project:**
> You click a button (frontend) → it sends a message asking for something or telling something to happen (a "request") → a backend receives that message, decides if it's allowed, does the work, and saves/reads the database → the backend sends an answer back → the frontend shows it on your screen.

That loop — click → request → backend does the work → database → answer → screen updates — happens on literally every single page of this app, every time. Once you get that loop, you understand the whole system's skeleton.

### A restaurant, because it never fails to click

- **Frontend** = the **waiter and the menu**. Shows you options, takes your order, brings your food. Has zero idea how the food is cooked.
- **Backend** = the **kitchen and the manager**. Decides if your order is even possible ("sorry, we're out of that"), does the actual cooking (the real work/logic), follows the restaurant's rules.
- **Database** = the **walk-in fridge / storage room**. Every ingredient (every piece of data) lives here. The kitchen is the only one allowed to go in and grab things — the waiter never does.

If someone asks you "so what does the frontend actually do?" — say: *"It draws what you see and sends requests. It never touches the database directly. It's not allowed to and it's not able to."*

---

## 2. The three technologies, in one paragraph each

You don't need to know how to write these. You need to know what they're FOR, so you can say a correct sentence about each.

**React** — a JavaScript tool for building the screens you click on. It's popular because it's fast and breaks the interface into reusable pieces ("components" — a button component, a table component, etc.) instead of rebuilding the whole page every time something changes.

**Laravel** — a PHP tool (a "framework") for building backends. It comes with security, database handling, and routing (matching a URL like `/api/employees` to the right piece of code) already built in, so you don't build those from scratch. Your project doesn't have ONE Laravel app anymore — it has **8**, one per business area.

**PostgreSQL** — a database program. It stores data as tables (think Excel sheets: rows and columns). It's reliable, free, and handles the kind of data this project has well. Your project now runs **8 separate PostgreSQL databases** instead of 1 — more on why below.

---

## 3. Tiny glossary — the words that will be said TO you tomorrow

Read this twice. These are the words a panelist drops into a question assuming you know them.

| Word | What it actually means |
|------|--------------------------|
| **API** | "Application Programming Interface" — sounds scary, means: a list of URLs the frontend is allowed to call to ask the backend for something. Example: `/api/employees` = "give me the employee list." |
| **Endpoint** | One specific URL in the API. `/api/attendance/employee/EMP20260001` is one endpoint. |
| **Request** | One message sent from the frontend to a backend, e.g. "log me in" or "give me today's attendance." |
| **JSON** | The text format both sides use to talk. Looks like `{"name": "Fercy", "status": "Present"}`. Not code — just a structured way to write data as text. |
| **Token** | A digital ID badge. After you log in, the backend gives your browser a token. Every request after that carries the token so the backend knows who's asking. |
| **Middleware** | A bouncer that checks your token/role BEFORE your request reaches the real code. "Are you logged in? Are you allowed here?" |
| **Controller** | The specific piece of backend code that handles one endpoint — reads the request, decides what to do, talks to the database, sends back JSON. |
| **Model** | Code that represents one database table. The `Employee` model = the `employees` table. Lets the backend read/write that table without writing raw SQL by hand everywhere. |
| **Migration** | A "recipe" file that builds or changes a database table's structure. Run once, it creates the table. |
| **Seeder** | A script that fills empty tables with demo data — that's why your demo has 12 fake employees already in it. |
| **CRUD** | Create, Read, Update, Delete — the four things you can do to any piece of data. Almost every feature is just CRUD with extra rules on top. |
| **Port** | A number a program listens on so your computer knows which program a request is for. `:8000` is `core`, `:5173` is the frontend, etc. Like an apartment unit number — same building (`127.0.0.1` = your own computer), different door. |

---

## 4. The scary word: "Monolithic" vs "Microservices"

This is THE question you will be asked. Here it is in the simplest possible terms.

### Monolithic (what this project WAS, a few days ago)

**One giant app that does everything.** One Laravel backend, one database. Login, attendance, leave, payroll, notifications, AI — all living inside the same app, the same folder, the same database.

> Analogy: **one big kitchen** that cooks every dish on the menu — appetizers, mains, desserts, drinks — all in the same room, same staff, same fridge.

Pros: simple to build, simple to run (one thing to start).
Cons: everything is tangled together. If the kitchen catches fire, the WHOLE restaurant stops — appetizers, drinks, everything. One bug in the "attendance" code could, in theory, take down "login" too, because they're the same running program.

### Microservices (what this project IS now)

**Many small, independent apps, each responsible for ONE thing, each with its OWN database.** Your project has exactly 8:

| Small app | Its ONE job |
|-----------|-------------|
| `core` | logging people in, the employee directory |
| `intelligence` | analytics charts + the AI assistant |
| `attendance` | daily clock-ins/outs, the kiosk |
| `scheduling` | shift templates, who works when |
| `timeoff` | leave requests, overtime requests |
| `payroll` | weekly timesheets |
| `communications` | notifications (the bell icon) |
| `configuration` | app settings, kiosk PIN/config |

> Analogy: **8 separate food stalls in a food court.** The drinks stall doesn't share a fridge with the dessert stall. If the dessert stall's fridge breaks, you can STILL buy drinks. Each stall has its own staff, its own storage, its own rules — but customers (the frontend) can order from any stall, and they all sit under one roof.

Pros: if one service crashes, the others keep working (you can literally demo this — kill the `intelligence` service and show that attendance/leave/payroll still work fine). Each piece can be built, tested, and fixed independently. This is how real companies (Netflix, Amazon, Shopee) build software at scale — it's an industry-standard pattern, not something invented for a school project.
Cons: more moving parts to run (8 things instead of 1), and the 8 services have to talk to each other over the network instead of just looking things up directly, which adds complexity.

### Why you did this migration (the honest, sayable reason)

> "Our department/adviser required this project to be built in microservices format. We started as a monolith because it's the faster way to prove the idea works first — get all the features correct in one place. Once the features worked, we split it into 8 independent services, one at a time, testing each one before moving to the next, instead of rewriting everything in one risky leap. That's a real, recognized migration pattern called the 'Strangler Fig' pattern — you strangle the monolith gradually instead of replacing it all at once."

### The numbers, if someone asks "how do you know it's REALLY split?"

- **Before:** 1 backend app, 1 database, 101 backend code files (~10,700 lines).
- **Now:** 8 backend apps, 8 databases, 693 backend code files (~49,800 lines) — each of the 8 has its own tests, its own settings, its own database connection.
- **Proof it's real, not just folders:** each service runs on its own port (8000, 8001, 8003–8008) and its own database. You can shut down any ONE service and the other 7 keep working. That's the actual definition of a microservice — independent failure.

---

## 5. How do 8 separate apps talk to each other, then?

This is the part that sounds the most "advanced," but it's actually just two simple ideas.

**Problem:** the `attendance` service needs to know an employee's name and department to show on screen. But it doesn't own the `employees` table — `core` does. `attendance` can't just peek into `core`'s database; they're separate, locked databases now (like the food stalls not sharing fridges).

**Solution 1 — Snapshot Sync (for stuff that just needs to be READ, and can be a little bit old):**
Every so often, `attendance` asks `core` over the network, "send me your current employee list," and saves a **local copy** in its own database. It's not live, real-time data — it's a snapshot, refreshed periodically. That's fine for showing a name on a screen. Think of it like a food stall keeping a printed, updated-every-hour price list from the main office instead of calling the office every single time a customer asks "how much is this?"

**Solution 2 — Internal API calls (for stuff that must happen RIGHT NOW):**
When HR clicks "Approve" on a leave request from the AI Decision Support page, that action has to actually update the real leave request — a stale copy won't do. So the `intelligence` service sends a direct message over the network straight to the `timeoff` service saying "mark leave request #47 as approved," and `timeoff` — the actual owner of that data — does it for real. This is like the drinks stall calling the dessert stall directly: "hey, the customer at table 5 wants a dessert added to their order," instead of guessing.

**How do they trust each other?** Every one of these internal messages carries a secret shared password (called a `SERVICE_TOKEN`) that only the 8 services know, so a stranger on the network can't pretend to be one of your services and start approving leave requests.

**One sentence to say out loud if asked "how do the services communicate?":**
> "Two ways: for data they just need to read and display, each service keeps a small, periodically-refreshed local copy synced from the owning service — that's called snapshot sync. For anything that must happen immediately, like approving a leave request, the service calls the owning service's internal API directly over HTTP, authenticated with a shared secret token."

---

## 6. Walk through ONE real action, start to finish

Let's trace what happens when an employee clocks in at the kiosk. Read this like a story.

1. Employee taps their ID on the kiosk screen. That screen is just the **frontend**, running in a browser.
2. The kiosk's camera takes a photo, and — inside the browser itself, no internet needed — compares it to the employee's saved face data. This face-matching step happens on the DEVICE, not on a server.
3. If it matches, the frontend sends a request: `POST /api/kiosk/attendance` — basically saying "clock this person in now."
4. That request has the URL prefix `/api/kiosk/...`, so the frontend's traffic-router (a setting called the Vite proxy) sends it straight to the **`attendance` service** (port 8003) — not to any of the other 7.
5. Inside the `attendance` service: the service checks the rules itself — is there a shift scheduled today? Is the shift already over? Are they already clocked in? The kiosk screen also shows friendly warning popups first (for example "You Are Late"), but the **service is the one that really enforces the rules** — so nobody can cheat by editing the screen.
6. The service uses **its own clock** to decide the time and whether the person is **Present** (up to 15 minutes after the shift starts) or **Late** (after that). If they're late, it still lets them clock in, but the admins get a notification. If there's no shift today, it says no. Then it writes one new row into ITS OWN database (`workforce_attendance`) — the actual attendance record.
7. It sends back a JSON answer: "success, clocked in at 8:03 AM."
8. The kiosk screen shows a green success message (or an amber one if the person was late).

> **If someone tries to clock in as another person:** their face won't match, the kiosk shows a red warning, and the system sends an alert to the Workforce Admin.

Notice: only ONE of the 8 services was involved in the core action (`attendance`). The other 7 didn't need to do anything. That's the whole point of splitting them up.

---

## 7. "Is the AI feature actually accurate?"

Good question to be ready for — say this honestly, it's actually a strength if you explain it right:

- The AI (Google Gemini, when there's internet) is NEVER allowed to make up numbers. It only receives real data pulled from the database — attendance counts, pending leave requests, security events from the last 30 days — and its job is to **describe and prioritize** that real data in plain language, not invent facts.
- If there's no internet, or the AI service fails, the system automatically falls back to a **built-in rule engine** — plain PHP code with fixed thresholds ("if late count > 3, flag it") — so the feature never just breaks. This is called a fallback, and it's a deliberate safety design, not a bug.
- So "accurate" here means: the underlying facts (attendance numbers, pending requests) are always 100% accurate because they come straight from the database. The AI's *commentary* on those facts is generated language, which is why it's clearly labeled on-screen as "Powered by Gemini" vs "Offline / rule-based" — the system is honest about which brain answered.

**One sentence:** *"The AI never invents data — it only summarizes real numbers pulled from our database, and if it can't reach Google's AI, it automatically falls back to a rule-based system so the feature never silently fails during a demo."*

---

## 8. If something breaks DURING the presentation

This will make or break your confidence more than any Q&A. Memorize this section.

1. **Don't panic-narrate.** Say: *"Let me check the service logs"* — that's a completely normal, professional thing to say. It shows you know how to debug, not that you're lost.
2a. **Running with Docker instead?** Use `docker compose ps` (which container is not healthy?) and `docker compose logs core` (replace `core` with the service name). Then `docker compose up -d` again. See `activator-deactivator.md` → *Way 2*.
2. Run `.\start-all.ps1` again — it tells you exactly which of the 8 services is `UP` or `DOWN`. If one is `DOWN`, that's your answer.
3. Check the log file for that specific service: `logs\svc-<name>.err.log` (e.g. `logs\svc-attendance.err.log`). The error is usually one readable sentence near the bottom.
4. If a whole PAGE won't load: it's almost always because ONE of the 8 services isn't running. Re-run `start-all.ps1` and wait for its health check to show all 8 as `UP`.
5. If it's a small glitch (page looks stuck): **refresh the browser tab.** This fixes more "bugs" than anything else, and there's no shame in it.
6. If you truly can't fix it live: say *"this is a great chance to show you our architecture's biggest advantage — even with one service down, the rest of the system still works,"* and demo a different page. That single sentence turns a crash into a feature demonstration. It is TRUE, not a dodge.

---

## 9. What to actually study, in order, tonight

1. Re-read Section 4 (monolith vs microservices) until you can say it without looking.
2. Re-read Section 5 (how services talk) until you can explain snapshot sync vs internal API in your own words.
3. Open `Oral Defense Prep - Plain English Guide.md` — it has the full script, roles, and a 50-question rapid-fire quiz.
4. Open `Defense Q&A - Easy to Extremely Hard.md` (new file) and go through it top to bottom — stop and re-read this file's relevant section any time you get one wrong.
5. Open `activator-deactivator.md` and physically run `.\start-all.ps1` yourself at least once before tomorrow, so the first time you see it work isn't in front of the panel.
6. Skim `Database System Tutorial And Guideline.md` for the database side, and `System Workflow Guide.md` if you want the full, detailed reference (it's long — treat it as a dictionary, not something to memorize front to back).

> **New to Docker?** Read Section 10 below — it explains, from zero, what Docker is and what every Docker file in this project does.

**Last thing:** you don't need to know how to code to lead this defense. You need to know the STORY — what the system does, why it's shaped the way it is, and where to look when something needs explaining. That story is entirely inside this one file. Read it twice more tonight and you'll be fine.

---

## 10. Docker, from zero — what it is and why this project has it

You added Docker recently and never had to understand it. This section fixes that. No prior knowledge needed.

### 10.1 The problem Docker solves

Our system is **not one program**. To run it on a computer you need: PHP 8.4 with the right extensions, Composer, Node 22, PostgreSQL 18, **eight** databases created, **eight** `.env` files with matching secrets, and **nine** programs started in the right order. On *your* laptop that's all done. On your teammate's laptop, or the panel's, or a server — you'd have to do every step again by hand, and something would be slightly different. That's the famous excuse: *"but it works on my laptop!"*

**Docker's answer:** pack each part of the system, *together with everything it needs*, into a sealed box. That box behaves **identically on any computer that has Docker**.

> **Analogy — a food-truck park.** Without Docker, opening the system on a new computer is like building 15 kitchens from scratch, finding a different stove in each. With Docker, you have 15 **sealed food trucks** — each already has its own stove, ingredients and staff. You just park them and turn the key.

### 10.2 The six words you need (everything else is detail)

| Word | Plain meaning | Analogy |
|------|---------------|---------|
| **Image** | A frozen, ready-to-run package of one program plus everything it needs. Built once. | The **recipe with all ingredients pre-packed** |
| **Container** | An image that is **running right now** | The **dish being cooked** from that recipe |
| **Dockerfile** | The text file of steps that *builds* an image | The **written recipe** |
| **docker-compose.yml** | One file that describes **all** the containers, how they connect, what order they start in, and their secrets | The **conductor's sheet** for the whole orchestra |
| **Volume** | A storage place that lives **outside** the container, so data survives when the container is deleted | The **fridge** — the food truck can leave, the food stays |
| **Port mapping** (`5173:80`) | Door number on *your laptop* → door number *inside* the container | A **street address** forwarding to a room inside the building |

Two more ideas:

- **Containers talk to each other by name.** Inside Docker, the attendance service reaches the auth service at `http://core:8000` — **`core`, not `127.0.0.1`**. Docker gives every container a name that works like a private intercom. (That is why `docker-compose.yml` is full of `http://core:8000` while the normal scripts use `http://127.0.0.1:8000`.)
- **Health checks.** Each container is asked "are you alive?" every 10 seconds. `depends_on` makes a container **wait** until the ones it needs say "yes" (e.g. nothing starts until PostgreSQL is ready).

### 10.3 What is actually inside OUR Docker setup — 15 containers

`docker compose up` starts **15 containers**:

| # | Container(s) | What it is | Port on your laptop |
|---|--------------|-----------|---------------------|
| 1 | `postgres` | **One** PostgreSQL 18 server holding all **8 databases** (created automatically the first time). Data lives in the `pgdata` volume | `5433` (so it never clashes with a normal PostgreSQL on 5432) |
| 8 | `core`, `intelligence`, `attendance`, `scheduling`, `timeoff`, `payroll`, `communications`, `configuration` | The **8 Laravel microservices**. All eight are built from the **same** recipe (`backend.Dockerfile`), told which folder to use with `SERVICE=<name>` | `8000`, `8001`, `8003`–`8008` |
| 5 | `scheduler-attendance`, `-intelligence`, `-scheduling`, `-timeoff`, `-payroll` | The **same images**, but instead of serving web requests they run `php artisan schedule:work` — the background jobs (the once-a-minute data sync in all five; the attendance one also runs the hourly "sick certificate overdue" check and a once-a-minute re-count of recent days' hours; the payroll one also runs the hourly timesheet jobs: auto-submit at the Monday-noon deadline, and reminders). In the normal scripts these are the hidden PowerShell windows | none |
| 1 | `frontend` | The React app **plus nginx**. nginx serves the screens and routes each `/api/...` request to the right service (the Docker version of the Vite proxy — a *router*, **not** an API gateway) | `5173` |

15 = 1 + 8 + 5 + 1.

### 10.4 Every Docker file in this project — what it does

| File | Purpose in one line |
|------|--------------------|
| `docker-compose.yml` | The conductor's sheet: defines all 15 containers, their ports, secrets, start order and health checks. Uses a shared block (`x-backend`) so the settings common to all 8 services are written once |
| `.env` *(git-ignored, you create it)* | The **secrets**: database password, the shared service token, the app key, optional Gemini key. Template: `.env.docker.example`. Never committed to GitHub |
| `.env.docker.example` | A blank template of `.env` — copy it to `.env` and fill it in |
| `.dockerignore` | A "do **not** pack this" list: `vendor`, `node_modules`, `.env`, logs, the docs, `.git`… keeps images small and keeps secrets out of them |
| `docker/backend.Dockerfile` | The recipe for the **8 backend images**: start from PHP 8.4 → add PHP extensions + Composer → `composer install` → copy that service's code → set permissions → start the web server |
| `docker/backend-entrypoint.sh` | A tiny script that runs **before** each backend container starts: if `RUN_MIGRATIONS=true` it creates/updates that service's database tables (`php artisan migrate`), and for `core` it also adds the fixed admin, departments and roles (`db:seed`) |
| `docker/frontend.Dockerfile` | A **two-stage** recipe: stage 1 uses Node to *build* the React app into plain files; stage 2 throws Node away and puts just those files into a small nginx image |
| `docker/nginx.conf` | nginx's routing table: `/api/attendance` → the attendance container, `/api/leaves` → timeoff … everything else under `/api` → core; every other URL → the React app. Also allows uploads up to 20 MB (face photos, leave proof) |
| `docker/postgres-init/01-create-databases.sh` | Runs **once**, the very first time the database volume is created: makes the 8 empty databases |

### 10.5 What happens when you type `docker compose up -d --build`

1. Docker reads `.env` for the secrets.
2. **Build** (slow the first time, 10+ minutes; fast afterwards because Docker remembers finished steps): the backend recipe runs 8 times (once per service) and the frontend recipe once.
3. **`postgres` starts.** The first time only, it creates the 8 databases. Everyone else waits until its health check passes.
4. **`core` starts.** Its entrypoint runs the migrations and seeds the admin, departments and roles. Others wait until `core` is healthy — every service asks `core` "who is this user?".
5. The other 7 services start; each runs **its own** migrations on its own database.
6. The 5 schedulers start once their service is healthy.
7. `frontend` starts last (it waits for all 8 services).
8. You open **http://localhost:5173**. Same app, same login.

### 10.6 The two ways to run the system (and why both exist)

| | **Scripts** (`start-all.ps1`) | **Docker** (`docker compose`) |
|---|---|---|
| Runs | PHP and Vite **directly on your laptop** | Everything **inside containers** |
| Needs installed | PHP, Composer, Node, PostgreSQL | **Only Docker Desktop** |
| Your code | **Live** — edit a file, it changes immediately | A **copy baked into the image** (see 10.7) |
| Database | Your local PostgreSQL (`5432`) | A separate one **inside Docker** (`5433`) |
| Web server | PHP's built-in server, **one request at a time** | PHP's built-in server with **4 workers**, so requests overlap |
| Best for | Daily development and debugging | Demoing on **any** computer, a clean start, showing the system is deployable |

Both use the **same ports (8000–8008, 5173)** — so run **only one at a time**. And their **data is separate**: an employee added in Scripts mode does **not** exist in Docker mode.

### 10.7 The one rule that trips everyone up: Docker keeps a COPY of your code

When an image is built, your code is **copied into it**. Change a file afterwards and the running container **does not notice**. After changing code (or pulling new commits) you must rebuild:

```
docker compose up -d --build
```

The first build is slow; rebuilds are quick because unchanged steps are reused. (Scripts mode has no such rule — it reads your files live.) So if a fix "isn't showing up" in Docker, the answer is almost always: **rebuild**.

### 10.8 What Docker changed — and what it did not

- **Did NOT change:** any feature, screen or business rule. Same code, same behavior.
- **Changed:** *how it is built, started and isolated.* One command starts everything; it behaves the same on any machine; each part is walled off from the others (which mirrors the microservices idea).
- **Bonus:** 4 workers per service instead of 1, so it feels faster than the scripts on a slow laptop. This is also why the **database itself** now refuses duplicate attendance/shift rows — with several workers, two simultaneous requests could otherwise both slip past an application check.

### 10.9 Everyday commands (run in a terminal at the project folder, Docker Desktop open)

| Command | What it does |
|---------|--------------|
| `docker compose up -d --build` | Build (if needed) and start everything in the background. **First time, or after code changes** |
| `docker compose up -d` | Start everything (no rebuild) |
| `docker compose ps` | Show every container and whether it is `healthy` |
| `docker compose logs -f core` | Live log of one service (replace `core`) — the first place to look when something breaks |
| `docker compose restart core` | Restart just one service |
| `docker compose down` | Stop everything — **your data is kept** |
| `docker compose down -v` | Stop **and erase the database volume** — a brand-new empty system. Careful! |

### 10.10 When something goes wrong

- **"Cannot connect to the Docker daemon"** → Docker Desktop isn't open. Start it (whale icon in the tray) and wait until it says running.
- **"port is already allocated"** → the scripts version is still running. Run `.\stop-all.ps1` first.
- **A container says `unhealthy`** → `docker compose logs <name>` and read the last lines.
- **You changed code but nothing changed** → rebuild (10.7).
- **Want a completely fresh start** → `docker compose down -v` then `docker compose up -d --build`.

### 10.11 Honest limits (say these if asked)

Docker here is a **development / demonstration setup on one machine**, not production hosting: the containers use PHP's built-in server (not PHP-FPM), there is no HTTPS or domain, no image registry, no automatic deployment pipeline, and the database port is published on your laptop. Secrets live in a local `.env` file. For real hosting you'd add a domain + HTTPS, PHP-FPM behind nginx, a secrets manager, backups and a CI/CD pipeline.

### 10.12 The one-paragraph answer for the panel

> "Docker packages each part of our system — the database, the eight microservices, the background schedulers and the frontend — into sealed containers that behave the same on any computer. One command, `docker compose up -d --build`, starts all 15 containers in the right order, creates the eight databases, and runs each service's migrations. It doesn't change what the system does; it changes how it's built and started, so we can demo it on any machine without installing PHP, Node or PostgreSQL first. It's a development setup, not production hosting."
