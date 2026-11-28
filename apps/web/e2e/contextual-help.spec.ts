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
  // The secondary RPC URL is a real tab stop between the primary field's help and its Test button.
  // Preserve its keyboard accessibility rather than assuming Tab skips an inserted input.
  const secondary = page.locator('.rpc-row').filter({ has: input }).locator('input[type="url"]').nth(1);
  await page.keyboard.press('Tab');
  await expect(secondary).toBeFocused();
  await expect(tooltip).toBeHidden();
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Test Base Sepolia', exact: true })).toBeFocused();
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

// An open in-flow explanation must not swallow the click on a control below it. Collapsing it during the press (on
// pointerdown, or on the focus change a press causes) moves that control before the release, so the release lands
// elsewhere and the control is never activated. Seen as a lost "Decrypt and load" in the keystore re-import journey.
for (const [how, open] of [
  ['opened by clicking its button', async (help: ReturnType<Page['getByRole']>) => { await help.click(); }],
  ['opened by keyboard focus', async (help: ReturnType<Page['getByRole']>) => { await help.focus(); }],
  ['opened by hover', async (help: ReturnType<Page['getByRole']>) => { await help.hover(); }],
] as const) {
  test(`a control below help ${how} receives the click that closes the help`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Seller keys', exact: true }).click();
    await page.getByText('Import an encrypted keystore', { exact: true }).click();
    const decrypt = page.getByRole('button', { name: 'Decrypt and load', exact: true });
    const form = page.locator('form').filter({ has: decrypt });
    await form.evaluate((f) => {
      (window as unknown as { submits: number }).submits = 0;
      f.addEventListener('submit', (event) => { event.preventDefault(); (window as unknown as { submits: number }).submits += 1; }, true);
    });
    const help = page.getByRole('button', { name: 'About Keystore file', exact: true });
    await page.mouse.move(0, 0);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    // Focus or a pointer move may scroll the viewport. Compare positions in the document.
    const documentY = (): Promise<number> => decrypt.evaluate((button) => button.getBoundingClientRect().top + window.scrollY);
    const closedY = await documentY();
    await open(help);
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    // The open explanation sits in the page flow above the button.
    expect(await documentY()).toBeGreaterThan(closedY);
    await decrypt.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(1);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
  });
}

test.describe('touch', () => {
  test.use({ hasTouch: true });
  test('a control below help opened by a tap receives the next tap', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Seller keys', exact: true }).tap();
    await page.getByText('Import an encrypted keystore', { exact: true }).tap();
    const decrypt = page.getByRole('button', { name: 'Decrypt and load', exact: true });
    const form = page.locator('form').filter({ has: decrypt });
    await form.evaluate((f) => {
      (window as unknown as { submits: number }).submits = 0;
      f.addEventListener('submit', (event) => { event.preventDefault(); (window as unknown as { submits: number }).submits += 1; }, true);
    });
    const help = page.getByRole('button', { name: 'About Keystore file', exact: true });
    await help.tap();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await decrypt.tap();
    await expect.poll(() => page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(1);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
  });
});
