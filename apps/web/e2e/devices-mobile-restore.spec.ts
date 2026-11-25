import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { KEYSTORE_V1, KEYSTORE_V1_PASSPHRASE } from '../../../packages/ux-vault/src/keystore-portable.vectors.testutil';
import { generateKeys } from './helpers';

// Restoring seller keys on a phone or tablet from a backup made somewhere else. Runs in the touch-device projects of
// both Playwright configs (Chromium descriptors, and native WebKit for iPhone/iPad in playwright.mobile.config.ts).
// These are browser-engine and viewport emulations with synthetic keys, not physical-device evidence.
const BASE_URL = 'http://localhost:4173';
const VECTOR = JSON.parse(KEYSTORE_V1) as { meta: { metaAddress: string; signer: string }; ciphertext: string };
const EXPORT_PASS = 'violet comet maple lantern harbor';
const VAULT_PASS = 'quiet orchard ember signal rowan';
const WRONG = 'Wrong passphrase, or the keystore was modified.';

const keysView = (page: Page): Locator => page.locator('section[aria-labelledby="keys-h"]');
const metaAddress = (page: Page): Locator => keysView(page).locator('code', { hasText: /^st:eth:0x/ });
const importPanel = (page: Page): Locator => keysView(page).locator('details', { has: page.locator('summary', { hasText: 'Import an encrypted keystore' }) });

async function openKeys(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).tap();
  await expect(page.getByRole('heading', { name: 'Seller keys', level: 2 })).toBeVisible();
}

async function chooseFile(page: Page, input: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await input.tap();
  await (await chooser).setFiles(file);
}

function damaged(text: string): string {
  const ct = VECTOR.ciphertext;
  const i = ct.length >> 1;
  return text.replace(ct, ct.slice(0, i) + (ct[i] === '0' ? '1' : '0') + ct.slice(i + 1));
}

/** Another device: its own browser context (separate storage), desktop-sized, light scheme, no animated QR stepping. */
async function otherDevice(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' });
}

/** Generates seller keys on the other device, downloads the encrypted keystore and returns its public identity. */
async function sellerWithBackupQr(dp: Page): Promise<{ meta: string; signer: string; frame: Locator }> {
  await dp.goto('/');
  const meta = await generateKeys(dp);
  const signer = (await keysView(dp).locator('h3', { hasText: 'Invoice-signing public key' }).locator('xpath=following-sibling::p[1]').textContent())?.trim() ?? '';
  expect(signer).toMatch(/^0?x?[0-9a-f]{66}$/);
  await dp.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(EXPORT_PASS);
  await dp.getByLabel('Repeat passphrase', { exact: true }).fill(EXPORT_PASS);
  const download = dp.waitForEvent('download', { timeout: 90_000 });
  await dp.getByRole('button', { name: 'Download encrypted keystore' }).click();
  await download;
  const frame = dp.locator('.qr-frame[data-qr-kind="secret"]');
  await expect(frame).toBeVisible();
  return { meta, signer, frame };
}

async function decryptAndLoad(page: Page, passphrase: string): Promise<void> {
  await importPanel(page).getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await importPanel(page).getByRole('button', { name: 'Decrypt and load' }).tap();
}

test('a keystore written by the independent codec restores on this device, refuses damage and survives a vault reload', async ({ page }) => {
  test.setTimeout(180_000);
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => { dialogs.push(dialog.type()); void dialog.dismiss(); });
  await page.goto('/');
  await openKeys(page);
  await importPanel(page).locator('summary').tap();
  const file = importPanel(page).getByLabel('Keystore file', { exact: true });

  // A damaged copy and a wrong passphrase load nothing on the device.
  await chooseFile(page, file, { name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(damaged(KEYSTORE_V1), 'utf8') });
  await decryptAndLoad(page, KEYSTORE_V1_PASSPHRASE);
  await expect(keysView(page).getByRole('alert')).toContainText(WRONG, { timeout: 60_000 });
  await expect(metaAddress(page)).toHaveCount(0);
  await chooseFile(page, file, { name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(KEYSTORE_V1, 'utf8') });
  await decryptAndLoad(page, `${KEYSTORE_V1_PASSPHRASE} typo`);
  await expect(keysView(page).getByRole('alert')).toContainText(WRONG, { timeout: 60_000 });
  await expect(metaAddress(page)).toHaveCount(0);

  // The exact file restores the same public identity: meta-address and invoice signer.
  await decryptAndLoad(page, KEYSTORE_V1_PASSPHRASE);
  await expect(metaAddress(page)).toHaveText(VECTOR.meta.metaAddress, { timeout: 60_000 });
  await expect(keysView(page).getByText(VECTOR.meta.signer, { exact: true })).toBeVisible();

  // Keep them on this device: an encrypted browser vault that unlocks to the same keys after a reload.
  await keysView(page).getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
  await keysView(page).getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
  await keysView(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).tap();
  await expect(keysView(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 90_000 });
  await page.reload();
  await openKeys(page);
  await expect(metaAddress(page)).toHaveCount(0);
  await keysView(page).getByLabel('Vault passphrase', { exact: true }).fill(VAULT_PASS);
  await keysView(page).getByRole('button', { name: 'Unlock saved vault' }).tap();
  await expect(metaAddress(page)).toHaveText(VECTOR.meta.metaAddress, { timeout: 90_000 });
  await expect(keysView(page).getByText(VECTOR.meta.signer, { exact: true })).toBeVisible();
  // An imported keystore is a verified external copy: neither the reload nor anything else asked to stay on the page.
  expect(dialogs).toEqual([]);
});

