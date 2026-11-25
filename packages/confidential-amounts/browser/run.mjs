#!/usr/bin/env node
// P13 browser qualification: bundles browser/harness.ts with Vite, serves it from 127.0.0.1 with a self-only CSP,
// runs two phases in Chromium across a real page reload and asserts persistence, reconciliation, ciphertext-only
// storage, wrong-key refusal, backup restore and zero third-party egress. Local only; no network beyond loopback.
// Usage: npm run test:browser -w @ghostpay/confidential-amounts   (GHOSTPAY_CHROMIUM=/path/to/chrome to override)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'p13-browser-'));
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";

const candidates = [process.env.GHOSTPAY_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'];
const executablePath = candidates.find((p) => typeof p === 'string' && existsSync(p));

let server;
let browser;
try {
  await build({
    configFile: false,
    root: here,
    logLevel: 'warn',
    build: {
      outDir: out,
      emptyOutDir: true,
      minify: false,
      target: 'es2022',
      lib: { entry: join(here, 'harness.ts'), formats: ['es'], fileName: () => 'harness.js' },
    },
  });
  const files = {
    '/': ['text/html', '<!doctype html><meta charset="utf-8"><title>P13</title><script type="module" src="/harness.js"></script>'],
    '/harness.js': ['text/javascript', readFileSync(join(out, 'harness.js'), 'utf8')],
  };
  server = createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const f = files[req.url ?? ''];
    if (f === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': f[0], 'content-security-policy': CSP, 'cache-control': 'no-store' }).end(f[1]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  const requests = [];
  const problems = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));

  await page.goto(`${origin}/`);
  await page.waitForFunction(() => globalThis.p13Ready === true);
  const ids = await page.evaluate(() => globalThis.p13.phase1());
  await page.reload();
  await page.waitForFunction(() => globalThis.p13Ready === true);
  const r = await page.evaluate((x) => globalThis.p13.phase2(x), ids);

  const foreign = requests.filter((u) => !u.startsWith(`${origin}/`));
  const result = { browser: browser.version(), settlementGate: ids.settlementGate, ...r, requests: requests.length, foreign, problems };
  console.log(JSON.stringify(result, null, 2));

  assert.equal(ids.settlementGate, 'P13_SETTLEMENT_DISABLED');
  assert.equal(r.exportable, false, 'persisted record key must be non-extractable');
  assert.equal(r.keyType, 'AES-GCM/256/false');
  assert.deepEqual(r.report, { total: 2, invalidatedReviews: 1, stalePlans: 1, needsReconciliation: 1, corrupt: 0 });
  assert.equal(r.reviewedState, 'prepared', 'review from the previous session must be invalidated');
  assert.equal(r.submittedState, 'unknown', 'interrupted submission must become unknown, never resent');
  assert.equal(r.submittedReason, 'reloaded');
  assert.equal(r.grossMatches, true);
  assert.equal(r.storedValues, 2);
  assert.deepEqual(r.leaks, [], 'IndexedDB must hold ciphertext only');
  assert.deepEqual(r.backupLeaks, [], 'backup must hold ciphertext only');
  assert.equal(r.wrongKey, 'P13_RECORD_AUTH');
  assert.deepEqual(r.imported, { inserted: 2, replacedOlder: 0, keptNewerOrEqual: 0, conflicts: 0 });
  assert.equal(r.restoredGross, true);
  assert.equal(r.localStorage, 0);
  assert.equal(r.sessionStorage, 0);
  assert.deepEqual(foreign, [], 'no request may leave the local origin');
  assert.deepEqual(problems, []);

  // Phase 3: two real tabs (same origin, shared IndexedDB) race the same review; the IndexedDB CAS must admit one.
  const tabB = await page.context().newPage();
  tabB.on('pageerror', (e) => problems.push(`pageerror(B): ${e.message}`));
  tabB.on('request', (q) => requests.push(q.url()));
  await tabB.goto(`${origin}/`);
  await tabB.waitForFunction(() => globalThis.p13Ready === true);
  const ROUNDS = 25;
  const raceIds = await page.evaluate((n) => globalThis.p13.raceSetup(n), ROUNDS);
  const race = { rounds: ROUNDS, bothOk: 0, oneOk: 0, noneOk: 0, loserCodes: new Set() };
  for (const id of raceIds) {
    const [a, b] = await Promise.all([page.evaluate((x) => globalThis.p13.raceReview(x), id), tabB.evaluate((x) => globalThis.p13.raceReview(x), id)]);
    const oks = [a, b].filter((x) => x === 'ok').length;
    if (oks === 2) race.bothOk += 1;
    else if (oks === 1) race.oneOk += 1;
    else race.noneOk += 1;
    for (const x of [a, b]) if (x !== 'ok') race.loserCodes.add(x);
    const seenA = await page.evaluate((x) => globalThis.p13.raceState(x), id);
    const seenB = await tabB.evaluate((x) => globalThis.p13.raceState(x), id);
    assert.deepEqual(seenA, { state: 'reviewed', revision: 2 }, 'tab A must see exactly one committed review');
    assert.deepEqual(seenB, seenA, 'both tabs must agree on the stored record');
  }
  // Phase 4: browser stress (IndexedDB + WebCrypto at volume).
  const STRESS_N = Number(process.env.P13_BROWSER_STRESS ?? 300);
  const stress = await page.evaluate((n) => globalThis.p13.stress(n), STRESS_N);
  console.log(JSON.stringify({ race: { ...race, loserCodes: [...race.loserCodes] }, stress }, null, 2));
  assert.equal(race.bothOk, 0, 'two tabs must never both commit the same revision');
  assert.equal(race.noneOk, 0, 'one of the two tabs must win each round');
  assert.equal(race.oneOk, ROUNDS);
  assert.deepEqual([...race.loserCodes], ['P13_RECORD_CONFLICT']);
  assert.equal(stress.listed, STRESS_N);
  assert.equal(stress.exported, STRESS_N);
  assert.equal(stress.inserted, STRESS_N);
  assert.equal(stress.stalePlans, STRESS_N);
  assert.ok(stress.prepareMs < 120_000 && stress.importMs < 120_000, 'stress budget exceeded');
  assert.deepEqual(requests.filter((u) => !u.startsWith(`${origin}/`)), [], 'no request may leave the local origin');
  assert.deepEqual(problems, []);
  console.log('P13 browser qualification: PASS');
} finally {
  await browser?.close();
  server?.close();
  rmSync(out, { recursive: true, force: true });
}
