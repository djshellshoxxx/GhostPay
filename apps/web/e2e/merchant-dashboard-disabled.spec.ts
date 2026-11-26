import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { MERCHANT_DASHBOARD_BUILD } from './merchantDashboardBuild';

test.skip(MERCHANT_DASHBOARD_BUILD, 'this build enables the merchant dashboard on purpose');

test('the merchant dashboard is absent from the default build', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Merchant dashboard' })).toHaveCount(0);
  await expect(page.locator('nav button[data-view="dashboard"]')).toHaveCount(0);

  // The bundler must drop the dashboard code, not merely hide its route.
  const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
  const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);
  for (const name of scripts) {
    const source = readFileSync(assets + name, 'utf8');
    for (const marker of ['ghostpay-payments.csv', 'ghostpay-invoices.', 'ghostpay.dashboard-input/1']) {
      expect(source.includes(marker), `${name} contains ${marker}`).toBe(false);
    }
  }
});
