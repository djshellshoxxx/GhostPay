import { expect, test, type Locator, type Page } from '@playwright/test';
import { createStealthExportApi } from '@ghostpay/ux-vault/portable';
import { ORIGIN } from './helpers';
import { configureRpc, mockNetwork, type MockNetworkState } from './flowMocks';
import {
  A1, A1_KEY, EXPORT_PASS, VAULT_PASS, VECTORS, countDownloads, download, fillNewPassphrase,
  importVectorSeller, keysView, leaksOf, nav, recordLeaks, saveVault, scanOnePayment, useVault, vectorLog,
} from './stealthExportFixtures';

// Spec 18 flows 2-4 in a real browser: the all-discovered encrypted archive from the scan results and the master backup
// from Seller keys, both behind vault re-authentication, then recovery of both files in a fresh browser context with no
// keys, storage or network beyond the app origin. Journeys adapted from 055d33e0:apps/web/e2e/stealth-export.spec.ts.

test.setTimeout(300_000);
const codec = createStealthExportApi();
const ADDRESS = A1.expected.stealthAddress;

/** Opens `text` in Seller keys > "Open a stealth key export" and returns that panel. */
async function openExportFile(page: Page, name: string, text: string, passphrase: string): Promise<Locator> {
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  const open = page.getByTestId('stealth-export-open');
  await expect(open.getByRole('heading', { name: 'Open a stealth key export' })).toBeVisible();
  await open.getByLabel('Stealth key export file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await open.getByLabel('Export file passphrase').fill(passphrase);
  await open.getByTestId('stealth-export-open-submit').click();
  return open;
}

test('archive and master backup export behind re-authentication; a fresh browser recovers the payment key and the master keys', async ({ browser, context, page }) => {
  const recorder = await recordLeaks(context, page);
  const state: MockNetworkState = { logs: [vectorLog()] };
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  await importVectorSeller(page);
  await saveVault(page);
  const downloads = countDownloads(page);

  // Master backup (flow 3): refused until the vault passphrase re-authenticates, then one encrypted file.
  const masterPanel = page.getByTestId('stealth-master-backup');
  await expect(masterPanel.getByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeVisible();
  await expect(masterPanel.getByTestId('stealth-master-download')).toBeDisabled();
  await useVault(masterPanel);
  await fillNewPassphrase(masterPanel);
  const master = await download(page, () => masterPanel.getByTestId('stealth-master-download').click());
  expect(master.name).toBe('ghostpay-stealth-master.json');
  await expect(masterPanel.getByLabel('Passphrase of your encrypted vault')).toHaveValue('');
  expect(codec.inspectMasterBackup(master.text).metaAddress).toBe(VECTORS.seller.metaAddress);

  // Archive (flow 2): count and chain shown before consent; one encrypted all-discovered file after re-authentication.
  await scanOnePayment(page, ADDRESS);
  const archivePanel = page.getByTestId('payment-keys-archive');
  await archivePanel.getByRole('button', { name: 'Export all payment keys (encrypted)' }).click();
  await expect(archivePanel.getByTestId('payment-keys-archive-summary')).toHaveText('1 payment key found on Base Sepolia (chain ID 84532), scope: all discovered payments.');
  expect(downloads.names).toEqual(['ghostpay-stealth-master.json']);
  await expect(archivePanel.getByTestId('payment-keys-archive-download')).toBeDisabled();
  await useVault(archivePanel);
  await fillNewPassphrase(archivePanel);
  const archive = await download(page, () => archivePanel.getByTestId('payment-keys-archive-download').click());
  expect(archive.name).toBe('ghostpay-stealth-keypairs.json');
  await expect(archivePanel.getByRole('note').filter({ hasText: 'Encrypted payment key archive generated; download initiated.' })).toBeVisible();
  await expect(archivePanel.getByLabel('Passphrase of your encrypted vault')).toHaveValue('');
  const header = codec.inspectPaymentKeys(archive.text);
  expect({ scope: header.scope, count: header.count, chainId: header.chainId, address: header.payments[0]?.stealthAddress })
    .toEqual({ scope: 'all-discovered', count: 1, chainId: 84532, address: ADDRESS });

  // The saved-file check verifies this exact archive without importing it.
  const verification = archivePanel.getByTestId('stealth-export-verification');
  await verification.getByRole('checkbox', { name: 'I saved this backup file and kept its passphrase separately.' }).check();
  await verification.getByLabel('Saved backup file').setInputFiles({ name: archive.name, mimeType: 'application/json', buffer: Buffer.from(archive.text) });
  await verification.getByLabel('Passphrase of the saved backup').fill(EXPORT_PASS);
  await verification.getByRole('button', { name: 'Verify the saved backup' }).click();
  await expect(verification.getByTestId('stealth-export-backup-state')).toContainText('Saved backup verified.', { timeout: 60_000 });

  // No private key or passphrase in either file, requests, console, URL, storage, IndexedDB or clipboard.
  const secrets = [A1_KEY, VECTORS.seller.spendingPrivateKey, VECTORS.seller.viewingPrivateKey];
  expect(leaksOf([master.text, archive.text], secrets).length).toBe(0);
  const observed = [...recorder.seen, ...(await recorder.snapshot()), await page.content()];
  expect(leaksOf(observed, [...secrets, VAULT_PASS, EXPORT_PASS]).length).toBe(0);
  expect(observed.some((entry) => entry.startsWith('clipboard '))).toBe(false);
  expect(downloads.names).toEqual(['ghostpay-stealth-master.json', 'ghostpay-stealth-keypairs.json']);

  // Flow 4: a fresh browser context with no keys, no storage and no network beyond the app origin.
  const fresh = await browser.newContext();
  try {
    await fresh.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
    const recovery = await fresh.newPage();
    await recovery.goto('/');
    expect(await recovery.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, dbs: (await indexedDB.databases()).length })))
      .toEqual({ local: 0, session: 0, dbs: 0 });

    // Wrong passphrase and a tampered ciphertext are refused and show no key.
    let open = await openExportFile(recovery, archive.name, archive.text, `${EXPORT_PASS}x`);
    await expect(open.getByRole('alert')).toContainText(/passphrase/i, { timeout: 60_000 });
    await expect(open.getByTestId('stealth-export-open-keypair')).toHaveCount(0);
    const parsed = JSON.parse(archive.text) as { ciphertext: string };
    const flipped = `${parsed.ciphertext.slice(0, -1)}${parsed.ciphertext.endsWith('0') ? '1' : '0'}`;
    open = await openExportFile(recovery, archive.name, archive.text.replace(parsed.ciphertext, flipped), EXPORT_PASS);
    await expect(open.getByRole('alert')).toContainText(/modified/i, { timeout: 60_000 });
    await expect(open.getByTestId('stealth-export-open-keypair')).toHaveCount(0);

    // The authentic archive opens; its key downloads only after a second confirmation, as the exact section-6 text.
    open = await openExportFile(recovery, archive.name, archive.text, EXPORT_PASS);
    const result = open.getByTestId('stealth-export-open-keypair');
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result).toContainText('1 payment key on Base Sepolia (chain ID 84532), scope: all discovered payments. Every key was checked against its address.');
    await expect(result.locator('code', { hasText: ADDRESS })).toBeVisible();
    const freshDownloads = countDownloads(recovery);
    await result.getByRole('button', { name: `Download private key for ${ADDRESS}` }).click();
    const confirm = result.getByRole('group', { name: 'Download a plain-text private key?' });
    await expect(confirm).toBeFocused();
    expect(freshDownloads.names).toEqual([]);
    const raw = await download(recovery, () => confirm.getByRole('button', { name: 'Download the private key', exact: true }).click());
    expect(raw.name).toBe('ghostpay-stealth-private-key.txt');
    // Compare as a boolean: a failing assertion must not print key material.
    expect(raw.text === VECTORS.files.rawPrivateKey.text.replace('Chain ID: 11155111\n', 'Chain ID: 84532\n')).toBe(true);
    expect((await recovery.content()).toLowerCase().includes(A1_KEY.slice(2))).toBe(false);
    await open.getByRole('button', { name: 'Close the export and wipe its keys' }).click();
    await expect(result).toHaveCount(0);

    // The master backup restores spending authority in the empty session (no keys to replace, so no consent step).
    open = await openExportFile(recovery, master.name, master.text, EXPORT_PASS);
    const restored = open.getByTestId('stealth-export-open-master');
    await expect(restored).toBeVisible({ timeout: 60_000 });
    await restored.getByRole('button', { name: 'Load these spending and viewing keys' }).click();
    await expect(open).toContainText('Spending and viewing keys loaded from the master backup, with a new invoice-signing key.');
    await expect(keysView(recovery).locator('code', { hasText: VECTORS.seller.metaAddress })).toBeVisible();
    expect(freshDownloads.names).toEqual(['ghostpay-stealth-private-key.txt']);
  } finally {
    await fresh.close();
  }
});
