# Workforce Management Project Framework

> ## 10-second summary (say this if the panel asks "what is your project?")
> We built **AI-Enhanced Workforce Management** for **Archon Nell Inc.**: a web app with
> **Facial Recognition clock-in**, **Shift Scheduling**, **Leave Management**, **Weekly Timesheets**,
> **Workforce Analytics**, and an **AI Decision Support** module. Built with **React + Laravel + PostgreSQL**.
> Users: Workforce Admin, Employees, and an entrance Clock-In kiosk device. Team of 5 under client **Junar Love Olarte**.
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
-Employee ID + Facial Recognition-Based Clock In (shift-aware: Present within 15 min of the shift start, Late warning afterwards, reason required for early clock-out, admin alert on a face mismatch — all enforced by the server)
-Optional Two-Factor Sign-In (employee-toggled in My Profile; a six-digit emailed code after password, off by default, separate from the forgot-password OTP)
-AI Decision Support (rules decide the findings and score; the AI API only words them, with a rule-based fallback)
-Automated Logic/Rule-Based Shift Scheduling (rules build a draft, HR reviews and approves it; the Standard Shift only)
-Attendance Corrections (worked past shift / kiosk failure, with photo proof; the admin makes the manual entry)
-Timesheet Generation (Weekly)
-Leave Management
-Workforce Analytical View (one This Week/Month/Year filter driving 6 cards, each stating its own data source and formula; rankings are by department only, never by named employee)
-Report Generation

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
-Workforce Admin (role value `Administrator`): the single operator account that runs the whole company side
-Employees: self-service for their own work life
-Entrance Clocking-In (kiosk) Device: not a login — a locked-down device at the entrance employees use to clock in/out

Client's Company Information:

- "ARCHO NELL INCORPORATED" (Company Name)
- known in the Cement, Steel, Petrochemical and Construction industries as a reliable solutions provider. (Motto)
- "JUNAR LOVE OLARTE" (Name of our Client)
- Quality control, Quality assurance supervisor (Position of our client in thier workplace)

Deployment:
The system is live, not just local/Docker. Frontend (static site): `https://workforce-management-qty0.onrender.com`. Backend API (Docker web service, built from `render.yaml` + `docker/backend.Dockerfile`, Laravel 13 / PHP 8.4): `https://workforce-api-nm7v.onrender.com`, with its own free Render PostgreSQL database. Local dev (`start-all.ps1` or `docker compose up`) still works the same as always — Render is an additional, always-reachable public copy for panelists, built on push to `main`. Production email on Render is Brevo over port 2525 (Render's free plan blocks ports 25/465/587); local dev can still use Gmail SMTP or the `log` driver.

PostgreSQL Password:
The backend reads its database credentials from `backend/app/.env` under `DB_PASSWORD`. The real password is never committed to GitHub — the committed `.env.example` file carries a placeholder instead.

Architecture note:
This Workforce Management System is one subsystem of a larger E-Commerce Enterprise platform the team is building — it is itself one microservice within that larger system's architecture. Internally, it is a single Laravel backend application (one codebase, one database), not split into further microservices.