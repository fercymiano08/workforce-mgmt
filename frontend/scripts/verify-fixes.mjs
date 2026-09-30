// Verify: Inactive is gone from the UI, nothing scrolls sideways, and the notification panel sits inside the screen.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5173';
const W = Number(process.env.W || 375);
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
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-v-')), defaultViewport: { width: W, height: 900, isMobile: true, hasTouch: true },
});
// A scroller is only a problem if it is the PAGE content area. A table scrolling inside its own
// box is the feature, not the bug.
const PROBE = () => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.tagName === 'MAIN' || /table|tbody|thead/.test(el.tagName)) continue;
    if (!/auto|scroll/.test(cs.overflowX)) continue;
    // ignore anything inside a table (that is a table scroller)
    if (el.closest('table') || el.querySelector('table')) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over > 1) out.push(`+${over} <${el.tagName.toLowerCase()}> ${String(el.className || '').slice(0, 60)}`);
  }
  return { mainOver: (() => { const m = document.querySelector('main'); return m ? m.scrollWidth - m.clientWidth : 0; })(), others: out.slice(0, 3) };
};
let bad = 0;
for (const [role, creds] of Object.entries({ admin: ['admin@workforcepro.com', 'Admin@123'], employee: ['employee@workforcepro.com', 'Employee@123'] })) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: W, height: 900, isMobile: true, hasTouch: true });
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
    const inactiveShown = await page.evaluate(() => /\bInactive\b/.test(document.body.innerText));
    if (r.mainOver > 1 || r.others.length || inactiveShown) {
      bad++;
      console.log(`FAIL ${role}${url}  mainOver=${r.mainOver}  inactiveText=${inactiveShown}`);
      r.others.forEach((o) => console.log('     ' + o));
    }
  }
  // notification panel position
  const panel = await page.evaluate(async () => {
    // Target the bell itself rather than guessing: it is the header button carrying an unread badge.
    const hdr = document.querySelector('header');
    if (!hdr) return 'no header';
    const candidates = [...hdr.querySelectorAll('button')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.top < 64;                       // in the topbar, not the page body
    });
    for (const b of candidates) {
      b.click();
      await new Promise((r) => setTimeout(r, 300));
      const head = [...document.querySelectorAll('h3')].find((h) => /notification/i.test(h.textContent));
      if (!head) { b.click(); await new Promise((r) => setTimeout(r, 120)); continue; }
      let p = head;
      while (p.parentElement && getComputedStyle(p.parentElement).position === 'static') p = p.parentElement;
      const r = p.getBoundingClientRect();
      return { offLeft: Math.round(-r.left), offRight: Math.round(r.right - document.documentElement.clientWidth), w: Math.round(r.width), vw: document.documentElement.clientWidth };
    }
    return 'not found';
  });
  console.log(`\n${role} notification panel:`, JSON.stringify(panel));
  await ctx.close();
}
await browser.close();
console.log(bad ? `\n${bad} page(s) still failing` : `\nAll clean at ${W}px: main never scrolls sideways, no stray scrollers, no "Inactive" text.`);
process.exit(bad ? 1 : 0);
