# Workforce Management Project Framework

> ## 10-second summary (say this if the panel asks "what is your project?")
> We built **AI-Enhanced Workforce Management** for **Archon Nell Inc.**: a web app with
> **Facial Recognition clock-in**, **Shift Scheduling**, **Leave Management**, **Semi-Monthly Timesheets**,
> **Workforce Analytics** with a built-in ranked **Top Performer** view and a per-employee popup, plus **AI Decision Support** as its own tab. Built with **React + Laravel + PostgreSQL**.
> Users: HR Admin, Employees, and an entrance Clock-In kiosk device. Team of 5 under client **Junar Love Olarte**.
> Deployed live on Render — see Deployment below for the links — alongside the usual local/Docker setup.

---

Capstone Title:
"DESIGN AND DEVELOPMENT OF AN AI-ENHANCED WORKFORCE MANAGEMENT SYSTEM FOR E-COMMERCE ENTERPRISE: SHIFT SCHEDULING, LEAVE MANAGEMENT, AND WORKFORCE ANALYTICS TO IMPROVE WORKFORCE PRODUCTIVITY"

Focus Modules:
Time and Attendance 
Shift and Schedule
Leave Management
Timesheet Management
Workforce Analytics

Features:
-Employee ID + Facial Recognition-Based Clock In (shift-aware: Present within 15 min of the shift start, Late warning afterwards, reason required for early clock-out, admin alert on a face mismatch — all enforced by the server; hours worked on a holiday are auto-paid at the DOLE rate — 200% on a regular holiday, 130% on a special non-working one, 100%/no premium on a special working one)
-Optional Two-Factor Sign-In (employee-toggled in My Profile; a six-digit emailed code after password, off by default, separate from the forgot-password OTP)
-AI Decision Support, inside Workforce Analytics (rules decide the findings and score; the AI API only words them, with a rule-based fallback)
-Top Performer (every active employee ranked by attendance + punctuality, named and sortable, with a punctuality-based read per person - deliberately not called a performance evaluation)
-Bulk Shift Assignment (pick one or several employees, assign the Standard Shift to all of them at once; each is checked independently)
-Attendance Corrections (worked past shift / kiosk failure, with photo proof; the admin makes the manual entry)
-Timesheet Generation (Semi-Monthly periods, 1st–15th and 16th–end of month; the current period is a live "Ongoing Timesheet Record" recomputed from attendance, not a saved snapshot; hours split into regular/overtime/break plus separate regular- and special-holiday buckets, with late and undertime minutes tracked per day)
-Leave Management (10 configurable leave types incl. the PH statutory ones — Solo Parent, VAWC, Special Leave for Women, Service Incentive Leave — each with its own gender/tenure/balance/proof rules; approved leave draws from a per-employee leave balance ledger, not a static counter)
-Workforce Analytical View (one This Week/Month/Year filter driving the overview's charts, each stating its own data source and formula)
-Report Generation (13 report types across 5 categories — Attendance, Leave, Timesheet & Payroll, Shift, Workforce — filterable by employee/department/status, with a saved recent-reports history)
-Live HR Admin dashboard (a polling System Health %, an animated Database Health graph, quick-action tiles, a navigable attendance chart) and a closable side navigation, used the same way on desktop as on a phone

Techstack:
React (Mainframe)
Tailwind CSS (Design)   
JavaScript (Functionality)
Laravel (Backend)
RestAPI(API) 
PostgreSQL (Database)
Github(Repository)

Members:
Fercy B. Miano
Asniyah G. Malna
John Paul Balderama
Florita Romulo
Kyle Matthew Galande

Usertypes:
-HR Admin (role value `Administrator`): the single operator account that runs the whole company side
-Employees: self-service for their own work life
-Entrance Clocking-In (kiosk) Device: not a login — a locked-down device at the entrance employees use to clock in/out

Client's Company Information:

- "ARCHO NELL INCORPORATED" (Company Name)
- known in the Cement, Steel, Petrochemical and Construction industries as a reliable solutions provider. (Motto)
- "JUNAR LOVE OLARTE" (Name of our Client)
- Quality control, Quality assurance supervisor (Position of our client in thier workplace)

Deployment:
The system is live, not just local/Docker. Frontend (static site): `https://workforce-management-qty0.onrender.com`. Backend API (Docker web service, built from `render.yaml` + `docker/backend.Dockerfile`, Laravel 13 / PHP 8.4): `https://workforce-api-nm7v.onrender.com`, backed by an Aiven-hosted PostgreSQL database (migrated off Render's free Postgres, which self-deletes after 30 days). Local dev still runs its own separate local PostgreSQL — Aiven is only the deployed app's database. Local dev (`start-all.ps1` or `docker compose up`) still works the same as always — Render is an additional, always-reachable public copy for panelists, built on push to `main`. Production email on Render is Brevo over port 2525 (Render's free plan blocks ports 25/465/587); local dev can still use Gmail SMTP or the `log` driver.

PostgreSQL Password:
The backend reads its database credentials from `backend/app/.env` under `DB_PASSWORD`. The real password is never committed to GitHub — the committed `.env.example` file carries a placeholder instead.

Architecture note:
This Workforce Management System is one subsystem of a larger E-Commerce Enterprise platform the team is building — it is itself one microservice within that larger system's architecture. Internally, it is a single Laravel backend application (one codebase, one database), not split into further microservices.