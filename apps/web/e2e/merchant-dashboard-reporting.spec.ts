import { readFile } from 'node:fs/promises';
import type { ReconciliationRecord } from '@ghostpay/ux-vault/portable';
import { expect, test } from '@playwright/test';
import { copyEncryptedLedger, loadSellerAndOpenDashboard, syntheticLedger } from './dashboardLedger';

for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 720 }]) {
  test(`reports exact verified totals, filters by asset and exports payment history at ${viewport.width}px`, async ({ page }) => {
    const { scope, ciphertexts, vault, spendingHex, viewingHex } = await syntheticLedger(84532, { spending: 5, viewing: 6 });
    const maximum = (1n << 256n) - 1n;
    const token = '0x' + 'a'.repeat(40);
    const day = Date.UTC(2026, 0, 2) / 1000;
    const invoices = [['native', maximum], [token, 37n]] as const;
    for (const [index, [asset, expected]] of invoices.entries()) {
      await vault.registerInvoice({
        version: 1, chainId: scope.chainId, invoiceDigest: '0x' + String(index + 1).repeat(64),
        nonce: String(index + 1).repeat(32), asset, expectedNetMinorUnits: expected.toString(),
        createdAt: day - 86_400, registeredAt: (day - 86_400) * 1000, expiresAt: day + 86_400,
      });
    }
    const observation = (logIndex: number, asset: string, amount: bigint, txByte: string): ReconciliationRecord => {
      const transactionHash = '0x' + txByte.repeat(64);
      const blockHash = '0x' + 'c'.repeat(64);
      const stealthAddress = '0x' + 'd'.repeat(40);
      return {
        version: 1, ...scope, transactionHash, blockHash, stealthAddress, logIndex,
        id: [scope.sellerKeyId, scope.chainId, transactionHash, stealthAddress, blockHash, logIndex].join(':'),
        blockNumber: '12', blockTimestamp: String(day), recordedAt: day * 1000,
        asset, amountMinorUnits: amount.toString(), viewTagMatched: true,
        evidenceStatus: 'verified-at-scan', evidenceSource: 'verified-router-scan',
      };
    };
    await vault.save(observation(0, 'native', maximum, 'b'));
    await vault.save(observation(1, 'native', 5n, 'b'));
    await vault.save(observation(2, token, 23n, 'e'));
    vault.lock();

    await page.setViewportSize(viewport);
    await loadSellerAndOpenDashboard(page, spendingHex, viewingHex);
    await page.getByLabel('Network', { exact: true }).selectOption(String(scope.chainId));
    await page.getByRole('button', { name: 'Open encrypted dashboard' }).click();
    await expect(page.getByText('No invoices are registered in this vault for this network.')).toBeVisible();
    await copyEncryptedLedger(page, ciphertexts);
    await page.getByRole('button', { name: 'Refresh local records' }).click();

    const report = page.getByRole('region', { name: 'Report for this view' });
    await expect(report).toContainText('Verified-at-scan payments: 2 · ' + (maximum + 5n).toString() + ' atomic units');
    await expect(report).toContainText('Verified-at-scan payments: 1 · 23 atomic units');
    await expect(report).toContainText('Excluded from payment totals: 0 imported');

    // Keyboard-only asset filtering keeps focus on the control the merchant is using.
    const asset = page.getByLabel('Asset', { exact: true });
    await asset.focus();
    await asset.selectOption('erc20:' + token);
    await expect(asset).toBeFocused();
    await expect(report).toContainText('Invoices: 1 · expected 37 atomic units');
    await expect(report).not.toContainText(maximum.toString());

    await page.getByLabel('Record type').selectOption('payments');
    await expect(page.locator('.dashboard-records li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Preview payment export' }).click();
    await expect(page.getByText('Export 1 payment observations (1 verified at scan time) as CSV?')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Agree and download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('ghostpay-payments.csv');
    const path = await file.path();
    const csv = await readFile(path, 'utf8');
    expect(csv).toBe([
      'chainId,assetId,status,includedAtUtc,blockNumber,amountAtomic,transactionHash,logIndex,localInvoiceRefs',
      `eip155:84532,erc20:${token},historical,2026-01-02T00:00:00.000Z,12,23,0x${'e'.repeat(64)},2,`,
      '',
    ].join('\r\n'));
    await expect(page.getByRole('button', { name: 'Preview payment export' })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
