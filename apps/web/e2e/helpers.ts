import { expect, type Page } from '@playwright/test';
import type { WalletDisclosureMethod } from '../src/lib/walletDisclosure';

export const ORIGIN = 'http://localhost:4173';

/** One deliberate decision for a named request; never approve an unexpected or future wallet prompt. */
export async function approveWalletDisclosure(page: Page, method: WalletDisclosureMethod): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Review wallet disclosure', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(method, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue to wallet', exact: true }).click();
}

/**
 * Opens the app, generates seller keys in memory and returns the public meta-address. Fresh keys have no backup, so the
 * meta-address and Create invoice stay behind the backup gate (L1-01); these flows type its waiver.
 */
export async function generateKeys(page: Page): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await page.getByRole('button', { name: 'Generate new keys' }).click();
  await page.getByLabel(/To continue without a backup, type/).fill('continue without backup');
  await page.getByRole('button', { name: 'Continue without a backup' }).click();
  const meta = page.locator('code', { hasText: /^st:eth:0x/ });
  await expect(meta).toBeVisible();
  return (await meta.textContent()) ?? '';
}

export interface InvoiceOptions {
  readonly description?: string;
  readonly memo?: string;
  /** Encrypts private fields with the key carried by the link (convenience only). */
  readonly encrypt?: boolean;
  /** Encrypts the entire invoice with an independently shared passphrase. */
  readonly passphrase?: string;
  /** Select a chain without a bundled E2E manifest when testing the disabled-deployment path. */
  readonly chainLabel?: string;
  readonly tokenSymbol?: string;
}

/** Fills the Create invoice form (fixed price of 0.5 units) and returns the invoice link. */
export async function createInvoice(page: Page, opts: InvoiceOptions = {}): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: opts.chainLabel ?? 'Base Sepolia' });
  if (opts.tokenSymbol !== undefined) await page.getByLabel('Token', { exact: true }).selectOption({ label: opts.tokenSymbol });
  await page.getByLabel('Token amount').fill('0.5');
  await page.getByLabel('Item 1 description').fill(opts.description ?? 'Consulting');
  await page.getByLabel('Item 1 unit price').fill('50.00');
  if (opts.memo !== undefined) await page.getByLabel(/Memo/).fill(opts.memo);
  // Encryption is on by default; tests that assume a plain invoice must opt out explicitly.
  const encryptBox = page.getByLabel('Encrypt line items and memo with a key included in the link');
  if (opts.passphrase === undefined) await (opts.encrypt === true ? encryptBox.check() : encryptBox.uncheck());
  if (opts.passphrase !== undefined) {
    await page.getByLabel('Protect the entire invoice with a passphrase').check();
    await page.getByLabel('Invoice passphrase (at least 14 characters)').fill(opts.passphrase);
    await page.getByLabel('Repeat invoice passphrase').fill(opts.passphrase);
  }
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(box).toBeVisible();
  const link = await box.inputValue();
  expect(link.startsWith(`${ORIGIN}/#gpi=v1.`)).toBe(true);
  return link;
}

/** A genuine fresh page load of `url` (as when following a link), not a same-document hash change. */
export async function openFresh(page: Page, url: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(url);
}
