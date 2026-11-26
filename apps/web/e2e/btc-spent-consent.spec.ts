import { expect, test, type Page } from '@playwright/test';
import { createScanState, parseScanState, serializeScanState, type ScanState } from '@ghostpay/btc-silent-payments';
import { mockChain, SEED_A, walletA } from '../src/features/btc/fixtures.testutil';
import { EsploraClient } from '../src/features/btc/esplora';
import { EsploraHeaderSource, loadHeaderChain, MemoryHeaderStore, syncHeaders } from '../src/features/btc/headers';
import { scanForPayments, wipeFound } from '../src/features/btc/scan';
import { BtcScanVault } from '../src/features/btc/scanStore';

const lean = (process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] ?? 'full') === 'lean';
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Bitcoin (test)', exact: true }).click();
  await page.getByLabel('Network', { exact: true }).selectOption('regtest');
  await page.getByLabel(/Esplora server URL/).fill('https://esplora.test/api');
  await page.getByLabel(/Or import a seed/).fill(SEED_A);
  await page.getByRole('button', { name: 'Import seed', exact: true }).click();
}

test('local Bitcoin scans disclose no outpoints; explicit provider checks are revocable during a native-worker scan', async ({ page, context }) => {
  test.skip(lean, 'Bitcoin is excluded from lean; the separate lean boundary test verifies that exclusion.');
  const chain = mockChain('regtest', walletA(), { payments: 2 });
  const outpoints: string[] = []; let hold = true; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await context.route('https://esplora.test/api/**', async (route) => {
    const request = route.request(); expect(request.method()).toBe('GET'); expect(request.postData()).toBeNull();
    expect(request.url()).not.toContain(SEED_A);
    if (request.url().includes('/outspend/')) { outpoints.push(request.url()); if (hold) await gate; }
    const response = await chain.fetchFn(request.url(), { method: 'GET' });
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, body: await response.text() }).catch(() => undefined);
  });
  await open(page); await page.getByLabel(/First block height/).fill('1');
  const provider = page.getByRole('checkbox', { name: /Also ask the server whether each found output is unspent/ });
  await expect(provider).not.toBeChecked();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/2 unspent payment/)).toBeVisible(); expect(outpoints).toEqual([]);
  await provider.check(); await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect.poll(() => outpoints.length).toBe(1);
  await expect(provider).toBeEnabled(); await provider.uncheck();
  await expect(page.getByRole('button', { name: 'Scan', exact: true })).toBeEnabled();
  hold = false; release();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/2 unspent payment/)).toBeVisible(); expect(outpoints).toHaveLength(1);
  await provider.check(); await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/Spent status: the configured Esplora server was asked about candidate outputs/)).toBeVisible();
  expect(outpoints).toHaveLength(3);
  expect(new Set(outpoints).size).toBe(2);
  await provider.uncheck(); await expect(page.getByRole('checkbox', { name: /^Sweep / })).toHaveCount(0);
});

test('legacy encrypted Bitcoin matches remain unknown until explicit provider refresh or a fresh local scan', async ({ page, context }) => {
  test.skip(lean, 'Bitcoin is excluded from lean; the separate lean boundary test verifies that exclusion.');
  const wallet = walletA(); const chain = mockChain('regtest', wallet);
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  const store = new MemoryHeaderStore(); const { chain: headers } = await loadHeaderChain(wallet.net, store);
  await syncHeaders({ chain: headers, sources: [new EsploraHeaderSource(client)], store });
  let state: ScanState = createScanState('regtest', 1);
  const result = await scanForPayments({ wallet, client, headers, fromHeight: 1, resumeState: state, onState: (s) => { state = s; } });
  wipeFound(result.found);
  const raw: Record<string, unknown> = JSON.parse(serializeScanState(state)) as Record<string, unknown>;
  delete raw['spendsFromHeight'];
  const legacy = parseScanState(JSON.stringify(raw));
  const records = new Map<string, string>();
  const vault = await BtcScanVault.open(wallet, {
    read: (key) => Promise.resolve(records.get(key) ?? null),
    compareAndSwap: (key, expected, next, guard) => {
      guard(); if ((records.get(key) ?? null) !== expected) return Promise.resolve(false);
      records.set(key, next); return Promise.resolve(true);
    },
  }, () => {});
  await vault.load(); await vault.save(legacy); vault.lock();
  chain.requests.length = 0;
  await context.route('https://esplora.test/api/**', async (route) => {
    const response = await chain.fetchFn(route.request().url(), { method: 'GET' });
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, body: await response.text() });
  });
  await page.goto('/');
  await page.evaluate(async (values) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('ghostpay-reconciliation-encrypted', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('vaults'); };
      request.onerror = () => { reject(new Error('Fixture storage could not be opened')); };
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('vaults', 'readwrite');
        for (const [key, value] of values) tx.objectStore('vaults').put(value, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Fixture storage could not be committed')); };
      };
    });
  }, [...records]);
  await open(page);
  await page.getByRole('checkbox', { name: 'Save scan progress encrypted in this browser' }).check();
  await expect(page.getByText(/Saved scan: birth height 1, checked through 4, 1 historical matches/)).toBeVisible();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/1 payment\(s\) found with unknown spent status/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toBeDisabled();
  await expect(page.getByText(/1 unspent payment/)).toHaveCount(0);
  expect(chain.requests.some((path) => path.includes('/outspend/'))).toBe(false);
  const provider = page.getByRole('checkbox', { name: /Also ask the server whether each found output is unspent/ });
  await provider.check(); await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/1 unspent payment/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toBeEnabled();
  expect(chain.requests.filter((path) => path.includes('/outspend/'))).toHaveLength(1);
  await provider.uncheck();
  await page.getByRole('button', { name: 'Forget saved scan progress', exact: true }).click();
  await page.getByRole('button', { name: 'Delete saved scan progress', exact: true }).click();
  await expect(page.getByText(/Saved scan: birth height/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.getByText(/Spent status: derived on this device/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^Sweep / })).toBeEnabled();
  expect(chain.requests.filter((path) => path.includes('/outspend/'))).toHaveLength(1);
});

test('lean profile exposes no Bitcoin controls, worker, or provider requests', async ({ page }) => {
  test.skip(!lean, 'This acceptance check targets the lean build boundary.');
  const btcRequests: string[] = []; const workers: string[] = [];
  page.on('request', (request) => { if (/esplora|blindbit|outspend|merkle-proof/i.test(request.url())) btcRequests.push(request.url()); });
  page.on('worker', (worker) => { workers.push(worker.url()); });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitcoin (test)', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /provider checks|Also ask the server whether each found output is unspent/ })).toHaveCount(0);
  expect(btcRequests).toEqual([]); expect(workers.some((url) => /btc|scan\.worker/.test(url))).toBe(false);
});
