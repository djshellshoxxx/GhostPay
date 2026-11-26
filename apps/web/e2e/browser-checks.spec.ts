import { expect, test, type Page } from '@playwright/test';
import { auditAccessibility } from './accessibility-audit';

// Synthetic browser faults, applied before app scripts run: an insecure-context flag, a wrong SHA-256 answer for the
// self-check's known-answer input only, and a refused write for the self-check's storage probe only. The rest of the
// app keeps real WebCrypto and storage, so no other feature is altered by the fixture.
async function injectBrowserFaults(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, get: () => false });
    const subtle = window.crypto.subtle;
    const digest = subtle.digest.bind(subtle);
    Object.defineProperty(subtle, 'digest', {
      configurable: true,
      value: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        if (bytes.length === 3 && bytes[0] === 97 && bytes[1] === 98 && bytes[2] === 99) return Promise.resolve(new ArrayBuffer(32));
        return digest(algorithm, data);
      },
    });
    const setItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')?.value as (this: Storage, key: string, value: string) => void;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key.startsWith('__ghostpay_capability_')) throw new DOMException('Synthetic refusal', 'SecurityError');
      setItem.call(this, key, value);
    };
  });
}

function selfChecks(page: Page) {
  return page.getByRole('contentinfo').getByRole('region', { name: 'Browser self-checks' });
}

test('the self-check footer passes on a secure local preview and stays on every main view', async ({ page }) => {
  await page.goto('/');
  const region = selfChecks(page);
  await expect(region.locator('summary')).toContainText('All browser capability checks passed');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const view of ['Create invoice', 'Pay', 'Settings', 'About and privacy']) {
    await nav.getByRole('button', { name: view, exact: true }).click();
    await expect(selfChecks(page).locator('summary')).toContainText('All browser capability checks passed');
  }
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('__ghostpay_capability_')))).toEqual([]);
});

test('failed and unavailable capabilities are explained, accessible and reflow at 320 CSS pixels', async ({ page }) => {
  await injectBrowserFaults(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const region = selfChecks(page);
  const summary = region.locator('summary');
  await expect(summary).toContainText('Check browser capabilities');
  await summary.click();
  const items = region.locator('.browser-checks-list li');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0).locator('strong')).toHaveText('Failed');
  await expect(items.nth(0)).toContainText('not in a secure context');
  await expect(items.nth(1).locator('strong')).toHaveText('Failed');
  await expect(items.nth(1)).toContainText('returned a wrong result or an error');
  await expect(items.nth(2).locator('strong')).toHaveText('Unavailable');
  await expect(items.nth(2)).toContainText('refused site storage');
  await expect(region.locator('.browser-checks-explain')).toHaveCount(3);
  for (const explanation of await region.locator('.browser-checks-explain').all()) await expect(explanation).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const wide = [...document.querySelectorAll<HTMLElement>('.browser-checks, .browser-checks *')]
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).length;
    return { page: root.scrollWidth - root.clientWidth, wide };
  });
  expect(overflow).toEqual({ page: 0, wide: 0 });
  await region.scrollIntoViewIfNeeded();
  await auditAccessibility(page, 'browser-self-checks-attention-320');
});
