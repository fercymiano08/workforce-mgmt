// Smoke test: opens the RUNNING system in a real browser, logs in, visits every page for the role, and
// reports anything broken - a crashed page, an error in the console, a failed API call, an empty screen.
// It also takes a screenshot of every page (scripts/smoke-output/), so a person can look through them fast.
// Run it after every larger change: it catches what the backend tests cannot see (a screen reading an API
// answer the wrong way, a page that crashes).
//
//   npm run smoke:setup                             # once: downloads a headless Chrome into .smoke-browser/
//   npm run smoke                                   # administrator, every admin page
//   SMOKE_EMPLOYEE_EMAIL=... SMOKE_EMPLOYEE_PASSWORD=... npm run smoke -- --role employee
//
// The system must be running first (start-all.ps1). Exit code 1 when anything fails. SMOKE_BROWSER picks
// another browser; without smoke:setup it falls back to Edge.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'smoke-output');
const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';
// The headless Chrome from `npm run smoke:setup` if present, else Edge.
function findBrowser() {
  const root = path.join(here, '..', '.smoke-browser', 'chrome-headless-shell');
  if (fs.existsSync(root)) {
    const folders = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const version of folders(root)) {
      for (const dir of folders(path.join(root, version))) {
        const exe = path.join(root, version, dir, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
}
const BROWSER = process.env.SMOKE_BROWSER || findBrowser();
const role = process.argv.includes('--role') ? process.argv[process.argv.indexOf('--role') + 1] : 'admin';

const ACCOUNTS = {
  admin: { email: process.env.SMOKE_ADMIN_EMAIL || 'admin@workforcepro.com', password: process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123' },
  employee: { email: process.env.SMOKE_EMPLOYEE_EMAIL, password: process.env.SMOKE_EMPLOYEE_PASSWORD },
};

// [name, path, text that must appear on a healthy page]
const PAGES = {
  admin: [
    ['dashboard', '/', 'Dashboard'], ['employees', '/employees', 'Employee'], ['attendance', '/attendance', 'Attendance'],
    ['shifts', '/shifts', 'Schedule'], ['timesheets', '/timesheets', 'Timesheets'], ['leave', '/leave', 'Leave'],
    ['analytics', '/analytics', 'Analytics'], ['reports', '/reports', 'Report'], ['ai', '/ai-decision-support', 'AI'],
    ['audit-logs', '/audit-logs', 'Audit Logs'], ['notifications', '/notifications', 'Notifications'], ['settings', '/settings', 'Settings'],
    ['kiosk-setup', '/kiosk-setup', 'Kiosk'], ['employee-registration', '/employee-registration', 'Employee'],
  ],
  employee: [
    ['dashboard', '/', 'Dashboard'], ['my-attendance', '/my-attendance', 'Attendance'], ['my-schedule', '/my-schedule', 'Schedule'],
    ['my-timesheet', '/my-timesheet', 'Timesheet'], ['leave', '/leave', 'Leave'], ['my-profile', '/my-profile', 'Profile'],
    ['notifications', '/notifications', 'Notifications'], ['settings', '/settings', 'Settings'],
  ],
};
// Windows that open inside a page (a crash there does not show when the page itself loads): open each one,
// click through its tabs, and check nothing breaks. [page name, buttons to click in order]
const INSIDE = {
  admin: [
    ['shifts', ['Automated Shift Scheduling', 'Work days', 'Holidays', 'Coverage', 'History', 'Schedule']],
  ],
  employee: [],
};

// What an employee must NOT be able to open
const FORBIDDEN_FOR_EMPLOYEE = ['/employees', '/attendance', '/shifts', '/timesheets', '/analytics', '/reports', '/audit-logs', '/kiosk-setup', '/ai-decision-support'];

// API answers that are normal (an administrator has no personal profile, etc.)
const EXPECTED_API_ERRORS = [/\/api\/profile/, /\/api\/auth\/logout/];

if (!ACCOUNTS[role]?.email) {
  console.error(`No login for role "${role}". Set SMOKE_${role.toUpperCase()}_EMAIL and SMOKE_${role.toUpperCase()}_PASSWORD.`);
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

// A fresh profile every run, so an already-open browser window cannot take over (or leave a login behind).
const browser = await puppeteer.launch({
  executablePath: BROWSER, headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-smoke-')), defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const problems = [];
let current = 'login';
page.on('pageerror', (e) => problems.push([current, 'page error', String(e.message).slice(0, 200)]));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon|Failed to load resource/.test(t)) return;   // network failures are reported below with their URL
  problems.push([current, 'console error', t.slice(0, 200)]);
});
page.on('response', (r) => {
  const url = r.url();
  if (!url.includes('/api/') || r.status() < 400) return;
  if (EXPECTED_API_ERRORS.some((re) => re.test(url))) return;
  problems.push([current, `API ${r.status()}`, url.replace(BASE, '')]);
});

const settle = async () => { await page.waitForNetworkIdle({ idleTime: 700, timeout: 12000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); };

// --- log in like a person would
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.type('input[type="email"]', ACCOUNTS[role].email);
await page.type('input[type="password"]', ACCOUNTS[role].password);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
await settle();
if (page.url().includes('/login')) {
  console.error('Login failed - check the smoke account credentials.');
  await browser.close();
  process.exit(2);
}

const rows = [];
for (const [name, route, mustSee] of PAGES[role]) {
  current = name;
  const before = problems.length;
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await settle();
  const text = await page.evaluate(() => document.body.innerText || '');
  await page.screenshot({ path: path.join(out, `${role}-${name}.png`) });

  if (text.trim().length < 80) problems.push([name, 'blank page', `${text.trim().length} characters on screen`]);
  else if (!text.toLowerCase().includes(mustSee.toLowerCase())) problems.push([name, 'unexpected page', `"${mustSee}" not found (redirected to ${page.url().replace(BASE, '')}?)`]);
  if (/something went wrong|unexpected error|cannot read prop/i.test(text)) problems.push([name, 'error screen', 'the page shows an error message']);
  rows.push([name, problems.length === before ? 'ok' : 'PROBLEM']);

  for (const [pageName, clicks] of INSIDE[role]) {
    if (pageName !== name) continue;
    current = `${name} > ${clicks[0]}`;
    const beforeInside = problems.length;
    for (const label of clicks) {
      const found = await page.evaluate((label) => {
        const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === label && x.offsetParent).pop();
        if (b) b.click();
        return Boolean(b);
      }, label);
      if (!found) { problems.push([current, 'missing button', `"${label}" not found`]); break; }
      await settle();
      const inner = await page.evaluate(() => document.body.innerText || '');
      if (/something went wrong|unexpected error|cannot read prop|is not a function/i.test(inner)) {
        problems.push([current, 'error screen', `crashed after clicking "${label}"`]);
        break;
      }
    }
    await page.screenshot({ path: path.join(out, `${role}-${name}-inside.png`) });
    rows.push([current, problems.length === beforeInside ? 'ok' : 'PROBLEM']);
  }
}

if (role === 'employee') {
  for (const route of FORBIDDEN_FOR_EMPLOYEE) {
    current = `boundary ${route}`;
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await settle();
    const stayed = page.url().replace(BASE, '') === route;
    if (stayed) problems.push([`boundary ${route}`, 'role boundary', 'an employee could open an administrator page']);
    rows.push([`boundary ${route}`, stayed ? 'PROBLEM' : 'blocked']);
  }
}

await browser.close();

console.log(`\nSmoke test - ${role} - ${PAGES[role].length} pages${role === 'employee' ? ` + ${FORBIDDEN_FOR_EMPLOYEE.length} boundary checks` : ''}`);
for (const [n, s] of rows) console.log(`  ${s === 'ok' || s === 'blocked' ? 'PASS' : 'FAIL'}  ${n}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const [where, kind, detail] of problems) console.log(`  [${where}] ${kind}: ${detail}`);
  process.exit(1);
}
console.log('\nAll pages loaded without a crash, console error or failed API call. Screenshots: frontend/scripts/smoke-output/');
