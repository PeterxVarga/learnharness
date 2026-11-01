/** R16.14: one-shot real local browser review of the Hungarian GUSEK form.
 * Owner-run only. No external services, user accounts, GLPK or release action. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.argv[2] && resolve(process.argv[2]);
assert.ok(root, 'Usage: node r1614-browser-ui-review.mjs /absolute/path/to/assembled');
const assembly = JSON.parse(readFileSync(join(root, '../evidence/assembly.json'), 'utf8'));
assert.equal(assembly.profile, 'workbench');
assert.equal(assembly.native_glpk_enabled_by_r16, false);
assert.equal(assembly.upstream_sha, '80f225d1fe16483b8e018b51dbfef4465262156e');
const require = createRequire(join(root, 'package.json'));
const puppeteer = require('puppeteer-core');

const browserNames = ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'brave-browser', 'brave-browser-stable'];
function browserPath() {
  if (process.env.LH_BROWSER_BIN) return process.env.LH_BROWSER_BIN;
  for (const name of browserNames) {
    try { return execFileSync('which', [name], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); } catch { /* search next */ }
  }
  throw Error('BLOCKED_NO_LOCAL_CHROMIUM: set LH_BROWSER_BIN to a trusted installed browser');
}
async function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(err => err ? fail(err) : done(address.port));
    });
  });
}
const profile = mkdtempSync(join(tmpdir(), 'lh-r1614-ui-'));
let server, browser;
let serverLog = '';
const errors = [];
function assignment(t) {
  let best = null;
  for (const p of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    const objective = p.reduce((sum, j, i) => sum + t.costs[i][j], 0);
    if (!best || objective < best.objective) best = {p, objective};
  }
  return {
    objective: best.objective,
    values: Object.fromEntries(t.variableNames.map((n, i) => [n, Number(best.p[Math.floor(i / 3)] === i % 3)])),
    model: [
      ...t.variableNames.map(n => `var ${n} binary;`),
      ...[0,1,2].map(i => `s.t. worker_${i}: ${[0,1,2].map(j => `a${i+1}${j+1}`).join(' + ')} = 1;`),
      ...[0,1,2].map(j => `s.t. job_${j}: ${[0,1,2].map(i => `a${i+1}${j+1}`).join(' + ')} = 1;`),
      `minimize total: ${t.variableNames.map((n, i) => `${t.costs[Math.floor(i / 3)][i % 3]}*${n}`).join(' + ')};`,
      'solve;', 'end;'
    ].join('\n')
  };
}
function production(t) {
  const maximum = i => {
    const bounds = [[t.material[i], t.materialLimit], [t.hours[i], t.hoursLimit]]
      .filter(([unit]) => unit > 0).map(([unit, total]) => Math.floor(total / unit));
    return Math.min(...bounds, 1000);
  };
  let best = {values: [0, 0], objective: 0};
  for (let a = 0; a <= maximum(0); a++) for (let b = 0; b <= maximum(1); b++) {
    if (t.material[0]*a + t.material[1]*b > t.materialLimit) continue;
    if (t.hours[0]*a + t.hours[1]*b > t.hoursLimit) continue;
    const objective = t.profit[0]*a + t.profit[1]*b;
    if (objective > best.objective) best = {values: [a,b], objective};
  }
  return {
    objective: best.objective,
    values: Object.fromEntries(t.variableNames.map((name, i) => [name, best.values[i]])),
    model: [
      'var alap >= 0, integer;', 'var premium >= 0, integer;',
      `s.t. material: ${t.material[0]}*alap + ${t.material[1]}*premium <= ${t.materialLimit};`,
      `s.t. labor: ${t.hours[0]}*alap + ${t.hours[1]}*premium <= ${t.hoursLimit};`,
      `maximize gain: ${t.profit[0]}*alap + ${t.profit[1]}*premium;`,
      'solve;', 'end;'
    ].join('\n')
  };
}
async function clickText(page, label) {
  for (const element of await page.$$('button')) {
    if ((await element.evaluate(el => el.textContent.trim())) === label) {
      await element.click(); return;
    }
  }
  throw Error(`MISSING_BUTTON: ${label}`);
}
async function replace(page, selector, value) {
  const element = await page.$(selector);
  assert.ok(element, `MISSING_INPUT: ${selector}`);
  await element.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.type(String(value));
  assert.equal(await element.evaluate(el => el.value), String(value));
}
async function grade(page, expected) {
  await clickText(page, 'Matematikai modell és optimum ellenőrzése');
  await page.waitForFunction(() => document.querySelector('[data-testid="or-grade"] h2')?.textContent?.trim(), {timeout: 20000});
  const visible = await page.$eval('[data-testid="or-grade"] h2', el => el.textContent.trim());
  if (expected === 'not-full') assert.notEqual(visible, '1/1', 'Malformed model must not earn full credit');
  else assert.equal(visible, expected);
}
async function load(page, kind) {
  await page.select('select', kind);
  await clickText(page, 'Feladat betöltése');
  await page.waitForFunction(() => document.querySelector('#or-model')?.value?.includes('TODO'), {timeout: 20000});
}
try {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const env = {...process.env, LH_GLPK_ENABLE_LOCAL: '0', NEXT_TELEMETRY_DISABLED: '1'};
  delete env.LH_GLPK_IMAGE_ID;
  delete env.LH_GLPK_RUN_TOKEN;
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe']});
  server.stdout.on('data', b => serverLog = (serverLog + b.toString()).slice(-4000));
  server.stderr.on('data', b => serverLog = (serverLog + b.toString()).slice(-4000));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw Error(`NEXT_EARLY_EXIT: ${serverLog}`);
    try {
      const r = await fetch(`${url}/api/pilot/gusek/szakmai?kind=assignment&seed=42`, {signal: AbortSignal.timeout(1000)});
      if (r.ok) { ready = true; break; }
    } catch { /* bounded wait */ }
    await delay(250);
  }
  assert.ok(ready, `NEXT_NOT_READY: ${serverLog}`);
  browser = await puppeteer.launch({executablePath: browserPath(), headless: true, userDataDir: profile, args: ['--disable-background-networking', '--disable-extensions', '--no-first-run']});
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  // Avoid requiring all Next.js background requests to become idle.
  const uiProbe = await fetch(`${url}/pilot/gusek/szakmai`, {signal: AbortSignal.timeout(15000)});
  assert.equal(uiProbe.status, 200, 'UI_ROUTE_NOT_HTTP_200');
  const navigation = await page.goto(`${url}/pilot/gusek/szakmai`, {waitUntil: 'domcontentloaded', timeout: 30000});
  assert.equal(navigation?.status(), 200, 'BROWSER_UI_NAVIGATION_NOT_HTTP_200');
  await page.waitForSelector('h1', {visible: true, timeout: 15000});
  assert.match(await page.$eval('h1', el => el.textContent), /Operációkutatás.*GUSEK/);

  for (const kind of ['assignment', 'production']) {
    await load(page, kind);
    const r = await fetch(`${url}/api/pilot/gusek/szakmai?kind=${kind}&seed=42`);
    assert.equal(r.status, 200);
    const payload = await r.json();
    assert.ok(!('solution' in payload) && !('oracle' in payload));
    const solution = kind === 'assignment' ? assignment(payload.task) : production(payload.task);
    await replace(page, '#or-model', solution.model);
    await replace(page, '#or-values', JSON.stringify(solution.values));
    await replace(page, '#or-obj', solution.objective);
    await grade(page, '1/1');
    console.log(`R16_14_UI_${kind.toUpperCase()}_INDEPENDENT_FULL=PASS`);

    if (kind === 'assignment') {
      // Hold the first grading POST at Chromium's request-interception boundary.
      // Editing must abort the stale request and permit the second POST immediately.
      let firstPost = null;
      let firstSeen;
      const captured = new Promise(resolve => firstSeen = resolve);
      let submitted = 0;
      let secondSeen;
      const second = new Promise(resolve => secondSeen = resolve);
      await page.setRequestInterception(true);
      const onRequest = req => {
        if (req.isInterceptResolutionHandled()) return;
        if (req.method() === 'POST' && req.url().includes('/api/pilot/gusek/szakmai')) {
          submitted++;
          if (submitted === 1) { firstPost = req; firstSeen(); return; }
          secondSeen();
        }
        req.continue().catch(() => {});
      };
      page.on('request', onRequest);
      try {
        await clickText(page, 'Matematikai modell és optimum ellenőrzése');
        await Promise.race([captured, delay(10000).then(() => {throw Error('FIRST_POST_NOT_OBSERVED')})]);
        await replace(page, '#or-obj', Number(solution.objective) + 1);
        await replace(page, '#or-obj', solution.objective);
        await clickText(page, 'Matematikai modell és optimum ellenőrzése');
        await Promise.race([second, delay(10000).then(() => {throw Error('SECOND_POST_BLOCKED_BY_STALE_ACTIVE')})]);
        await page.waitForFunction(() => document.querySelector('[data-testid="or-grade"] h2')?.textContent?.trim() === '1/1', {timeout: 10000});
        if (firstPost && !firstPost.isInterceptResolutionHandled()) await firstPost.abort('failed').catch(() => {});
        await delay(120);
        assert.equal(await page.$eval('[data-testid="or-grade"] h2', e => e.textContent.trim()), '1/1');
        console.log('R16_15_REAL_BROWSER_STALE_SUBMISSION_RACE=PASS');
      } finally {
        if (firstPost && !firstPost.isInterceptResolutionHandled()) await firstPost.abort('failed').catch(() => {});
        page.off('request', onRequest);
        await page.setRequestInterception(false);
      }
    }

    await page.click('input[type=checkbox]');
    await grade(page, '0/1');
    console.log(`R16_14_UI_${kind.toUpperCase()}_ASSISTED_ZERO=PASS`);
    await page.click('input[type=checkbox]');
    await replace(page, '#or-model', 'invalid syntax;');
    await grade(page, 'not-full');
    console.log(`R16_14_UI_${kind.toUpperCase()}_BAD_MODEL_NO_FULL=PASS`);
  }
  await replace(page, 'input[inputmode=numeric]', '-1');
  await clickText(page, 'Feladat betöltése');
  await page.waitForSelector('[role=alert]', {timeout: 10000});
  assert.match(await page.$eval('[role=alert]', el => el.textContent), /variáns|0 és/);
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
  console.log('R16_14_UI_INVALID_SEED=PASS');
  console.log('R16_14_REAL_BROWSER_USER_JOURNEY=PASS');
  console.log('MERGE_RELEASE=NO_GO');
} catch (error) {
  console.error('R16_14_UI=FAIL_OR_BLOCKED', error?.stack || String(error));
  console.error('NEXT_LOG_LAST_4000=', serverLog);
  if (errors.length) console.error('BROWSER_PAGE_ERRORS=', errors);
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  rmSync(profile, {recursive: true, force: true});
}
