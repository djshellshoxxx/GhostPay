import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  canonicalize,
  createInvoice as makeInvoice,
  decodeBase64Url,
  encodeBase64Url,
  encodeFragment,
  FRAGMENT_PREFIX,
  parseFragment,
  signInvoice,
  signerPublicKeyHex,
  type EncodeOptions,
} from '@ghostpay/invoice-schema';
import { createInvoice, generateKeys } from './helpers';

const PINS_KEY = 'ghostpay.invoiceSignerPins.v1';
const VALID = 'Valid signature — matches the trusted signer pin.';
const UNPINNED = 'Valid signature — no matching signer pin is configured.';
const MISMATCH = 'Valid signature — does not match the selected seller’s pinned key.';
const UNAVAILABLE = 'Verification unavailable or interrupted. Open the invoice again to retry.';
const INVALID = 'Invalid signature. The signed invoice could not be authenticated.';

const panel = (page: Page): Locator => page.getByRole('region', { name: 'Invoice signer verification', exact: true });

/** Authored test-only invoices. Only public keys and signed links are passed into the browser. */
async function fixture(byte: number, options: EncodeOptions = {}): Promise<{ fragment: string; signer: string }> {
  const key = new Uint8Array(32).fill(byte);
  const now = Math.floor(Date.now() / 1000);
  try {
    const signer = signerPublicKeyHex(key);
    const invoice = makeInvoice({
      chainId: 84532,
      metaAddress: `st:eth:0x${signerPublicKeyHex(new Uint8Array(32).fill(71))}${signerPublicKeyHex(new Uint8Array(32).fill(72))}`,
      fiat: { currency: 'USD', minorUnits: '5000' },
      token: 'native',
      amountPolicy: { mode: 'fixed_token', tokenAmount: '500000000000000000' },
      quote: { source: 'test-only', timestamp: now, expiresAt: now + 3600, maxSlippageBps: 0 },
      expiresAt: now + 3600,
      lineItems: [{ description: 'Signer acceptance fixture', quantity: '1', unitMinorUnits: '5000' }],
      tax: { rateBps: 0, minorUnits: '0' },
      feePolicy: 'seller_pays',
      signer,
    });
    return { fragment: await encodeFragment(signInvoice(invoice, key), options), signer };
  } finally { key.fill(0); }
}

function altered(fragment: string, change: (envelope: Record<string, unknown>) => void): string {
  const envelope = JSON.parse(new TextDecoder().decode(decodeBase64Url(fragment.slice(FRAGMENT_PREFIX.length)))) as Record<string, unknown>;
  change(envelope);
  return FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(envelope)));
}

async function addPin(page: Page, label: string, signer: string): Promise<void> {
  const region = panel(page);
  await region.getByRole('button', { name: 'Add a signer pin', exact: true }).click();
  await region.getByLabel('Local seller name', { exact: true }).fill(label);
  await region.getByLabel('Independently trusted signing public key', { exact: true }).fill(signer);
  await region.getByRole('button', { name: 'Review pin change', exact: true }).click();
  await region.getByRole('button', { name: 'Confirm signer pin', exact: true }).click();
  await expect(region.getByLabel('Expected seller (optional)', { exact: true })).toHaveValue(label);
}

