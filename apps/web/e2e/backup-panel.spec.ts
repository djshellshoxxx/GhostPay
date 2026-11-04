import { expect, test } from '@playwright/test';
import { generateKeys } from './helpers';

const lean = process.env['GHOSTPAY_LOCAL_BUILD_PROFILE'] === 'lean';
const PASS = 'violet comet maple lantern';

test.describe('combined backup panel', () => {
  test.skip(lean, 'full profile only; the lean case below asserts the exclusion');

  test('shows honest per-item status and marks each item done only after its export', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await generateKeys(page);
    const panel = page.getByTestId('backup-panel');
    const keys = page.getByTestId('backup-item-keys');
    const tags = page.getByTestId('backup-item-tags');
    await expect(panel.getByRole('heading', { name: 'Backup checklist' })).toBeVisible();
    // The waiver typed by generateKeys lets the page be used; it is not a backup.
    await expect(keys.getByRole('status').first()).toContainText('Not started');
    await expect(tags.getByRole('status').first()).toContainText('Not started');

    await page.getByRole('button', { name: 'Go to the keystore backup' }).click();
    await page.getByLabel("Passphrase (at least 14 characters)", { exact: true }).fill(PASS);
    await page.getByLabel("Repeat passphrase", { exact: true }).fill(PASS);
    const keystore = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download encrypted keystore' }).click();
    expect((await keystore).suggestedFilename()).toBe('ghostpay-keystore.json');
    await expect(keys.getByRole('status').first()).toContainText('Done');
    await expect(tags.getByRole('status').first()).toContainText('Not started');

    await tags.getByLabel('Archive passphrase (at least 14 characters)').fill(PASS);
    await tags.getByLabel('Repeat archive passphrase').fill(PASS);
    await tags.getByLabel('Include scan history').uncheck();
    const archive = page.waitForEvent('download', { timeout: 60_000 });
    await tags.getByRole('button', { name: 'Download encrypted tag archive' }).click();
    expect((await archive).suggestedFilename()).toMatch(/\.gpa$/);
    await expect(tags.getByRole('status').first()).toContainText('Downloaded');
    await expect(tags.getByRole('status').first()).not.toContainText('Done');
  });
});

test.describe('lean profile', () => {
  test.skip(!lean, 'lean profile only');

  test('keeps the key backup and has no tag archive item or combined panel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
    await page.getByRole('button', { name: 'Generate new keys' }).click();
    await expect(page.getByRole('heading', { name: 'Back up (encrypted)' })).toBeVisible();
    await expect(page.getByTestId('backup-panel')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Client tags/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download encrypted tag archive' })).toHaveCount(0);
  });
});
