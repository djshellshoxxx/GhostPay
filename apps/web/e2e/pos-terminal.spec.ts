import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const example = new URL('../../../examples/pos-terminal/', import.meta.url);
const qrScript = createRequire(import.meta.url).resolve('qrcode-generator');
const link = 'https://pos.example/#gpi=v1.synthetic';
const epoch = new Date('2026-01-01T00:00:00Z');

test.beforeEach(async ({ page }) => {
  await page.route('**/pos-example/**', async route => {
    const file = new URL(route.request().url()).pathname.slice('/pos-example/'.length);
    if (file === 'vendor/qrcode.js') return route.fulfill({ path: qrScript, contentType: 'text/javascript' });
    if (['index.html', 'pos.css', 'pos.js', 'pos-logic.js', 'pos-session.js'].includes(file))
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

// Synthetic payment-feed fixtures: raw bodies of webhook events a merchant server has already verified
// (merchant-hooks serializeWebhookEvent key order; amountMinor is the cumulative invoice total).
const feedBody = (id: string, invoiceId: string, amountMinor: string, type = 'invoice.partial', currency = 'USD') =>
  JSON.stringify({ id, type, createdAt: 1_767_225_601, data: { invoiceId, currency, amountMinor, paymentId: `tx_${id}` } });
const postFeed = (page: Page, body: string) =>
  page.evaluate((raw) => { const channel = new BroadcastChannel('ghostpay-pos-feed'); channel.postMessage(raw); channel.close(); }, body);
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
async function expectNoAxeViolations(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: { id: string }[] }> } }).axe;
    return (await axe.run(document)).violations.map(v => v.id);
  });
  expect(violations).toEqual([]);
}

