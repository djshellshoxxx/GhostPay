#!/usr/bin/env node
// Actual static app, offline Chromium. These checks do not establish Tor routing or Tor Browser support.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { chromium } from 'playwright-core';
import { runPreview } from '../../tools/portable-hosting-kit/src/cli.mjs';

const [archive, reportPath, ...extra] = process.argv.slice(2);
assert(archive && reportPath && isAbsolute(archive) && isAbsolute(reportPath) && !extra.length,
  'Usage: node scripts/tor/browser-acceptance.mjs /absolute/site.zip /absolute/new-report.json');
// Assert the message the English source catalog actually supplies to Settings; never let a stale literal mask a save failure.
const locale = JSON.parse(await readFile(new URL('../../apps/web/locales/en.json', import.meta.url), 'utf8'));
const scanPrivacySavedMessage = locale.messages?.['settings.scanPrivacy.saved'];
assert.equal(typeof scanPrivacySavedMessage, 'string', 'missing English scan-privacy save confirmation');
assert(scanPrivacySavedMessage.length > 0, 'empty English scan-privacy save confirmation');
const archiveSha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
const servers = [];
let browser;
const report = { format: 'ghostpay-static-hosting-browser/1', archiveSha256, browser: null, cases: [],
  limits: ['Ordinary Chromium on loopback, not Tor Browser or live onion acceptance.',
    'No external wallet, public RPC, chain payment or real funds.',
    'Observed HTTP(S) requests and WebSocket attempts are checked; browser/extension traffic is outside this fixture.'] };
try {
  // Both listeners remain open to guarantee distinct ports/origins.
  for (const basePath of ['/', '/mirror/ghostpay/']) {
    servers.push({ basePath, server: await runPreview(archive,
      { port: '0', 'base-path': basePath, 'expect-sha256': archiveSha256 }) });
  }
  assert.notEqual(new URL(servers[0].server.url).origin, new URL(servers[1].server.url).origin);
  browser = await chromium.launch(process.env.GHOSTPAY_CHROMIUM ? { executablePath: process.env.GHOSTPAY_CHROMIUM } : {});
  report.browser = { name: 'chromium', version: browser.version() };
  const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block' });
  const webSockets = [];
  await context.routeWebSocket('**/*', (socket) => {
    webSockets.push(new URL(socket.url()).origin);
    socket.close();
  });
  for (const { server, basePath } of servers) {
    const url = new URL(basePath, server.url).href;
    const origin = new URL(url).origin;
    const page = await context.newPage();
    const requests = [], external = [], problems = [];
    let failHash = false, failedHashAttempts = 0;
    await context.route('**/*', async (route) => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== origin) {
        external.push(`${target.protocol}//${target.host}${target.pathname}`);
        return route.abort();
      }
      requests.push({ path: target.pathname, method: request.method(), type: request.resourceType() });
      assert(target.pathname.startsWith(basePath), 'request escaped the configured subpath');
      if (failHash && request.resourceType() === 'fetch' && /\/assets\/index[^/]*\.js$/.test(target.pathname)) {
        failedHashAttempts++;
        return route.abort('connectionrefused');
      }
      return route.continue();
    });
    // Record fixed error labels only; never copy console payloads or request bodies.
    page.on('pageerror', () => problems.push('unhandled-page-error'));
    page.on('console', (m) => { if (m.type() === 'error' && !failHash) problems.push('console-error'); });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http-${r.status()}`); });
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    assert(response?.ok(), 'entrypoint failed');
    const headers = await response.allHeaders();
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.match(headers['content-security-policy'] ?? '', /frame-ancestors 'none'/);
    assert.match(headers['content-security-policy'] ?? '', /object-src 'none'/);
    assert.equal(headers['referrer-policy'], 'no-referrer');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.waitFor();
    await page.getByText(/^[0-9a-f]{64}$/, { exact: false }).first().waitFor();
    const facts = await page.evaluate(async () => ({ secure: isSecureContext,
      digestBytes: (await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hosting-acceptance'))).byteLength,
      marker: localStorage.getItem('ghostpay.hosting.acceptance') }));
    assert.equal(facts.secure, true);
    assert.equal(facts.digestBytes, 32);
    assert.equal(facts.marker, null, 'storage crossed origin boundary');
    await page.evaluate(() => localStorage.setItem('ghostpay.hosting.acceptance', 'synthetic-local-marker'));
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    const transport = page.getByLabel('Scan transport', { exact: true });
    assert.equal(await transport.inputValue(), 'direct');
    await transport.selectOption('tor-browser');
    await page.getByRole('button', { name: 'Save scan privacy', exact: true }).click();
    await page.getByText(scanPrivacySavedMessage, { exact: true }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await nav.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await page.getByLabel('Scan transport', { exact: true }).inputValue(), 'tor-browser');
    assert.deepEqual(problems, []);
    // A missing integrity read must remain unavailable without changing the saved transport or falling back.
    failHash = true;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByText('not available in this environment', { exact: false }).waitFor();
    assert.equal(failedHashAttempts, 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ghostpay.scanPrivacy.v1') ?? '{}').transport), 'tor-browser');
    // Synthetic keys remain entirely in a disposable page; no private key is read into the test runner.
    await nav.getByRole('button', { name: 'Seller keys', exact: true }).click();
    await page.getByRole('button', { name: 'Generate new keys', exact: true }).click();
    await page.getByLabel(/To continue without a backup, type/).waitFor();
    assert.deepEqual(external, [], 'unexpected external request');
    assert.deepEqual(webSockets, [], 'unexpected WebSocket attempt');
    assert.deepEqual(problems, []);
    report.cases.push({ basePath, origin, checks: ['render', 'CSP/headers', 'WebCrypto', 'storage separation',
      'Tor preference persistence', 'no hash fallback', 'local key generation'], requestCount: requests.length,
      requests: [...new Map(requests.map((r) => [JSON.stringify(r), r])).values()], externalRequestAttempts: 0 });
    await page.close({ runBeforeUnload: false });
    await context.unrouteAll({ behavior: 'wait' });
  }
  await context.close();
  await writeFile(reportPath, `${JSON.stringify({ ...report, status: 'passed' }, null, 2)}\n`, { flag: 'wx' });
  console.log(`Static browser acceptance passed: ${report.cases.length} origins; archive SHA-256 ${archiveSha256}`);
} finally {
  await browser?.close();
  for (const { server } of servers) await server.close();
}
