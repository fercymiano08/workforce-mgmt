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
| **Backend** | The part you DON'T see. It decides what's allowed, does the math, talks to the database. | Laravel (a tool for building backends) — **one** application, organized internally into 8 clear domains (Identity, Attendance, Scheduling, Time-off, Payroll, Communications, Configuration, Intelligence) | the `backend/app/` folder |
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

**Laravel** — a PHP tool (a "framework") for building backends. It comes with security, database handling, and routing (matching a URL like `/api/employees` to the right piece of code) already built in, so you don't build those from scratch. Your project has **one** Laravel app, organized internally into **8 domains** (business areas) so the code stays easy to navigate — Identity, Attendance, Scheduling, Time-off, Payroll, Communications, Configuration, and Intelligence.

**PostgreSQL** — a database program. It stores data as tables (think Excel sheets: rows and columns). It's reliable, free, and handles the kind of data this project has well. Your project runs **one** PostgreSQL database, `workforce_mgnt`, holding every table the app needs.

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
| **Seeder** | A script that fills empty tables with demo data — that's why your demo has 10 fake employees already in it. |
| **CRUD** | Create, Read, Update, Delete — the four things you can do to any piece of data. Almost every feature is just CRUD with extra rules on top. |
| **Port** | A number a program listens on so your computer knows which program a request is for. `:8000` is the backend, `:5173` is the frontend. Like an apartment unit number — same building (`127.0.0.1` = your own computer), different door. |

---

## 4. The scary word: "Monolithic" vs "Microservices"

This is THE question you will be asked. Here it is in the simplest possible terms.

### Monolithic — one app that does everything

**One app, one database.** All the related features — login, attendance, leave, payroll, notifications, AI — live inside the same running program and the same database.

> Analogy: **one kitchen** that cooks every dish on the menu — appetizers, mains, desserts, drinks — all in the same room, same staff, same fridge. A well-run kitchen still organizes itself internally (a grill station, a dessert station, a drinks station, each cook knowing their job) — but it's still one kitchen, one fridge, one head chef running the whole thing.

Pros: simple to build, simple to run (one thing to start), easy to keep data consistent (everything shares one fridge, so nothing goes out of sync).
Cons: if it grows huge with no internal organization, it can get tangled — a careless change in one area risks breaking another. And the whole app has to be deployed and scaled as one unit, even if only one part of it is under heavy load.

### Microservices — many small, independently-run apps

**Many small, independent apps, each responsible for ONE thing, each with its OWN database, each deployed and scaled on its own.**

> Analogy: **separate food stalls in a food court.** The drinks stall doesn't share a fridge with the dessert stall. If the dessert stall's fridge breaks, you can STILL buy drinks. Each stall has its own staff, its own storage, its own rules — but customers can order from any stall, and they all sit under one roof.

Pros: if one service crashes, the others keep working. Each piece can be built, tested, released, and scaled independently. This is how companies like Netflix, Amazon, or Shopee build software at massive scale.
Cons: more moving parts to run and monitor, and the services have to talk to each other over the network instead of just looking things up directly — which adds real complexity: separate databases, network calls in the middle of a single feature, and background jobs just to keep copies of the same data in sync.

### So which one is THIS project?

Here's the honest, slightly more nuanced answer — and it's actually a good story to tell the panel, because it shows you understand WHEN to use which pattern, not just "microservices = better."

**The Workforce Management System (this project) is, internally, ONE Laravel monolith with ONE PostgreSQL database (`workforce_mgnt`).** Login, attendance, leave, payroll, notifications, settings, and the AI assistant all run inside the same application and the same database.

Inside that one app, the code IS organized into 8 clear domains — folders/namespaces that group each business area's routes, controllers, and models together:

| Domain | Its job |
|--------|---------|
| Identity | logging people in, the employee directory |
| Attendance | daily clock-ins/outs, the kiosk |
| Scheduling | shift templates, who works when |
| Time-off | leave requests, overtime requests |
| Payroll | weekly timesheets |
| Communications | notifications (the bell icon) |
| Configuration | app settings, kiosk PIN/config |
| Intelligence | analytics charts + the AI assistant |

That's "organized by domain" — a good coding practice **inside one app** — and it's genuinely a different thing from "split into separately deployed services," which is what "microservices" actually means. Don't let anyone conflate the two: folders are not services.

