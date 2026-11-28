import { expect, test, type Locator, type Page } from '@playwright/test';
import { createStealthExportApi } from '@ghostpay/ux-vault/portable';
import { toHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import { download, EXPORT_PASS, fillNewPassphrase, saveVault, useVault } from './stealthExportFixtures';
import { configureRpc, mockNetwork, RPC, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';

// Synthetic keys are imported through the real seller UI. No runtime hooks or cleartext scan-state fixtures.
const scalar = (value: number): string => value.toString(16).padStart(64, '0');

async function importSeller(page: Page): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  await page.getByLabel('Spending private key (64 hex characters)').fill(scalar(31));
  await page.getByLabel('Viewing private key (64 hex characters)').fill(scalar(32));
  await page.getByLabel('Invoice-signing private key (optional)', { exact: true }).fill(scalar(33));
  await page.getByRole('button', { name: 'Load keys', exact: true }).click();
  const meta = page.locator('code', { hasText: /^st:eth:0x/ });
  await expect(meta).toBeVisible();
  return await meta.innerText();
}

async function openScan(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive', exact: true }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption('84532');
  await expect(page.getByRole('button', { name: 'Start scan', exact: true })).toBeEnabled();
}

/** A verified payment also renders its address in its receipt; count discovery rows, not address copies. */
function paymentRows(page: Page, address: string): Locator {
  return page.locator('ul.matches > li').filter({ has: page.getByText(address, { exact: true }) });
}

async function readEncryptedScanRows(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ghostpay-reconciliation-encrypted');
      request.onupgradeneeded = () => { request.transaction?.abort(); };
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(new Error('scan storage is unavailable')); };
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const rows: string[] = [];
        const tx = db.transaction('vaults', 'readonly');
        const request = tx.objectStore('vaults').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) return;
          if (typeof cursor.key === 'string' && cursor.key.startsWith('ghostpay.scan.checkpoint.v5.') && typeof cursor.value === 'string') rows.push(cursor.value);
          cursor.continue();
        };
        tx.oncomplete = () => { resolve(rows); };
        tx.onabort = tx.onerror = () => { reject(new Error('scan storage could not be read')); };
      });
    } finally { db.close(); }
  });
}

