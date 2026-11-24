import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const example = new URL('../../../examples/pos-terminal/', import.meta.url);
const qrScript = createRequire(import.meta.url).resolve('qrcode-generator');
const link = 'https://pos.example/#gpi=v1.synthetic';
const epoch = new Date('2026-01-01T00:00:00Z');

test.beforeEach(async ({ page }) => {
  await page.route('**/pos-example/**', async route => {
    const file = new URL(route.request().url()).pathname.slice('/pos-example/'.length);
    if (file === 'vendor/qrcode.js') return route.fulfill({ path: qrScript, contentType: 'text/javascript' });
    if (['index.html', 'pos.css', 'pos.js', 'pos-logic.js'].includes(file))
      return route.fulfill({ path: fileURLToPath(new URL(file, example)) });
    return route.abort();
  });
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(new Date(epoch.getTime() + 1000));
  await page.goto('/pos-example/index.html');
  await page.getByLabel('Amount due').fill('9999999999999999.99');
  await page.getByLabel('Payment link').fill(link);
});

for (const ending of ['paid', 'expired', 'cancelled'] as const) {
  test(`POS ${ending} sale clears the customer view and resets for the next sale`, async ({ page }) => {
    await page.getByRole('button', { name: 'Start sale' }).click();
    await expect(page.locator('#status')).toHaveText('AWAITING');
    await expect(page.locator('#qr svg')).toBeVisible();
    await expect(page.locator('#linkText')).toHaveText(link);
    await page.getByLabel('Received amount').fill('9999999999999999.98');
    await page.getByRole('button', { name: 'Payment received' }).click();
    await expect(page.locator('#amounts')).toHaveText('9999999999999999.98 / 9999999999999999.99 USD');
    await page.getByLabel('Received amount').fill('0.01');
    if (ending === 'paid') await page.getByRole('button', { name: 'Payment received' }).click();
    if (ending === 'expired') {
      await page.clock.fastForward(299_000);
      await expect(page.locator('#countdown')).toHaveText('1s left');
      await page.clock.fastForward(1000);
    }
    if (ending === 'cancelled') await page.getByRole('button', { name: 'Cancel sale' }).click();
    await expect(page.locator('#status')).toHaveText(ending.toUpperCase());
    const paid = ending === 'paid' ? '9999999999999999.99' : '9999999999999999.98';
    await expect(page.locator('#amounts')).toHaveText(`${paid} / 9999999999999999.99 USD`);
    await expect(page.locator('#qr svg')).toHaveCount(0);
    await expect(page.locator('#linkText')).toBeEmpty();
    await expect(page.getByLabel('Payment link')).toHaveValue('');
    await expect(page.locator('#countdown')).toBeEmpty();
    await page.getByRole('button', { name: 'New sale' }).click();
    await expect(page.locator('#status')).toHaveText('IDLE');
    await expect(page.locator('#amounts')).toBeEmpty();
    await expect(page.getByLabel('Amount due')).toHaveValue('');
    await expect(page.getByLabel('Received amount')).toHaveValue('');
    await page.getByLabel('Amount due').fill('1.25');
    await page.getByLabel('Payment link').fill(link + '2');
    await page.getByRole('button', { name: 'Start sale' }).click();
    await expect(page.locator('#amounts')).toHaveText('0.00 / 1.25 USD');
  });
}

test('POS ignores a broken clock, retries the countdown and rejects a late payment before a queued tick', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByLabel('Amount due').fill('1e6');
  await page.getByRole('button', { name: 'Start sale' }).click();
  await expect(page.locator('#status')).toHaveText('IDLE');
  await expect(page.getByRole('alert')).toContainText('Enter an amount');
  await page.getByLabel('Amount due').fill('9999999999999999.99');
  await page.evaluate(() => { Date.now = () => NaN; });
  await page.getByRole('button', { name: 'Start sale' }).click();
  await expect(page.getByRole('alert')).toContainText('clock');
  await expect(page.locator('#status')).toHaveText('IDLE');
  await expect(page.locator('#qr svg')).toHaveCount(0);
  await page.evaluate(() => { Date.now = () => 100_000; });
  await page.getByRole('button', { name: 'Start sale' }).click();
  await page.getByLabel('Received amount').fill('0.01');
  await page.getByRole('button', { name: 'Payment received' }).click();
  await expect(page.getByLabel('Received amount')).toHaveValue('');
  await page.getByLabel('Received amount').fill('0.02');
  await page.evaluate(() => { Date.now = () => Infinity; });
  await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Payment received' }).click();
  await expect(page.getByRole('alert')).toContainText('clock');
  await expect(page.locator('#countdown')).toBeEmpty();
  await expect(page.locator('#amounts')).toHaveText('0.01 / 9999999999999999.99 USD');
  await page.evaluate(() => { Date.now = () => 399_000; });
  await page.clock.fastForward(1000);
  await expect(page.locator('#countdown')).toHaveText('1s left');
  await expect(page.getByRole('alert')).toBeEmpty();
  await page.evaluate(() => { Date.now = () => 400_000; });
  await page.getByRole('button', { name: 'Payment received' }).click();
  await expect(page.locator('#status')).toHaveText('EXPIRED');
  await expect(page.locator('#amounts')).toHaveText('0.01 / 9999999999999999.99 USD');
  expect(errors).toEqual([]);
});

test('POS cancellation works with a failed clock and a reload opens an empty terminal', async ({ page }) => {
  await page.getByRole('button', { name: 'Start sale' }).click();
  await page.getByLabel('Received amount').fill('1.234');
  await page.getByRole('button', { name: 'Payment received' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter the received amount');
  await expect(page.locator('#amounts')).toHaveText('0.00 / 9999999999999999.99 USD');
  await page.getByLabel('Received amount').fill('0.02');
  await page.getByRole('button', { name: 'Payment received' }).click();
  await page.evaluate(() => { Date.now = () => NaN; });
  await page.clock.fastForward(1000);
  await expect(page.getByRole('alert')).toContainText('clock');
  await page.getByRole('button', { name: 'Cancel sale' }).click();
  await expect(page.locator('#status')).toHaveText('CANCELLED');
  await expect(page.locator('#amounts')).toHaveText('0.02 / 9999999999999999.99 USD');
  await expect(page.locator('#qr svg')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('IDLE');
  await expect(page.locator('#amounts')).toBeEmpty();
  await expect(page.getByLabel('Payment link')).toHaveValue('');
});