**But here's the bigger picture, if a panelist digs deeper:** the Workforce Management System you're demoing is actually just **one microservice** inside a larger platform the team is also building — an **E-Commerce Enterprise system** — which genuinely IS split into several independently-deployed services at that larger scale (this HR/workforce system is one of them, alongside things like the storefront, orders, and payments). So the honest, complete sentence is:

> "At the scale of the whole company platform we're building, we DO use microservices — the Workforce Management System is one independently-deployed service among several. But inside this one service, we deliberately kept it as a single, well-organized monolith instead of splitting it further into 8 tiny services, because at this size that split would add real cost — separate databases, network calls in the middle of a single feature, background jobs just to keep copies of the same data in sync — without a real benefit. Nothing inside this system needs to scale independently or ship on its own release schedule. You only pay the microservices complexity tax when you actually need what it buys you."

**One sentence to say out loud if asked "so is this a monolith or microservices?":**
> "Both, at different zoom levels: it's one microservice inside our larger E-Commerce Enterprise platform, and internally that one service is a single Laravel monolith, cleanly organized into 8 domains rather than split into 8 separately deployed services — because splitting it further wouldn't have bought us anything at this size."

---

## 5. How do the 8 domains share data with each other, then?

Good news: in a single application this is the *simplest* part to explain — and it's much easier than the fancy answer it used to be.

**Problem (in the old design):** the attendance feature needed to know an employee's name and department to show on screen, but in the old split design the `employees` table belonged to a different app. Data had to be copied around (snapshot sync) or fetched over the network between apps (internal API calls).

**Today:** there's only **one app and one database**. The attendance feature just reads the `Employee` model directly — same process, same database, a normal query. There is nothing to copy, no network call, no secret token, and nothing to keep in sync. When HR approves a leave from the AI Decision Support page, the backend updates the real leave request in the same database it already has open. Same data, one copy, always live.

**One sentence to say out loud if asked "how do the domains share data?":**
> "They don't need to 'talk' at all — they're folders inside one Laravel application with one shared database, so one domain simply queries or writes the same Eloquent models directly. There's no network traffic between domains and no duplicated data. During development we briefly split this system into 8 separate apps and databases, which required copying tables and calling between apps — then we consolidated it back into one app and one database before the defense, because at this size the split only added cost."

---

## 6. Walk through ONE real action, start to finish

Let's trace what happens when an employee clocks in at the kiosk. Read this like a story.

1. Employee taps their ID on the kiosk screen. That screen is just the **frontend**, running in a browser.
2. The kiosk's camera takes a photo, and — inside the browser itself, no internet needed — compares it to the employee's saved face data. This face-matching step happens on the DEVICE, not on a server.
3. If it matches, the frontend sends a request: `POST /api/kiosk/attendance` — basically saying "clock this person in now."
4. That request has the URL prefix `/api/kiosk/...`, so the frontend's traffic-router (a setting called the Vite proxy) sends it to the **one backend** on port `8000` — the whole API lives at a single address now, not one address per feature.
5. Inside the backend, the request lands in the **Attendance domain** (`routes/services/attendance.php`): it checks the rules itself — is there a shift scheduled today? Is the shift already over? Are they already clocked in? The kiosk screen also shows friendly warning popups first (for example "You Are Late"), but the **server is the one that really enforces the rules** — so nobody can cheat by editing the screen.
6. It uses **its own clock** to decide the time and whether the person is **Present** or **Late**, using a grace period (15 minutes by default) that the Workforce Admin can tune from **Settings → Time Manager** — it's no longer a hardcoded number. If they're late, it still lets them clock in, but the admins get a notification. If there's no shift today, it says no. Then it writes one new row into the `attendance` table in the single `workforce_mgnt` database — the actual attendance record.
7. It sends back a JSON answer: "success, clocked in at 8:03 AM."
8. The kiosk screen shows a green success message (or an amber one if the person was late).

> **If someone tries to clock in as another person:** their face won't match, the kiosk shows a red warning, and the system sends an alert to the Workforce Admin.

Notice: only the **Attendance domain** was involved in the core action. The other domains (payroll, time-off, scheduling…) didn't need to do anything — but they're not separate apps that had to be left out; they're just folders in the same app that weren't needed for this request.

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

