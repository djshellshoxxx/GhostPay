import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  FRAGMENT_PREFIX, MAX_PAYMENT_REQUEST_FILE_BYTES, PAYMENT_REQUEST_FILE_NAME,
  canonicalize, decodeBase64Url, encodeBase64Url, parsePaymentRequestFile, serializePaymentRequestFile,
} from '@ghostpay/invoice-schema';
import { ORIGIN, createInvoice, generateKeys } from './helpers';

const PASSPHRASE = 'cedar orbit velvet lantern meadow';
const PREVIEW = 'Review request file';
const OPEN = 'Open request file';
interface WalletProbe { discoveries: number; methods: string[] }

test.beforeEach(async ({ context, page }) => {
  // Only local generated invoices are used. Unexpected remote requests cannot reach a real service.
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin === ORIGIN) await route.continue();
    else await route.abort();
  });
  await page.addInitScript(() => {
    const probe: WalletProbe = { discoveries: 0, methods: [] };
    (window as unknown as { __f03WalletProbe: WalletProbe }).__f03WalletProbe = probe;
    window.addEventListener('eip6963:requestProvider', () => { probe.discoveries++; });
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: {
        request({ method }: { method: string }): Promise<never> {
          probe.methods.push(method);
          return Promise.reject(new Error('Synthetic request-file test wallet'));
        },
      },
    });
  });
  await page.goto('/');
});

async function downloadRequest(page: Page): Promise<Buffer> {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download payment request', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(PAYMENT_REQUEST_FILE_NAME);
  const path = await download.path();
  if (path === null) throw new Error('Synthetic request download was unavailable');
  return readFile(path);
}

async function openImport(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await page.getByText('Scan an invoice QR or open a request file', { exact: true }).click();
  await page.waitForLoadState('networkidle');
}

async function uploadRequest(page: Page, buffer: Buffer): Promise<void> {
  // MIME and extension are hints; the content is authoritative.
  await page.getByLabel('Payment request file', { exact: true }).setInputFiles({
    name: 'synthetic-request.bin', mimeType: 'application/octet-stream', buffer,
  });
}

async function localSnapshot(page: Page) {
  return page.evaluate(() => {
    const snapshot = (storage: Storage): Record<string, string | null> => Object.fromEntries(
      Array.from({ length: storage.length }, (_unused, index) => storage.key(index))
        .filter((key): key is string => key !== null).sort().map((key) => [key, storage.getItem(key)]),
    );
    return {
      local: snapshot(localStorage), session: snapshot(sessionStorage),
      wallet: (window as unknown as { __f03WalletProbe: WalletProbe }).__f03WalletProbe,
    };
  });
}

