import { expect, test, type Page } from '@playwright/test';
import { generateKeys } from './helpers';

async function saveDelay(page: Page, seconds: 0 | 30 | 60) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Clear copied invoice links and other sensitive data').selectOption(String(seconds));
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
}

async function mockClipboard(page: Page) {
  return page.evaluateHandle(() => {
    const state = { value: '', reads: 0, writes: 0 };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      readText: () => { state.reads++; return Promise.resolve(state.value); },
      writeText: (value: string) => { state.writes++; state.value = value; return Promise.resolve(); },
    } });
    return state;
  });
}

test('seller address and pairing config share the saved delay across navigation', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await saveDelay(page, 30);
  await page.reload();
  const meta = await generateKeys(page);
  const config = await page.getByLabel('Same config as text').inputValue();
  const clipboard = await mockClipboard(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.getByRole('button', { name: 'Copy meta-address', exact: true }).click();
  expect(await clipboard.evaluate((state, text) => state.value === text, meta)).toBe(true);
  await page.clock.fastForward(29_999);
  await page.getByRole('button', { name: 'Copy config text', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Home', exact: true }).click();
  await page.clock.fastForward(1);
  expect(await clipboard.evaluate((state, text) => state.reads === 0 && state.value === text, config)).toBe(true);
  await page.clock.fastForward(29_999);
  expect(await clipboard.evaluate((state) => state.value === '' && state.writes === 3)).toBe(true);
});

test('saving Off after leaving Seller keys cancels its outstanding clipboard check', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await saveDelay(page, 60);
  const meta = await generateKeys(page);
  const clipboard = await mockClipboard(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.getByRole('button', { name: 'Copy meta-address', exact: true }).click();
  await saveDelay(page, 0);
  await page.clock.fastForward(60_001);
  expect(await clipboard.evaluate((state, text) => state.reads === 0 && state.writes === 1 && state.value === text, meta)).toBe(true);
});
