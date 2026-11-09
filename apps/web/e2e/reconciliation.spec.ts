import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { generateKeys } from './helpers';

async function navigate(page: Page, view: 'create' | 'scan' | 'settings'): Promise<void> {
  const button = page.locator(`nav button[data-view="${view}"]`);
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  if (view === 'scan') await page.locator('section[aria-labelledby="scan-h"] select').first().selectOption('84532');
}

test('encrypted reconciliation keeps invoice identity through language changes and cancels import previews on lock', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  await navigate(page, 'create');
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount', { exact: true }).fill('0.5');
  await page.getByLabel('Item 1 description').fill('Local matching fixture');
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByLabel('Register this invoice in my encrypted reconciliation vault for automatic local matching').check();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  await expect(page.getByText('Invoice registered in your encrypted reconciliation vault for local matching.', { exact: true })).toBeVisible();

  await navigate(page, 'scan');
  const ledger = page.locator('.reconciliation-ledger');
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  const invoice = ledger.locator('li.card').filter({ has: page.getByRole('button', { name: 'Remove registration', exact: true }) });
  await expect(invoice).toHaveCount(1);
  const digest = await invoice.locator('code').innerText();
  const meaning = await invoice.locator('p.hint').innerText();
  expect(digest).toMatch(/^0x[0-9a-f]{64}$/);
  expect(meaning).toContain('No linked observation.');

  const download = page.waitForEvent('download');
  await ledger.getByRole('button', { name: 'Export encrypted reconciliation backup', exact: true }).click();
  const backup = readFileSync(await (await download).path(), 'utf8');
  expect(backup).not.toContain(digest);
  const file = { name: 'reconciliation.json', mimeType: 'application/json', buffer: Buffer.from(backup) };
  const backupInput = ledger.getByLabel('Encrypted reconciliation backup', { exact: true });
  const backupFile = ledger.getByLabel('Encrypted reconciliation backup file', { exact: true });
  const activate = ledger.getByRole('button', { name: 'Activate previewed historical records', exact: true });
  await backupInput.fill('{"privateDiagnostic":"DO-NOT-RENDER"}');
  await ledger.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
  await expect(ledger.getByRole('alert')).toBeVisible();
  await expect(ledger.getByRole('alert')).not.toContainText('DO-NOT-RENDER');
  await expect(activate).toHaveCount(0);

  await backupFile.setInputFiles(file);
  await expect(backupInput).toHaveValue(backup);
  await ledger.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
  await expect(activate).toBeVisible();
  // Picking the identical file again must invalidate the old approval preview and allow a fresh preview.
  await backupFile.setInputFiles(file);
  await expect(activate).toHaveCount(0);
  await ledger.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
  await expect(activate).toBeVisible();
  await ledger.getByRole('button', { name: 'Lock reconciliation vault', exact: true }).click();
  await expect(activate).toHaveCount(0);
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  await expect(backupInput).toHaveValue('');
  await expect(invoice.locator('code')).toHaveText(digest);

  await navigate(page, 'settings');
  await page.getByLabel('Language', { exact: true }).selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await navigate(page, 'scan');
  await expect(ledger.getByRole('heading', { name: 'Conciliación local de pagos', exact: true })).toBeVisible();
  // Consent and payment status deliberately retain reviewed English in machine-drafted locales.
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  await expect(invoice.locator('code')).toHaveText(digest);
  await expect(invoice.locator('p.hint')).toHaveText(meaning);
  await expect(ledger.getByLabel('Buscar registros locales', { exact: true })).toBeVisible();

  await navigate(page, 'settings');
  await page.getByLabel('Idioma', { exact: true }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await navigate(page, 'scan');
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  await expect(invoice.locator('code')).toHaveText(digest);
  await expect(invoice.locator('p.hint')).toHaveText(meaning);
  await backupInput.fill(backup);
  await expect(backupInput).toHaveAttribute('dir', 'ltr');
  await ledger.getByRole('button', { name: 'Preview encrypted backup', exact: true }).click();
  await expect(activate).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  // These keys were memory-only: reloading must show the no-keys view, not an unlocked ledger.
  const scanRoute = page.locator('nav button[data-view="scan"]');
  await scanRoute.click();
  await expect(scanRoute).toHaveAttribute('aria-current', 'page');
  const scan = page.locator('section[aria-labelledby="scan-h"]');
  await expect(scan.getByRole('note')).toContainText('قم أولاً بتحميل مفاتيح البائع أو إنشائها.');
  await expect(scan.locator('select')).toHaveCount(0);
  await expect(ledger).toHaveCount(0);
  await expect(activate).toHaveCount(0);
});
