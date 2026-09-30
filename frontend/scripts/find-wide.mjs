// Which element inside <main> is actually too wide?
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
const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-w-')), defaultViewport: { width: 375, height: 900, isMobile: true, hasTouch: true },
});
const probe = () => {
  const main = document.querySelector('main');
  if (!main) return 'no main';
  const limit = main.getBoundingClientRect().right;
  const out = [];
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const past = Math.round(r.right - limit);
    if (past <= 1) continue;
    // is it inside something that scrolls or clips it?
    let p = el.parentElement, contained = false;
    while (p && p !== main) { const o = getComputedStyle(p).overflowX; if (/auto|scroll|hidden|clip/.test(o)) { contained = true; break; } p = p.parentElement; }
    if (contained) continue;
    out.push(`+${past} <${el.tagName.toLowerCase()}> ${String(el.className || '').slice(0, 85)}`);
  }
  return out.slice(0, 6);
};
for (const [role, creds, urls] of [
  ['admin', ['admin@workforcepro.com', 'Admin@123'], ['/attendance', '/audit-logs']],
  ['employee', ['employee@workforcepro.com', 'Employee@123'], ['/my-attendance']],
]) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 375, height: 900, isMobile: true, hasTouch: true });
  const settle = async () => { await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 400)); };
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.type('input[type="email"]', creds[0]);
  await page.type('input[name="password"]', creds[1]);
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await settle();
  for (const u of urls) {
    await page.goto(`${BASE}${u}`, { waitUntil: 'domcontentloaded' });
    await settle();
    const r = await page.evaluate(probe);
    console.log(`\n${role}${u}`);
    if (Array.isArray(r)) r.forEach((x) => console.log('  ' + x)); else console.log('  ' + r);
  }
  await ctx.close();
}
await browser.close();
