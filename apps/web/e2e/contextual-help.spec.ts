import { expect, test, type Page } from '@playwright/test';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';

async function settings(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('navigation').locator('button[data-view="settings"]').click();
  await expect(page.getByRole('heading', { level: 2, name: 'Settings', exact: true })).toBeVisible();
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
}

test.afterEach(async ({ page }, info) => { await retainAccessibilityAudit(page, info); });

test('contextual RPC help is described, keyboard operable and dismissible at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await settings(page);
  const input = page.getByRole('textbox', { name: 'Base Sepolia RPC URL', exact: true });
  const help = page.getByRole('button', { name: 'About Base Sepolia RPC URL', exact: true });
  const tooltip = page.locator('.context-help').filter({ has: help }).getByRole('tooltip', { includeHidden: true });
  // Navigation left the pointer over the page; focus-driven scrolling must not turn this into a hover test.
  await page.mouse.move(0, 0);
  const before = await input.inputValue();
  await expect(input).toHaveAccessibleDescription(/An RPC provider supplies blockchain data/);
  await help.focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('A second, independent provider');
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await noHorizontalOverflow(page);
  await auditAccessibility(page, 'settings-help-open-375px');
  await help.press('Escape');
  await expect(tooltip).toBeHidden();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(help).toBeFocused();
  await help.press('Enter');
  await expect(tooltip).toBeVisible();
  await expect(help).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Test Base Sepolia', exact: true })).toBeFocused();
  await expect(tooltip).toBeHidden();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await expect(input).toHaveValue(before);
});

test('large QR confines keyboard focus, scrolls on short screens and preserves bytes under RTL', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  await settings(page);
  await page.getByRole('button', { name: 'Show settings QR', exact: true }).click();
  const frame = page.locator('.qr-frame[data-qr-kind="device"]');
  const path = await frame.locator('path.qr-fg').getAttribute('d');
  const opener = frame.getByRole('button', { name: 'Show larger', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog');
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeFocused();
  await close.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.getByRole('navigation').locator('button[data-view="settings"]').focus();
  await expect(close).toBeFocused();
  await dialog.evaluate((element) => { element.scrollTop = 0; });
  const heading = await dialog.locator('.qr-large-label').boundingBox();
  expect(heading?.y).toBeGreaterThanOrEqual(0);
  await close.scrollIntoViewIfNeeded();
  await expect(close).toBeInViewport();
  await auditAccessibility(page, 'preferences-qr-dialog-375px');
  await close.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await frame.locator('path.qr-fg').getAttribute('d')).toBe(path);
  await noHorizontalOverflow(page);
  await auditAccessibility(page, 'preferences-qr-rtl-375px');
});