test('POS completes a sale only from the payment feed, ignores replays and flags late reports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByLabel('Amount due').fill('10.00');
  await page.getByLabel('Invoice reference').fill('inv-e2e');
  await page.getByRole('button', { name: 'Start sale' }).click();
  await expect(page.locator('#customer-title')).toHaveText('Scan to pay');
  await expect(page.locator('#customer-due')).toHaveText('10.00 USD');
  await expect(page.locator('#customer-countdown')).toHaveText('5:00');
  await postFeed(page, feedBody('evt_1', 'inv-e2e', '400'));
  await expect(page.locator('#amounts')).toHaveText('4.00 / 10.00 USD');
  await expect(page.locator('#customer-remaining')).toHaveText('Remaining 6.00 USD');
  await expect(page.locator('#announce')).toHaveText('Payment of 4.00 USD reported.');
  await postFeed(page, feedBody('evt_1', 'inv-e2e', '400'));
  await postFeed(page, feedBody('evt_2', 'inv-other', '1000'));
  await expect(page.getByRole('status').filter({ hasText: 'different invoice' })).toBeVisible();
  await postFeed(page, 'not json');
  await expect(page.getByRole('status').filter({ hasText: 'unreadable' })).toBeVisible();
  await expect(page.locator('#amounts')).toHaveText('4.00 / 10.00 USD');
  await expect(page.locator('#status')).toHaveText('AWAITING');
  await postFeed(page, feedBody('evt_3', 'inv-e2e', '1000', 'invoice.paid'));
  await expect(page.locator('#status')).toHaveText('PAID');
  await expect(page.locator('#amounts')).toHaveText('10.00 / 10.00 USD');
  await expect(page.locator('#verification')).toContainText("server's payment feed");
  await expect(page.locator('#verification')).toContainText('not on-chain proof');
  await expect(page.locator('#customer-title')).toHaveText('Payment recorded. Thank you');
  await expect(page.locator('#qr svg')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New sale' })).toBeFocused();
  await postFeed(page, feedBody('evt_4', 'inv-e2e', '1500', 'invoice.over'));
  await expect(page.getByRole('status').filter({ hasText: 'review it in your records' })).toBeVisible();
  await expect(page.locator('#amounts')).toHaveText('10.00 / 10.00 USD');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('POS restores an active sale after a reload without storing the payment link', async ({ page }) => {
  await page.getByRole('button', { name: 'Start sale' }).click();
  await page.getByLabel('Received amount').fill('1.00');
  await page.getByRole('button', { name: 'Payment received' }).click();
  await expect(page.locator('#verification')).toContainText('entered by hand');
  const stored = await page.evaluate(() => Object.keys(sessionStorage).map(k => sessionStorage.getItem(k) ?? '').join());
  expect(stored).toContain('"paidMinor":"100"');
  expect(stored).not.toContain('gpi=');
  await page.clock.fastForward(10_000);
  await page.reload();
  await expect(page.locator('#status')).toHaveText('AWAITING');
  await expect(page.locator('#amounts')).toHaveText('1.00 / 9999999999999999.99 USD');
  await expect(page.getByRole('status').filter({ hasText: 'restored after a reload' })).toBeVisible();
  await expect(page.locator('#qr svg')).toHaveCount(0);
  await expect(page.locator('#customer-title')).toHaveText('One moment, please');
  await expect(page.locator('#countdown')).toHaveText('290s left');
  await page.getByLabel('Payment link').fill('http://bad.example/#gpi=v1.x');
  await page.getByRole('button', { name: 'Show payment QR' }).click();
  await expect(page.getByRole('alert')).toHaveText('link must be https');
  await expect(page.getByLabel('Payment link')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Payment link').fill(link);
  await page.getByRole('button', { name: 'Show payment QR' }).click();
  await expect(page.locator('#qr svg')).toBeVisible();
  await expect(page.locator('#customer-title')).toHaveText('Scan to pay');
  await expect(page.getByRole('button', { name: 'Show payment QR' })).toBeHidden();
  await page.clock.fastForward(290_000);
  await expect(page.locator('#status')).toHaveText('EXPIRED');
  await expect(page.locator('#amounts')).toHaveText('1.00 / 9999999999999999.99 USD');
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  await page.evaluate(() => sessionStorage.setItem('ghostpay-pos/v1/sale', '{"v":1,"paidMinor":"oops"}'));
  await page.reload();
  await expect(page.locator('#status')).toHaveText('IDLE');
  await expect(page.getByRole('status').filter({ hasText: 'could not be read' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test.describe('touch tablet', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true });

  test('POS keypad, customer screen, focus and error states work by touch at tablet and phone widths', async ({ page }) => {
    await page.clock.resume(); // axe-core schedules timers; let the installed clock flow in real time here
    const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.getByRole('button', { name: 'Clear amount' }).tap();
    for (const key of ['1', '2', '.', '5', '0', '9']) await page.getByRole('button', { name: key, exact: true }).tap();
    await expect(page.getByLabel('Amount due')).toHaveValue('12.50');
    await page.getByRole('button', { name: 'Delete last digit' }).tap();
    await expect(page.getByLabel('Amount due')).toHaveValue('12.5');
    await page.getByLabel('Invoice reference').fill('bad reference');
    await page.getByRole('button', { name: 'Start sale' }).tap();
    await expect(page.getByRole('alert')).toContainText('Invoice reference');
    await expect(page.getByLabel('Invoice reference')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Invoice reference')).toBeFocused();
    await expectNoAxeViolations(page);
    await page.getByLabel('Invoice reference').fill('');
    await page.getByRole('button', { name: 'Start sale' }).tap();
    await expect(page.locator('#status')).toHaveText('AWAITING');
    await expect(page.getByLabel('Invoice reference')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '7', exact: true })).toBeDisabled();
    const operator = await page.locator('#operator').boundingBox();
    const customer = await page.locator('#customer').boundingBox();
    expect(customer!.x).toBeGreaterThan(operator!.x + operator!.width - 1);
    expect(await noHorizontalScroll()).toBe(true);
    for (const target of ['Start sale', 'Cancel sale', 'Show customer screen', '5']) {
      const box = await page.getByRole('button', { name: target, exact: true }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Show customer screen' }).tap();
    await expect(page.locator('#operator')).toBeHidden();
    await expect(page.locator('#customer-title')).toBeFocused();
    await expect(page.locator('#customer-due')).toHaveText('12.50 USD');
    await expect(page.locator('#qr svg')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#operator')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show customer screen' })).toBeFocused();
    await page.getByRole('button', { name: 'Show customer screen' }).tap();
    await page.getByRole('button', { name: 'Back to operator' }).tap();
    await expect(page.locator('#operator')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await noHorizontalScroll()).toBe(true);
    const narrowOperator = await page.locator('#operator').boundingBox();
    const narrowCustomer = await page.locator('#customer').boundingBox();
    expect(narrowCustomer!.y).toBeGreaterThan(narrowOperator!.y);
    await page.getByRole('button', { name: 'Cancel sale' }).tap();
    await expect(page.locator('#customer-title')).toHaveText('Sale cancelled');
    await expect(page.getByRole('button', { name: 'New sale' })).toBeFocused();
    await expect(page.locator('#announce')).toHaveText('Sale cancelled.');
  });
});
