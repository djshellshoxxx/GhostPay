import { expect, test, type Page } from '@playwright/test';
import { createInvoice, generateKeys } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
});

async function copyInvoiceLink(page: Page) {
  await generateKeys(page);
  // A signed synthetic invoice exercises the button without putting a bearer key in test artifacts.
  const link = await createInvoice(page, { encrypt: false });
  const clipboard = await page.evaluateHandle(() => {
    const state = { text: '', reads: 0, writes: 0 };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText() { state.reads++; return Promise.resolve(state.text); },
        writeText(text: string) { state.text = text; state.writes++; return Promise.resolve(); },
      },
    });
    return state;
  });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  // Pass only booleans and counts to the test reporter when a clipboard check fails.
  const snapshot = async (expected = link) => {
    const { text, reads, writes } = await clipboard.jsonValue();
    return { matches: text === expected, reads, writes };
  };
  expect(await snapshot()).toEqual({ matches: true, reads: 0, writes: 1 });
  return snapshot;
}

async function chooseDelay(page: Page, seconds: number) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  const preference = page.getByLabel('Clear copied invoice links');
  await expect(preference).toHaveValue('0');
  await preference.selectOption({ label: `${String(seconds)} seconds` });
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  await page.reload();
}

test('Copy link leaves the clipboard alone by default', async ({ page }) => {
  const snapshot = await copyInvoiceLink(page);
  await page.clock.fastForward(300_001);
  expect(await snapshot()).toEqual({ matches: true, reads: 0, writes: 1 });
});

test('Copy link clears an unchanged invoice link at the saved delay', async ({ page }) => {
  await chooseDelay(page, 60);
  const snapshot = await copyInvoiceLink(page);
  await page.clock.fastForward(59_999);
  expect(await snapshot()).toEqual({ matches: true, reads: 0, writes: 1 });
  await page.clock.fastForward(1);
  expect(await snapshot('')).toMatchObject({ matches: true, writes: 2 });
});

test('Copy link preserves text copied before the saved delay expires', async ({ page }) => {
  await chooseDelay(page, 30);
  const snapshot = await copyInvoiceLink(page);
  await page.clock.fastForward(29_999);
  await page.evaluate(() => navigator.clipboard.writeText('newer text'));
  await page.clock.fastForward(1);
  const state = await snapshot('newer text');
  expect(state.matches).toBe(true);
  expect(state.reads).toBeGreaterThan(0);
  expect(state.writes).toBe(2);
});

test('copying the same invoice link again gets a full delay after the write completes', async ({ page }) => {
  await chooseDelay(page, 30);
  const snapshot = await copyInvoiceLink(page);
  await page.clock.fastForward(29_999);
  await page.evaluate(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = async (text: string) => {
      await write(text);
      if (text !== '') await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
    };
  });
  await page.getByRole('button', { name: 'Copied', exact: true }).click();
  await page.clock.fastForward(1);
  expect(await snapshot()).toEqual({ matches: true, reads: 0, writes: 2 });
  await page.clock.fastForward(1_999); // The second write is acknowledged here.
  await page.clock.fastForward(29_999);
  expect(await snapshot()).toEqual({ matches: true, reads: 0, writes: 2 });
  await page.clock.fastForward(1);
  expect((await snapshot('')).matches).toBe(true);
});
