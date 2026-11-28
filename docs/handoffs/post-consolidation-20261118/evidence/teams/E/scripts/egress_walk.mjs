// Team E: browser egress + storage walk over the built lean Pages artifact (served like GitHub Pages under /GhostPay/).
// Usage: node egress_walk.mjs <wtRoot> <siteDir> <profileDir> <outJson>
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [wt, site, profile, out] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(join(wt, 'node_modules/playwright-core/index.mjs')).href);
const PORT = 47123;
const BASE = `http://127.0.0.1:${String(PORT)}/GhostPay/`;
const server = spawn(process.execPath, [join(wt, 'scripts/pages/serve-pages.mjs'), site, '--port', String(PORT), '--base', '/GhostPay/'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => setTimeout(r, 1200));

const report = { base: BASE, steps: [], requests: [], foreign: [], outsideBase: [], consoleMsgs: [], pageErrors: [] };
const ctx = await chromium.launchPersistentContext(profile, { executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
try {
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    const url = new URL(u);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    if (u.startsWith(BASE)) return route.continue();
    report.foreign.push({ url: u, method: route.request().method(), type: route.request().resourceType() });
    return route.abort();
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('request', (r) => {
    const u = r.url();
    report.requests.push({ url: u, method: r.method(), type: r.resourceType() });
    if (u.startsWith(`http://127.0.0.1:${String(PORT)}/`) && !u.startsWith(BASE)) report.outsideBase.push(u);
  });
  page.on('console', (m) => report.consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => report.pageErrors.push(String(e).slice(0, 300)));

  // 1. Open with an invoice-shaped fragment (content irrelevant: clearing keys on the prefix only).
  const FRAG = '#gpi=v1.TEAME-PROBE-FRAGMENT-AAAAAAAAAAAAAAAAAAAA';
  await page.goto(BASE + FRAG, { waitUntil: 'load' });
  await page.getByRole('navigation', { name: 'Main' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);
  report.steps.push({ step: 'open-with-fragment', href: page.url(), historyLength: await page.evaluate(() => history.length) });

  // 2. Walk every lean nav view.
  const labels = (await page.getByRole('navigation', { name: 'Main' }).getByRole('button').allTextContents()).map((s) => s.trim());
  report.navLabels = labels;
  for (const l of labels) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: l, exact: true }).click();
    await page.waitForTimeout(1200);
    report.steps.push({ step: `view:${l}`, requestsSoFar: report.requests.length, foreignSoFar: report.foreign.length });
  }

  // 3. Seller keys: generate keys in memory, then inspect storage for anything secret-shaped.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await page.waitForTimeout(800);
  const gen = page.getByRole('button', { name: 'Generate new keys' });
  if (await gen.count()) { await gen.first().click(); await page.waitForTimeout(1500); report.steps.push({ step: 'generate-keys', ok: true }); }
  else report.steps.push({ step: 'generate-keys', ok: false });

  // 4. Settings: type an RPC URL and save (no Test click): does saving alone contact it?
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(800);
  const rpcInputs = page.locator('fieldset').filter({ hasText: 'RPC endpoints' }).locator('input[type="url"]');
  report.rpcInputs = await rpcInputs.count();
  if (report.rpcInputs > 0) {
    await rpcInputs.first().fill('https://rpc-probe.example.invalid/teamE');
    const before = report.foreign.length;
    await page.getByRole('button', { name: 'Save settings' }).first().click();
    await page.waitForTimeout(2000);
    report.steps.push({ step: 'save-rpc', foreignAfterSave: report.foreign.length - before });
    // Visit views that may use the RPC automatically after saving.
    for (const l of ['Home', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Create invoice']) {
      const b0 = report.foreign.length;
      await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: l, exact: true }).click();
      await page.waitForTimeout(1500);
      report.steps.push({ step: `after-rpc:${l}`, newForeign: report.foreign.slice(b0).map((f) => f.url) });
    }
    // Explicit Test click (user action) should contact it.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForTimeout(600);
    const b1 = report.foreign.length;
    const testBtn = page.getByRole('button', { name: /^Test / }).first();
    if (await testBtn.count()) { await testBtn.click(); await page.waitForTimeout(2500); }
    report.steps.push({ step: 'click-test-rpc', newForeign: report.foreign.slice(b1).map((f) => `${f.method} ${f.url}`) });
  }

  // 5. Storage, cookies, service workers.
  report.storage = await page.evaluate(async () => {
    const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) ?? '').slice(0, 400); }
    const ss = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = (sessionStorage.getItem(k) ?? '').slice(0, 400); }
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'n/a';
    const sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 'n/a';
    const cacheKeys = typeof caches !== 'undefined' ? await caches.keys() : 'n/a';
    return { localStorage: ls, sessionStorage: ss, indexedDB: dbs, serviceWorkers: sw, cacheStorage: cacheKeys, cookie: document.cookie, href: location.href };
  });
  const allStorage = JSON.stringify(report.storage);
  report.secretShapedInStorage = /[0-9a-f]{64}/i.test(JSON.stringify({ ...report.storage.localStorage, ...report.storage.sessionStorage }).replace(/"ghostpay\.scan\.checkpoint\.v2\.[^"]*"/g, ''));
  report.fragmentInStorage = allStorage.includes('TEAME-PROBE');
} finally {
  await ctx.close();
  server.kill();
}
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ requests: report.requests.length, foreign: report.foreign, outsideBase: report.outsideBase, steps: report.steps, storage: report.storage, pageErrors: report.pageErrors, rpcInputs: report.rpcInputs }, null, 1));
