import { expect, test, type Page } from '@playwright/test';

async function rpcRows(page: Page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
  const rpcGroup = page.locator('main form fieldset').first();
  await expect(rpcGroup).toBeVisible();
  const rows = rpcGroup.locator(':scope > .row, :scope > .rpc-row');
  expect(await rows.count()).toBeGreaterThan(0);
  return rows;
}

test('both RPC URLs have usable width and do not overlap at 900 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 850 });
  const rows = await rpcRows(page);
  for (const row of await rows.all()) {
    const inputs = row.locator('input[type="url"]');
    await expect(inputs).toHaveCount(2);
    const primary = await inputs.nth(0).boundingBox();
    const secondary = await inputs.nth(1).boundingBox();
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    if (primary === null || secondary === null) throw new Error('An RPC URL input was not laid out');
    expect(primary.width).toBeGreaterThanOrEqual(260);
    expect(secondary.width).toBeGreaterThanOrEqual(260);
    expect(Math.abs(primary.y - secondary.y)).toBeLessThan(12);
    expect(primary.x + primary.width).toBeLessThanOrEqual(secondary.x + 1);
    expect(secondary.x + secondary.width).toBeLessThanOrEqual(901);
  }
});

test('RPC URL inputs and test controls reflow without page scrolling at 320 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const rows = await rpcRows(page);
  for (const row of await rows.all()) {
    const inputs = row.locator('input[type="url"]');
    await expect(inputs).toHaveCount(2);
    const primary = await inputs.nth(0).boundingBox();
    const secondary = await inputs.nth(1).boundingBox();
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    if (primary === null || secondary === null) throw new Error('An RPC URL input was not laid out');
    expect(secondary.y).toBeGreaterThan(primary.y + primary.height);
    for (const element of await row.locator('input, button').all()) {
      const rect = await element.boundingBox();
      expect(rect).not.toBeNull();
      if (rect !== null) {
        expect(rect.x).toBeGreaterThanOrEqual(-1);
        expect(rect.x + rect.width).toBeLessThanOrEqual(321);
      }
    }
  }
  const pageWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  expect(pageWidth).toBeLessThanOrEqual(321);
});
