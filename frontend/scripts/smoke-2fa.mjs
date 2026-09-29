// End-to-end check of two-factor sign-in, in a real browser against the real backend and database.
//
// The backend tests prove the server behaves. This proves the whole thing is actually wired together:
// the switch on the profile page, the second step on the login screen, the emailed code, and - the
// part that matters most - that the setting survives a real sign out and sign back in.
//
// It reads the code out of the mail log, so it needs a mailer that writes to a file (MAIL_MAILER=log).
// That is the only reason it cannot run against a real inbox.
//
//   npm run smoke:2fa
//
// It leaves the account with the setting off and the flag back where it found it.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // frontend/
const repo = path.join(here, '..');                                        // repository root
const apiRoot = path.join(repo, 'backend', 'app');
const out = path.join(here, 'scripts', 'smoke-output');
const BASE = process.env.SMOKE_BASE || 'http://localhost:5173';
const API = process.env.SMOKE_API || 'http://localhost:8000';
const LOG = path.join(apiRoot, 'storage', 'logs', 'laravel.log');
const EMAIL = process.env.SMOKE_EMPLOYEE_EMAIL || 'employee@workforcepro.com';
const PASSWORD = process.env.SMOKE_EMPLOYEE_PASSWORD || 'Employee@123';

function findBrowser() {
  const root = path.join(here, '.smoke-browser', 'chrome-headless-shell');
  if (fs.existsSync(root)) {
    const folders = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    for (const version of folders(root)) {
      for (const dir of folders(path.join(root, version))) {
        const exe = path.join(root, version, dir, process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
}

const problems = [];
const steps = [];
const step = (name, ok, detail = '') => {
  steps.push([name, ok ? 'ok' : 'FAIL', detail]);
  if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const settle = async (page) => {
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 12000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 350));
};
const bodyText = (page) => page.evaluate(() => document.body.innerText || '');

/**
 * When a step cannot find what it expected, save what was actually on screen. Without this the only
 * clue is "selector not found", which says nothing about whether the page never drew, drew something
 * else, or drew the thing under a different label.
 */
async function capture(page, tag) {
  await page.screenshot({ path: path.join(out, `2fa-FAIL-${tag}.png`), fullPage: true }).catch(() => {});
  const seen = await page.evaluate(() => ({
    url: location.pathname,
    buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => b.innerText.trim()).filter(Boolean),
    inputs: [...document.querySelectorAll('input')].map((i) => `${i.type}${i.name ? `/${i.name}` : ''}${i.getAttribute('aria-label') ? `/${i.getAttribute('aria-label')}` : ''}`),
  })).catch(() => null);
  return seen ? `page ${seen.url} - buttons: [${seen.buttons.join(' | ')}] - inputs: [${seen.inputs.join(' | ')}]` : 'page state unavailable';
}

/** Clicks the visible button whose label matches exactly. Returns false when there is no such button. */
const clickButton = (page, label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === l && x.offsetParent).pop();
  if (b) { b.click(); return true; }
  return false;
}, label);

/**
 * The newest sign-in code out of the mail log, so the test types the code a person would receive.
 *
 * Read from the line that introduces the code rather than "the last six digit run in the file" - the
 * log is full of other six digit numbers (timestamps, message ids) and grabbing one of those by
 * mistake would fail for a reason that has nothing to do with the feature.
 */
