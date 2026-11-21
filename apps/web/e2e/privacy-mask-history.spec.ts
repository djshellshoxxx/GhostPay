import { expect, test, type Page } from '@playwright/test';
import { generateKeys } from './helpers';
import { configureRpc, mockNetwork, stageVerifiedErc20Payment, type MockNetworkState } from './flowMocks';
import { auditAccessibility } from './accessibility-audit';

const privacyControl = (page: Page) => page.getByRole('banner').getByRole('switch', { name: 'Privacy mode', exact: true });
const reveal = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Reveal details for 30 seconds', exact: true });

test('privacy masking preserves seller keys and drafts while excluding them from display, focus and the accessibility tree', async ({ page }, info) => {
  await page.clock.install();
  await page.goto('/');
  const meta = await generateKeys(page);
  const keys = page.getByText(meta, { exact: true });
  await privacyControl(page).focus();
  await privacyControl(page).press('Space');
  await expect(keys).toBeHidden();
  expect(await page.locator('body').ariaSnapshot()).not.toContain(meta);
  await auditAccessibility(page, 'privacy-masked-keys');
  await info.attach('privacy-masked.png', { body: await page.screenshot(), contentType: 'image/png' });
  await reveal(page).click();
  await expect(keys).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Paste an invoice link', exact: true })).toHaveCount(0);
  await reveal(page).click();
  const input = page.getByRole('textbox', { name: 'Paste an invoice link', exact: true });
  await input.fill('#private-draft-kept-in-memory');
  const draft = await input.elementHandle();
  await input.selectText();
  await page.clock.runFor(30_000);
  await expect(input).toHaveCount(0);
  await expect(privacyControl(page)).toBeFocused();
  expect(await page.locator('body').ariaSnapshot()).not.toContain('private-draft-kept-in-memory');
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('');
  await page.keyboard.press('Tab');
  await expect(reveal(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('#private-draft-kept-in-memory');
  expect(await draft?.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await reveal(page).click();
  await expect(page.getByText(meta, { exact: true })).toBeVisible();
});

async function encryptedHistory(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ghostpay-reconciliation-encrypted');
      request.onupgradeneeded = () => { request.transaction?.abort(); };
      request.onsuccess = () => { resolve(request.result); };
      request.onerror = () => { reject(new Error('Encrypted history is unavailable')); };
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction('vaults', 'readonly');
        const request = tx.objectStore('vaults').getAll();
        tx.oncomplete = () => { resolve((request.result as unknown[]).filter((value): value is string => typeof value === 'string').sort()); };
        tx.onabort = tx.onerror = () => { reject(new Error('Encrypted history read failed')); };
      });
    } finally { db.close(); }
  });
}

test('saved transaction history needs unlock and separate reveal, with no new lookup or plaintext storage', async ({ context, page }) => {
  const state: MockNetworkState = {};
  const network = await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await generateKeys(page);
  const { txHash } = stageVerifiedErc20Payment(state, meta);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive', exact: true }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption('84532');
  await page.getByLabel('Start block', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Start scan', exact: true }).click();
  await expect(page.getByText(/Finished\./)).toBeVisible();
  const ledger = page.getByRole('region', { name: 'Local payment reconciliation', exact: true });
  await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
  await ledger.getByRole('button', { name: 'Add verified payment to ledger', exact: true }).click();
  await expect(ledger.getByText(txHash, { exact: true })).toBeVisible();
  const ciphertext = await encryptedHistory(page);
  expect(ciphertext.length).toBeGreaterThan(0);
  expect(ciphertext.join()).not.toContain(txHash);
  const requests = network.requests.length;
  await privacyControl(page).check();
  await reveal(page).click();
  await expect(ledger.getByText(txHash, { exact: true })).toBeHidden();
  expect(await ledger.ariaSnapshot()).not.toContain(txHash);
  await ledger.getByRole('button', { name: 'Reveal history for 30 seconds', exact: true }).click();
  await expect(ledger.getByText(txHash, { exact: true })).toBeVisible();
  await auditAccessibility(page, 'privacy-history-revealed');
  await ledger.getByRole('button', { name: 'Lock reconciliation vault', exact: true }).click();
  await reveal(page).click();
  await expect(ledger.getByRole('button', { name: 'Reveal history for 30 seconds', exact: true })).toBeDisabled();
  await expect(ledger.getByText(txHash, { exact: true })).toHaveCount(0);
  expect(await encryptedHistory(page)).toEqual(ciphertext);
  expect(network.requests.length).toBe(requests);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(txHash);
});
