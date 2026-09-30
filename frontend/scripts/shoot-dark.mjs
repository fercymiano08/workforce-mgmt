// Renders the built app in dark mode against the live API and screenshots every page,
// so the theme can actually be looked at rather than assumed.
//   node scripts/shoot-dark.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dark-output');
fs.mkdirSync(out, { recursive: true });

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const EMAIL = process.env.SMOKE_EMAIL || 'admin@workforcepro.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Admin@123';

function findBrowser() {
  const root = path.join(here, '..', '.smoke-browser', 'chrome-headless-shell');
  if (fs.existsSync(root)) {
    for (const v of fs.readdirSync(root)) {
      const vPath = path.join(root, v);
      if (!fs.statSync(vPath).isDirectory()) continue;
      for (const d of fs.readdirSync(vPath)) {
        const dPath = path.join(vPath, d);
        if (!fs.statSync(dPath).isDirectory()) continue;
        const exe = path.join(root, v, d, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  return fs.existsSync(edge) ? edge : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
}

const PAGES = [
  ['dashboard', '/'],
  ['employees', '/employees'],
  ['attendance', '/attendance'],
  ['leave', '/leave-management'],
  ['timesheets', '/timesheets'],
  ['shifts', '/shifts'],
  ['overtime', '/overtime'],
  ['analytics', '/analytics'],
  ['reports', '/reports'],
  ['ai', '/ai-decision-support'],
  ['notifications', '/notifications'],
  ['settings', '/settings'],
];

const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });

const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 140)}`); });
page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 140)}`));

// Dark before the app boots, so the very first paint is the dark theme.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await page.evaluate(() => window.localStorage.setItem('wf-theme', 'dark'));

// The password field is not type="password" in this build, so target by position.
const fields = await page.$$('input');
await fields[0].type(EMAIL);
await fields[1].type(PASSWORD);
const submit = await page.$('button[type="submit"]') || await page.$('form button');
await submit.click();
await new Promise((r) => setTimeout(r, 6000));

const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
console.log('dark class active after login:', isDark);

for (const [name, url] of PAGES) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle2' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  console.log(`  ${name.padEnd(15)} dark=${dark}`);
}

// The notification dropdown, which is a floating surface over the page.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' }).catch(() => {});
await new Promise((r) => setTimeout(r, 1200));
const bell = await page.$('button[title*="otification"]');
if (bell) {
  await bell.click();
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(out, 'notification-dropdown.png') });
  console.log('  dropdown         shot');
} else {
  console.log('  dropdown         BELL NOT FOUND');
}

await browser.close();
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + [...new Set(problems)].slice(0, 10).join('\n') : '\nno console errors');