test('private checkpoints preserve discovery through reload and independently recovered seller keys', async ({ page, context, browser }) => {
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await importSeller(page);
  const { mine } = stageVerifiedErc20Payment(state, meta);
  await openScan(page);
  await page.getByLabel('Start block', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  await expect(page.getByText(/Finished\./)).toBeVisible();
  await expect(paymentRows(page, mine.stealthAddress)).toBeVisible();
  const rows = await readEncryptedScanRows(page);
  const ciphertexts = rows.filter((text) => text.includes('ciphertext'));
  expect(ciphertexts).toHaveLength(1);
  const serialized = JSON.stringify(rows);
  for (const value of [meta, mine.stealthAddress.toLowerCase(), scalar(31), scalar(32), scalar(33)]) expect(serialized).not.toContain(value);

  await page.reload();
  await importSeller(page);
  await openScan(page);
  await expect(page.getByText(/1 saved payment observation/)).toBeVisible();
  await expect(page.getByText(mine.stealthAddress, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  await expect(page.getByText(/Finished\./)).toBeVisible();
  await expect(paymentRows(page, mine.stealthAddress)).toHaveCount(1);

  // Recovery in a genuinely independent profile has the seller keys but no progress. It must rediscover from zero.
  const recovered = await browser.newContext({ baseURL: 'http://localhost:4173', serviceWorkers: 'block' });
  try {
    await mockNetwork(recovered, state);
    const other = await recovered.newPage();
    await configureRpc(other);
    await other.goto('/');
    expect(await importSeller(other)).toBe(meta);
    await openScan(other);
    await expect(other.getByLabel('Start block', { exact: true })).toHaveValue('0');
    await expect(other.getByText(/1 saved payment observation/)).toHaveCount(0);
    await other.getByRole('button', { name: 'Start scan', exact: true }).click();
    await expect(other.getByText(/Finished\./)).toBeVisible();
    await expect(paymentRows(other, mine.stealthAddress)).toHaveCount(1);
  } finally { await recovered.close(); }
});

test('concurrent tabs reject a stale checkpoint writer and can resume the committed history', async ({ context, page }) => {
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await importSeller(page);
  const { mine } = stageVerifiedErc20Payment(state, meta);
  await openScan(page);
  const second = await context.newPage();
  await second.goto('/');
  await importSeller(second);
  await openScan(second);
  await Promise.all([page.getByLabel('Start block', { exact: true }).fill('100'), second.getByLabel('Start block', { exact: true }).fill('100')]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const arrived = new Set<Page>();
  await context.route(`${RPC}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = JSON.parse(request.postData() ?? '{}') as { method?: string };
      if (body.method === 'eth_getLogs') {
        arrived.add(request.frame().page());
        if (arrived.size === 2) release();
        await gate;
      }
    }
    await route.fallback();
  });
  try {
    await Promise.all([page.getByRole('button', { name: 'Start scan', exact: true }).click(), second.getByRole('button', { name: 'Start scan', exact: true }).click()]);
    await expect.poll(async () => (await page.getByText(/changed in another tab/).count()) + (await second.getByText(/changed in another tab/).count())).toBe(1);
    const loser = await page.getByText(/changed in another tab/).count() > 0 ? page : second;
    const winner = loser === page ? second : page;
    await expect(winner.getByText(/Finished\./)).toBeVisible();
    await expect(loser.getByText(/Finished\./)).toHaveCount(0);
    await loser.getByRole('button', { name: 'Reload saved scan history', exact: true }).click();
    await expect(loser.getByRole('button', { name: 'Start scan', exact: true })).toBeEnabled();
    await loser.getByRole('button', { name: 'Start scan', exact: true }).click();
    await expect(loser.getByText(/Finished\./)).toBeVisible();
    await expect(paymentRows(loser, mine.stealthAddress)).toHaveCount(1);
    expect((await readEncryptedScanRows(page)).filter((text) => text.includes('ciphertext'))).toHaveLength(1);
  } finally { release(); await second.close(); }
});

async function expectArchive(page: Page, addresses: readonly string[]): Promise<void> {
  const panel = page.getByTestId('payment-keys-archive');
  const button = panel.getByRole('button', { name: 'Export all payment keys (encrypted)' });
  if (!await panel.getByTestId('payment-keys-archive-download').isVisible()) await button.click();
  await useVault(panel);
  await fillNewPassphrase(panel);
  const file = await download(page, () => panel.getByTestId('payment-keys-archive-download').click());
  const opened = await createStealthExportApi().decryptPaymentKeys(file.text, EXPORT_PASS, { expectedChainId: 84532 });
  try {
    const expected = addresses.map((address) => address.toLowerCase()).sort();
    expect(opened.header.scope).toBe('all-discovered');
    expect(opened.payments.map((p) => p.record.stealthAddress.toLowerCase()).sort()).toEqual(expected);
    for (const payment of opened.payments) {
      expect(privateKeyToAddress(toHex(payment.secret)).toLowerCase()).toEqual(payment.record.stealthAddress.toLowerCase());
    }
  } finally {
    for (const payment of opened.payments) payment.secret.fill(0);
  }
}

test('a resumed archive drops an orphaned payment and rejects the tab still scanning the old fork', async ({ context, page }) => {
  test.setTimeout(180_000);
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const seller = await importSeller(page);
  await saveVault(page);
  const survivor = stageVerifiedErc20Payment(state, seller, 120);
  const orphan = stageVerifiedErc20Payment(state, seller, 260);
  const oldChain = { ...state, logs: [...state.logs!], evidence: new Map(state.evidence) };
  const run = (tab: Page) => tab.getByRole('button', { name: 'Start scan', exact: true }).click();
  await openScan(page);
  await run(page);
  await expect(page.getByText(/2 saved payment observations/)).toBeVisible();
  await page.reload();
  await importSeller(page);
  await openScan(page);
  await expect(page.getByText(/2 saved payment observations/)).toBeVisible();
  await run(page);
  await expect(page.getByText(/Finished\./)).toBeVisible();
  await expectArchive(page, [survivor.mine.stealthAddress, orphan.mine.stealthAddress]);

  const stale = await context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    await mockNetwork(stale, oldChain);
    await stale.goto('/');
    await importSeller(stale);
    await openScan(stale);
    let held = false;
    await stale.route(`${RPC}/**`, async (route) => {
      if (route.request().method() === 'POST' && route.request().postDataJSON().method === 'eth_blockNumber' && !held) {
        held = true;
        await gate;
      }
      await route.fallback();
    });
    await run(stale);
    await expect.poll(() => held).toBe(true);

    state.forkFromBlock = 260;
    state.logs = oldChain.logs.filter((log) => (log as { transactionHash: string }).transactionHash !== orphan.txHash);
    state.evidence?.delete(orphan.txHash.toLowerCase());
    await run(page);
    await expect(page.getByText(/1 saved payment observation/)).toBeVisible();
    await expect(paymentRows(page, orphan.mine.stealthAddress)).toHaveCount(0);
    await expect(paymentRows(page, survivor.mine.stealthAddress)).toHaveCount(1);
    release();
    await expect(stale.getByText(/changed in another tab/)).toBeVisible();
    await page.reload();
    await importSeller(page);
    await openScan(page);
    await expect(page.getByText(/1 saved payment observation/)).toBeVisible();
    await run(page);
    await expect(page.getByText(/Finished\./)).toBeVisible();
    await expectArchive(page, [survivor.mine.stealthAddress]);
  } finally {
    release();
    await stale.close();
  }
});
