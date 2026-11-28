import { expect, test } from '@playwright/test';

test('the beta home directory opens every core destination and ends with the testnet disclaimer', async ({ page }) => {
  test.skip(process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] !== 'lean', 'The directory belongs to the lean Pages profile.');
  await page.goto('./');
  const guide = page.locator('.beta-guide-list');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const routes = await nav.locator('button:not([data-view="home"])').evaluateAll((buttons) => buttons.map((b) => (b as HTMLButtonElement).dataset['view'] ?? ''));
  await expect(guide.getByRole('button')).toHaveCount(routes.length);
  for (const [index, route] of routes.entries()) {
    await guide.getByRole('button').nth(index).click();
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('data-view', route);
    await nav.locator('[data-view="home"]').click();
  }
  await expect(page.getByRole('contentinfo').locator(':scope > :last-child')).toHaveText(/use test assets only/i);
});
