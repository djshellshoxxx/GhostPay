import { expect, test } from '@playwright/test';
import { createInvoice, generateKeys, openFresh } from './helpers';

test('passphrase invoice stays closed after a wrong passphrase and opens with the right one', async ({ page }) => {
  test.setTimeout(120_000);
  const passphrase = 'cedar orbit velvet lantern meadow';
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, {
    description: 'Private consulting detail',
    memo: 'Private project note',
    passphrase,
  });

  await expect(page.getByText(/contents are protected by a passphrase/)).toBeVisible();
  await expect(page.locator('[data-qr-kind="shareable"] .qr-label')).toHaveText('SHARE');
  await openFresh(page, link);
  await expect(page.getByRole('heading', { level: 2, name: 'Pay an invoice' })).toBeVisible();
  await expect(page.getByText(/Passphrase-protected invoice/)).toBeVisible();
  await expect(page.getByLabel('Invoice passphrase')).toBeVisible();
  await expect(page.getByText('Private consulting detail')).toHaveCount(0);
  await expect(page.getByText('Private project note')).toHaveCount(0);

  await page.getByLabel('Invoice passphrase').fill('wrong phrase here');
  await page.getByRole('button', { name: 'Open invoice' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Private consulting detail')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);

  await page.getByLabel('Invoice passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Open invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Private consulting detail')).toBeVisible();
  await expect(page.getByText('Private project note')).toBeVisible();
});

test('encrypted seller vault survives reload, rejects a wrong passphrase, then unlocks the same keys', async ({ page }) => {
  test.setTimeout(120_000);
  const passphrase = 'river copper maple starlight';
  await page.goto('/');
  const metaAddress = await generateKeys(page);

  await expect(page.getByRole('heading', { name: 'Optional encrypted browser vault' })).toBeVisible();
  await page.getByLabel('New vault passphrase (14+ characters)').fill(passphrase);
  await page.getByLabel('Repeat vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(page.locator('main').getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Wipe keys from memory' }).click();
  await expect(page.getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();

  await expect(page.getByRole('heading', { name: 'Encrypted seller vault saved in this browser' })).toBeVisible();
  await page.getByLabel('Vault passphrase').fill('wrong phrase here');
  await page.getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await expect(page.locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);

  await page.getByLabel('Vault passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Unlock saved vault' }).click();
  await expect(page.getByText(metaAddress, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Vault passphrase')).toHaveValue('');
});
