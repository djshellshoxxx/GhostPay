import { expect, test, type Page } from '@playwright/test';
import { generateKeys } from './helpers';

const settings = async (page: Page): Promise<void> => {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
};
const clipboard = (page: Page): Promise<string> => page.evaluate(() => navigator.clipboard.readText());
const seller = (page: Page) => page.locator('section[aria-labelledby="keys-h"]');
const pauseClock = async (page: Page): Promise<void> => {
  await page.clock.install({ time: new Date('2026-11-20T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-20T01:00:00Z'));
};

test('clipboard privacy: saved opt-in clears the current copy, preserves replacement text, and can be disabled', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pauseClock(page);
  await page.goto('/');
  await settings(page);
  const preference = page.getByLabel('Clear copied data automatically', { exact: true });
  await expect(preference).toHaveValue('0');
  await preference.selectOption('30000');
  await page.reload();
  await settings(page);
  await expect(preference).toHaveValue('30000');

  const meta = await generateKeys(page);
  await seller(page).getByRole('button', { name: 'Copy meta-address', exact: true }).click();
  await expect.poll(() => clipboard(page)).toBe(meta);
  await page.clock.runFor(29_999);
  expect(await clipboard(page)).toBe(meta);
  await page.clock.runFor(1);
  await expect.poll(() => clipboard(page)).toBe('');

  await seller(page).getByRole('button', { name: 'Copied', exact: true }).click();
  await expect.poll(() => clipboard(page)).toBe(meta);
  await page.evaluate(() => navigator.clipboard.writeText('newer clipboard content'));
  await page.clock.runFor(30_000);
  expect(await clipboard(page)).toBe('newer clipboard content');

  await seller(page).getByRole('button', { name: 'Copied', exact: true }).click();
  await expect.poll(() => clipboard(page)).toBe(meta);
  await settings(page); // The copying component unmounts before the preference changes.
  await preference.selectOption('0');
  await page.clock.runFor(300_000);
  expect(await clipboard(page)).toBe(meta);
  expect(await page.evaluate(() => localStorage.getItem('ghostpay.settings.v1') ?? '')).not.toContain(meta);
  expect(await page.evaluate(() => localStorage.getItem('ghostpay.uiPrivacy.v1'))).not.toContain(meta);
  await page.evaluate(() => navigator.clipboard.writeText(''));
});

test('clipboard privacy: a denied automatic read leaves the successful user copy intact', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pauseClock(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => { errors.push(error.message); });
  await page.goto('/');
  await settings(page);
  await page.getByLabel('Clear copied data automatically', { exact: true }).selectOption('30000');
  const meta = await generateKeys(page);
  // Permission fault injection only: writes still use the browser clipboard. This is not an OS permission prompt test.
  await page.evaluate(() => {
    const native = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      readText: () => Promise.reject(new DOMException('Read permission denied', 'NotAllowedError')),
      writeText: native.writeText.bind(native),
    } });
  });
  await seller(page).getByRole('button', { name: 'Copy meta-address', exact: true }).click();
  await expect(seller(page).getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
  await page.clock.runFor(30_000);
  await page.evaluate(() => { Reflect.deleteProperty(navigator, 'clipboard'); });
  expect(await clipboard(page)).toBe(meta);
  expect(errors).toEqual([]);
  await page.evaluate(() => navigator.clipboard.writeText(''));
});
