// Fast: which pages let you scroll sideways at phone width, and what is too wide.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5173';
function findBrowser() {
  const root = path.join(here, '..', '.smoke-browser', 'chrome-headless-shell');
  const folders = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const v of folders(root)) for (const d of folders(path.join(root, v))) {
    const exe = path.join(root, v, d, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
}
const PAGES = {
  admin: ['/', '/employees', '/attendance', '/shifts', '/timesheets', '/leave', '/analytics', '/reports', '/ai-decision-support', '/audit-logs', '/notifications', '/settings', '/kiosk-setup', '/employee-registration'],
  employee: ['/', '/my-attendance', '/my-schedule', '/my-timesheet', '/leave', '/my-profile', '/notifications', '/settings'],
};
const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-f-')), defaultViewport: { width: 375, height: 900, isMobile: true, hasTouch: true },
});
const PROBE = () => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || !/auto|scroll/.test(cs.overflowX)) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) continue;
    let widest = null;
    for (const c of el.querySelectorAll('*')) {
      const w = Math.round(c.getBoundingClientRect().width);
      if (!widest || w > widest.w) widest = { w, t: c.tagName.toLowerCase(), c: String(c.className || '').slice(0, 60) };
    }
    out.push(`+${over} <${el.tagName.toLowerCase()}> ${String(el.className || '').slice(0, 70)} || widest ${widest?.w}px <${widest?.t}> ${widest?.c}`);
  }
  return out.slice(0, 3);
};
for (const [role, creds] of Object.entries({ admin: ['admin@workforcepro.com', 'Admin@123'], employee: ['employee@workforcepro.com', 'Employee@123'] })) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 375, height: 900, isMobile: true, hasTouch: true });
  const settle = async () => { await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 350)); };
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', creds[0]);
  await page.type('input[name="password"]', creds[1]);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await settle();
  for (const url of PAGES[role]) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
    await settle();
    const r = await page.evaluate(PROBE);
    if (r.length) { console.log(`\n${role}${url}`); r.forEach((x) => console.log('   ' + x)); }
  }
  await ctx.close();
}
await browser.close();
console.log('\ndone');
