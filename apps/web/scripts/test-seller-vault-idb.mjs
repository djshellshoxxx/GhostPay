/** Local Chromium defensive check of the real seller-vault IndexedDB adapter across two tabs. No wallets or RPCs. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 4194, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.GHOSTPAY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  const unexpected = [];
  for (const page of pages) {
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4194') return route.continue();
      unexpected.push(url.origin);
      return route.abort();
    });
    await page.goto('http://127.0.0.1:4194/');
    await page.evaluate(async () => {
      const { IndexedDbKeyVaultStore } = await import('/src/lib/keyVault.ts');
      window.sellerVaultForTest = new IndexedDbKeyVaultStore();
    });
  }
  const [tabA, tabB] = pages;
  const read = (page) => page.evaluate(() => window.sellerVaultForTest.get());
  const put = (page, value) => page.evaluate((value) => window.sellerVaultForTest.putIfEmpty(value, () => {}), value);
  const del = (page, expected) => page.evaluate(async (expected) => {
    try { await window.sellerVaultForTest.delete(expected); return 'deleted'; } catch (error) { return error.name; }
  }, expected);

  assert.equal(await read(tabA), undefined, 'fresh browser context starts without a vault');

  // V1: a save whose session is revoked while the write is pending must abort inside the transaction.
  const stale = await tabA.evaluate(async () => {
    let calls = 0;
    try {
      await window.sellerVaultForTest.putIfEmpty('stale ciphertext', () => {
        if (++calls > 1) throw new Error('session revoked while the IndexedDB add was pending');
      });
      return { rejected: false, calls };
    } catch { return { rejected: true, calls }; }
  });
  assert.equal(stale.rejected, true, 'stale save must reject');
  assert.equal(stale.calls, 2, 'guard must run after DB open and again inside the transaction');
  assert.equal(await read(tabB), undefined, 'aborted save must leave the store empty for every tab');

  // V2: tab B opens a delete confirmation for A; tab A replaces A with B; tab B's stale confirm must not delete B.
  await put(tabA, 'ciphertext-a');
  const confirmedInB = await read(tabB);
  assert.equal(confirmedInB, 'ciphertext-a');
  assert.equal(await del(tabA, 'ciphertext-a'), 'deleted');
  await put(tabA, 'ciphertext-b');
  assert.equal(await del(tabB, confirmedInB), 'VaultChangedError', 'stale confirmation must report a changed vault');
  assert.equal(await read(tabA), 'ciphertext-b', 'replacement must survive byte-for-byte');

  // Concurrent stale confirmations from both tabs against the current record: exactly one deletes, B is not recreated.
  const race = await Promise.all([del(tabA, 'ciphertext-b'), del(tabB, 'ciphertext-b')]);
  assert.deepEqual(race.slice().sort(), ['VaultChangedError', 'deleted'], 'exactly one tab may delete the confirmed record');
  assert.equal(await read(tabB), undefined);
  await put(tabB, 'ciphertext-c');
  assert.equal(await del(tabA, 'ciphertext-b'), 'VaultChangedError', 'a repeated confirm cannot delete a later vault');
  assert.equal(await read(tabA), 'ciphertext-c');

  assert.deepEqual(unexpected, [], 'local-only browser test must not contact external origins');
  await context.close();
  console.log('PASS: Chromium seller vault two-tab compare-and-delete, stale-session save abort, no external egress.');
} finally {
  await browser?.close();
  await server.close();
}
