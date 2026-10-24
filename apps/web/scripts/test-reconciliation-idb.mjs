/** Local Chromium defensive check of the real IndexedDB adapter across two tabs. No wallets or RPCs. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 4193, strictPort: true } });
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
      if (url.origin === 'http://127.0.0.1:4193') return route.continue();
      unexpected.push(url.origin);
      return route.abort();
    });
    await page.goto('http://127.0.0.1:4193/');
    await page.evaluate(async () => {
      const { IdbReconciliationVaultStore } = await import('/src/lib/reconciliationVault.ts');
      window.vaultStoreForTest = new IdbReconciliationVaultStore();
    });
  }
  const key = `defensive-cas-${Date.now()}`;
  const noGuard = '(guard executed inside the transaction)';
  assert.equal(await pages[0].evaluate(async ({ key }) => window.vaultStoreForTest.compareAndSwap(key, null, 'ciphertext-a', () => {}), { key }), true);
  assert.equal(await pages[1].evaluate(async ({ key }) => window.vaultStoreForTest.compareAndSwap(key, null, 'unexpected overwrite', () => {}), { key }), false);
  const race = await Promise.all(pages.map((page, index) => page.evaluate(async ({ key, index }) => window.vaultStoreForTest.compareAndSwap(key, 'ciphertext-a', `ciphertext-${index}`, () => {}), { key, index })));
  assert.equal(race.filter(Boolean).length, 1, 'exactly one tab may replace the expected ciphertext');
  const before = await pages[0].evaluate(async (key) => window.vaultStoreForTest.read(key), key);
  const stale = await pages[1].evaluate(async ({ key, before }) => {
    let calls = 0;
    try {
      await window.vaultStoreForTest.compareAndSwap(key, before, 'stale ciphertext', () => {
        if (++calls > 1) throw new Error('session changed while IndexedDB request was pending');
      });
      return { rejected: false, calls };
    } catch { return { rejected: true, calls }; }
  }, { key, before });
  assert.equal(stale.rejected, true, 'session guard must run again inside request callback');
  assert.equal(stale.calls, 2, noGuard);
  assert.equal(await pages[0].evaluate(async (key) => window.vaultStoreForTest.read(key), key), before, 'aborted transaction must preserve prior ciphertext');
  for (const page of pages) await page.evaluate(async () => {
    const { ReconciliationVault } = await import('/src/lib/reconciliationVault.ts');
    window.testVault = new ReconciliationVault(window.vaultStoreForTest, { sellerKeyId: 'f'.repeat(64), chainId: 84532 }, () => {});
    await window.testVault.unlock(new Uint8Array(32).fill(7));
  });
  await pages[0].evaluate(async () => {
    const { subscribeReconciliationChanges } = await import('/src/lib/reconciliationVault.ts');
    window.testVaultRecords = [];
    window.unsubscribeVaultTest = subscribeReconciliationChanges(() => {
      void window.testVault.read().then((records) => { window.testVaultRecords = records; });
    });
  });
  await pages[1].evaluate(async () => {
    const sellerKeyId = 'f'.repeat(64), transactionHash = `0x${'b'.repeat(64)}`;
    const stealthAddress = `0x${'c'.repeat(40)}`, blockHash = `0x${'d'.repeat(64)}`;
    await window.testVault.save({
      version: 1, sellerKeyId, chainId: 84532, transactionHash, stealthAddress, blockHash,
      id: `${sellerKeyId}:84532:${transactionHash}:${stealthAddress}:${blockHash}:3`, blockNumber: '120', logIndex: 3,
      asset: 'native', amountMinorUnits: '42', viewTagMatched: true, recordedAt: Date.now(),
      evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
    });
  });
  await pages[0].waitForFunction(() => window.testVaultRecords[0]?.evidenceStatus === 'verified-at-scan');
  await pages[1].evaluate(() => window.testVault.invalidateFrom(100n));
  await pages[0].waitForFunction(() => window.testVaultRecords[0]?.evidenceStatus === 'invalidated-after-reorg');
  await pages[0].evaluate(() => window.unsubscribeVaultTest());
  assert.deepEqual(unexpected, [], 'local-only browser test must not contact external origins');
  await context.close();
  console.log('PASS: Chromium IndexedDB exact-ciphertext CAS, two-tab race/reorg refresh, stale-session abort, no external egress.');
} finally {
  await browser?.close();
  await server.close();
}
