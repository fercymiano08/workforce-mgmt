// Audit: horizontal overflow at narrow widths, and the interactive layers (notification panel,
// profile menu, sidebar drawer, More sheet) that were never tested open.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:5173';
const WIDTHS = (process.env.WIDTHS || '375,430').split(',').map(Number);

function findBrowser() {
  const root = path.join(here, '..', '.smoke-browser', 'chrome-headless-shell');
  const folders = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const v of folders(root)) for (const d of folders(path.join(root, v))) {
    const exe = path.join(root, v, d, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
}

const ACCOUNTS = {
  admin: { email: 'admin@workforcepro.com', password: 'Admin@123' },
  employee: { email: 'employee@workforcepro.com', password: 'Employee@123' },
};
const PAGES = {
  admin: ['/', '/employees', '/attendance', '/shifts', '/timesheets', '/leave', '/analytics', '/reports', '/ai-decision-support', '/audit-logs', '/notifications', '/settings', '/kiosk-setup', '/employee-registration'],
  employee: ['/', '/my-attendance', '/my-schedule', '/my-timesheet', '/leave', '/my-profile', '/notifications', '/settings'],
};

// Runs in the page: every region a finger can actually scroll sideways.
// The symptom is not "an element is wide" - it is "a box whose content is wider than the box".
// Note overflow-y:auto makes overflow-x computed 'auto' too, so the page <main> is itself one of
// these; that is usually the real thing the user is scrolling by accident.
const PROBE = () => {
  const scrollers = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (!/auto|scroll/.test(cs.overflowX)) continue;
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 1) continue;
    // Does anything inside it genuinely need that width, or is it a stray fixed-width child?
    scrollers.push({
      over,
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 90),
      widest: (() => {
        let w = null;
        for (const c of el.querySelectorAll('*')) {
          const cw = Math.round(c.getBoundingClientRect().width);
          if (!w || cw > w.w) w = { w: cw, tag: c.tagName.toLowerCase(), cls: String(c.className || '').slice(0, 70) };
        }
        return w;
      })(),
    });
  }
  scrollers.sort((a, b) => b.over - a.over);
  return {
    docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    scrollers: scrollers.slice(0, 4),
    count: scrollers.length,
  };
};

const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-audit-')),
});
const report = [];

for (const width of WIDTHS) {
  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width, height: 900, isMobile: true, hasTouch: true });
    const settle = async () => { await page.waitForNetworkIdle({ idleTime: 600, timeout: 12000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 500)); };

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.type('input[type="email"]', acct.email);
    await page.type('input[name="password"]', acct.password);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
    await settle();

    for (const url of PAGES[role]) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
      await settle();
      const base = await page.evaluate(PROBE);
      if (base.docOver > 1 || base.scrollers.length) report.push({ w: width, page: role + url, state: 'default', ...base });

      // --- notification panel: click header buttons until the panel appears
      const notif = await page.evaluate(() => {
        const hdr = document.querySelector('header');
        if (!hdr) return null;
        for (const b of hdr.querySelectorAll('button')) {
          b.click();
          const panel = [...document.querySelectorAll('div')].find((d) => /w-\[min\(/.test(String(d.className)) && d.getBoundingClientRect().width > 200);
          if (panel) {
            const r = panel.getBoundingClientRect();
            const vw = document.documentElement.clientWidth;
            return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw, offLeft: Math.round(-r.left), offRight: Math.round(r.right - vw) };
          }
        }
        return 'not-found';
      });
      if (notif && notif !== 'not-found' && (notif.offLeft > 1 || notif.offRight > 1)) {
        report.push({ w: width, page: role + url, state: 'notification panel', offLeft: notif.offLeft, offRight: notif.offRight, detail: JSON.stringify(notif) });
      }
      await page.keyboard.press('Escape');
      await page.evaluate(() => document.body.click());
      await new Promise((r) => setTimeout(r, 250));

      // --- More sheet from the bottom tab bar
      const more = await page.evaluate(() => {
        const b = document.querySelector('button[aria-label]');
        const btns = [...document.querySelectorAll('button')].filter((x) => /more/i.test(x.getAttribute('aria-label') || ''));
        if (!btns.length) return null;
        btns[btns.length - 1].click();
        return new Promise((res) => setTimeout(() => {
          const dlg = [...document.querySelectorAll('div')].find((d) => /rounded-2xl/.test(String(d.className)) && d.className.includes('max-h-'));
          if (!dlg) return res('no-sheet');
          const r = dlg.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          res({ w: Math.round(r.width), vw, offLeft: Math.round(-r.left), offRight: Math.round(r.right - vw) });
        }, 400));
      });
      if (more && more !== 'no-sheet' && (more.offLeft > 1 || more.offRight > 1)) {
        report.push({ w: width, page: role + url, state: 'More sheet', detail: JSON.stringify(more) });
      }
      await page.keyboard.press('Escape');
      await page.evaluate(() => { document.body.style.overflow = ''; });
      await new Promise((r) => setTimeout(r, 250));
    }
    await ctx.close();
  }
}
await browser.close();

if (!report.length) { console.log(`CLEAN at ${WIDTHS.join('/')}: no overflow, no mispositioned layers.`); process.exit(0); }
console.log(`FOUND ${report.length} problem(s):\n`);
for (const r of report) {
  const bits = [`@${r.w}px ${r.page} [${r.state}]`];
  if (r.docOver > 1) bits.push(`PAGE-SCROLLS=+${r.docOver}`);
  for (const s of r.scrollers || []) {
    bits.push(`  scroll+${s.over} <${s.tag}> ${s.cls}`);
    if (s.widest) bits.push(`     widest child: ${s.widest.w}px <${s.widest.tag}> ${s.widest.cls}`);
  }
  if (r.offLeft) bits.push(`  offLeft=${r.offLeft}`);
  if (r.offRight) bits.push(`  offRight=${r.offRight}`);
  if (r.detail) bits.push(`  ${r.detail}`);
  console.log(bits.join('\n'));
}
process.exit(1);
