import { expect, type Page } from '@playwright/test';

export const ORIGIN = 'http://localhost:4173';

/** Opens the app, generates seller keys in memory and returns the public meta-address. */
export async function generateKeys(page: Page): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await page.getByRole('button', { name: 'Generate new keys' }).click();
  const meta = page.locator('code', { hasText: /^st:eth:0x/ });
  await expect(meta).toBeVisible();
  return (await meta.textContent()) ?? '';
}

export interface InvoiceOptions {
  readonly description?: string;
  readonly memo?: string;
  readonly encrypt?: boolean;
}

/** Fills the Create invoice form (fixed 0.5 native-coin price on Base Sepolia) and returns the invoice link. */
export async function createInvoice(page: Page, opts: InvoiceOptions = {}): Promise<string> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount').fill('0.5');
  await page.getByLabel('Item 1 description').fill(opts.description ?? 'Consulting');
  await page.getByLabel('Item 1 unit price').fill('50.00');
  if (opts.memo !== undefined) await page.getByLabel(/Memo/).fill(opts.memo);
  if (opts.encrypt === true) await page.getByLabel('Encrypt line items and memo inside the link').check();
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
