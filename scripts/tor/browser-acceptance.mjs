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
const archiveSha256 = createHash('sha256').update(await readFile(archive)).digest('hex');
const servers = [];
let browser;
const report = { format: 'ghostpay-static-hosting-browser/1', archiveSha256, browser: null, cases: [],
  limits: ['Ordinary Chromium on loopback, not Tor Browser or live onion acceptance.',
    'No external wallet, public RPC, chain payment or real funds.',
    'Invoice transfer uses the existing signed link; invoice-file export/import is not implemented in this source.',
    'Encrypted keystore recovery does not establish recovery of an interrupted or submitted payment.',
    'The narrow viewport checks mobile layout only; no real mobile device or mobile Tor Browser was exercised.',
    'Observed HTTP(S) requests and WebSocket attempts are checked; browser/extension traffic is outside this fixture.'] };

const BACKUP_PASSPHRASE = 'hosting fixture amber falcon quiet meadow';
const VAULT_PASSPHRASE = 'hosting fixture violet comet maple harbor';
const INVOICE_PASSPHRASE = 'hosting fixture cedar orbit velvet lantern';
const WRONG_PASSPHRASE = 'hosting fixture deliberately wrong phrase';
const keysView = (page) => page.locator('section[aria-labelledby="keys-h"]');
const navigation = (page) => page.getByRole('navigation', { name: 'Main' });
const waitForKdf = (locator) => locator.waitFor({ timeout: 60_000 });

async function publicIdentity(page) {
  const keys = keysView(page);
  const meta = keys.locator('code', { hasText: /^st:eth:0x/ });
  const signer = keys.locator('code', { hasText: /^0[23][0-9a-f]{64}$/ });
  await meta.waitFor();
  await signer.waitFor();
  return { meta: await meta.textContent(), signer: await signer.textContent() };
}

async function exportAndVerifyBackup(page) {
  const keys = keysView(page);
  await keys.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(BACKUP_PASSPHRASE);
  await keys.getByLabel('Repeat passphrase', { exact: true }).fill(BACKUP_PASSPHRASE);
  const pending = page.waitForEvent('download', { timeout: 60_000 });
  await keys.getByRole('button', { name: 'Download encrypted keystore', exact: true }).click();
  const download = await pending;
  let encrypted;
  try {
    const path = await download.path();
    assert(path, 'encrypted backup download was not available');
    encrypted = await readFile(path, 'utf8');
  } finally {
    // Synthetic ciphertext is used in memory only and is never added to the qualification report.
    await download.delete();
  }
  await waitForKdf(keys.getByText(/^Encrypted keystore downloaded\./));
  assert.equal(await keys.getByLabel('Passphrase (at least 14 characters)', { exact: true }).inputValue(), '');
  assert(Buffer.byteLength(encrypted, 'utf8') <= 8 * 1024, 'backup exceeded the product size bound');
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.kdf, 'scrypt');
  assert.equal(envelope.kdfParams.N, 131072);
  assert.equal(envelope.kdfParams.r, 8);
  assert.equal(envelope.kdfParams.p, 1);
  assert.equal(envelope.cipher, 'AES-256-GCM');
  assert(!encrypted.includes(BACKUP_PASSPHRASE), 'backup retained its passphrase');
  await keys.getByLabel('Downloaded keystore file', { exact: true }).setInputFiles({
    name: 'synthetic-hosting-backup.json', mimeType: 'application/json', buffer: Buffer.from(encrypted, 'utf8'),
  });
  await keys.getByLabel('Keystore passphrase', { exact: true }).fill(BACKUP_PASSPHRASE);
  await keys.getByRole('button', { name: 'Verify backup', exact: true }).click();
  await waitForKdf(keys.getByText('Backup verified: the file decrypts and holds exactly the loaded keys. Keep the file and its passphrase safe: neither can be recovered.', { exact: true }));
  const identity = await publicIdentity(page);
  assert.equal(envelope.meta.metaAddress, identity.meta);
  assert.equal(envelope.meta.signer, identity.signer);
  return { encrypted, identity };
}