test('the encrypted backup QR shown on another device restores here from an image after a camera denial', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const desktop = await otherDevice(browser);
  try {
    const dp = await desktop.newPage();
    const seller = await sellerWithBackupQr(dp);
    await seller.frame.getByRole('button', { name: 'Reveal secret QR code' }).click();
    const image = await seller.frame.getByRole('img', { name: 'Encrypted seller keystore backup' }).screenshot();

    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: () => Promise.reject(new DOMException('Test camera permission denied', 'NotAllowedError')),
      });
    });
    await page.goto('/');
    await openKeys(page);
    await importPanel(page).locator('summary').tap();
    const importer = page.getByRole('region', { name: 'Import encrypted keystore QR' });
    await importer.getByRole('button', { name: 'Scan with camera' }).tap();
    await expect(importer.getByText(/Camera access was denied/)).toBeVisible();
    await chooseFile(page, importer.locator('input[type=file]'), { name: 'backup.png', mimeType: 'image/png', buffer: image });
    await expect(keysView(page).getByText('Encrypted keystore received. Enter its passphrase and choose Decrypt and load.')).toBeVisible({ timeout: 30_000 });
    await decryptAndLoad(page, EXPORT_PASS);
    await expect(metaAddress(page)).toHaveText(seller.meta, { timeout: 90_000 });
    await expect(keysView(page).getByText(seller.signer, { exact: true })).toBeVisible();
  } finally {
    await desktop.close();
  }
});

test('the smaller multi-part backup codes shown on another device restore here one image at a time', async ({ page, browser }) => {
  test.setTimeout(300_000);
  const desktop = await otherDevice(browser);
  try {
    const dp = await desktop.newPage();
    const seller = await sellerWithBackupQr(dp);
    await keysView(dp).getByLabel('Show as several smaller codes').check();
    await seller.frame.getByRole('button', { name: 'Reveal secret QR code' }).click();
    const status = seller.frame.getByRole('group', { name: 'Multipart QR code' }).getByRole('status');
    const total = Number((/of (\d+)$/.exec((await status.textContent()) ?? '') ?? [])[1]);
    expect(total).toBeGreaterThan(1);
    const parts: Buffer[] = [];
    for (let part = 1; part <= total; part += 1) {
      await expect(status).toHaveText(`Part ${String(part)} of ${String(total)}`);
      parts.push(await seller.frame.getByRole('img', { name: 'Encrypted seller keystore backup' }).screenshot());
      if (part < total) await seller.frame.getByRole('button', { name: 'Next part' }).click();
    }

    await page.goto('/');
    await openKeys(page);
    await importPanel(page).locator('summary').tap();
    const importer = page.getByRole('region', { name: 'Import encrypted keystore QR' });
    // Out of order, as a person scanning a looping code would: the last part first, then the rest.
    const order = [total - 1, ...Array.from({ length: total - 1 }, (_, i) => i)];
    for (const [step, index] of order.entries()) {
      await chooseFile(page, importer.locator('input[type=file]'), { name: `backup-part-${String(index + 1)}.png`, mimeType: 'image/png', buffer: parts[index]! });
      if (step < total - 1) await expect(importer.getByText(`${String(step + 1)} of ${String(total)} parts received.`)).toBeVisible({ timeout: 30_000 });
    }
    await expect(keysView(page).getByText('Encrypted keystore received. Enter its passphrase and choose Decrypt and load.')).toBeVisible({ timeout: 30_000 });
    await decryptAndLoad(page, EXPORT_PASS);
    await expect(metaAddress(page)).toHaveText(seller.meta, { timeout: 90_000 });
    await expect(keysView(page).getByText(seller.signer, { exact: true })).toBeVisible();
  } finally {
    await desktop.close();
  }
});
