import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';
import { generateKeys } from './helpers';

const passphrase = 'river copper maple starlight';

async function saveSeller(page: Page): Promise<void> {
  await page.goto('/');
  await generateKeys(page);
  await page.getByLabel('New vault passphrase (14+ characters)').fill(passphrase);
  await page.getByLabel('Repeat vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(page.getByRole('main').getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function prepareRegisteredInvoice(page: Page, description: string): Promise<void> {
  await page.locator('nav button[data-view="create"]').click();
  await page.getByLabel('Chain', { exact: true }).selectOption('84532');
  await page.getByLabel('Token amount', { exact: true }).fill('0.5');
  await page.getByLabel('Item 1 description').fill(description);
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByRole('checkbox', { name: /Register this invoice in my encrypted reconciliation vault/ }).check();
}

async function unlockSeller(page: Page): Promise<void> {
  await page.locator('nav button[data-view="seller"]').click();
  await page.getByLabel('Vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(page.getByRole('button', { name: 'Wipe keys from memory' })).toBeVisible({ timeout: 30_000 });
}

test('opens encrypted merchant records on mobile and only exports the approved invoice range', async ({ page }, info) => {
  test.setTimeout(120_000);
  const privateText = 'Local fixture line item';
  await page.setViewportSize({ width: 375, height: 667 });
  await saveSeller(page);
  await prepareRegisteredInvoice(page, privateText);
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
  await unlockSeller(page);

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

test('keeps focus on Network for a background ledger refresh and announces an explicit refresh', async ({ page, context }) => {
  test.setTimeout(120_000);
  const writer = await context.newPage();
  await saveSeller(writer);
  await prepareRegisteredInvoice(writer, 'Background invoice');

  await page.goto('/');
  await unlockSeller(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Merchant dashboard' }).click();
  const network = page.getByLabel('Network', { exact: true });
  await network.selectOption('84532');
  await page.getByRole('button', { name: 'Open encrypted dashboard' }).click();
  await expect(page.getByText('No records match this view.')).toBeVisible();
  const refresh = page.getByRole('button', { name: 'Refresh local records' });
  await refresh.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(network).toBeFocused();

  // The writer commits the encrypted invoice. Its broadcast refreshes the reader without input there.
  await writer.getByRole('button', { name: 'Create invoice link' }).click();
  const record = page.locator('.dashboard-records li');
  await expect(record).toHaveText(/Open · no linked evidence/);
  await expect(network).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(refresh).toBeFocused();
  // Capture the transient progress focus even if the local read finishes between Playwright assertions.
  const focused = await page.evaluateHandle(() => {
    const labels: string[] = [];
    document.addEventListener('focusin', ({ target }) => {
      if (target instanceof HTMLElement) labels.push(target.textContent ?? '');
    });
    return labels;
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Network overview' })).toBeFocused();
  expect(await focused.jsonValue()).toEqual(['Merchant records are being refreshed…', 'Network overview']);
  await expect(record).toHaveText(/Open · no linked evidence/);
});

test('respects focus moved to Network during the first read, and restores focus after a failed refresh', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Merchant dashboard' }).click();
  const network = page.getByLabel('Network', { exact: true });
  // Interrupt at the real progress focus event, before IndexedDB can return an empty ledger.
  await network.evaluate((picker) => {
    const interrupt = (event: FocusEvent): void => {
      if (!(event.target instanceof HTMLElement) || event.target.textContent !== 'Loading merchant dashboard…') return;
      document.removeEventListener('focusin', interrupt);
      picker.focus();
      window.dispatchEvent(new Event('focus'));
    };
    document.addEventListener('focusin', interrupt);
  });
  await page.getByRole('button', { name: 'Open encrypted dashboard' }).click();
  const overview = page.getByRole('heading', { name: 'Network overview' });
  await expect(overview).toBeVisible();
  await expect(network).toBeFocused();

  // Abort exactly one ledger read; the next foreground refresh uses IndexedDB normally.
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      if (this.name === 'ghostpay-reconciliation-encrypted' && tx.mode === 'readonly') {
        IDBDatabase.prototype.transaction = transaction;
        queueMicrotask(() => { tx.abort(); });
      }
      return tx;
    };
  });
  await page.getByRole('button', { name: 'Refresh local records' }).click();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await expect(overview).toBeFocused();
});