async function createProtectedInvoice(page, url) {
  await navigation(page).getByRole('button', { name: 'Create invoice', exact: true }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount', { exact: true }).fill('0.5');
  await page.getByLabel('Item 1 description', { exact: true }).fill('Synthetic hosting invoice detail');
  await page.getByLabel('Item 1 unit price', { exact: true }).fill('50.00');
  await page.getByLabel('Protect the entire invoice with a passphrase', { exact: true }).check();
  await page.getByLabel('Invoice passphrase (at least 14 characters)', { exact: true }).fill(INVOICE_PASSPHRASE);
  await page.getByLabel('Repeat invoice passphrase', { exact: true }).fill(INVOICE_PASSPHRASE);
  await page.getByRole('button', { name: 'Create invoice link', exact: true }).click();
  const linkBox = page.getByRole('textbox', { name: 'Link', exact: true });
  await waitForKdf(linkBox);
  const link = await linkBox.inputValue();
  const parsed = new URL(link);
  assert.equal(parsed.origin, new URL(url).origin);
  assert.equal(parsed.pathname, new URL(url).pathname);
  assert(parsed.hash.startsWith('#gpi=v1.'), 'product did not export a signed invoice link');
  assert.equal(parsed.search, '', 'invoice export unexpectedly added a query string');
  return link;
}

async function importProtectedInvoice(page, link) {
  await page.goto(link, { waitUntil: 'networkidle' });
  await page.getByLabel('Invoice passphrase', { exact: true }).waitFor();
  assert.equal(await page.getByText('Synthetic hosting invoice detail', { exact: true }).count(), 0);
  await page.getByLabel('Invoice passphrase', { exact: true }).fill(WRONG_PASSPHRASE);
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await waitForKdf(page.getByRole('alert'));
  assert.equal(await page.getByRole('heading', { name: 'Review payment', exact: true }).count(), 0);
  assert.equal(await page.getByText('Synthetic hosting invoice detail', { exact: true }).count(), 0);
  await page.getByLabel('Invoice passphrase', { exact: true }).fill(INVOICE_PASSPHRASE);
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await waitForKdf(page.getByRole('heading', { name: 'Review payment', exact: true }));
  await page.getByText('Synthetic hosting invoice detail', { exact: true }).waitFor();
  await page.getByText(/^Signature matches key .+ \(not pinned\)\./).waitFor();
  assert.equal(new URL(page.url()).hash, '', 'opened invoice was not cleared from the address bar');
}

async function importBackup(page, encrypted, passphrase) {
  const keys = keysView(page);
  const input = keys.getByLabel('Keystore file', { exact: true });
  if (!await input.isVisible()) await keys.getByText('Import an encrypted keystore', { exact: true }).click();
  await input.setInputFiles({ name: 'synthetic-hosting-backup.json', mimeType: 'application/json', buffer: Buffer.from(encrypted, 'utf8') });
  await keys.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await keys.getByRole('button', { name: 'Decrypt and load', exact: true }).click();
}

async function restoreAndReload(page, backup) {
  await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await keysView(page).getByRole('button', { name: 'Generate new keys', exact: true }).waitFor();
  assert.equal(await keysView(page).locator('code', { hasText: /^st:eth:0x/ }).count(), 0);
  await importBackup(page, backup.encrypted, WRONG_PASSPHRASE);
  await waitForKdf(keysView(page).getByText(/Wrong passphrase/));
  assert.equal(await keysView(page).locator('code', { hasText: /^st:eth:0x/ }).count(), 0);
  await importBackup(page, backup.encrypted, BACKUP_PASSPHRASE);
  await waitForKdf(keysView(page).getByText('Keystore decrypted; keys are in memory.', { exact: true }));
  assert.deepEqual(await publicIdentity(page), backup.identity, 'backup restored a different public identity');
  const keys = keysView(page);
  await keys.getByLabel('New vault passphrase (14+ characters)', { exact: true }).fill(VAULT_PASSPHRASE);
  await keys.getByLabel('Repeat vault passphrase', { exact: true }).fill(VAULT_PASSPHRASE);
  await keys.getByRole('button', { name: 'Save encrypted vault in this browser', exact: true }).click();
  await waitForKdf(keys.getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true }));
  assert.equal(await page.evaluate((passphrases) => {
    const stored = JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]);
    return passphrases.some((passphrase) => stored.includes(passphrase));
  }, [BACKUP_PASSPHRASE, VAULT_PASSPHRASE, INVOICE_PASSPHRASE]), false, 'web storage retained a fixture passphrase');
  await page.reload({ waitUntil: 'networkidle' });
  await navigation(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await keys.getByRole('button', { name: 'Unlock saved vault', exact: true }).waitFor();
  assert.equal(await keys.locator('code', { hasText: /^st:eth:0x/ }).count(), 0, 'reload exposed unlocked keys');
  await keys.getByLabel('Vault passphrase', { exact: true }).fill(WRONG_PASSPHRASE);
  await keys.getByRole('button', { name: 'Unlock saved vault', exact: true }).click();
  await waitForKdf(keys.getByRole('alert'));
  assert.equal(await keys.locator('code', { hasText: /^st:eth:0x/ }).count(), 0);
  await keys.getByLabel('Vault passphrase', { exact: true }).fill(VAULT_PASSPHRASE);
  await keys.getByRole('button', { name: 'Unlock saved vault', exact: true }).click();
  await waitForKdf(keys.getByRole('heading', { name: 'Your meta-address (public)', exact: true }));
  assert.deepEqual(await publicIdentity(page), backup.identity, 'saved vault changed the restored identity');
  assert.equal(await keys.getByLabel('Vault passphrase', { exact: true }).inputValue(), '');
}

