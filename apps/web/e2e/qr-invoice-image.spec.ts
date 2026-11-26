import { expect, test } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { createInvoice, generateKeys, ORIGIN } from './helpers';

// Pay validates the HTTPS origin of a full invoice link. Serve this test origin from the local Pages preview.
const appOrigin = 'https://ghostpay.test';
test.use({ deviceScaleFactor: 2 });

test('reads the QR rendered by Create invoice and rejects damaged images and unsupported QR payloads', async ({ page }) => {
  const unexpectedRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== appOrigin) {
      unexpectedRequests.push(url.origin);
      await route.abort();
      return;
    }
    await route.fulfill({ response: await route.fetch({ url: ORIGIN + url.pathname + url.search }) });
  });
  await page.addInitScript(() => { Object.defineProperty(window, 'BarcodeDetector', { value: undefined }); });
  await page.goto(appOrigin);
  await generateKeys(page);
  const description = 'QR image round trip';
  await createInvoice(page, { description });
  const png = await page.getByRole('img', { name: 'QR code containing the invoice link' }).screenshot();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Pay$/ }).click();
  await page.getByText('Scan an invoice QR or open a request file').click();
  const file = page.getByLabel('Read a QR from an image');
  const open = page.getByRole('button', { name: 'Open scanned invoice' });
  const invoice = { name: 'invoice.png', mimeType: 'image/png', buffer: png };
  await file.setInputFiles(invoice);
  await expect(page.getByText(/Chain 84532\. The embedded key signed this invoice/)).toBeVisible();
  await expect(open).toBeVisible();

  await file.setInputFiles({ ...invoice, buffer: png.subarray(0, 32) });
  await expect(page.getByText(/That image could not be opened/)).toBeVisible();
  await expect(open).toHaveCount(0);

  const unsupported = qrcode(0, 'M');
  unsupported.addData('bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
  unsupported.make();
  const gif = Buffer.from(unsupported.createDataURL(5).split(',')[1] as string, 'base64');
  await file.setInputFiles({ name: 'request.gif', mimeType: 'image/gif', buffer: gif });
  await expect(page.getByText(/plain wallet payment request/)).toBeVisible();
  await expect(open).toHaveCount(0);
  await expect(page).toHaveURL(appOrigin + '/');

  await file.setInputFiles(invoice);
  await expect(open).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toHaveCount(0);
  await open.click();
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
});
