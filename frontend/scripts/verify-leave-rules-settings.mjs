// Targeted check for the leave rules engine move: the rules now live in Settings > Company
// Configuration > Leave Rules (below Time Manager) instead of the old standalone /leave-types page.
// Verifies the section renders, the old route redirects, the sidebar no longer offers it, and the
// other settings sections still open.
//
//   start-all.ps1 first, then:  node scripts/verify-leave-rules-settings.mjs
// Screenshots land in scripts/smoke-output/. Exit code 1 when anything fails.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'smoke-output');
const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';

// Same browser pick-up as smoke.mjs: the downloaded headless Chrome, else Edge.
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

const browser = await puppeteer.launch({
  executablePath: process.env.SMOKE_BROWSER || findBrowser(), headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-leave-rules-')), defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const problems = [];
const rows = [];
const check = (name, ok, detail) => { rows.push([name, ok ? 'ok' : 'PROBLEM']); if (!ok) problems.push([name, detail || '']); };
const body = () => page.evaluate(() => document.body.innerText || '');
const settle = async () => { await page.waitForNetworkIdle({ idleTime: 700, timeout: 12000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); };
const shot = (name) => page.screenshot({ path: path.join(out, `leave-rules-${name}.png`) });

fs.mkdirSync(out, { recursive: true });

// --- log in
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type="email"]', { timeout: 20000 });
await page.type('input[type="email"]', process.env.SMOKE_ADMIN_EMAIL || 'admin@workforcepro.com');
await page.type('input[name="password"]', process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
await settle();
if (page.url().includes('/login')) { console.error('Login failed.'); await browser.close(); process.exit(2); }

// --- sidebar: the old entry is gone, the console is still there
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await settle();
const sidebar = await body();
check('sidebar has no "Leave Types" entry', !/Leave Types/i.test(sidebar), 'the sidebar still offers Leave Types');
check('sidebar still has Leave Management', /Leave Management/.test(sidebar), '"Leave Management" missing from the sidebar');
await shot('sidebar');

// --- Settings opens on Company Information as before
await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await settle();
check('default section is Company Information', /Company Details/.test(await body()), 'Settings did not open on the company section');
await shot('settings-company');

// --- click the new nav item
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === 'Leave Rules' && x.offsetParent).pop();
  if (b) b.click();
  return Boolean(b);
});
await settle();
check('Leave Rules nav item is clickable', clicked, '"Leave Rules" not found in the settings nav');
check('URL carries ?section=leaveRules', page.url().includes('section=leaveRules'), `url is ${page.url().replace(BASE, '')}`);
let text = await body();
check('Leave Rules section renders', /Leave Rules/.test(text) && /Vacation/.test(text), 'the rules table did not render');
check('No page-level leftover heading', !/Leave Type Configuration/.test(text), 'the old standalone page heading is still shown');
await shot('section-leaveRules');

// --- the Add Leave Type modal still opens from inside Settings
const openedModal = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.includes('Add Leave Type') && x.offsetParent).pop();
  if (b) b.click();
  return Boolean(b);
});
await settle();
text = await body();
check('Add Leave Type modal opens', openedModal && /Code/.test(text) && /Applicable Gender/.test(text), 'the create modal did not open');
await shot('add-modal');
await page.keyboard.press('Escape');
await settle();

// --- deep link straight to the section
await page.goto(`${BASE}/settings?section=leaveRules`, { waitUntil: 'domcontentloaded' });
await settle();
text = await body();
check('deep link lands on Leave Rules', /Leave Rules/.test(text) && /Vacation/.test(text), 'the ?section=leaveRules URL did not render the rules');
await shot('deeplink');

// --- the old route redirects there too
await page.goto(`${BASE}/leave-types`, { waitUntil: 'domcontentloaded' });
await settle();
text = await body();
check('/leave-types redirects to the section', page.url().includes('/settings?section=leaveRules') && /Leave Rules/.test(text),
  `ended on ${page.url().replace(BASE, '')}`);
await shot('redirect-from-leave-types');

// --- Time Manager (the section this one now sits below) still opens
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === 'Time Manager' && x.offsetParent).pop();
  if (b) b.click();
});
await settle();
check('Time Manager still opens', /Attendance Grace Periods/.test(await body()), 'the Time Manager section broke');
await shot('time-manager');

await browser.close();

console.log('');
for (const [name, status] of rows) console.log(`  ${status === 'ok' ? 'ok      ' : 'PROBLEM '} ${name}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const [name, detail] of problems) console.error(`  - ${name}${detail ? `: ${detail}` : ''}`);
  process.exit(1);
}
console.log('\nAll leave-rules-in-settings checks passed.');
