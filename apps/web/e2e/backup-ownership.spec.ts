import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const PASS = 'violet comet maple lantern';
const HELD_FILE = 'held-backup.json';
const VERIFIED = /^Backup verified: the file decrypts and holds exactly the loaded keys/;
const DOWNLOADED = /^Encrypted keystore downloaded\./;
type DelayKind = 'encrypt' | 'file';
interface BackupDelay {
  arm: (kind: DelayKind) => void;
  pending: (kind: DelayKind) => boolean;
  release: (kind: DelayKind) => Promise<void>;
}
declare global {
  interface Window {
    backupOperationDelay: BackupDelay;
  }
}

// These journeys retain the production scrypt cost and native AES-GCM implementation.
test.setTimeout(120_000);

function keys(page: Page) {
  return page.locator('section[aria-labelledby="keys-h"]');
}

/** Hold native completions, without importing product internals or replacing cryptographic results. */
async function installDelays(page: Page): Promise<void> {
  await page.addInitScript(({ heldFile }) => {
    const gates: Record<DelayKind, { armed: boolean; release?: () => void }> = {
      encrypt: { armed: false },
      file: { armed: false },
    };
    const hold = async (kind: DelayKind): Promise<void> => {
      const gate = gates[kind];
      if (!gate.armed) return;
      gate.armed = false;
      await new Promise<void>((resolve) => { gate.release = resolve; });
      delete gate.release;
    };
    crypto.subtle.encrypt = async (...args: Parameters<SubtleCrypto['encrypt']>): Promise<ArrayBuffer> => {
      const result = await SubtleCrypto.prototype.encrypt.call(crypto.subtle, ...args);
      const algorithm = typeof args[0] === 'string' ? args[0] : args[0].name;
      if (algorithm === 'AES-GCM') await hold('encrypt');
      return result;
    };
    File.prototype.text = async function (this: File): Promise<string> {
      const text = await Blob.prototype.text.call(this);
      if (this.name === heldFile) await hold('file');
      return text;
    };
    window.backupOperationDelay = {
      arm(kind) {
        if (gates[kind].armed || gates[kind].release !== undefined) throw new Error('The delay is already armed.');
        gates[kind].armed = true;
      },
      pending: (kind) => gates[kind].release !== undefined,
      async release(kind) {
        const release = gates[kind].release;
        if (release === undefined) throw new Error('No operation is waiting at this delay.');
        release();
        // Let the released promise and its product continuations finish before checking negative assertions.
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      },
    };
  }, { heldFile: HELD_FILE });
}

async function arm(page: Page, kind: DelayKind): Promise<void> {
  await page.evaluate((k) => { window.backupOperationDelay.arm(k); }, kind);
}

async function expectPending(page: Page, kind: DelayKind): Promise<void> {
  await expect.poll(() => page.evaluate((k) => window.backupOperationDelay.pending(k), kind), {
    timeout: 60_000,
  }).toBe(true);
}

async function release(page: Page, kind: DelayKind): Promise<void> {
  await page.evaluate((k) => window.backupOperationDelay.release(k), kind);
}

async function prepareExport(page: Page): Promise<void> {
  await keys(page).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(PASS);
  await keys(page).getByLabel('Repeat passphrase', { exact: true }).fill(PASS);
}

async function prepareVerification(page: Page, backup: Buffer): Promise<void> {
  await keys(page).getByLabel('Downloaded keystore file', { exact: true }).setInputFiles({
    name: HELD_FILE, mimeType: 'application/json', buffer: backup,
  });
  await keys(page).getByLabel('Keystore passphrase', { exact: true }).fill(PASS);
}

async function createBackup(page: Page): Promise<Buffer> {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await keys(page).getByRole('button', { name: 'Generate new keys' }).click();
  await prepareExport(page);
  const downloaded = page.waitForEvent('download', { timeout: 60_000 });
  await keys(page).getByRole('button', { name: 'Download encrypted keystore' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('ghostpay-keystore.json');
  const path = await file.path();
  if (path === null) throw new Error('The encrypted backup download is unavailable.');
  await expect(keys(page).getByText(DOWNLOADED)).toBeVisible();
  await expect(keys(page).getByLabel('Passphrase (at least 14 characters)', { exact: true })).toHaveValue('');
  return readFile(path);
}

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:', 'data:', 'about:'].includes(url.protocol)) return route.continue();
    return route.abort();
  });
  await installDelays(page);
});

