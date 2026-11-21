import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createReconciliationApi } from '@ghostpay/ux-vault/portable';
import { ORIGIN } from './helpers';

async function importKnownSeller(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  const seller = page.locator('section[aria-labelledby="keys-h"]');
  // Public deterministic fixture keys used throughout browser acceptance; never funded.
  await seller.getByLabel('Spending private key (64 hex characters)').fill('11'.repeat(32));
  await seller.getByLabel('Viewing private key (64 hex characters)').fill('22'.repeat(32));
  await seller.getByLabel('Invoice-signing private key (optional)', { exact: true }).fill('33'.repeat(32));
  await seller.getByRole('button', { name: 'Load keys', exact: true }).click();
  await expect(seller.locator('code', { hasText: /^st:eth:0x/ })).toBeVisible();
}
async function createRegisteredInvoice(page: Page): Promise<void> {
  await page.locator('nav button[data-view="create"]').click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount', { exact: true }).fill('0.5');
  await page.getByLabel('Item 1 description').fill('Local registration-time fixture');
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByRole('checkbox', { name: 'Register this invoice in my encrypted reconciliation vault for automatic local matching', exact: true }).check();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  await expect(page.getByText('Invoice registered in your encrypted reconciliation vault for local matching.', { exact: true })).toBeVisible();
}
async function openLedger(page: Page): Promise<Locator> {
  await page.locator('nav button[data-view="scan"]').click();
  await page.locator('section[aria-labelledby="scan-h"] select').first().selectOption('84532');
  const ledger = page.locator('.reconciliation-ledger');
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  await expect(ledger.getByRole('button', { name: 'Lock reconciliation vault', exact: true })).toBeVisible();
  return ledger;
}
async function backup(page: Page, ledger: Locator): Promise<string> {
  const saved = page.waitForEvent('download');
  await ledger.getByRole('button', { name: 'Export encrypted reconciliation backup', exact: true }).click();
  return readFileSync(await (await saved).path(), 'utf8');
}
async function inspect(text: string) {
  const api = createReconciliationApi();
  const header = api.inspectReconciliationEnvelope(text);
  const vault = new api.ReconciliationVault({ read: () => Promise.resolve(text), compareAndSwap: () => { throw new Error('inspection must not write'); } }, header, () => undefined);
  await vault.unlock(new Uint8Array(32).fill(0x22));
  try { return await vault.readState(); } finally { vault.lock(); }
}

test('manual registration-time cleanup preserves encrypted invoice records across backup import and reload', async ({ context, page }) => {
  const foreign: string[] = [];
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== ORIGIN) { foreign.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto('/');
  await importKnownSeller(page);
  await createRegisteredInvoice(page);
  let ledger = await openLedger(page);
  const consent = () => ledger.getByRole('checkbox', { name: 'Allow registration-time cleanup for this unlocked vault', exact: true });
  const preview = () => ledger.getByRole('button', { name: 'Preview registration-time cleanup', exact: true });
  await expect(consent()).not.toBeChecked();
  await expect(preview()).toBeDisabled();
  const originalText = await backup(page, ledger);
  const original = await inspect(originalText);
  expect(original.invoices).toHaveLength(1);
  await consent().check();
  await preview().click();
  await expect(ledger.getByText('Registration timestamps to remove: 1.', { exact: true })).toBeVisible();
  await ledger.getByRole('button', { name: 'Cancel cleanup', exact: true }).click();
  expect(await backup(page, ledger)).toBe(originalText);
  await preview().click();
  await ledger.getByRole('button', { name: 'Remove registration timestamps', exact: true }).click();
  await expect(ledger.getByText('Local registration timestamps removed. Invoice registrations and payment history remain saved.', { exact: true })).toBeVisible();
  const cleaned = await inspect(await backup(page, ledger));
  expect(cleaned).toEqual({ ...original, invoices: original.invoices.map((invoice) => ({ ...invoice, version: 2, registeredAt: null })) });
  await ledger.getByLabel('Encrypted reconciliation backup', { exact: true }).fill(originalText);
  await ledger.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
  await ledger.getByRole('button', { name: 'Activate previewed historical records', exact: true }).click();
  expect((await inspect(await backup(page, ledger))).invoices).toEqual(cleaned.invoices);
  await page.reload();
  await importKnownSeller(page);
  ledger = await openLedger(page);
  await expect(consent()).not.toBeChecked();
  expect((await inspect(await backup(page, ledger))).invoices).toEqual(cleaned.invoices);
  await consent().check(); await preview().click();
  await expect(ledger.getByText('Registration timestamps to remove: 0.', { exact: true })).toBeVisible();
  await expect(ledger.getByRole('button', { name: 'Remove registration timestamps', exact: true })).toBeDisabled();
  expect(foreign).toEqual([]);
});


test('another tab registering an invoice invalidates a cleanup preview without broadening its native-storage write', async ({ context, page }) => {
  const foreign: string[] = [];
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== ORIGIN) { foreign.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto('/');
  await importKnownSeller(page);
  await createRegisteredInvoice(page);
  const ledger = await openLedger(page);
  await ledger.getByRole('checkbox', { name: 'Allow registration-time cleanup for this unlocked vault', exact: true }).check();
  await ledger.getByRole('button', { name: 'Preview registration-time cleanup', exact: true }).click();
  await expect(ledger.getByText('Registration timestamps to remove: 1.', { exact: true })).toBeVisible();

  const other = await context.newPage();
  await other.goto('/');
  await importKnownSeller(other);
  await createRegisteredInvoice(other);
  const otherLedger = await openLedger(other);
  const concurrentText = await backup(other, otherLedger);
  const concurrent = await inspect(concurrentText);
  expect(concurrent.invoices).toHaveLength(2);
  expect(concurrent.invoices.every((invoice) => invoice.version === 1 && invoice.registeredAt > 0)).toBe(true);

  await ledger.getByRole('button', { name: 'Remove registration timestamps', exact: true }).click();
  await expect(ledger.getByText(/changed in another tab/i)).toBeVisible();
  expect(await backup(page, ledger)).toBe(concurrentText);
  expect(await inspect(await backup(other, otherLedger))).toEqual(concurrent);
  expect(foreign).toEqual([]);
});
