# Workforce Management Project Framework

> ## 10-second summary (say this if the panel asks "what is your project?")
> We built **AI-Enhanced Workforce Management** for **Archon Nell Inc.**: a web app with
> **Facial Recognition clock-in**, **Shift Scheduling**, **Leave Management**, **Weekly Timesheets**,
> **Workforce Analytics**, and an **AI Decision Support** module. Built with **React + Laravel + PostgreSQL**.
> Users: Workforce Admin, Employees, and an entrance Clock-In kiosk device. Team of 5 under client **Nardz Olarte**.

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
-AI Decision Support (rules decide the findings and score; the AI API only words them, with a rule-based fallback)
-Automated Logic/Rule-Based Shift Scheduling (rules build a draft, HR reviews and approves it; the Standard Shift only)
-Attendance Corrections (worked past shift / kiosk failure, with photo proof; the admin makes the manual entry)
-Timesheet Generation (Weekly)
-Leave Management
-Workforce Analytical View
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
- "NARDZ OLARTE" (Name of our Client)
- Quality control, Quality assurance supervisor (Position of our client in thier workplace)

PostgreSQL Password:
The backend reads its database credentials from `backend/app/.env` under `DB_PASSWORD`. The real password is never committed to GitHub — the committed `.env.example` file carries a placeholder instead.

Architecture note:
This Workforce Management System is one subsystem of a larger E-Commerce Enterprise platform the team is building — it is itself one microservice within that larger system's architecture. Internally, it is a single Laravel backend application (one codebase, one database), not split into further microservices.