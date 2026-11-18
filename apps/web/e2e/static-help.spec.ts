import { expect, test } from '@playwright/test';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';

test.afterEach(async ({ page }, info) => { await retainAccessibilityAudit(page, info); });

for (const guide of [
  { path: '/help.html', heading: 'Invoices, receipts and recovery', title: /GhostPay help/ },
  { path: '/privacy.html', heading: 'Privacy and local data', title: /GhostPay privacy/ },
]) {
  test(`${guide.path} keeps local assets and accessible content at mobile, tablet and desktop widths`, async ({ page }) => {
    const response = await page.goto(guide.path);
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveTitle(guide.title);
    await expect(page.getByRole('heading', { level: 1, name: guide.heading, exact: true })).toBeVisible();
    expect(await page.locator('.brand img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.locator('link[rel="stylesheet"]').evaluate((link) => (link as HTMLLinkElement).sheet !== null)).toBe(true);

    for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
      await auditAccessibility(page, `${guide.path}-${String(viewport.width)}px`);
    }
    const skip = page.locator('a.skip');
    await skip.focus();
    await expect(skip).toBeInViewport();
    await skip.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });
}

test.describe('help without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the no-JavaScript entry links to usable local help and privacy pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'This app needs JavaScript', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Help without JavaScript' }).getByRole('link', { name: /^Help:/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices, receipts and recovery', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy and local data', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What stays in this browser', exact: true })).toBeVisible();
  });
});
