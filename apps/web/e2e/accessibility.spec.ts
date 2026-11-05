import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys, openFresh, ORIGIN } from './helpers';
import { installSweepNetwork, SWEEP_RPC } from './sweep-network';
import { auditAccessibility, retainAccessibilityAudit } from './accessibility-audit';

const ROUTES = ['Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy'] as const;
test.setTimeout(180_000);

async function visit(page: Page, route: typeof ROUTES[number]): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: route, exact: true });
  const changesRoute = await button.getAttribute('aria-current') !== 'page';
  await button.focus();
  await expect(button).toBeFocused();
  await button.press('Enter');
  await expect(button).toHaveAttribute('aria-current', 'page');
  if (changesRoute) await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toBeVisible();
}

async function assertReflow(page: Page, label: string): Promise<void> {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll<HTMLElement>('main button, main input, main select, main textarea, main summary')]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > width + 1))
      .map(({ element, rect }) => ({ tag: element.tagName, left: rect.left, right: rect.right }));
    return { width, pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), controls };
  });
  expect(layout.width, `${label}: actual CSS viewport width`).toBe(320);
  expect(layout.pageWidth, `${label}: horizontal page scrolling`).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.controls, `${label}: controls remain within the viewport`).toEqual([]);
}

test.beforeEach(async ({ context, page }) => {
  // Authored transport only: product methods, key generation and accessible DOM remain real.
  await installSweepNetwork(context, page, 'success');
  await page.addInitScript((rpc) => {
    localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
  }, SWEEP_RPC);
  await page.goto('/');
});

test.afterEach(async ({ page }, info) => {
  await retainAccessibilityAudit(page, info);
});

test('supported routes have axe coverage and keyboard route focus', async ({ page }) => {
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await auditAccessibility(page, 'home');
  for (const route of ROUTES.slice(1)) {
    await visit(page, route);
    await auditAccessibility(page, route);
    if (route === 'Seller keys') {
      await generateKeys(page);
      await auditAccessibility(page, 'seller-generated-and-explicit-backup-waiver');
    }
  }
});

test('creation, scan and invoice errors remain accessible and signing stays unavailable', async ({ page }) => {
  await generateKeys(page);
  await visit(page, 'Create invoice');
  const create = page.getByRole('region', { name: 'Create invoice', exact: true });
  await expect(create.getByLabel('Token amount', { exact: true })).toBeVisible();
  await expect(create.getByLabel('Item 1 description', { exact: true })).toBeVisible();
  await create.getByRole('button', { name: 'Create invoice link', exact: true }).click();
  await expect(create.getByRole('alert')).toBeVisible();
  await expect(create.getByRole('textbox', { name: 'Link', exact: true })).toHaveCount(0);
  await auditAccessibility(page, 'create-validation-error');

  await visit(page, 'Scan and receive');
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block', { exact: true }).fill('not-a-block');
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  const scan = page.getByRole('region', { name: 'Scan and receive', exact: true });
  await expect(scan.getByRole('alert')).toContainText('Enter the block number to start scanning from.');
  await expect(scan.getByRole('button', { name: 'Sweep this payment', exact: true })).toHaveCount(0);
  await auditAccessibility(page, 'scan-validation-error');

  const link = await createInvoice(page, { description: 'Accessibility authored invoice' });
  await expect(page.locator('.sr-only[role="status"][aria-live="polite"]')).toHaveText('Invoice link created.');
  await auditAccessibility(page, 'signed-invoice-created');
  await openFresh(page, link);
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await expect(page.getByText('Seller receives (net)', { exact: true })).toBeVisible();
  await auditAccessibility(page, 'signed-invoice-review');

  await openFresh(page, `${ORIGIN}/#gpi=v1.not-base64!`);
  const rejected = page.getByRole('region', { name: 'Pay an invoice', exact: true });
  await expect(rejected.getByRole('alert')).toContainText('Invoice rejected');
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send payment in my wallet', exact: true })).toHaveCount(0);
  await auditAccessibility(page, 'malformed-invoice-rejected');
});

test('supported routes reflow at 320 CSS pixels with normal and 200 percent text', async ({ page }) => {
  await generateKeys(page);
  await page.setViewportSize({ width: 320, height: 900 });
  const normalSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  for (const scale of [1, 2]) {
    // Text-only enlargement retains a real320-CSS-pixel viewport; no CSS zoom/transform approximation.
    await page.evaluate((percent) => { document.documentElement.style.fontSize = `${percent}%`; }, scale * 100);
    const textSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(textSize).toBeGreaterThanOrEqual(normalSize * scale - 0.5);
    for (const route of ROUTES) {
      await visit(page, route);
      const label = `${route}-${String(scale * 100)}percent-320px`;
      await assertReflow(page, label);
      await auditAccessibility(page, label);
    }
  }
});

test('supported routes remain accessible with forced colors and reduced motion', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await generateKeys(page);
  const qr = page.locator('section[aria-labelledby="keys-h"] .qr-frame').first();
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((frame) => getComputedStyle(frame).transitionDuration)).toBe('0.2s');
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  expect(await page.evaluate(() => ({
    forcedColors: matchMedia('(forced-colors: active)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))).toEqual({ forcedColors: true, reducedMotion: true });
  expect(await qr.evaluate((frame) => getComputedStyle(frame).transitionDuration)).toBe('0s');
  for (const route of ROUTES) {
    await visit(page, route);
    await auditAccessibility(page, `${route}-forced-colors-and-reduced-motion`);
  }
});
