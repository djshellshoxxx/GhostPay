import { expect, type Page } from '@playwright/test';

/*
 * Page drivers for the devnet journey. They follow e2e/helpers.ts and e2e/core-journey.spec.ts step for step; the only
 * difference is the origin (the devnet build is served on its own port, so helpers.createInvoice's fixed 4173 origin
 * assertion cannot be reused as is).
 */

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
export const keysView = (page: Page) => page.locator('section[aria-labelledby="keys-h"]');
export const sweepView = (page: Page) => page.locator('section[aria-labelledby="sw-h"]');
export const scanMatches = (page: Page) => page.locator('section[aria-labelledby="scan-h"] .matches > li');
export const receiptPanel = (page: Page) => page.getByRole('region', { name: 'Seller-signed receipt' });
export const walletJournal = (page: Page): Promise<{ status: string; hash?: string; chainId: number; kind: string }[]> =>
  page.evaluate(() => JSON.parse(window.sessionStorage.getItem('ghostpay.wallet-attempts.v1') ?? '[]') as { status: string; hash?: string; chainId: number; kind: string }[]);
export const sweepJournal = (page: Page): Promise<{ chainId: number; owner: string; nonce: number; expectedHash: string; status: string }[]> =>
  page.evaluate(() => JSON.parse(window.sessionStorage.getItem('ghostpay.sweep-attempts.v1') ?? '[]') as { chainId: number; owner: string; nonce: number; expectedHash: string; status: string }[]);

export async function identityOf(page: Page): Promise<{ meta: string; signer: string }> {
  const meta = keysView(page).locator('code', { hasText: /^st:eth:0x/ });
  const signer = keysView(page).locator('code', { hasText: /^0[23][0-9a-f]{64}$/ });
  await expect(meta).toBeVisible();
  await expect(signer).toBeVisible();
  return { meta: ((await meta.textContent()) ?? '').trim(), signer: ((await signer.textContent()) ?? '').trim() };
}

/** helpers.createInvoice with the devnet origin: fixed 0.5 ETH on Base Sepolia (here: the local anvil under 84532). */
export async function createInvoiceAt(page: Page, origin: string, description: string): Promise<string> {
  await nav(page).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount').fill('0.5');
  await page.getByLabel('Item 1 description').fill(description);
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(box).toBeVisible();
  const link = await box.inputValue();
  expect(link.startsWith(`${origin}/#gpi=v1.`)).toBe(true);
  return link;
}

/** Payer: review -> Continue -> connect the injected wallet -> prepare -> final check (nothing sent yet). */
export async function reviewToFinalCheck(payer: Page, router: string, walletName: string): Promise<void> {
  await expect(payer.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await expect(payer.getByText(router).first()).toBeVisible();
  await payer.getByRole('button', { name: 'Continue' }).click();
  await payer.getByRole('button', { name: `Connect ${walletName}` }).click();
  await payer.getByRole('button', { name: 'Prepare payment' }).click();
  await expect(payer.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible({ timeout: 30_000 });
  await expect(payer.getByText('payNative')).toBeVisible();
}

export async function scan(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/^Finished\./)).toBeVisible({ timeout: 60_000 });
}
