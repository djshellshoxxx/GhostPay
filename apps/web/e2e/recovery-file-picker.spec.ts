import { expect, test, type Locator, type Page } from '@playwright/test';
import { A1, EXPORT_PASS, VECTORS, download, importVectorSeller, keysView, nav } from './stealthExportFixtures';

async function selectRecoveryFile(page: Page, text: string): Promise<Locator> {
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  const panel = page.getByTestId('stealth-export-open');
  await expect(panel.locator('input[type="password"]')).toHaveCount(0);
  await panel.getByLabel('Recovery file').setInputFiles({
    name: 'renamed.json', mimeType: 'application/json', buffer: Buffer.from(text),
  });
  return panel;
}

test('a public payment record opens in a fresh profile without a passphrase or seller keys', async ({ page }) => {
  const panel = await selectRecoveryFile(page, VECTORS.files.public.text);
  await expect(panel.getByRole('status')).toHaveText('Public payment record');
  await expect(panel.locator('input[type="password"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Open export' }).click();
  await expect(panel.getByText(A1.expected.stealthAddress, { exact: true })).toBeVisible();
  await expect(panel.locator('input[type="password"]')).toHaveCount(0);
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});

test('a single-payment export recovers only its one address in a fresh profile', async ({ page }) => {
  const panel = await selectRecoveryFile(page, VECTORS.files.single.text);
  await expect(panel.getByRole('status')).toHaveText('Encrypted payment keys for the addresses in this export');
  await panel.getByLabel('Export file passphrase').fill(EXPORT_PASS);
  await panel.getByRole('button', { name: 'Open export' }).click();
  const result = panel.getByTestId('stealth-export-open-keypair');
  await expect(result).toContainText('scope: single payment');
  await expect(result.getByRole('listitem')).toHaveCount(1);
  await result.getByRole('button', { name: `Download private key for ${A1.expected.stealthAddress}` }).click();
  const file = await download(page, () => result.getByRole('button', { name: 'Download the private key', exact: true }).click());
  expect(file.text === VECTORS.files.rawPrivateKey.text).toBe(true);
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});

test('a master backup restores its seller address after a separate load action in a fresh profile', async ({ page }) => {
  const panel = await selectRecoveryFile(page, VECTORS.files.master.text);
  await expect(panel.getByRole('status')).toHaveText('Master backup (spending and viewing keys)');
  await panel.getByLabel('Export file passphrase').fill(EXPORT_PASS);
  await panel.getByRole('button', { name: 'Open export' }).click();
  const master = panel.getByTestId('stealth-export-open-master');
  await expect(master.getByText(VECTORS.seller.metaAddress, { exact: true })).toBeVisible();
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  await master.getByRole('button', { name: 'Load these spending and viewing keys' }).click();
  await expect(panel).toContainText('with a new invoice-signing key');
  await expect(keysView(page).getByText(VECTORS.seller.metaAddress, { exact: true })).toBeVisible();
});

test('a renamed encrypted keystore restores the same payment and invoice-signing identity in a fresh profile', async ({ browser, page }) => {
  await page.goto('/');
  await importVectorSeller(page);
  const keys = keysView(page);
  const signer = await keys.getByRole('heading', { name: 'Invoice-signing public key' }).locator('+ p code').innerText();
  await keys.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(EXPORT_PASS);
  await keys.getByLabel('Repeat passphrase', { exact: true }).fill(EXPORT_PASS);
  const file = await download(page, () => keys.getByRole('button', { name: 'Download encrypted keystore' }).click());
  const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin, serviceWorkers: 'block' });
  try {
    const recovery = await fresh.newPage();
    const panel = await selectRecoveryFile(recovery, file.text);
    await expect(panel.getByRole('status')).toHaveText('Seller keystore (spending, viewing and invoice-signing keys)');
    await panel.getByLabel('Passphrase', { exact: true }).fill(EXPORT_PASS);
    await expect(keysView(recovery).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
    await panel.getByRole('button', { name: 'Decrypt and load' }).click();
    await expect(keysView(recovery).getByText(VECTORS.seller.metaAddress, { exact: true })).toBeVisible();
    await expect(keysView(recovery).getByText(signer, { exact: true })).toBeVisible();
  } finally {
    await fresh.close();
  }
});