async function replacePreview(page: Page, signer: string): Promise<void> {
  const region = panel(page);
  await region.getByRole('button', { name: 'Replace selected pin', exact: true }).click();
  await region.getByLabel('Independently trusted signing public key', { exact: true }).fill(signer);
  await region.getByRole('button', { name: 'Review pin change', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Confirm signer pin', exact: true })).toBeVisible();
}

test('created invoice requires explicit pin confirmation, and saved pins survive reload without choosing a seller', async ({ page }) => {
  await page.goto('/');
  await generateKeys(page);
  const link = await createInvoice(page, { description: 'Created signer acceptance invoice', encrypt: true });
  const signed = await parseFragment(new URL(link).hash);
  expect(signed.verification.signatureValid).toBe(true);
  await page.goto(link);
  await expect(panel(page).getByText(UNPINNED, { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), PINS_KEY)).toBeNull();

  const region = panel(page);
  await region.getByRole('button', { name: 'Add a signer pin', exact: true }).click();
  await region.getByLabel('Local seller name', { exact: true }).fill('Created seller');
  await region.getByLabel('Independently trusted signing public key', { exact: true }).fill(signed.invoice.signer);
  await region.getByRole('button', { name: 'Review pin change', exact: true }).click();
  await expect(region.getByText(UNPINNED, { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), PINS_KEY)).toBeNull();
  await region.getByRole('button', { name: 'Confirm signer pin', exact: true }).click();
  await expect(region.getByText(VALID, { exact: true })).toBeVisible();
  await expect(region.getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('Created seller');

  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(panel(page).getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('');
  await expect(panel(page).getByRole('option', { name: 'Created seller', exact: true })).toHaveCount(1);
  await page.goto(link);
  await expect(panel(page).getByText(UNPINNED, { exact: true })).toBeVisible();
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('Created seller');
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('verified seller');
});

test('a selected seller cannot be authenticated by another named or legacy saved signer, including after invoice changes', async ({ page }) => {
  const alice = await fixture(41);
  const bob = await fixture(42);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Pinned seller signing keys (one per line)', { exact: true }).fill(bob.signer);
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
  await page.goto(`/${bob.fragment}`);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await addPin(page, 'Alice', alice.signer);
  await expect(panel(page).getByText(MISMATCH, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(panel(page).getByText(VALID, { exact: true })).toHaveCount(0);
  await addPin(page, 'Bob', bob.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('Alice');
  await expect(panel(page).getByText(MISMATCH, { exact: true })).toBeVisible();
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('Bob');
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await page.goto(`/${alice.fragment}`);
  await expect(panel(page).getByText(MISMATCH, { exact: true })).toBeVisible();
  await expect(panel(page).getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('Bob');
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('Alice');
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
});

test('replacement and removal require confirmation, and another tab invalidates old trust and pending confirmation', async ({ page, context }) => {
  const alice = await fixture(41);
  const rotated = await fixture(43);
  await page.goto(`/${alice.fragment}`);
  await addPin(page, 'Alice', alice.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(`/${rotated.fragment}`);
  await panel(second).getByLabel('Expected seller (optional)', { exact: true }).selectOption('Alice');
  await expect(panel(second).getByText(MISMATCH, { exact: true })).toBeVisible();

  await replacePreview(second, rotated.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await panel(second).getByRole('button', { name: 'Cancel pin change', exact: true }).click();
  await expect(panel(second).getByText(MISMATCH, { exact: true })).toBeVisible();
  await panel(second).getByRole('button', { name: 'Cancel pin change', exact: true }).click();

  // The first tab's independently reviewed change becomes obsolete when the second tab changes the pin.
  await replacePreview(page, alice.signer);
  await replacePreview(second, rotated.signer);
  await panel(second).getByRole('button', { name: 'Confirm signer pin', exact: true }).click();
  await expect(panel(second).getByText(VALID, { exact: true })).toBeVisible();
  await expect(panel(page).getByText(MISMATCH, { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Confirm signer pin', exact: true })).toHaveCount(0);

  await panel(second).getByRole('button', { name: 'Remove selected pin', exact: true }).click();
  await expect(panel(second).getByText(VALID, { exact: true })).toBeVisible();
  await panel(second).getByRole('button', { name: 'Confirm pin removal', exact: true }).click();
  for (const tab of [page, second]) {
    await expect(panel(tab).getByText(UNAVAILABLE, { exact: true })).toBeVisible();
    await expect(panel(tab).getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('Alice');
    await expect(panel(tab).getByRole('option', { name: 'Alice (pin unavailable)', exact: true })).toHaveCount(1);
    await expect(panel(tab).getByText(VALID, { exact: true })).toHaveCount(0);
    await expect(tab.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  }
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('');
  await expect(panel(page).getByText(UNPINNED, { exact: true })).toBeVisible();
});

test('encrypted invoices verify and pins change offline without requests, wallet access or exposed secrets', async ({ page, context }) => {
  const alice = await fixture(41, { encrypt: true });
  const bob = await fixture(42, { encrypt: true });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__signerWalletCalls', { value: calls });
    Object.defineProperty(window, 'ethereum', { value: {
      request: (request: { method: string }) => { calls.push(request.method); return Promise.reject(new Error('No wallet call is authorized by this test')); },
      on: () => undefined,
      removeListener: () => undefined,
    } });
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  const sockets: string[] = [];
  page.on('request', (request) => { requests.push(request.url()); });
  page.on('websocket', (socket) => { sockets.push(socket.url()); });
  await context.setOffline(true);
  await page.evaluate((fragment) => { window.location.hash = fragment; }, alice.fragment);
  await expect(panel(page).getByText(UNPINNED, { exact: true })).toBeVisible();
  await addPin(page, 'Offline Alice', alice.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await page.evaluate((fragment) => { window.location.hash = fragment; }, bob.fragment);
  await expect(panel(page).getByText(MISMATCH, { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect(sockets).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __signerWalletCalls: string[] }).__signerWalletCalls)).toEqual([]);
  const visible = await page.locator('body').innerText();
  expect(visible).not.toContain('29'.repeat(32));
  expect(visible).not.toContain('2a'.repeat(32));
  await context.setOffline(false);
});

test('tampered, missing, unsupported and malformed invoices show distinct failures and cannot retain trusted state', async ({ page }) => {
  const alice = await fixture(41);
  await page.goto(`/${alice.fragment}`);
  await addPin(page, 'Alice', alice.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  const cases: readonly [string, string][] = [
    [altered(alice.fragment, (envelope) => {
      const invoice = envelope['inv'] as Record<string, unknown>;
      invoice['amountPolicy'] = { mode: 'fixed_token', tokenAmount: '500000000000000001' };
    }), INVALID],
    [altered(alice.fragment, (envelope) => { envelope['sig'] = 'not-a-compact-signature'; }), INVALID],
    [altered(alice.fragment, (envelope) => { delete envelope['sig']; }), 'Missing signature. This invoice cannot be authenticated.'],
    [altered(alice.fragment, (envelope) => { envelope['alg'] = 'unsupported-test-algorithm'; }), 'Unsupported invoice signature format, algorithm or version.'],
    [altered(alice.fragment, (envelope) => {
      const invoice = envelope['inv'] as Record<string, unknown>;
      invoice['token'] = 5;
      invoice['memo'] = 'browser-test-private-metadata';
    }), 'Malformed invoice. Verification was refused.'],
  ];
  for (const [fragment, status] of cases) {
    await page.goto(`/${fragment}`);
    await expect(panel(page).getByText(status, { exact: true })).toBeVisible();
    await expect(panel(page).getByText(VALID, { exact: true })).toHaveCount(0);
    await expect(panel(page).getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('Alice');
    expect(await page.locator('body').innerText()).not.toContain('browser-test-private-metadata');
    expect(await page.getByRole('button', { name: 'Continue', exact: true }).evaluateAll((buttons) =>
      buttons.every((button) => button instanceof HTMLButtonElement && button.disabled))).toBe(true);
  }
  await page.goto(`/${alice.fragment}`);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
});

test('a passphrase header is never trusted, and selecting a seller requires decrypting under the fresh policy', async ({ page }) => {
  const passphrase = 'synthetic invoice browser phrase';
  const alice = await fixture(41, { passphrase, scryptN: 1 << 15 });
  await page.goto(`/${alice.fragment}`);
  await expect(page.getByLabel('Invoice passphrase', { exact: true })).toBeVisible();
  await expect(panel(page).getByText(VALID, { exact: true })).toHaveCount(0);
  await addPin(page, 'Alice', alice.signer);
  await expect(panel(page).getByText(UNAVAILABLE, { exact: true })).toBeVisible();
  await page.getByLabel('Invoice passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  expect(await page.locator('body').innerText()).not.toContain(passphrase);
  await panel(page).getByLabel('Expected seller (optional)', { exact: true }).selectOption('');
  await expect(panel(page).getByText(VALID, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Invoice passphrase', { exact: true })).toBeVisible();
  await page.getByLabel('Invoice passphrase', { exact: true }).fill(passphrase);
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await expect(panel(page).getByText(UNPINNED, { exact: true })).toBeVisible();
});

test('idle lock clears trusted invoice review without seller keys or wallet requests', async ({ page, context }) => {
  const alice = await fixture(41);
  await context.clock.install({ time: new Date() });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__signerWalletCalls', { value: calls });
    Object.defineProperty(window, 'ethereum', { value: {
      request: (request: { method: string }) => { calls.push(request.method); return Promise.reject(new Error('No wallet call is authorized by this test')); },
      on: () => undefined,
      removeListener: () => undefined,
    } });
  });
  // This fresh payer profile never generates or imports seller keys.
  await page.goto(`/${alice.fragment}`);
  await addPin(page, 'Alice', alice.signer);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment', exact: true })).toBeVisible();
  // No RPC is configured in this payer profile, so signer trust alone must not authorize payment.
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __signerWalletCalls: string[] }).__signerWalletCalls)).toEqual([]);

  const afterIdle = await page.evaluate(() => Date.now() + 16 * 60_000);
  expect(afterIdle).toBeLessThan((await parseFragment(alice.fragment)).invoice.expiresAt * 1000);
  // Wall time crosses the default 15-minute idle deadline; pointerdown checks it before accepting new activity.
  await context.clock.setSystemTime(afterIdle);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  // This notice is specific to the idle-lock branch with no seller session.
  await expect(page.getByText('Local tags locked after inactivity.', { exact: true })).toHaveCount(1);
  await expect(panel(page).getByText(UNAVAILABLE, { exact: true })).toBeVisible();
  await expect(panel(page).getByText(VALID, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send payment in my wallet', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __signerWalletCalls: string[] }).__signerWalletCalls)).toEqual([]);

  // The public pin remains saved, but trust returns only after the invoice is opened and checked again.
  await expect(panel(page).getByLabel('Expected seller (optional)', { exact: true })).toHaveValue('Alice');
  await page.goto(`/${alice.fragment}`);
  await expect(panel(page).getByText(VALID, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Review payment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { __signerWalletCalls: string[] }).__signerWalletCalls)).toEqual([]);
});

test('pin controls work with the keyboard and fit a narrow Chromium viewport', async ({ page }) => {
  const alice = await fixture(41);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/${alice.fragment}`);
  const region = panel(page);
  await expect(region.getByText(UNPINNED, { exact: true })).toBeVisible();
  await region.getByLabel('Expected seller (optional)', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(region.getByRole('button', { name: 'Add a signer pin', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await region.getByLabel('Local seller name', { exact: true }).fill('Keyboard seller');
  await region.getByLabel('Independently trusted signing public key', { exact: true }).fill(alice.signer);
  await region.getByRole('button', { name: 'Review pin change', exact: true }).focus();
  await page.keyboard.press('Enter');
  await region.getByRole('button', { name: 'Confirm signer pin', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(region.getByText(VALID, { exact: true })).toBeVisible();
  const layout = await region.evaluate((element) => {
    const width = document.documentElement.clientWidth;
    const clipped = [...element.querySelectorAll<HTMLElement>('input, select, button')]
      .filter((control) => control.getClientRects().length > 0)
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.left < -1 || rect.right > width + 1).length;
    return { width, scrollWidth: document.documentElement.scrollWidth, clipped };
  });
  expect(layout.width).toBe(375);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  expect(layout.clipped).toBe(0);
});
