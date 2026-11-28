import { expect, test } from '@playwright/test';
import { generateKeys } from './helpers';

test('read-only sample opens offline, shows fees and disclosures, and leaves no wallet or storage activity', async ({ page, context }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.assign(window, { sampleWalletCalls: calls, ethereum: {
      request: ({ method }: { method: string }) => { calls.push(method); throw new Error('Unexpected wallet request'); },
    } });
    window.addEventListener('eip6963:requestProvider', () => { calls.push('discovery'); });
  });
  await page.goto('/');
  const summary = page.locator('#home-sample summary');
  await expect(summary).toBeVisible();
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', (r) => { requests.push(r.url()); });
  const snapshot = () => page.evaluate(() => ({
    url: location.href, local: { ...localStorage }, session: { ...sessionStorage },
    wallet: (window as unknown as { sampleWalletCalls: string[] }).sampleWalletCalls,
  }));
  const before = await snapshot();
  expect(before.wallet).toEqual([]);
  await context.setOffline(true);
  await summary.tap();
  const sample = page.locator('#home-sample');
  for (const value of ['0.010 ETH', 'Sepolia', '15 minutes after issue', '0.0101 ETH']) {
    await expect(sample.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(sample.getByText('0.0001 ETH', { exact: true })).toBeVisible();
  await expect(sample.getByText(/your selected account/)).toBeVisible();
  await expect(sample.getByRole('button')).toHaveCount(0);
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', await page.locator('html').evaluate(el => el.clientWidth));
  await summary.tap();
  await expect(sample.getByText('Sepolia')).toBeHidden();
  expect(await snapshot()).toEqual(before);
  expect(requests).toEqual([]);
});

test('restore shortcut opens and focuses the encrypted keystore importer only when requested', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const summary = page.locator('#keystore-import summary');
  for (let visit = 0; visit < 2; visit++) {
    await page.getByRole('button', { name: 'Restore from a backup' }).tap();
    await expect(summary).toBeFocused();
    await expect(page.locator('#keystore-import')).toHaveJSProperty('open', true);
    await expect(page.locator('#keystore-import input[type="file"]').first()).toBeVisible();
    await nav.getByRole('button', { name: 'Home', exact: true }).tap();
  }
  await nav.getByRole('button', { name: 'Seller keys' }).tap();
  await expect(page.locator('#keystore-import')).toHaveJSProperty('open', false);
});

test('returning to Home with keys loaded preserves the seller identity', async ({ page }) => {
  await page.goto('/');
  const identity = await generateKeys(page);
  await page.locator('nav [data-view="home"]').tap();
  await expect(page.getByRole('button', { name: 'Restore from a backup' })).toHaveCount(0);
  await expect(page.getByText(/Seller keys are already loaded/)).toBeVisible();
  await page.getByText(/Seller keys are already loaded/).getByRole('button', { name: 'Seller keys', exact: true }).tap();
  await expect(page.locator('#keys-h').locator('..').getByText(identity, { exact: true }).first()).toBeVisible();
});

test('translated homepage controls fit with doubled text, including right-to-left reading order', async ({ page }) => {
  for (const locale of ['en', 'es', 'ja', 'ar']) {
    await page.goto('/');
    await page.evaluate(lang => localStorage.setItem('ghostpay.locale', lang), locale);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (locale === 'ar') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const summary = page.locator('#home-sample summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#home-sample')).toHaveJSProperty('open', true);
    for (const control of [page.locator('#home-sample'), page.locator('#home-restore-help')]) {
      const fits = await control.evaluate(el => {
        const box = el.getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth + 1 && box.left >= -1 && box.right <= document.documentElement.clientWidth + 1;
      });
      expect(fits, locale).toBe(true);
    }
    await summary.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#home-sample')).toHaveJSProperty('open', false);
  }
});