function latestCode() {
  if (!fs.existsSync(LOG)) return null;
  const tail = fs.readFileSync(LOG, 'utf8').split(/\n\[/).slice(-60).join('\n[');
  const labelled = [...tail.matchAll(/sign-in code is:\s*(\d{6})/gi)].map((m) => m[1]);
  if (labelled.length) return labelled[labelled.length - 1];
  const fallback = [...tail.matchAll(/\b(\d{6})\b/g)].map((m) => m[1]);
  return fallback.length ? fallback[fallback.length - 1] : null;
}

/**
 * Types a six digit code one box at a time and then presses the button that submits it.
 *
 * The six boxes are a paste target first and a typing target second: each box holds one character,
 * and the whole code can be pasted into any of them. Nothing happens on the sixth digit, so the
 * "Verify and sign in" button has to be pressed - exactly as a person would.
 */
async function enterCode(page, code) {
  for (let i = 0; i < 6; i++) {
    const box = (await page.$$('input[aria-label^="Digit"]'))[i];
    if (box) await box.type(code[i]);
  }
  await clickButton(page, 'Verify and sign in');
  await settle(page);
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await settle(page);
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await settle(page);
}

async function signOut(page) {
  await page.evaluate(async () => {
    // The sign-out button lives in the header, so go to a page that has one first.
    try {
      const token = JSON.parse(localStorage.getItem('workforce_auth') || '{}').token;
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
      });
    } catch { /* the session is cleared locally below regardless */ }
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function apiFlag() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await r.json();
  return body.requiresTwoFactor === true;
}

/**
 * Puts the account back to "off" straight in the database.
 *
 * This is the backstop, not the happy path. The normal cleanup below turns the setting off through the
 * profile page, which needs a signed-in session - and a signed-in session is exactly what is missing
 * when the feature is on. Without this fallback a failed run leaves the employee unable to sign in at
 * all, which is a far worse outcome than a red test.
 */
function resetFlagDirectly() {
  const php = `require '${apiRoot}/vendor/autoload.php';
    $a = require '${apiRoot}/bootstrap/app.php';
    $a->make(Illuminate\\Contracts\\Console\\Kernel::class)->bootstrap();
    $u = App\\Models\\User::where('email', ${JSON.stringify(EMAIL)})->first();
    if ($u) { $u->forceFill(['two_factor_enabled' => false])->save();
      Illuminate\\Support\\Facades\\DB::table('two_factor_challenges')->where('user_id', $u->id)->delete(); }`;
  const r = spawnSync('php', ['-r', php], { cwd: apiRoot, encoding: 'utf8' });
  if (r.status !== 0) problems.push(`direct reset failed: ${(r.stderr || '').trim().slice(0, 200)}`);
  return r.status === 0;
}

fs.mkdirSync(out, { recursive: true });

// Preflight. This test reads the emailed code out of the log, which needs a mailer that writes to a
// file and a log level low enough to record it. Without this check the run fails later with "no code
// reached the mail log", which reads like a broken feature rather than a misconfigured test.
{
  const env = fs.readFileSync(path.join(apiRoot, '.env'), 'utf8');
  const mailer = env.match(/^MAIL_MAILER=(.*)$/m)?.[1]?.trim();
  const level = env.match(/^LOG_LEVEL=(.*)$/m)?.[1]?.trim();
  if (mailer !== 'log' || (level && level !== 'debug')) {
    console.error('This test needs the mail to be readable, which means in backend/app/.env:');
    console.error('   MAIL_MAILER=log');
    console.error('   LOG_LEVEL=debug');
    console.error(`   found MAIL_MAILER=${mailer} LOG_LEVEL=${level}`);
    console.error('Set both, run the test, then put your real values back. Nothing else is changed.');
    process.exit(2);
  }
}
const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--no-first-run'],
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'wfp-2fa-')), defaultViewport: { width: 430, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => problems.push(`page error: ${String(e.message).slice(0, 160)}`));

