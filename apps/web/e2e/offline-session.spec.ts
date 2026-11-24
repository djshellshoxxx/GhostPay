import { expect, test, type Page } from '@playwright/test';
import { parseFragment } from '@ghostpay/invoice-schema';
import { configureRpc, mockNetwork } from './flowMocks';

const seller = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' });
const create = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Create invoice' });

async function loadKeys(page: Page, first: number): Promise<void> {
  await seller(page).click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  const hex = (n: number): string => n.toString(16).padStart(64, '0');
  await page.getByLabel('Spending private key (64 hex characters)').fill(hex(first));
  await page.getByLabel('Viewing private key (64 hex characters)').fill(hex(first + 1));
  await page.getByLabel('Invoice-signing private key (optional)').fill(hex(first + 2));
  await page.getByRole('button', { name: 'Load keys' }).click();
  await expect(page.getByRole('heading', { name: 'Your meta-address (public)' })).toBeVisible();
  await create(page).click();
}

test('encrypted opt-in keeps unfinished edits across failed offline reload and same-seller recovery', async ({ context, page }) => {
  await page.goto('/');
  await loadKeys(page, 1);
  await page.getByLabel('Token amount').fill('0.75001');
  await page.getByLabel('Item 1 description').fill('Offline fixture service');
  await page.getByLabel('Item 1 unit price').fill('41.90');
  await page.getByLabel('Memo').fill('private fixture memo');
  const stored = (): Promise<string[]> => page.evaluate(() =>
    Object.keys(sessionStorage).filter(k => k.startsWith('ghostpay.invoice-draft.')).map(k => sessionStorage.getItem(k) ?? ''));
  expect(await stored()).toEqual([]);
  await context.setOffline(true);
  await expect(page.getByText(/Your browser is offline/)).toBeVisible();
  await expect(page.getByLabel('Token amount')).toHaveValue('0.75001');
  await page.getByRole('button', { name: 'Keep an encrypted draft in this tab' }).click();
  await page.getByLabel('Memo').fill('latest private fixture');
  await page.getByLabel('Protect the entire invoice with a passphrase').check();
  await page.getByLabel('Invoice passphrase (at least 14 characters)').fill('only in the original form');
  await expect(page.getByText('Latest edits saved in this tab.')).toBeVisible();
  const records = await stored();
  expect(records).toHaveLength(1);
  for (const field of ['latest private fixture', 'Offline fixture service', 'only in the original form', '0.75001']) {
    expect(records[0]).not.toContain(field);
  }
  // Routing disables the HTTP cache. The beta has no installable offline shell.
  await context.route('**/*', route => route.continue());
  await expect(page.reload()).rejects.toThrow();
  await context.unroute('**/*');
  await context.setOffline(false);
  await page.goto('/');
  await loadKeys(page, 4);
  await expect(page.getByLabel('Memo')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Resume encrypted draft' })).toHaveCount(0);
  await page.reload();
  await loadKeys(page, 1);
  await page.getByRole('button', { name: 'Resume encrypted draft' }).click();
  await expect(page.getByLabel('Memo')).toHaveValue('latest private fixture');
  await expect(page.getByLabel('Token amount')).toHaveValue('0.75001');
  await expect(page.getByLabel('Protect the entire invoice with a passphrase')).toBeChecked();
  await expect(page.getByLabel('Invoice passphrase (at least 14 characters)')).not.toHaveValue('only in the original form');
  await expect(page.getByLabel('Repeat invoice passphrase')).toHaveValue('');
  await page.getByLabel('Protect the entire invoice with a passphrase').uncheck();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  await expect(page.getByLabel('Link', { exact: true })).toBeVisible();
  expect(await stored()).toEqual([]);
});

test('a loaded tab signs and reads locally, then retries RPC verification explicitly', async ({ context, page }) => {
  const network = await mockNetwork(context, {});
  await configureRpc(page);
  await page.goto('/');
  await loadKeys(page, 7);
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await context.setOffline(true);
  await expect(page.getByText(/Your browser is offline/)).toBeVisible();
  const before = network.requests.length;
  await page.getByLabel('Token amount').fill('0.25');
  await page.getByLabel('Item 1 description').fill('Offline local work');
  await page.getByLabel('Item 1 unit price').fill('9.50');
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const link = await page.getByLabel('Link', { exact: true }).inputValue();
  expect((await parseFragment(new URL(link).hash)).verification.signatureValid).toBe(true);
  await page.evaluate(hash => { window.location.hash = hash; }, new URL(link).hash);
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  await expect(page.getByText('Offline local work')).toBeVisible();
  const proceed = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(proceed).toBeDisabled();
  expect(network.requests.length).toBe(before);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Retry chain verification' }).click();
  await expect(proceed).toBeEnabled();
  expect(network.requests.length).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Send payment in my wallet' })).toHaveCount(0);
});
