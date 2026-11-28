import { expect, test, type Page } from '@playwright/test';
import { configureRpc, mockNetwork, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { generateKeys } from './helpers';

async function expectControlHelp(page: Page): Promise<void> {
  const selector = ['button', 'a[href]', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
    'progress', 'output', 'video', '[tabindex="0"]', '[role="img"]', '[role="status"]', '[role="alert"]'].join(',');
  const missing = await page.locator(selector).evaluateAll((nodes) => nodes.filter((node) => {
    if (!node.getClientRects().length || node.closest('[hidden], [inert], [aria-hidden="true"], .sr-only')) return false;
    if (node.getAttribute('aria-description')?.trim()) return false;
    return !(node.matches('.context-help-button') && document.getElementById(node.getAttribute('aria-describedby') ?? '')?.textContent?.trim());
  }).map((node) => node.tagName + ' ' + (node.getAttribute('type') ?? '') + ' ' + (node.getAttribute('class') ?? '')));
  expect(missing).toEqual([]);
}

test('beta routes and conditionally revealed controls carry instructions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('button[data-view="home"]')).toBeVisible();
  test.skip(await page.locator('button[data-view="btc"]').count() > 0, 'Inventory covers the nine shipped beta routes.');
  await generateKeys(page);
  for (const view of ['home', 'seller', 'create', 'pay', 'scan', 'sweep', 'registry', 'settings', 'about']) {
    const link = page.locator(`button[data-view="${view}"]`);
    await link.click();
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expectControlHelp(page);
    // Include controls rendered inside collapsed native disclosures.
    for (const summary of await page.locator('main details:not([open]) > summary:visible').all()) {
      await summary.evaluate((element) => { (element.parentElement as HTMLDetailsElement).open = true; });
    }
    await expectControlHelp(page);
  }
});

test('hover, keyboard focus and Escape explain actions without activating them', async ({ page }) => {
  await page.goto('/');
  const settings = page.locator('button[data-view="settings"]');
  const bubble = page.locator('.control-tip-bubble');
  await settings.hover();
  await expect(bubble).toHaveText(/Configure endpoints/);
  await expect(page.locator('[data-view="home"]')).toHaveAttribute('aria-current', 'page');
  await page.mouse.move(0, 0);
  await settings.focus();
  await expect(bubble).toBeVisible();
  await settings.press('Escape');
  await expect(bubble).toBeHidden();
  await expect(settings).toBeFocused();
  await settings.press('Enter');
  await expect(settings).toHaveAttribute('aria-current', 'page');
});

test.describe('inline help on touchscreens', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 680 } });
  test('explains a checkbox and a disabled action without changing form state', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-view="seller"]').tap();
    const details = page.locator('details').filter({ has: page.locator('input[type="file"]') }).first();
    await details.locator('summary').tap();
    const importButton = details.getByRole('button', { name: 'Use pasted text', exact: true });
    await expect(importButton).toBeDisabled();
    const input = details.locator('input[type="password"]');
    const privateText = 'synthetic-passphrase-value-for-help-test';
    await input.fill(privateText);
    const toggle = page.getByRole('checkbox', { name: 'Show control tips', exact: true });
    await toggle.tap();
    await expect(input).toHaveValue(privateText);
    await expect(importButton.locator('+ .control-tip-inline')).toHaveText(/Read and check the pasted text/);
    await expect(page.locator('.control-tip-inline').filter({ hasText: privateText })).toHaveCount(0);
    await expect(importButton).toBeDisabled();
    const privacy = page.getByRole('switch');
    await privacy.locator('+ .control-tip-inline').tap();
    await expect(privacy).not.toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await toggle.tap();
    await expect(page.locator('.control-tip-inline')).toHaveCount(0);
    await expect(input).toHaveValue(privateText);
  });
});

test('explains both sweep radio choices before the seller selects a route or signs', async ({ page, context }) => {
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  stageVerifiedErc20Payment(state, await generateKeys(page));
  await page.locator('[data-view="scan"]').click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  const sweep = page.getByRole('button', { name: 'Sweep this payment' });
  await expect(sweep).toBeVisible();
  await expectControlHelp(page);
  await sweep.click();
  const direct = page.getByRole('radio', { name: /Directly/ });
  const relay = page.getByRole('radio', { name: /Through the relayer/ });
  const selected = await direct.isChecked();
  await expect(direct).toHaveAccessibleDescription(/native coin to pay the network fee/);
  await expect(relay).toHaveAccessibleDescription(/quoted fee before signing/);
  await page.getByRole('checkbox', { name: 'Show control tips' }).check();
  await expect(direct.locator('+ .control-tip-inline')).toBeVisible();
  await expect(relay.locator('+ .control-tip-inline')).toBeVisible();
  expect(await direct.isChecked()).toBe(selected);
  expect(state.sent).toBeUndefined();
  await expectControlHelp(page);
});