try {
  // Both listeners remain open to guarantee distinct ports/origins.
  for (const basePath of ['/', '/mirror/ghostpay/']) {
    servers.push({ basePath, server: await runPreview(archive,
      { port: '0', 'base-path': basePath, 'expect-sha256': archiveSha256 }) });
  }
  assert.notEqual(new URL(servers[0].server.url).origin, new URL(servers[1].server.url).origin);
  browser = await chromium.launch(process.env.GHOSTPAY_CHROMIUM ? { executablePath: process.env.GHOSTPAY_CHROMIUM } : {});
  report.browser = { name: 'chromium', version: browser.version() };
  const context = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block', acceptDownloads: true });
  const webSockets = [];
  await context.routeWebSocket('**/*', (socket) => {
    webSockets.push(new URL(socket.url()).origin);
    socket.close();
  });
  for (const { server, basePath } of servers) {
    const url = new URL(basePath, server.url).href;
    const origin = new URL(url).origin;
    const viewport = basePath === '/' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const requests = [], external = [], problems = [];
    let failHash = false, failedHashAttempts = 0;
    let expectedFailedHashConsoleUrl, expectedFailedHashConsoles = 0;
    const routeRequest = async (route) => {
      const request = route.request(), target = new URL(request.url());
      if (target.origin !== origin) {
        external.push(`${target.protocol}//${target.host}${target.pathname}`);
        return route.abort();
      }
      requests.push({ path: target.pathname, method: request.method(), type: request.resourceType() });
      assert(target.pathname.startsWith(basePath), 'request escaped the configured subpath');
      if (failHash && request.resourceType() === 'fetch' && /\/assets\/index[^/]*\.js$/.test(target.pathname)) {
        failedHashAttempts++;
        expectedFailedHashConsoleUrl = request.url();
        expectedFailedHashConsoles++;
        return route.abort('connectionrefused');
      }
      return route.continue();
    };
    await context.route('**/*', routeRequest);
    // Record fixed error labels only; never copy console payloads or request bodies.
    const observePage = (observed) => {
      observed.on('pageerror', () => problems.push('unhandled-page-error'));
      observed.on('console', (m) => {
        if (m.type() !== 'error') return;
        // Ignore only the browser's one expected diagnostic for a request we deliberately refused.
        // Its event may arrive after the hash-failure UI, so matching does not depend on failHash timing.
        if (expectedFailedHashConsoles > 0 && m.location().url === expectedFailedHashConsoleUrl &&
            m.text() === 'Failed to load resource: net::ERR_CONNECTION_REFUSED') {
          expectedFailedHashConsoles--;
          return;
        }
        problems.push('console-error');
      });
      observed.on('response', (r) => { if (r.status() >= 400) problems.push(`http-${r.status()}`); });
    };
    observePage(page);
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
    await page.getByText('Scan privacy settings saved. They apply to the next scan.', { exact: true }).waitFor();
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
    failHash = false;
    // Synthetic keys remain entirely in a disposable page; no private key is read into the test runner.
    await nav.getByRole('button', { name: 'Seller keys', exact: true }).click();
    await page.getByRole('button', { name: 'Generate new keys', exact: true }).click();
    await page.getByLabel(/To continue without a backup, type/).waitFor();
    const backup = await exportAndVerifyBackup(page);
    const invoiceLink = await createProtectedInvoice(page, url);
    // An independent browser context proves the transfer does not rely on the source tab's keys or storage.
    const restored = await browser.newContext({ locale: 'en-US', serviceWorkers: 'block', acceptDownloads: true, viewport });
    try {
      await restored.route('**/*', routeRequest);
      await restored.routeWebSocket('**/*', (socket) => { webSockets.push(new URL(socket.url()).origin); socket.close(); });
      const recipient = await restored.newPage();
      observePage(recipient);
      await importProtectedInvoice(recipient, invoiceLink);
      await restoreAndReload(recipient, backup);
    } finally {
      await restored.close();
    }
    assert.deepEqual(external, [], 'unexpected external request');
    assert.deepEqual(webSockets, [], 'unexpected WebSocket attempt');
    assert.deepEqual(problems, []);
    report.cases.push({ basePath, origin, viewport, layout: basePath === '/' ? 'desktop' : 'mobile-width', checks: ['render', 'CSP/headers', 'WebCrypto', 'storage separation',
      'Tor preference persistence', 'no hash fallback', 'local key generation', 'encrypted keystore export and verification',
      'signed passphrase invoice link transfer', 'wrong invoice passphrase refusal', 'independent encrypted backup restoration',
      'wrong backup passphrase refusal', 'encrypted vault reload and unlock', 'wrong vault passphrase refusal'], requestCount: requests.length,
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