try {
  // --- 0. Start from a known state, whatever a previous run left behind. Recovering here rather than
  //        failing keeps one bad run from poisoning every run after it.
  if (await apiFlag()) {
    resetFlagDirectly();
    step('recovered a previous run that left it on', (await apiFlag()) === false);
  }
  step('starts with two-factor off', (await apiFlag()) === false);

  // --- 1. Sign in and turn it on from the profile page.
  await signIn(page);
  step('employee signs in without a code', !page.url().includes('/login'), `landed on ${page.url().replace(BASE, '')}`);

  await page.goto(`${BASE}/my-profile`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  step('profile shows the setting', (await bodyText(page)).includes('Sign-In Verification'));

  step('"Turn on" button exists', await clickButton(page, 'Turn on'));
  await settle(page);
  await page.waitForFunction(
    () => (document.body.innerText || '').includes('After your password, we email you'),
    { timeout: 15000 }
  ).catch(() => {});
  const onText = await bodyText(page);
  step('profile flips to "On"', onText.includes('After your password, we email you'), onText.slice(0, 120));
  step('server recorded the switch', (await apiFlag()) === true, 'the account was not turned on');
  await page.screenshot({ path: path.join(out, '2fa-1-profile-on.png') });

  // --- 2. The second step must actually appear on the next sign-in.
  await signOut(page);
  await signIn(page);
  const afterLogin = await bodyText(page);
  const onCodeScreen = page.url().includes('/login')
    && (await page.$$('input[inputmode="numeric"], input[maxlength="1"]')).length >= 6;
  step('password alone no longer signs in', page.url().includes('/login'), `went to ${page.url().replace(BASE, '')}`);
  step('the code screen appears', onCodeScreen, afterLogin.slice(0, 140).replace(/\n/g, ' '));
  await page.screenshot({ path: path.join(out, '2fa-2-code-step.png') });

  // --- 3. The emailed code is what finishes the sign-in.
  const code = latestCode();
  step('a code reached the mail log', Boolean(code), 'nothing in storage/logs/laravel.log');
  if (code) {
    await enterCode(page, code);
    const done = !page.url().includes('/login');
    const after = await bodyText(page);
    step('the real code finishes the sign-in', done, done ? '' : `still on ${page.url().replace(BASE, '')} - ${after.slice(0, 120).replace(/\n/g, ' ')}`);
    await page.screenshot({ path: path.join(out, '2fa-3-signed-in.png') });
  }

  // --- 4. The setting is remembered across a fresh sign-in, not just this browser tab.
  await signOut(page);
  await signIn(page);
  step('a later sign-in asks for the code again', page.url().includes('/login'), 'went straight in without a code');
  const second = latestCode();
  step('a fresh code was mailed for that attempt', Boolean(second) && second !== code, 'same code as the first attempt');
  if (second) await enterCode(page, second);
  step('the setting survived the whole round trip', (await apiFlag()) === true);

  // --- 5. Turning it off asks for the password, refuses a wrong one, and accepts the right one.
  //        Done here, on the session the code just opened, so this checks the real thing a person does.
  if (!page.url().includes('/login')) {
    await page.goto(`${BASE}/my-profile`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    step('"Turn off" asks for a password first', await clickButton(page, 'Turn off'));
    const pw = 'input[type="password"], input[name="current-password"]';
    const gotPw = await page.waitForSelector(pw, { timeout: 8000 }).then(() => true).catch(() => false);
    step('the password box appeared', gotPw, await capture(page, 'no-password-box'));
    if (!gotPw) throw new Error('the password box never appeared, so switching off cannot be tested');

    await page.type(pw, 'definitely-not-the-password');
    await clickButton(page, 'Turn off');
    await settle(page);
    const refused = /password is not correct|current password/i.test(await bodyText(page));
    step('a wrong password is refused', refused, 'no error was shown to the person');
    step('and the feature is still on', (await apiFlag()) === true, 'it was switched off by a wrong password');
    await page.screenshot({ path: path.join(out, '2fa-4-wrong-password.png') });

    const box = await page.$(pw);
    if (box) {
      // Clear properly: a triple click is unreliable in a masked field, and whatever is left over
      // would be sent as part of the password and refused for the wrong reason.
      await box.click();
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type(pw, PASSWORD);
      const typed = await page.$eval(pw, (i) => i.value);
      step('the password box holds exactly the password', typed === PASSWORD, `held ${typed.length} characters`);
      await settle(page);
      await clickButton(page, 'Turn off');
      await settle(page);
    }
    const stillOnAfter = await apiFlag();
    step('the right password turns it off', stillOnAfter === false, stillOnAfter ? `the box said: ${(await bodyText(page)).replace(/\n+/g, ' | ').slice(0, 200)}` : '');
  } else {
    step('reached the signed-in session to test switching off', false, 'could not get past the code screen');
  }

  // --- 6. With it off, a password alone is enough again.
  await signOut(page);
  await signIn(page);
  step('a sign-in needs no code once it is off', !page.url().includes('/login'), `stuck on ${page.url().replace(BASE, '')}`);
} catch (err) {
  problems.push(`script error: ${String(err.message).slice(0, 200)}`);
} finally {
  // Safety net only - the run above normally switches the feature off itself. This exists for the case
  // where it could not: an account left with the feature on cannot get back in, which is a far worse
  // outcome for the person than a red test.
  if (await apiFlag()) resetFlagDirectly();

  let restored = (await apiFlag()) === false;
  if (!restored) problems.push('the account was left with two-factor ON and could not be reset');
  step('account left with two-factor off', restored);
  await browser.close();
}

// Printed last, because the password checks above happen while cleaning up.
console.log('\nTwo-factor sign-in - end to end');
for (const [name, status, detail] of steps) {
  console.log(`  ${status === 'ok' ? 'PASS' : 'FAIL'}  ${name}${status === 'ok' ? '' : `  (${detail})`}`);
}

if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nThe whole two-factor journey works: switch, second step, real emailed code, and a clean sign out.');
