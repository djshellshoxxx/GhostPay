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
    const stylesheets = page.locator('link[rel="stylesheet"]');
    await expect(stylesheets).toHaveCount(2);
    expect(await stylesheets.evaluateAll((links) => links.every((link) => (link as HTMLLinkElement).sheet !== null))).toBe(true);

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

  for (const path of ['/help.html', '/privacy.html']) {
    test(`${path} returns keyboard focus to the heading from the footer`, async ({ page }) => {
      await page.goto(path);
      const backToTop = page.getByRole('contentinfo').getByRole('link', { name: 'Back to top', exact: true });
      await backToTop.press('Enter');
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeFocused();
      await expect(heading).toBeInViewport();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Open app', exact: true })).toBeFocused();
    });
  }

  test('the no-JavaScript entry links to usable local help and privacy pages', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('main').getByRole('link', { name: 'help guide', exact: true })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'This app needs JavaScript', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Help without JavaScript' }).getByRole('link', { name: /^Help:/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invoices, receipts and recovery', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy and local data', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What stays in this browser', exact: true })).toBeVisible();
  });
});

test.describe('help guide coverage', () => {
  test('the guide covers every required topic and has no inline styles or scripts', async ({ page }) => {
    await page.goto('/help.html');
    for (const heading of [
      'Start here (plain language)',
      'How a payment works',
      'Keys and backups',
      'Connect a wallet',
      'Create an invoice',
      'Pay an invoice',
      'What counts as evidence',
      'Receipts and QR codes',
      'RPC and network configuration',
      'Privacy in brief',
      'Merchant guidance',
      'Contextual help in the app',
      'Technical glossary',
      'Accessibility and layout',
    ]) {
      // Numbered headings ("1. How a payment works") match as substrings.
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(page.locator('[style]')).toHaveCount(0);
    await expect(page.locator('script')).toHaveCount(0);
    await expect(page.locator('.flow-lanes .flow > li')).toHaveCount(10);
  });

  test('merchant help preserves ordinary reconciliation without promising excluded products', async ({ page }) => {
    await page.goto('/help.html');
    const merchant = page.getByRole('table', { name: 'Merchant capabilities and their status' });
    for (const [name, notes] of [
      ['Aggregate merchant dashboard (totals and records)', 'Archived indefinitely; ordinary invoice status and reconciliation remain available'],
      ['Subscriptions and installments', 'Outside the browser payment and recovery scope'],
      ['Point-of-sale terminal and NFC', 'Terminal product archived; ordinary invoice QR exchange remains available'],
    ] as const) {
      const row = merchant.getByRole('row').filter({
        has: page.getByRole('rowheader', { name, exact: true }),
      });
      await expect(row).toHaveCount(1);
      await expect(row).toBeVisible();
      await expect(row.getByRole('cell').first()).toHaveText('Unsupported beta and v1.0');
      await expect(row.getByRole('cell').last()).toHaveText(notes);
    }
    const ledger = merchant.getByRole('row').filter({
      has: page.getByRole('rowheader', { name: 'Per-invoice payment summary in the scan ledger', exact: true }),
    });
    await expect(ledger.getByRole('cell').first()).toHaveText('Implemented Both builds');
    await expect(page.getByText('Keep aggregate bookkeeping outside the app.', { exact: false })).toContainText('excluded products have no scheduled restart.');
  });

  test('the privacy matrix uses only the status labels defined by the guide legend', async ({ page }) => {
    await page.goto('/help.html');
    const legend = (await page.locator('.legend .status').allTextContents()).map((s) => s.trim()).sort();
    expect(legend).toEqual(['Experimental', 'Implemented', 'Planned', 'Unsupported']);
    await page.goto('/privacy.html');
    await expect(page.getByRole('table', { name: 'What each feature stores, exposes and leaves unprotected' })).toBeVisible();
    const used = new Set((await page.locator('.matrix .status').allTextContents()).map((s) => s.trim()));
    expect(used.size).toBeGreaterThan(1);
    for (const status of used) expect(legend).toContain(status);
  });
});

test.describe('static recovery and privacy guidance', () => {
  test.use({ javaScriptEnabled: false });

  test('explains idle lock, master-backup recovery and the Pay request file', async ({ page }) => {
    await page.goto('/help.html');
    await expect(page.locator('#idle-lock')).toContainText('only when it can confirm a recoverable copy');
    await expect(page.locator('#idle-lock')).toContainText('the keys stay in memory for recovery');

    const master = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Master stealth key backup/ }) });
    await expect(master.getByRole('cell').nth(0)).toContainText('master spending and viewing keys');
    await expect(master.getByRole('cell').nth(1)).toContainText('creates a new invoice-signing key');
    await expect(master.getByRole('cell').nth(2)).toHaveText('Implemented both builds');

    const requestFile = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Payment request (Pay)' }) });
    await expect(requestFile).toContainText('Scan an invoice QR or open a request file');
    await expect(requestFile).toContainText('ghostpay-request.gpr.json (up to 24 KiB)');
    await expect(requestFile).toContainText('Open request file');

    await page.goto('/privacy.html');
    const keys = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Generate a seller key set/ }) });
    await expect(keys).toContainText('If GhostPay cannot confirm a recoverable copy, the keys stay in memory');
  });

  test('walkthrough and privacy summary links focus their destinations with the keyboard', async ({ page }) => {
    await page.goto('/help.html');
    const walkthrough = page.getByRole('region', { name: '1. How a payment works', exact: true });
    for (const [label, target] of [
      ['Keys and backups', 'keys-backups'],
      ['wallet connection steps', 'wallet'],
      ['What counts as evidence', 'evidence'],
    ] as const) {
      await walkthrough.getByRole('link', { name: label, exact: true }).press('Enter');
      await expect(page.locator(`#${target}`)).toBeFocused();
    }

    await page.goto('/privacy.html');
    const topics = page.getByRole('navigation', { name: 'Privacy topics', exact: true });
    for (const label of ['What stays in this browser', 'Who receives requests', 'Links, QR codes and backups']) {
      await topics.getByRole('link', { name: label, exact: true }).press('Enter');
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeFocused();
    }
  });
});
