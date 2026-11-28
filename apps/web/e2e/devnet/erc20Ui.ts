import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page } from '@playwright/test';
import { tokensForChain } from '@ghostpay/chain-adapters';
import { checkKeystore, PAGES_BASE } from './pages';
import { identityOf, keysView, nav } from './ui';

/** Disposable browser-qualification passphrases, never real wallet material. */
export const KEYSTORE_PASS = 'harbor lantern quiet meadow falcon';
export const VAULT_PASS = 'copper violet river starlight maple';

export interface SellerBackup {
  readonly identity: { readonly meta: string; readonly signer: string };
  readonly keystoreText: string;
}

export const ledger = (page: Page): Locator => page.locator('section[aria-labelledby="ledger-heading"]');

/** Generate, download and actually reopen the encrypted file; never waive the seller backup gate. */
export async function createErc20Seller(page: Page, options: { readonly saveVault?: boolean } = {}): Promise<SellerBackup> {
  await nav(page).getByRole('button', { name: 'Seller keys' }).click();
  const keys = keysView(page);
  await keys.getByRole('button', { name: 'Generate new keys' }).click();
  await expect(keys.getByText('New keys generated in memory.', { exact: true })).toBeVisible();
  await expect(page.getByText('Back up these seller keys first')).toBeVisible();

  await keys.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(KEYSTORE_PASS);
  await keys.getByLabel('Repeat passphrase', { exact: true }).fill(KEYSTORE_PASS);
  const pending = page.waitForEvent('download', { timeout: 60_000 });
  await keys.getByRole('button', { name: 'Download encrypted keystore' }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('ghostpay-keystore.json');
  const path = await downloaded.path();
  const keystoreText = readFileSync(path, 'utf8');
  // Download initiation is not recovery verification; the product must retain its gate here.
  await expect(page.getByText('This backup is not verified yet')).toBeVisible();
  await expect(page.getByText('Back up these seller keys first')).toBeVisible();
  await expect(keys.getByLabel('Passphrase (at least 14 characters)', { exact: true })).toHaveValue('');
  await keys.getByLabel('Downloaded keystore file', { exact: true }).setInputFiles(path);
  await keys.getByLabel('Keystore passphrase', { exact: true }).fill(KEYSTORE_PASS);
  await keys.getByRole('button', { name: 'Verify backup', exact: true }).click();
  await expect(keys.getByText(/^Backup verified: the file decrypts and holds exactly the loaded keys/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Back up these seller keys first')).toHaveCount(0);
  const identity = await identityOf(page);
  checkKeystore(keystoreText, identity, KEYSTORE_PASS);

  if (options.saveVault !== false) {
    await keys.getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
    await keys.getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
    await keys.getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
    await expect(keys.getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });
  }
  return { identity, keystoreText };
}

export interface Erc20InvoiceOptions {
  readonly description: string;
  readonly register?: boolean;
  readonly amount?: string;
}

/** Token-aware counterpart of createPagesInvoice, using only the existing lean Create invoice controls. */
export async function createErc20Invoice(page: Page, baseURL: string, options: Erc20InvoiceOptions): Promise<string> {
  const usdc = tokensForChain(84532).find((token) => token.symbol === 'USDC');
  if (usdc === undefined) throw new Error('Base Sepolia USDC is not allowlisted');
  await nav(page).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  // The Create form and signed invoice use lowercase addresses; registry/calldata helpers use EIP-55 addresses.
  await page.getByLabel('Token', { exact: true }).selectOption(usdc.address.toLowerCase());
  await expect(page.getByLabel('Token', { exact: true })).toHaveValue(usdc.address.toLowerCase());
  await page.getByLabel('Token amount', { exact: true }).fill(options.amount ?? '100');
  await page.getByLabel('Who pays the 0.25 % checkout fee', { exact: true }).selectOption('seller_pays');
  await page.getByLabel('Item 1 description').fill(options.description);
  await page.getByLabel('Item 1 unit price').fill('100.00');
  await expect(page.getByLabel('Gas buffer policy', { exact: true })).toHaveCount(0);
  if (options.register === true) {
    await page.getByRole('checkbox', { name: 'Register this invoice in my encrypted reconciliation vault for automatic local matching' }).check();
  }
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(box).toBeVisible();
  const link = await box.inputValue();
  expect(baseURL.endsWith(PAGES_BASE)).toBe(true);
  expect(link.startsWith(`${baseURL}#gpi=v1.`)).toBe(true);
  expect(new URL(link).pathname).toBe(PAGES_BASE);
  if (options.register === true) {
    await expect(page.getByText('Invoice registered in your encrypted reconciliation vault for local matching.')).toBeVisible({ timeout: 30_000 });
  }
  return link;
}

/** Return the real disclosure without approving it; callers assert provider silence before their explicit click. */
export async function walletDisclosure(page: Page, method: string): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Review wallet disclosure', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(method, { exact: true })).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Cancel wallet request', exact: true })).toBeFocused();
  return dialog;
}

/** Import only the downloaded keystore; no copied browser state or test-side session injection. */
export async function importSellerKeystore(page: Page, text: string, passphrase: string): Promise<void> {
  const keys = keysView(page);
  const file = keys.getByLabel('Keystore file', { exact: true });
  if (!(await file.isVisible())) await keys.getByText('Import an encrypted keystore', { exact: true }).click();
  await file.setInputFiles({ name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await keys.getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await keys.getByRole('button', { name: 'Decrypt and load', exact: true }).click();
}

/** Run the actual scanner Worker; a full rescan explicitly opts out of a restored checkpoint. */
export async function scanErc20(page: Page, options: { readonly fromStart?: boolean } = {}): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive', exact: true }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  const start = page.getByRole('button', { name: 'Start scan', exact: true });
  await expect(start).toBeEnabled();
  if (options.fromStart === true) {
    const resume = page.getByLabel('Resume from checkpoint', { exact: true });
    if (await resume.count() > 0) await resume.uncheck();
  }
  await page.getByLabel('Start block', { exact: true }).fill('0');
  await start.click();
  await expect(page.getByText(/^Finished\./)).toBeVisible({ timeout: 60_000 });
}
