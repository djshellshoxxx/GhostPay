import { checkpointKeyId, createReconciliationApi, type ReconciliationRecord } from '@ghostpay/ux-vault/portable';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { expect, test } from '@playwright/test';
import { copyEncryptedLedger } from './dashboardLedger';
import { MERCHANT_DASHBOARD_BUILD, MERCHANT_DASHBOARD_SKIP } from './merchantDashboardBuild';

test.skip(!MERCHANT_DASHBOARD_BUILD, MERCHANT_DASHBOARD_SKIP);

test('keeps encrypted network totals exact across filtering, refresh and a recorded reorg', async ({ page }) => {
  const spending = new Uint8Array(32).fill(3);
  const viewing = new Uint8Array(32).fill(4);
  const scope = {
    chainId: 84532,
    sellerKeyId: checkpointKeyId(bytesToHex(secp256k1.getPublicKey(spending)), bytesToHex(secp256k1.getPublicKey(viewing))),
  };
  const ciphertexts = new Map<string, string>();
  const { ReconciliationVault } = createReconciliationApi();
  const vault = new ReconciliationVault({
    read: (key) => Promise.resolve(ciphertexts.get(key) ?? null),
    compareAndSwap: (key, previous, next, guard) => {
      guard();
      if ((ciphertexts.get(key) ?? null) !== previous) return Promise.resolve(false);
      ciphertexts.set(key, next);
      return Promise.resolve(true);
    },
  }, scope, () => undefined);
  await vault.unlock(viewing.slice());
  const maximum = (1n << 256n) - 1n;
  const token = '0x' + 'a'.repeat(40);
  const day = Date.UTC(2026, 0, 2) / 1000;
  for (const [index, [asset, expected]] of ([['native', maximum], ['native', 2n], [token, 37n]] as const).entries()) {
    await vault.registerInvoice({
      version: 1, chainId: scope.chainId, invoiceDigest: '0x' + String(index + 1).repeat(64),
      nonce: String(index + 1).repeat(32), asset, expectedNetMinorUnits: expected.toString(),
      createdAt: day - 86_400, registeredAt: (day - 86_400) * 1000, expiresAt: day + index * 86_400,
    });
  }
  const transactionHash = '0x' + 'b'.repeat(64);
  const blockHash = '0x' + 'c'.repeat(64);
  const stealthAddress = '0x' + 'd'.repeat(40);
  const record: ReconciliationRecord = {
    version: 1, ...scope, transactionHash, blockHash, stealthAddress, logIndex: 0,
    id: [scope.sellerKeyId, scope.chainId, transactionHash, stealthAddress, blockHash, 0].join(':'),
    blockNumber: '12', blockTimestamp: String(day), recordedAt: day * 1000,
    asset: token, amountMinorUnits: '23', viewTagMatched: true,
    evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
  };
  await vault.save(record);

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.locator('nav button[data-view="seller"]').click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  await page.getByLabel('Spending private key (64 hex characters)').fill(bytesToHex(spending));
  await page.getByLabel('Viewing private key (64 hex characters)').fill(bytesToHex(viewing));
  await page.getByRole('button', { name: 'Load keys' }).click();
  await page.locator('nav button[data-view="dashboard"]').click();
  const network = page.getByLabel('Network', { exact: true });
  const open = page.getByRole('button', { name: 'Open encrypted dashboard' });
  const refresh = page.getByRole('button', { name: 'Refresh local records' });
  const overview = page.getByRole('region', { name: 'Network overview' });
  await network.selectOption(String(scope.chainId));
  await open.click();
  await expect(page.getByText('No invoices are registered in this vault for this network.')).toBeVisible();
  await copyEncryptedLedger(page, ciphertexts);
  await refresh.click();

  const nativeSum = 'native Expected invoice total: ' + (maximum + 2n).toString() + ' atomic units';
  const tokenSum = 'erc20:' + token + ' Expected invoice total: 37 atomic units';
  const historical = 'erc20:' + token + ' Historical scan total: 23 atomic units';
  for (const text of [nativeSum, tokenSum, historical]) await expect(overview.getByText(text, { exact: true })).toBeVisible();
  await expect(overview).toContainText('Verified revenue is unavailable.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const through = page.getByLabel('Through date (UTC)');
  await through.fill('1969-12-31');
  await expect(page.getByText('No records match this view.')).toBeVisible();
  await expect(through).toHaveAttribute('aria-invalid', 'false');
  await through.fill('2026-01-03');
  await page.getByLabel('From date (UTC)').fill('2026-01-03');
  await expect(page.locator('.dashboard-records li')).toHaveCount(1);
  await expect(page.locator('.dashboard-records li')).toContainText('Expected: 2 atomic units');
  await expect(overview).toContainText(nativeSum);
  await page.getByRole('button', { name: 'Preview export' }).click();
  await expect(page.getByRole('region', { name: 'Export invoices' }).getByText(/Expected invoice total/)).toHaveText('native Expected invoice total: 2 atomic units');
  await refresh.click();
  await expect(overview.getByRole('heading')).toBeFocused();
  await expect(overview).toContainText(nativeSum);
  await expect(overview).toContainText(historical);
  await expect(page.locator('.dashboard-records li')).toHaveCount(1);

  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.getByLabel('Record type').selectOption('payments');
  await expect(page.locator('.dashboard-records li')).toContainText('Verified at scan time');
  await vault.invalidateFrom(12n, [record], () => Promise.resolve('0x' + 'e'.repeat(64)));
  vault.lock();
  await copyEncryptedLedger(page, ciphertexts);
  await refresh.click();
  await expect(page.locator('.dashboard-records li')).toContainText('Invalidated after chain reorganization');
  await expect(overview).not.toContainText('Historical scan total');
  await expect(overview).toContainText(nativeSum);
  await expect(overview).toContainText(tokenSum);

  await network.selectOption('11155420');
  await open.click();
  await expect(overview).toContainText('Registered invoices: 0. Saved payment observations: 0.');
  await expect(overview).not.toContainText('Expected invoice total');
  await network.selectOption(String(scope.chainId));
  await open.click();
  await expect(overview).toContainText(nativeSum);
  await expect(overview).not.toContainText('Historical scan total');
});
