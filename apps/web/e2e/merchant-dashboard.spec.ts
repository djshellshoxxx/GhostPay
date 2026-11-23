import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';
import { generateKeys } from './helpers';

test('opens encrypted merchant records on mobile and only exports the approved invoice range', async ({ page }, info) => {
  test.setTimeout(120_000);
  const passphrase = 'river copper maple starlight';
  const privateText = 'Local fixture line item';
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await generateKeys(page);
  await page.getByLabel('New vault passphrase (14+ characters)').fill(passphrase);
  await page.getByLabel('Repeat vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(page.getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.')).toBeVisible();

  await page.locator('nav button[data-view="create"]').click();
  await page.getByLabel('Chain', { exact: true }).selectOption('84532');
  await page.getByLabel('Token amount', { exact: true }).fill('0.5');
  await page.getByLabel('Item 1 description').fill(privateText);
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByRole('checkbox', { name: /Register this invoice in my encrypted reconciliation vault/ }).check();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  await expect(page.getByText('Invoice registered in your encrypted reconciliation vault for local matching.')).toBeVisible();

  // Reload discards the seller session. Only unlocking the saved seller identity can reveal the encrypted records.
  await page.reload();
  const dashboard = page.locator('nav button[data-view="dashboard"]');
  await dashboard.focus();
  await page.keyboard.press('Enter');
  await expect(dashboard).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByText('Load your seller keys to open your local merchant records.')).toBeVisible();
  await page.locator('nav button[data-view="seller"]').click();
  await page.getByLabel('Vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(page.getByRole('button', { name: 'Wipe keys from memory' })).toBeVisible({ timeout: 30_000 });

  const messages: string[] = [];
  const requests: string[] = [];
  page.on('console', (message) => { messages.push(message.text()); });
  page.on('request', (request) => { requests.push(request.url() + (request.postData() ?? '')); });
  await dashboard.click();
  await page.getByLabel('Network', { exact: true }).selectOption('84532');
  await page.getByRole('button', { name: 'Open encrypted dashboard' }).click();
  const record = page.locator('.dashboard-records li');
  await expect(record).toHaveCount(1);
  await expect(record).toContainText('Open · no linked evidence');
  const reference = await record.locator('bdi').first().innerText();
  expect(reference).toMatch(/^0x[0-9a-f]{64}$/);
  await expect(page.getByText(/Current invoice settlement could not be verified/)).toBeVisible();
  await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);

  await page.getByRole('searchbox').fill('not-a-reference');
  await expect(page.getByText('No records match this view.')).toBeVisible();
  await page.getByRole('searchbox').fill(reference);
  await page.getByLabel('Status', { exact: true }).selectOption('reorged');
  await expect(page.getByText('No records match this view.')).toBeVisible();
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await page.getByLabel('Sort by date').selectOption('oldest');
  await page.getByLabel('From date (UTC)').fill('2099-01-01');
  const preview = page.getByRole('button', { name: 'Preview export' });
  await expect(preview).toBeDisabled();
  await page.getByLabel('From date (UTC)').fill('');
  await page.getByLabel('File format').selectOption('json');
  await expect(page.getByRole('button', { name: 'Agree and download' })).toHaveCount(0);
  await preview.click();
  await expect(page.getByText('Export 1 invoice records as JSON?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export' }).click();
  await expect(page.getByRole('button', { name: 'Agree and download' })).toHaveCount(0);
  await preview.click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Agree and download' }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('ghostpay-invoices.json');
  const text = readFileSync(await file.path(), 'utf8');
  expect(JSON.parse(text)).toMatchObject({ coverage: 'not-evaluated', rows: [{ chainId: 'eip155:84532', assetId: 'native', expectedAtomic: expect.stringMatching(/^[0-9]+$/) }] });
  for (const value of [reference, privateText, passphrase]) {
    expect(text).not.toContain(value);
    expect(messages.join(' ')).not.toContain(value);
    expect(requests.join(' ')).not.toContain(value);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await auditAccessibility(page, 'merchant-dashboard-mobile');
  await retainAccessibilityAudit(page, info);
});
