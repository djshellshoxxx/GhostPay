import { expect, test } from '@playwright/test';
import { createInvoice, generateKeys } from './helpers';

/*
 * Pins the accepted focus scope of AppShell's [view, fragment] effect (SEC-30 / R-04): besides deep-link arrivals it
 * also moves focus to <main> after an in-view paste "Read" that changes the invoice fragment, because the pressed
 * control unmounts and focus would otherwise drop to <body>. A rejected paste changes nothing and keeps focus in place.
 */
test('in-view paste "Read" moves focus to main once the invoice loads; a rejected paste keeps focus on the control', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { chainLabel: 'Ethereum Sepolia' });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pay an invoice' })).toBeVisible();

  const box = page.getByLabel('Paste an invoice link');
  const read = page.getByRole('button', { name: 'Read invoice', exact: true });
  await box.fill('https://app.test/nothing here');
  await read.click();
  await expect(page.getByRole('alert')).toContainText(/not a GhostPay v1/);
  await expect(read).toBeFocused();

  await box.fill(link);
  await read.click();
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await expect(read).toHaveCount(0);
  await expect(page.locator('main#main')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});
