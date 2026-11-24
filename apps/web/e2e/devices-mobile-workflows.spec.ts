import { expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { createInvoice, generateKeys } from './helpers';

test('after a camera denial a touch user can import an invoice QR image and review it before opening payment', async ({ page }) => {
  // Drive the same OS-denial branch deterministically in both engines.
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Test camera permission denied', 'NotAllowedError')),
    });
  });
  await page.goto('/');
  await generateKeys(page);
  const memo = 'Mobile file import';
  const link = await createInvoice(page, { memo });
  // localhost uses HTTP in the test harness. The scanner supports a bare GhostPay fragment.
  const qr = qrcode(0, 'M');
  qr.addData(new URL(link).hash, 'Byte');
  qr.make();
  const gif = Buffer.from(qr.createDataURL(6).slice('data:image/gif;base64,'.length), 'base64');

  const pay = page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true });
  await pay.tap();
  await expect(pay).toHaveAttribute('aria-current', 'page');
  await page.getByText('Scan an invoice QR', { exact: true }).tap();
  const importer = page.getByRole('region', { name: 'Invoice QR import' });
  await importer.getByRole('button', { name: 'Scan with camera' }).tap();
  await expect(importer.getByText(/Camera access was denied/)).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await importer.locator('input[type=file]').tap();
  await (await chooser).setFiles({ name: 'invoice.gif', mimeType: 'image/gif', buffer: gif });
  await expect(page.getByRole('heading', { name: 'Review scanned invoice' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open scanned invoice' }).tap();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  const memoParagraph = page.locator('p').filter({ has: page.getByText('Memo:', { exact: true }) });
  await expect(memoParagraph).toBeVisible();
  await expect(memoParagraph).toHaveText(`Memo: ${memo}`);
});

test('an encrypted backup downloaded by touch can be selected again and verified', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const pass = 'violet comet maple lantern harbor';
  await page.goto('/');
  await generateKeys(page);
  await page.getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(pass);
  await page.getByLabel('Repeat passphrase', { exact: true }).fill(pass);
  const pending = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Download encrypted keystore' }).tap();
  const download = await pending;
  const path = testInfo.outputPath('synthetic-keystore.json');
  await download.saveAs(path);
  await expect(page.getByText('This backup is not verified yet')).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByLabel('Downloaded keystore file', { exact: true }).tap();
  await (await chooser).setFiles(path);
  await page.getByLabel('Keystore passphrase', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Verify backup' }).tap();
  await expect(page.getByText(/^Backup verified: the file decrypts and holds exactly the loaded keys/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('This backup is not verified yet')).toHaveCount(0);
});
