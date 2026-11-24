import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { qrMatrix, qrSvgPath } from '@ghostpay/qr-exchange';
import { parseFragment } from '@ghostpay/invoice-schema';
import { createInvoice, generateKeys, openFresh } from './helpers';

async function downloadInvoice(page: Page): Promise<string> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download invoice link (.txt)' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('ghostpay-invoice.txt');
  return readFile(await download.path(), 'utf8');
}

test('export and reopen both formats with their signed metadata choice', async ({ page }) => {
  const description = 'Demo merchant 217';
  const memo = 'Internal order 831';
  await page.goto('/?order=local-only');
  await generateKeys(page);
  const normalLink = await createInvoice(page, { description, memo });
  const normalFile = await downloadInvoice(page);
  expect(normalFile).toBe(normalLink);
  const normal = await parseFragment(new URL(normalFile).hash);
  expect(normal.verification.signatureValid).toBe(true);
  expect(normal.invoice.lineItems[0]?.description).toBe(description);
  expect(normal.invoice.memo).toBe(memo);

  const choice = page.getByRole('checkbox', { name: 'Privacy-minimal invoice' });
  await expect(choice).not.toBeChecked();
  await choice.check();
  await expect(choice).toHaveAccessibleDescription(/Omits all item descriptions.*seller meta-address/);
  await expect(page.getByRole('textbox', { name: 'Link', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download SVG' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download invoice link (.txt)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const minimalFile = await downloadInvoice(page);
  expect(minimalFile).toBe(await page.getByRole('textbox', { name: 'Link', exact: true }).inputValue());
  const url = new URL(minimalFile);
  expect(url.search).toBe('');
  const minimal = await parseFragment(url.hash, { pinnedSigners: [normal.invoice.signer], requirePinnedSigner: true });
  expect(minimal.invoice.lineItems).toEqual([]);
  expect(minimal.invoice).not.toHaveProperty('memo');
  expect(minimal.invoice.amountPolicy).toEqual(normal.invoice.amountPolicy);
  expect(minimal.invoice.fiat).toEqual(normal.invoice.fiat);

  const qrDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  const svg = await readFile(await (await qrDownload).path(), 'utf8');
  expect(svg).toContain(`d="${qrSvgPath(qrMatrix(minimalFile))}"`);

  await openFresh(page, normalFile);
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByText(memo)).toBeVisible();
  await openFresh(page, minimalFile);
  await expect(page.getByRole('heading', { name: 'Review payment' })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toHaveCount(0);
  await expect(page.getByText(memo)).toHaveCount(0);
  await page.evaluate(() => { window.print = () => undefined; });
  await page.getByRole('button', { name: 'Print bill' }).click();
  await page.emulateMedia({ media: 'print' });
  const bill = page.getByRole('article', { name: 'Printable bill' });
  await expect(bill).toContainText(minimal.invoice.nonce);
  await expect(bill).toContainText('0.5');
  await expect(bill.getByRole('table')).toHaveCount(0);
  await expect(bill).not.toContainText(memo);
});
