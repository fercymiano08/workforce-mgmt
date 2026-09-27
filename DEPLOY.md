# Deploying WorkForce Pro to the public web (free, ~30 minutes)

One GitHub repository -> one click in Render -> a public `https://` link you can put on a slide.
Everything Render needs is declared in `render.yaml`, so there is no dashboard clicking beyond
"connect the repo and press Apply".

| Piece | Where it runs | Cost |
|---|---|---|
| React frontend | Render static site | free, never sleeps |
| Laravel API | Render web service (Docker) | free tier |
| Scheduler | inside the API container, `schedule:work` | free |
| PostgreSQL | Render's built-in Postgres | free **for 30 days** - see below |
| Keep-awake ping | GitHub Actions, every 5 min | free |

---

## 1. Before you start (5 minutes, on your machine)

**a) Push the deployment changes** (this guide plus `render.yaml` and the three small edits):

```powershell
git add -A
git commit -m "Deploy: Render blueprint, public demo"
git push
```

**b) Generate an app key.** Render asks for it during Apply and this key is what signs your
sessions and your kiosk device tokens:

```powershell
cd backend\app
php artisan key:generate --show
```

Copy the whole line, including the `base64:` prefix. Keep it in a text file - you paste it once.

**c) Optional: a free Gemini key** from <https://aistudio.google.com> (no card). Paste it in the
same Apply screen. Leave it blank and the AI Decision Support module quietly uses its rule-based
fallback instead, so nothing breaks.

---

## 2. Create the deployment (10 minutes, on render.com)

1. Sign up or log in at <https://render.com> (GitHub login is fine).
2. In the dashboard click **New -> Blueprint**.
3. Connect this repository (`fercymiano08/workforce-mgmt`) and pick the `main` branch.
4. Render reads `render.yaml` and shows you the three resources it will create:

   | Name | What it is |
   |---|---|
   | `workforce-api` | the Laravel API, with the scheduler running inside it |
   | `workforce-frontend` | the React app |
   | `workforce-db` | the PostgreSQL database |

5. Fill in the two boxes it asks for: **APP_KEY** (from step 1b) and **GEMINI_API_KEY** (optional).
6. Press **Apply**.

That is the whole "boom". Render now builds the API image, builds the React app, creates the
database. The first build takes about 5-8 minutes; the **Events** tab shows each step.

7. **Set the three values by hand** - this part is not optional, and skipping it is the one thing
   that will leave you with a deployed app that 500s on every screen:

   | Key | Where to get it |
   |---|---|
   | `APP_KEY` | the `base64:...` line from step 1b |
   | `DB_URL` | open **workforce-db** -> its dashboard -> **Internal Database URL** -> copy |
   | `GEMINI_API_KEY` | optional, from <https://aistudio.google.com>; blank is fine |

   Go to **workforce-api -> Environment -> Add Environment Variable**, add each one, then hit
   **Save Changes** and **Restart Service** (or just redeploy). The entrypoint runs all 51
   migrations and the demo seed on boot, so the app comes up fully populated.

   These three live in the dashboard rather than in `render.yaml` on purpose. Render's
   `fromDatabase` and environment-group bindings were dropped without warning when this Blueprint
   was first applied, which left the API running with no database, no `APP_KEY` and no migrations -
   a service that looked perfectly healthy and failed every request. A value typed into the
   dashboard cannot be lost that way.

7. When it finishes, open the `workforce-frontend` service -> the link at the top of the page
   (`https://workforce-frontend.onrender.com`) **is your public app.** That is the URL for your
   slides, your QR code and your panel.

### If a service name gets a suffix

Render appends a suffix when a name is taken (`workforce-api` became `workforce-api-nm7v`). If
either of your services ends up suffixed, the hostnames baked into the build are wrong and nothing
will load. Change the real host in all three places in `render.yaml` - `APP_URL`, `FRONTEND_URL` and
`VITE_API_URL` - plus the ping in `.github/workflows/keep-awake.yml`, then push. `VITE_API_URL` is
read while the frontend builds, so the push has to rebuild it.

Note the difference between the three: `APP_URL` is the API's own root (`https://<api-host>`), while
`VITE_API_URL` is the base every browser call is appended to and therefore needs the API prefix
(`https://<api-host>/api`). `FRONTEND_URL` is the frontend host with no prefix.

---

## 3. First things to check

Open the public link and sign in with the seeded accounts
(`backend/app/database/seeders/DatabaseSeeder.php`):

| Role | Email | Password |
|---|---|---|
| Workforce Admin | `admin@workforcepro.com` | `Admin@123` |
| Employee | (any demo employee, see the Employees screen) | `Employee@123` |

Check in this order, so you find a problem while you still have time:

1. The login page loads and the fonts/icons look right.
2. Log in as admin - the dashboard loads.
3. Open the **Time & Attendance** screen: there is recent demo data, not an empty table.
4. Open the **kiosk** route and walk through a punch. This is the most demanding screen: it loads
   the face-recognition models in the browser and uploads a photo.
5. On the API service's **Logs** tab, confirm the requests arrived and there are no `ERROR` lines.

---

## 4. Refreshing the demo data before you present

The demo employees' schedules, attendance and timesheets are built by the seeders on every
deploy, so a redeploy is a reset button:

