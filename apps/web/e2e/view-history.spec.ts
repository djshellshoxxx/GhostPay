import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys } from './helpers';

const button = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });

test('private view traversal preserves browser direction, main focus, and branch replacement', async ({ page }) => {
  await page.goto('./?privateMarker=fixture');
  await button(page, 'Settings').click();
  await button(page, 'About and privacy').click();
  expect(await page.evaluate(() => ({ search: location.search, hash: location.hash, state: history.state as unknown })))
    .toEqual({ search: '', hash: '', state: { ghostPayView: { view: 'about', position: 2 } } });
  await page.goBack();
  await expect(button(page, 'Settings')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toBeFocused();
  await page.goForward();
  await expect(button(page, 'About and privacy')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await button(page, 'Pay').click();
  expect(await page.evaluate(() => history.state as unknown)).toEqual({ ghostPayView: { view: 'pay', position: 2 } });
  await page.reload();
  await expect(button(page, 'Pay')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(button(page, 'Settings')).toHaveAttribute('aria-current', 'page');
});

test('leaving or forgetting a retained invoice prevents its contents from returning on Back and Forward', async ({ page }) => {
  await page.goto('./');
  await generateKeys(page);
  const link = await createInvoice(page, { description: 'Private fixture', chainLabel: 'Ethereum Sepolia' });
  await button(page, 'Settings').click();
  await page.getByRole('checkbox', { name: 'Remove the invoice from the address bar after reading it' }).uncheck();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await button(page, 'Home').click();
  await page.evaluate((url) => { location.hash = new URL(url).hash; }, link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toContain('#gpi=');
  await page.goBack();
  await expect(button(page, 'Home')).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(button(page, 'Pay')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Pay an invoice' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => Object.keys(history.state as Record<string, unknown>))).toEqual(['ghostPayView']);
  await page.evaluate((url) => { location.hash = new URL(url).hash; }, link);
  await page.getByRole('button', { name: 'Forget this invoice' }).click();
  expect(new URL(page.url()).hash).toBe('');
  await button(page, 'About and privacy').click();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Pay an invoice' })).toBeVisible();
  await expect(page.getByText('Private fixture', { exact: true })).toHaveCount(0);
});

test('a pending Settings decision can cancel Back without losing its Forward destination', async ({ page }) => {
  await page.goto('./');
  await button(page, 'About and privacy').click();
  await button(page, 'Settings').click();
  await page.evaluate(() => {
    window.addEventListener('ghostpay:settings-navigation', (event) => {
      event.preventDefault();
      (event as CustomEvent<{ cancel(): void }>).detail.cancel();
    }, { once: true });
  });
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (history.state as {ghostPayView?: {view: string}} | null)?.ghostPayView?.view)).toBe('settings');
  await expect(button(page, 'Settings')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(button(page, 'About and privacy')).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(button(page, 'Settings')).toHaveAttribute('aria-current', 'page');
});

for (const width of [320, 375]) {
  test(`keyboard navigation and the first Home action fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto('./');
    await expect(page.locator('#home-h + .cards .btn-primary').first()).toBeInViewport({ ratio: 1 });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('button').first().focus();
    for (let n = 1; n < await nav.getByRole('button').count(); n++) await page.keyboard.press('Tab');
    await expect(button(page, 'About and privacy')).toBeFocused();
    await expect(button(page, 'About and privacy')).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
}