for (const encrypt of [false, true]) {
  test(`request file retains the exact ${encrypt ? 'bearer-encrypted' : 'plain'} invoice without implicit effects`, async ({ page }) => {
    await generateKeys(page);
    const link = await createInvoice(page, { encrypt, memo: 'Synthetic invoice file note' });
    const bytes = await downloadRequest(page);
    expect(parsePaymentRequestFile(bytes.toString('utf8'))).toEqual({
      format: 'ghostpay-payment-request', version: 1, fragment: new URL(link).hash,
    });
    await openImport(page);
    const originalUrl = page.url();
    const before = await localSnapshot(page);
    const requests: string[] = [];
    page.on('request', (request) => { requests.push(request.url()); });
    await uploadRequest(page, bytes);
    await expect(page.getByRole('heading', { name: PREVIEW, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toHaveCount(0);
    expect(page.url()).toBe(originalUrl);
    expect(await localSnapshot(page)).toEqual(before);
    expect(requests).toEqual([]);
    await page.getByRole('button', { name: OPEN, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
    await expect(page.getByText('Fixed: 0.5 ETH', { exact: true })).toBeVisible();
    const review = page.getByRole('region', { name: 'Review payment', exact: true });
    await expect(review.getByText('Memo: Synthetic invoice file note', { exact: true })).toBeVisible();
    expect((await localSnapshot(page)).wallet).toEqual(before.wallet);
    await expect(page.getByRole('heading', { name: 'Final check before your wallet' })).toHaveCount(0);
  });
}

test('passphrase request stays closed until the existing unlock flow succeeds', async ({ page }) => {
  test.setTimeout(120_000);
  await generateKeys(page);
  const link = await createInvoice(page, {
    passphrase: PASSPHRASE, description: 'Synthetic confidential item', memo: 'Synthetic confidential note',
  });
  const bytes = await downloadRequest(page);
  expect(parsePaymentRequestFile(bytes.toString('utf8')).fragment).toBe(new URL(link).hash);
  expect(bytes.toString('utf8')).not.toContain(PASSPHRASE);
  await openImport(page);
  await uploadRequest(page, bytes);
  await expect(page.getByText('This invoice needs a passphrase. Its header is unverified until it opens.', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic confidential item', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic confidential note', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: OPEN, exact: true }).click();
  await page.getByLabel('Invoice passphrase', { exact: true }).fill('wrong synthetic passphrase');
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open invoice', exact: true })).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic confidential item', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthetic confidential note', { exact: false })).toHaveCount(0);
  await page.getByLabel('Invoice passphrase', { exact: true }).fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Open invoice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Synthetic confidential item', { exact: true })).toBeVisible();
  const review = page.getByRole('region', { name: 'Review payment', exact: true });
  await expect(review.getByText('Memo: Synthetic confidential note', { exact: true })).toBeVisible();
  expect((await localSnapshot(page)).wallet.methods).toEqual([]);
});

test('invalid replacement files clear a prior preview and the identical valid file can be retried', async ({ page }) => {
  await generateKeys(page);
  await createInvoice(page);
  const bytes = await downloadRequest(page);
  await openImport(page);
  for (const invalid of [
    { bytes: Buffer.from('{"format":"wrong","version":1}'), message: 'Cannot read this request file. Choose a valid GhostPay request file.' },
    { bytes: Buffer.alloc(MAX_PAYMENT_REQUEST_FILE_BYTES + 1, 0x20), message: 'Request file exceeds the 24 KiB size limit.' },
    { bytes: Buffer.from([0x7b, 0xc3, 0x28, 0x7d]), message: 'Cannot read this request file. Choose a valid GhostPay request file.' },
  ]) {
    await uploadRequest(page, bytes);
    await expect(page.getByRole('button', { name: OPEN, exact: true })).toBeVisible();
    await uploadRequest(page, invalid.bytes);
    await expect(page.getByText(invalid.message, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: OPEN, exact: true })).toHaveCount(0);
  }
  await uploadRequest(page, bytes);
  await expect(page.getByRole('button', { name: OPEN, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear imported invoice', exact: true }).click();
  await expect(page.getByRole('button', { name: OPEN, exact: true })).toHaveCount(0);
  await uploadRequest(page, bytes);
  await expect(page.getByRole('button', { name: OPEN, exact: true })).toBeVisible();
  expect((await localSnapshot(page)).wallet.methods).toEqual([]);
});

test('successive request files open their own signed terms without a page refresh', async ({ page }) => {
  await generateKeys(page);
  const firstLink = await createInvoice(page, { memo: 'Synthetic request A' });
  const first = Buffer.from(serializePaymentRequestFile(new URL(firstLink).hash));
  await page.getByLabel('Token amount', { exact: true }).fill('0.75');
  await page.getByLabel('Memo (optional, shown to the payer)', { exact: true }).fill('Synthetic request B');
  await page.getByRole('button', { name: 'Create invoice link', exact: true }).click();
  const linkBox = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(linkBox).not.toHaveValue(firstLink);
  const secondLink = await linkBox.inputValue();
  const second = Buffer.from(serializePaymentRequestFile(new URL(secondLink).hash));
  await openImport(page);
  const originalUrl = page.url();
  await uploadRequest(page, first);
  await expect(page.getByRole('button', { name: OPEN, exact: true })).toBeVisible();
  await uploadRequest(page, second);
  await expect(page.getByRole('button', { name: OPEN, exact: true })).toBeVisible();
  await page.getByRole('button', { name: OPEN, exact: true }).click();
  await expect(page.getByText('Fixed: 0.75 ETH', { exact: true })).toBeVisible();
  const review = page.getByRole('region', { name: 'Review payment', exact: true });
  await expect(review.getByText('Memo: Synthetic request B', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic request A', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Forget this invoice', exact: true }).click();
  await page.getByText('Scan an invoice QR or open a request file', { exact: true }).click();
  await uploadRequest(page, first);
  await page.getByRole('button', { name: OPEN, exact: true }).click();
  await expect(page.getByText('Fixed: 0.5 ETH', { exact: true })).toBeVisible();
  await expect(review.getByText('Memo: Synthetic request A', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic request B', { exact: false })).toHaveCount(0);
  expect(page.url()).toBe(originalUrl);
  expect((await localSnapshot(page)).wallet.methods).toEqual([]);
});

test('a corrupted signed amount remains untrusted and cannot enable payment', async ({ page }) => {
  await generateKeys(page);
  const link = await createInvoice(page);
  const fragment = new URL(link).hash;
  const envelope = JSON.parse(new TextDecoder().decode(decodeBase64Url(fragment.slice(FRAGMENT_PREFIX.length)))) as Record<string, unknown>;
  const invoice = envelope['inv'] as Record<string, unknown>;
  const changed = { ...envelope, inv: { ...invoice, amountPolicy: { mode: 'fixed_token', tokenAmount: '750000000000000000' } } };
  const corrupted = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(changed)));
  await openImport(page);
  await uploadRequest(page, Buffer.from(serializePaymentRequestFile(corrupted)));
  await expect(page.getByText('Chain 84532. The invoice signature is invalid. Payment will remain blocked.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: OPEN, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review payment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Prepare payment', exact: true })).toHaveCount(0);
  expect((await localSnapshot(page)).wallet.methods).toEqual([]);
});