**Render dashboard -> `workforce-api` -> Manual Deploy -> Deploy Now**

Do this the morning of the defense. It re-runs the migrations and rebuilds the last weeks of demo
data up to today, and it undoes anything a rehearsal left behind. (Live punches you make *during*
the defense are also reset by a redeploy - so do not redeploy while you are presenting.)

---

## 5. The 30-day database cliff (read this part)

Render's free PostgreSQL has a fixed 1 GB of storage and **expires 30 days after it is created.**
An expired database is inaccessible until you upgrade it to a paid plan, and you then have a
14-day grace period before Render deletes it and everything in it. (One free database per account,
which is all this needs.)

For the defense itself this does not matter. It matters if the panel, your school or a future
employer looks at the link more than a month from now. Fix it once, in about 10 minutes:

1. Sign up at <https://neon.tech> (free, no card, free forever, 0.5 GB). Create a project, then a
   branch, and copy the **pooled connection string**.
2. Render dashboard -> `workforce-api` -> **Environment**. Add:
   - `DB_HOST` = the host from the Neon string
   - `DB_PORT` = `5432`
   - `DB_DATABASE` = the database name
   - `DB_USERNAME` = the user
   - `DB_PASSWORD` = the password
3. Delete the five `DB_*` values that were pointing at `workforce-db` (Render shows them as coming
   from the database, which locks them) - if Render will not let you edit them, delete the
   `workforce-db` database first, then add the Neon values.
4. **Manual Deploy.** `docker/backend-entrypoint.sh` runs all 51 migrations against the new
   database and seeds the demo data, so the app comes up populated.
5. Delete the now-unused `workforce-db` database, and remove the `databases:` block plus the
   `fromDatabase:` entries from `render.yaml`.

Do this after the defense, not before it.

---

## 6. Sending real emails (optional)

Out of the box `MAIL_MAILER=log`, so a "reset your password" email is written to the API log
instead of being sent. That is enough to demo the flow (open the **Logs** tab and show it), but if
you want a real inbox, add these to the `api` service environment:

| Key | Value |
|---|---|
| `MAIL_MAILER` | `smtp` |
| `MAIL_HOST` | `smtp-relay.brevo.com` (or `smtp.gmail.com` with an app password) |
| `MAIL_PORT` | `587` |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | your Brevo or Gmail credentials |

Brevo's free tier sends 300 emails a day, Gmail's app password works too. Then redeploy.

---

## 7. Pushing a fix after the first deploy

Just push. Both services rebuild automatically:

```powershell
git add -A
git commit -m "Fix: whatever you changed"
git push
```

Watch it in the dashboard's **Events** tab. If the frontend was rebuilt, browsers pick up the new
build on the next reload - `frontend/vite.config.js` stamps every build with an id and the app
notices when it is out of date, so you do not have to tell anyone to hard-refresh.

---

## 8. If something goes wrong

| Symptom | Cause and fix |
|---|---|
| First load of the day takes ~1 minute, then it is fast | The free API was asleep. `.github/workflows/keep-awake.yml` pings it every 5 minutes to prevent this; check that the workflow exists under the **Actions** tab (scheduled workflows only run from the default branch). |
| Login says `Unauthenticated` or the console shows `blocked by CORS policy ... No 'Access-Control-Allow-Origin' header` | `VITE_API_URL` is wrong. It must be the API hostname Render gave the `api` service **including the trailing `/api`** (e.g. `https://<api-host>/api`). Dropping the `/api` makes the app request `/auth/login` instead of `/api/auth/login`; that 404 is returned without CORS headers, so the browser blames CORS and login never works. |
| Login says `Unauthenticated` but the request URL in the Network tab is correct | The token was rejected, not lost. The API is running an older build than the frontend - redeploy the API and sign in again. |
| API log: `No application encryption key` | `APP_KEY` was pasted wrong. It must be the full `base64:...` line, with the prefix. |
| API log: `could not translate host name` or connection refused | The database is not ready yet, or `DB_HOST` is not Render's internal host. A second deploy fixes a race during the very first apply. |
| Kiosk photo upload fails or the page hangs | The free instance has 512 MB. A 20 MB base64 photo is a lot for it. Take a smaller photo, or use an employee whose face is already registered. |
| Build fails in the `npm ci` step | `frontend/package-lock.json` must be committed. It is. If you added a dependency without committing the lock file, that is the cause. |
| `workforce-frontend` 404s on a deep link such as `/attendance` | The `routes:` rewrite in `render.yaml` is missing. Put it back and redeploy. |

---

## 9. What this setup deliberately does not do

- **No custom domain.** The `onrender.com` links are what you present. A domain is optional and
  costs money; skip it.
- **No HTTPS certificate to configure.** Render issues and renews it for the `onrender.com` hosts
  automatically.
- **No file storage to configure.** Face photos and leave proofs are stored as text inside
  PostgreSQL, so there is no S3 bucket to pay for and no disk that loses data on a restart.
- **The demo passwords are public knowledge** because the seeder is in a public repository. Anyone
  who reads the source can sign in to the public link as the admin. That is acceptable for a
  defence demo and is not acceptable for a real deployment - if you ever deploy this for real,
  move the seeded passwords into environment variables first.
