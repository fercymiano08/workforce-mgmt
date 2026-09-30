// Does the Raise overtime modal actually work end to end on a phone?
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
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-ot-')),
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE: ' + String(e.message).slice(0, 140)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 140)); });
// Report the server's own answer, so a rejection is visible rather than silent.
const api = [];
page.on('response', async (r) => {
  if (!/\/api\/overtime(\/bulk)?(\?|$)/.test(r.url())) return;
  let body = '';
  try {
    const j = await r.json();
    body = `created=${Array.isArray(j?.data) ? j.data.length : 'n/a'} skipped=${Array.isArray(j?.skipped) ? j.skipped.length : 'n/a'} msg="${j?.message || ''}"`;
  } catch { body = r.status() + ' (no json)'; }
  api.push(`${r.request().method()} ${r.url().replace(BASE, '')} -> ${r.status()} ${body}`);
});
const settle = async () => { await page.waitForNetworkIdle({ idleTime: 600, timeout: 12000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 500)); };

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[type="email"]', { timeout: 20000 });
await page.type('input[type="email"]', 'admin@workforcepro.com');
await page.type('input[name="password"]', 'Admin@123');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
await settle();

await page.goto(`${BASE}/attendance?tab=overtime`, { waitUntil: 'domcontentloaded' });
await settle();

const findPanel = `(() => {
  const h = [...document.querySelectorAll('h2')].find((x) => /^raise overtime$/i.test(x.textContent.trim()));
  return h ? h.closest('.relative') : null;
})()`;

const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /raise overtime/i.test(x.textContent));
  if (!b) return false;
  b.click();
  return true;
});
console.log('found Raise overtime button:', opened);
await new Promise((r) => setTimeout(r, 700));

const modal = await page.evaluate(`(() => {
  const panel = ${findPanel};
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  const rows = [...panel.querySelectorAll('button')].filter((b) => b.className.includes('w-full flex items-center gap-3'));
  return { offLeft: Math.round(-r.left), offRight: Math.round(r.right - document.documentElement.clientWidth), w: Math.round(r.width), vw: document.documentElement.clientWidth, peopleRows: rows.length, docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth };
})()`);
console.log('modal:', JSON.stringify(modal));

const ticked = await page.evaluate(`(() => {
  const panel = ${findPanel};
  if (!panel) return { error: 'no panel' };
  const list = [...panel.querySelectorAll('button')].filter((b) => b.className.includes('w-full flex items-center gap-3'));
  const picked = [];
  for (const b of list) { if (picked.length >= 3) break; b.click(); picked.push(b.textContent.replace(/\\s+/g,' ').trim().slice(0,32)); }
  return { available: list.length, picked };
})()`);
await new Promise((r) => setTimeout(r, 500));
console.log('ticked:', JSON.stringify(ticked));

const btn = await page.evaluate(`(() => {
  const panel = ${findPanel};
  if (!panel) return null;
  const b = [...panel.querySelectorAll('button')].find((x) => /Raise for/.test(x.textContent));
  return b ? { label: b.textContent.trim(), disabled: b.disabled } : null;
})()`);
console.log('submit button:', JSON.stringify(btn));

await page.evaluate(`(() => {
  const panel = ${findPanel};
  const ta = panel && panel.querySelector('textarea');
  if (!ta) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'Verification e2e run');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 250));
await page.evaluate(`(() => {
  const panel = ${findPanel};
  if (!panel) return;
  [...panel.querySelectorAll('button')].find((b) => /Raise for/.test(b.textContent))?.click();
})()`);
await new Promise((r) => setTimeout(r, 2500));
const after = await page.evaluate(`(() => {
  const h = [...document.querySelectorAll('h2')].find((x) => /^raise overtime$/i.test(x.textContent.trim()));
  const msgs = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /request[s]? raised|already has|skipped|Could not raise|Nothing was created/i.test(e.textContent)).map((e) => e.textContent.trim().slice(0,130));
  return { modalOpen: !!h, messages: [...new Set(msgs)].slice(0,5) };
})()`);
console.log('after submit:', JSON.stringify(after, null, 1));
console.log('overtime API calls:\n  ' + (api.join('\n  ') || '(none)'));

await browser.close();
if (errs.length) { console.error('\nERRORS:\n' + errs.join('\n')); process.exit(1); }
console.log('\nno console/page errors');
