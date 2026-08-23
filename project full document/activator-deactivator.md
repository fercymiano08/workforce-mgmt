# How To Activate and Deactivate The System

> Workforce Management System — for VS Code terminal

---

## Activating The System (2 Steps)

### Step 1 — Backend

In VS Code, open the terminal (menu: **Terminal → New Terminal**).
Paste this ENTIRE line, then press Enter:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\backend"; php -d max_execution_time=0 artisan serve --port=8000
```

You should see: `Server running on [http://127.0.0.1:8000]`

**LEAVE THIS TERMINAL OPEN.**

### Step 2 — Frontend

Open a SECOND terminal inside VS Code (click the **+** or the split icon at the top-right of the terminal area).
Paste this ENTIRE line, then press Enter:

```powershell
cd "C:\Users\FERCY\OneDrive\Desktop\Workforce MGNT\frontend"; npm run dev
```

You should see: `Local: http://localhost:5173/`

**LEAVE THIS TERMINAL OPEN.**

Then open your browser and go to: **http://localhost:5173**

---

## Deactivating The System

Press `Ctrl + C` in each of the two terminals.
(Or just close the two terminal tabs.)

---

## Rules That Make This Work Every Time

1. Paste the WHOLE line as one piece — do not type or paste only the folder path by itself.
2. The folder path stays inside quotes (it has a space: `Workforce MGNT`).
3. Two terminals, one command each. Both must stay open.
4. If you only have ONE terminal tab, click the **+** icon to make a second one for the frontend.

---

## Quick Check

| Symptom | Meaning |
|---------|---------|
| "can't be reached" in browser | Both terminals must be open and waiting |
| "Server running on 8000" not shown | The backend did not start |
| Red error text in a terminal | Copy it and send it to the team |

---

## Easy Fallback (No Typing At All)

Double-click the file **`start.bat`** in the `Workforce MGNT` folder — it opens both servers and the browser for you.
