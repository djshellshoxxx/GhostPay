import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { generateKeys } from './helpers';

const lean = process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] === 'lean';

test('reimports the same original tag archive after a successful import without reloading', async ({ page }) => {
  test.skip(lean, 'tag archives are intentionally available only in the full profile');
  test.setTimeout(120_000);
  await page.goto('/');
  await generateKeys(page);
  const tags = page.getByTestId('backup-item-tags');
  const passphrase = 'violet comet maple lantern';
  await tags.getByLabel('Archive passphrase (at least 14 characters)').fill(passphrase);
  await tags.getByLabel('Repeat archive passphrase').fill(passphrase);
  await tags.getByLabel('Include scan history').uncheck();
  const downloaded = page.waitForEvent('download');
  await tags.getByRole('button', { name: 'Download encrypted tag archive' }).click();
  const download = await downloaded;
  const path = await download.path();
  if (path === null) throw new Error('The original archive download was not available.');
  const file = { name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile(path) };
  for (let attempt = 0; attempt < 2; attempt++) {
    await tags.getByLabel('Archive file', { exact: true }).setInputFiles(file);
    await expect(tags.getByLabel('Archive file', { exact: true })).toHaveValue('');
    await tags.getByLabel('Archive passphrase', { exact: true }).fill(passphrase);
    await tags.getByRole('button', { name: 'Decrypt and preview', exact: true }).click();
    const apply = tags.getByRole('button', { name: 'Apply import', exact: true });
    await expect(apply).toBeVisible({ timeout: 60_000 });
    await apply.click();
    await expect(tags.getByText(/Imported: 0 added, 0 updated, 0 removed/)).toBeVisible();
    await expect(apply).toHaveCount(0);
  }
});