test('backup verification owns the controls after superseding a pending export', async ({ page }) => {
  const downloads: string[] = [];
  page.on('download', (download) => { downloads.push(download.suggestedFilename()); });
  const backup = await createBackup(page);
  const exportButton = keys(page).getByRole('button', { name: 'Download encrypted keystore' });
  const verifyButton = keys(page).getByRole('button', { name: 'Verify backup', exact: true });
  const cancelVerify = keys(page).getByRole('button', { name: 'Cancel verification' });

  await arm(page, 'encrypt');
  await prepareExport(page);
  await exportButton.click();
  await expectPending(page, 'encrypt');
  await expect(exportButton).toBeDisabled();

  await prepareVerification(page, backup);
  await arm(page, 'file');
  await verifyButton.click();
  await expectPending(page, 'file');
  await expect(exportButton).toBeEnabled();
  await expect(verifyButton).toBeDisabled();
  await expect(cancelVerify).toBeVisible();

  await release(page, 'encrypt');
  expect(downloads).toEqual(['ghostpay-keystore.json']);
  await expect(keys(page).getByText(DOWNLOADED)).toHaveCount(0);
  await expect(exportButton).toBeEnabled();
  await expect(verifyButton).toBeDisabled();
  await expect(cancelVerify).toBeVisible();

  await release(page, 'file');
  await expect(keys(page).getByText(VERIFIED)).toBeVisible({ timeout: 60_000 });
  await expect(cancelVerify).toHaveCount(0);
  await expect(exportButton).toBeEnabled();
  await expect(keys(page).getByRole('alert')).toHaveCount(0);
  expect(downloads).toEqual(['ghostpay-keystore.json']);
});

test('export owns the controls after superseding verification, and verification can cancel and retry', async ({ page }) => {
  const downloads: string[] = [];
  page.on('download', (download) => { downloads.push(download.suggestedFilename()); });
  const backup = await createBackup(page);
  const exportButton = keys(page).getByRole('button', { name: 'Download encrypted keystore' });
  const verifyButton = keys(page).getByRole('button', { name: 'Verify backup', exact: true });
  const cancelVerify = keys(page).getByRole('button', { name: 'Cancel verification' });

  await prepareVerification(page, backup);
  await arm(page, 'file');
  await verifyButton.click();
  await expectPending(page, 'file');
  await arm(page, 'encrypt');
  await prepareExport(page);
  await exportButton.click();
  await expectPending(page, 'encrypt');
  await expect(verifyButton).toBeEnabled();
  await expect(cancelVerify).toHaveCount(0);
  await expect(exportButton).toBeDisabled();

  await release(page, 'file');
  await expect(keys(page).getByText(VERIFIED)).toHaveCount(0);
  await expect(page.getByText('This backup is not verified yet')).toBeVisible();
  await expect(exportButton).toBeDisabled();
  await expect(verifyButton).toBeEnabled();
  expect(downloads).toEqual(['ghostpay-keystore.json']);

  const downloaded = page.waitForEvent('download');
  await release(page, 'encrypt');
  await downloaded;
  await expect(keys(page).getByText(DOWNLOADED)).toBeVisible();
  await expect(exportButton).toBeEnabled();
  expect(downloads).toHaveLength(2);

  // An explicit cancellation releases only its verification and keeps a subsequent retry usable.
  await arm(page, 'file');
  await verifyButton.click();
  await expectPending(page, 'file');
  await cancelVerify.click();
  await release(page, 'file');
  await expect(cancelVerify).toHaveCount(0);
  await expect(keys(page).getByText(VERIFIED)).toHaveCount(0);
  await expect(exportButton).toBeEnabled();

  await prepareVerification(page, backup);
  await verifyButton.click();
  await expect(keys(page).getByText(VERIFIED)).toBeVisible({ timeout: 60_000 });
  await expect(cancelVerify).toHaveCount(0);
  await expect(keys(page).getByRole('alert')).toHaveCount(0);
  expect(downloads).toHaveLength(2);
});