1. **Don't panic-narrate.** Say: *"Let me check the backend logs"* — a completely normal, professional thing to say. It shows you know how to debug, not that you're lost.
2a. **Running with Docker instead?** Use `docker compose ps` (which container is not healthy?) and `docker compose logs -f app` (the backend's live log; also `scheduler` and `frontend` for those). Then `docker compose up -d` again. See `activator-deactivator.md` → *Way 2*.
2. Run `.\start-all.ps1` again — it tells you whether the backend is `UP` or `DOWN`. If it's `DOWN`, that's your answer.
3. Check the log file: `logs\backend.err.log`. The error is usually one readable sentence near the bottom.
4. If a whole PAGE won't load: it's almost always because the backend isn't running. Re-run `start-all.ps1` and wait for its health check to show `UP`.
5. If it's a small glitch (page looks stuck): **refresh the browser tab.** This fixes more "bugs" than anything else, and there's no shame in it.
6. If you truly can't fix it live: say *"let me restart the backend — it's a single process, so one restart covers the whole system."* Run `.\stop-all.ps1` then `.\start-all.ps1`, open the page fresh, and continue.

---

## 9. What to actually study, in order, tonight

1. Re-read Section 4 (monolith vs microservices) until you can say it without looking.
2. Re-read Section 5 (how the 8 domains share data) until you can say it without looking — they don't call each other, they read/write the same models in one database.
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

Our system is **not one program**. To run it on a computer you need: PHP 8.4 with the right extensions, Composer, Node 22, PostgreSQL 18, **one** database created, **one** `.env` file (the scripts) or `.env` + `.env.docker.example` (Docker) with matching secrets, and **three** programs started in the right order: the backend, its background scheduler, and the frontend. On *your* laptop that's all done. On your teammate's laptop, or the panel's, or a server — you'd have to do every step again by hand, and something would be slightly different. That's the famous excuse: *"but it works on my laptop!"*

**Docker's answer:** pack each part of the system, *together with everything it needs*, into a sealed box. That box behaves **identically on any computer that has Docker**.

> **Analogy — a food-truck park.** Without Docker, opening the system on a new computer is like building 4 kitchens from scratch, finding a different stove in each. With Docker, you have 4 **sealed food trucks** — each already has its own stove, ingredients and staff. You just park them and turn the key.

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

- **Containers talk to each other by name.** Inside Docker, the frontend's nginx reaches the backend at `http://app:8000` — **`app`, not `127.0.0.1`**. Docker gives every container a name that works like a private intercom. (That is why `docker-compose.yml` and `docker/nginx.conf` use `http://app:8000`, while the normal scripts use `http://127.0.0.1:8000`.)
- **Health checks.** Each container is asked "are you alive?" every 10 seconds. `depends_on` makes a container **wait** until the ones it needs say "yes" (e.g. nothing starts until PostgreSQL is ready).

### 10.3 What is actually inside OUR Docker setup — 4 containers

`docker compose up` starts **4 containers**:

| # | Container | What it is | Port on your laptop |
|---|-----------|-----------|---------------------|
| 1 | `postgres` | **One** PostgreSQL 18 server holding **one** database, `workforce_mgnt` (created automatically the first time). Data lives in the `pgdata` volume | `5433` (so it never clashes with a normal PostgreSQL on 5432) |
| 2 | `app` | **The one Laravel backend** — every domain (identity, attendance, scheduling, time-off, payroll, communications, configuration, intelligence) lives in this single app. Built from `docker/backend.Dockerfile` | `8000` |
| 3 | `scheduler` | **The same backend image**, but instead of serving web requests it runs `php artisan schedule:work` — the background jobs (certificate expiry, absence marking, automatic scheduling, timesheet auto-submit and reminders). In the normal scripts this is a hidden PowerShell window | none |
| 4 | `frontend` | The React app **plus nginx**. nginx serves the screens and routes every `/api/...` request to the one backend (`http://app:8000`) — the Docker version of the Vite proxy. A *router*, **not** an API gateway | `5173` |

4 = 1 + 1 + 1 + 1.

### 10.4 Every Docker file in this project — what it does

| File | Purpose in one line |
|------|--------------------|
| `docker-compose.yml` | The conductor's sheet: defines all 4 containers, their ports, secrets, start order and health checks. Uses a shared block (`x-backend`) so the settings for the backend and its scheduler are written once |
| `.env` *(git-ignored, you create it)* | The **secrets**: database password, the app key, optional Gemini key. Template: `.env.docker.example`. Never committed to GitHub |
| `.env.docker.example` | A blank template of `.env` — copy it to `.env` and fill it in |
| `.dockerignore` | A "do **not** pack this" list: `vendor`, `node_modules`, `.env`, logs, the docs, `.git`… keeps images small and keeps secrets out of them |
| `docker/backend.Dockerfile` | The recipe for the **one backend image**: start from PHP 8.4 → add PHP extensions + Composer → `composer install` → copy the `backend/app` code → set permissions → start the web server |
| `docker/backend-entrypoint.sh` | A tiny script that runs **before** the backend container starts: if `RUN_MIGRATIONS=true` it creates/updates the database tables (`php artisan migrate`), and `RUN_SEED=true` adds the fixed admin, departments, roles and demo data (`db:seed`) |
| `docker/frontend.Dockerfile` | A **two-stage** recipe: stage 1 uses Node to *build* the React app into plain files; stage 2 throws Node away and puts just those files into a small nginx image |
| `docker/nginx.conf` | nginx's routing table: every `/api/*` request → the one backend (`http://app:8000`); every other URL → the React app. Also allows uploads up to 20 MB (face photos, leave proof) |

### 10.5 What happens when you type `docker compose up -d --build`

1. Docker reads `.env` for the secrets.
2. **Build** (slow the first time, 10+ minutes; fast afterwards because Docker remembers finished steps): the backend recipe once and the frontend recipe once.
3. **`postgres` starts.** The first time only, it creates the `workforce_mgnt` database. Everyone else waits until its health check passes.
4. **`app` starts** after `postgres`. Its entrypoint runs the migrations (`php artisan migrate`) and seeds the admin, departments, roles and demo data — one command, one database.
5. **`scheduler` starts** after `app` is healthy and runs the background jobs.
6. **`frontend` starts last** (it waits for the backend).
7. You open **http://localhost:5173**. Same app, same login.

### 10.6 The two ways to run the system (and why both exist)

| | **Scripts** (`start-all.ps1`) | **Docker** (`docker compose`) |
|---|---|---|
| Runs | PHP and Vite **directly on your laptop** | Everything **inside containers** |
| Needs installed | PHP, Composer, Node, PostgreSQL | **Only Docker Desktop** |
| Your code | **Live** — edit a file, it changes immediately | A **copy baked into the image** (see 10.7) |
| Database | Your local PostgreSQL (`5432`) | A separate one **inside Docker** (`5433`) |
| Web server | PHP's built-in server, **one request at a time** | PHP's built-in server with **4 workers**, so requests overlap |
| Best for | Daily development and debugging | Demoing on **any** computer, a clean start, showing the system is deployable |

Both use the **same ports (8000, 5173)** — so run **only one at a time**. And their **data is separate**: an employee added in Scripts mode does **not** exist in Docker mode.

### 10.7 The one rule that trips everyone up: Docker keeps a COPY of your code

When an image is built, your code is **copied into it**. Change a file afterwards and the running container **does not notice**. After changing code (or pulling new commits) you must rebuild:

```
docker compose up -d --build
```

The first build is slow; rebuilds are quick because unchanged steps are reused. (Scripts mode has no such rule — it reads your files live.) So if a fix "isn't showing up" in Docker, the answer is almost always: **rebuild**.

### 10.8 What Docker changed — and what it did not

- **Did NOT change:** any feature, screen or business rule. Same code, same behavior.
- **Changed:** *how it is built, started and isolated.* One command starts everything; it behaves the same on any machine. (The backend used to be split into 8 separate apps and databases; it is now one app and one database — that consolidation happened before Docker was set up.)
- **Bonus:** the backend runs with several workers instead of one, so it feels faster than the scripts on a slow laptop. This is also why the **database itself** now refuses duplicate attendance/shift rows — with several workers, two simultaneous requests could otherwise both slip past an application check.

### 10.9 Everyday commands (run in a terminal at the project folder, Docker Desktop open)

| Command | What it does |
|---------|--------------|
| `docker compose up -d --build` | Build (if needed) and start everything in the background. **First time, or after code changes** |
| `docker compose up -d` | Start everything (no rebuild) |
| `docker compose ps` | Show every container and whether it is `healthy` |
| `docker compose logs -f app` | Live log of the backend (replace `app` with `scheduler` or `frontend`) — the first place to look when something breaks |
| `docker compose restart app` | Restart just the backend container |
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

> "Docker packages each part of our system — the database, the one Laravel backend, its background scheduler and the frontend — into sealed containers that behave the same on any computer. One command, `docker compose up -d --build`, starts all 4 containers in the right order, creates the single `workforce_mgnt` database, runs the backend's migrations, and seeds the admin and demo data. It doesn't change what the system does; it changes how it's built and started, so we can demo it on any machine without installing PHP, Node or PostgreSQL first. It's a development setup, not production hosting."
