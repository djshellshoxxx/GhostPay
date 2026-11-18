import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createStealthExportApi } from '@ghostpay/ux-vault/portable';
import { makeLog } from '../src/test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../src/test/fakeManifest';
import { RPC, configureRpc, mockNetwork, type MockNetworkState } from './flowMocks';
import { ORIGIN, generateKeys } from './helpers';
import {
  A1,
  A1_KEY,
  EXPORT_PASS,
  KEYSTORE_PASS,
  VAULT_PASS,
  VECTORS,
  countDownloads,
  download,
  downloadKeystore,
  holdNext,
  installCryptoProbe,
  announceNextYield,
  readProbe,
  releaseHold,
  fillNewPassphrase,
  importVectorSeller,
  keysView,
  leaksOf,
  nav,
  openDetails,
  openExportFile,
  recordLeaks,
  saveVault,
  scanOnePayment,
  throttleCpu,
  useKeystore,
  useVault,
  vectorLog,
} from './stealthExportFixtures';

// Spec 18 browser journeys on the TEST-ONLY reference vector seller (spending 0x11.., viewing 0x22..): every export is
// produced by the built app at production scrypt cost and checked here with the shared codec in Node, never by trusting
// the UI. Runs under both build profiles (GHOSTPAY_LOCAL_BUILD_PROFILE=lean|full).
test.setTimeout(240_000);

const codec = createStealthExportApi();
const ADDRESS = A1.expected.stealthAddress;
const hexOf = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const okNotice = (page: Page, text: string) => page.getByRole('note').filter({ hasText: text });

async function sellerWithPayment(context: BrowserContext, page: Page, opts: { readonly vault: boolean }): Promise<{ readonly state: MockNetworkState; readonly keystore: string | undefined }> {
  const state: MockNetworkState = { logs: [vectorLog()] };
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  await importVectorSeller(page);
  if (opts.vault) {
    await saveVault(page);
    return { state, keystore: undefined };
  }
  return { state, keystore: await downloadKeystore(page) };
}

/** Decrypts an exported keypair file in Node with the shared codec and returns its header and key hex. */
async function decryptInNode(text: string, chainId: number): Promise<{ readonly scope: string; readonly addresses: string[]; readonly keys: string[] }> {
  const opened = await codec.decryptPaymentKeys(text, EXPORT_PASS, { expectedChainId: chainId });
  try {
    return { scope: opened.header.scope, addresses: opened.payments.map((p) => p.record.stealthAddress), keys: opened.payments.map((p) => hexOf(p.secret)) };
  } finally {
    for (const p of opened.payments) p.secret.fill(0);
  }
}

test('payment details: public record holds no key; encrypted keypair after vault re-auth; raw key only after the second confirmation', async ({ context, page }) => {
  await sellerWithPayment(context, page, { vault: true });
  const downloads = countDownloads(page);
  const match = await scanOnePayment(page, ADDRESS);
  const details = await openDetails(match);
  await expect(details).toContainText('Base Sepolia (chain ID 84532)');
  await expect(details.locator('code', { hasText: ADDRESS })).toBeVisible();
  await expect(details).toContainText('Your keys control this address. This is not payment confirmation or finality.');

  // Public record: no re-authentication, no secret.
  const pub = await download(page, () => details.getByTestId('stealth-export-public').click());
  expect(pub.name).toBe('ghostpay-stealth-public.json');
  await expect(okNotice(page, 'Public record generated; download initiated. This file contains no private keys.')).toBeVisible();
  expect(leaksOf([pub.text], [A1_KEY, VECTORS.seller.spendingPrivateKey, VECTORS.seller.viewingPrivateKey])).toEqual([]);
  const record = codec.parsePublicRecord(pub.text);
  expect(record.stealthAddress).toBe(ADDRESS);
  expect(record.chainId).toBe(84532);
  expect(Object.keys(JSON.parse(pub.text) as object).filter((k) => /private|secret|cipher/i.test(k))).toEqual([]);

  // Encrypted keypair: vault re-authentication, then a file that only the new passphrase opens.
  const encrypt = details.getByTestId('stealth-export-encrypted');
  await expect(encrypt).toBeDisabled();
  await useVault(details);
  await fillNewPassphrase(details);
  await expect(details.getByText(/^Passphrase strength: /)).toBeVisible();

  // Simulate a refused anchor click once. Generated ciphertext is not a retained backup, and the key session survives.
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'click');
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? false,
      writable: true,
      value: (): never => {
        if (descriptor === undefined) Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
        else Object.defineProperty(HTMLAnchorElement.prototype, 'click', descriptor);
        throw new Error('test-only blocked download');
      },
    });
  });
  await encrypt.click();
  await expect(details.getByRole('alert')).toContainText('did not start the download', { timeout: 60_000 });
  await expect(details.getByTestId('stealth-export-verification')).toHaveCount(0);
  await expect(details.getByLabel('Passphrase of your encrypted vault')).toHaveValue('');
  expect(downloads.names).toEqual(['ghostpay-stealth-public.json']);
  await useVault(details);
  await fillNewPassphrase(details);
  const enc = await download(page, () => encrypt.click());
  expect(enc.name).toBe('ghostpay-stealth-keypair.json');
  await expect(okNotice(page, 'Encrypted keypair generated; download initiated. Keep and verify the saved file.')).toBeVisible();
  await expect(details.getByLabel('Passphrase of your encrypted vault')).toHaveValue('');
  expect(leaksOf([enc.text], [A1_KEY])).toEqual([]);
  expect(await decryptInNode(enc.text, 84532)).toEqual({ scope: 'single', addresses: [ADDRESS], keys: [A1_KEY.slice(2)] });

  // A download event alone does not mark retention or recoverability. Reopen the exact saved ciphertext before success.
  const verification = details.getByTestId('stealth-export-verification');
  await expect(verification.getByTestId('stealth-export-backup-state')).toContainText('Retention and recoverability are not yet confirmed.');
  await expect(verification.getByRole('button', { name: 'Verify the saved backup' })).toBeDisabled();
  const retained = verification.getByRole('checkbox', { name: 'I saved this backup file and kept its passphrase separately.' });
  await retained.focus();
  await page.keyboard.press('Space');
  await expect(verification.getByTestId('stealth-export-backup-state')).toContainText('Recoverability is not yet verified.');
  // File.text() strips a UTF-8 BOM. The strict standalone decoder rejects these altered bytes, so verification must too.
  await verification.getByLabel('Saved backup file').setInputFiles({ name: enc.name, mimeType: 'application/json', buffer: Buffer.from(`\uFEFF${enc.text}`) });
  await verification.getByLabel('Passphrase of the saved backup').fill(EXPORT_PASS);
  await verification.getByRole('button', { name: 'Verify the saved backup' }).click();
  await expect(verification.getByRole('alert')).toContainText('not the exact file generated by this export');
  await expect(verification.getByTestId('stealth-export-backup-state')).not.toContainText('Saved backup verified.');
  await verification.getByLabel('Saved backup file').setInputFiles({ name: enc.name, mimeType: 'application/json', buffer: Buffer.from(enc.text) });
  await verification.getByLabel('Passphrase of the saved backup').fill(EXPORT_PASS);
  await verification.getByRole('button', { name: 'Verify the saved backup' }).focus();
  await page.keyboard.press('Enter');
  await expect(verification.getByTestId('stealth-export-backup-state')).toContainText('Saved backup verified.', { timeout: 60_000 });
  await expect(verification.getByLabel('Passphrase of the saved backup')).toHaveValue('');

  // Raw key: the first click only asks; Cancel downloads nothing; the confirmation downloads exactly the section-6 text.
  await useVault(details);
  const before = downloads.names.length;
  await details.getByTestId('stealth-export-raw').click();
  const confirm = details.getByRole('group', { name: 'Download a plain-text private key?' });
  await expect(confirm).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(downloads.names.length).toBe(before);
  await useVault(details);
  await details.getByTestId('stealth-export-raw').click();
  await expect(confirm).toBeFocused();
  expect(downloads.names.length).toBe(before);
  const raw = await download(page, () => confirm.getByTestId('stealth-export-raw-confirm').click());
  expect(raw.name).toBe('ghostpay-stealth-private-key.txt');
  await expect(okNotice(page, 'Private key file generated; download initiated. Confirm that you saved it. Keep it offline and delete it when you no longer need it.')).toBeVisible();
  expect(raw.text).toBe(VECTORS.files.rawPrivateKey.text.replace('Chain ID: 11155111\n', 'Chain ID: 84532\n'));
  // The key is never rendered on the page.
  expect((await page.content()).toLowerCase()).not.toContain(A1_KEY.slice(2));
  expect(downloads.names).toEqual(['ghostpay-stealth-public.json', 'ghostpay-stealth-keypair.json', 'ghostpay-stealth-private-key.txt']);
});

test('keys without a vault: secret exports are refused until the keystore backup file and its passphrase are given', async ({ context, page }) => {
  const { keystore } = await sellerWithPayment(context, page, { vault: false });
  if (keystore === undefined) throw new Error('keystore expected');
  const downloads = countDownloads(page);
  const match = await scanOnePayment(page, ADDRESS);
  const details = await openDetails(match);
  await fillNewPassphrase(details);

  // Vault credential with no vault in this browser.
  await useVault(details);
  await details.getByTestId('stealth-export-encrypted').click();
  await expect(details.getByRole('alert')).toContainText('No encrypted vault for the loaded keys was found in this browser');
  await useVault(details);
  await details.getByTestId('stealth-export-raw').click();
  await details.getByTestId('stealth-export-raw-confirm').click();
  await expect(details.getByRole('alert')).toContainText('No encrypted vault for the loaded keys was found in this browser');

  // Keystore chosen but no file, or a file but no passphrase: nothing can be submitted.
  await details.getByRole('radio', { name: 'Use my keystore backup file' }).check();
  await details.getByLabel('Passphrase of the keystore backup file').fill(KEYSTORE_PASS);
  await expect(details.getByTestId('stealth-export-encrypted')).toBeDisabled();
  await expect(details.getByTestId('stealth-export-raw')).toBeDisabled();
  await useKeystore(details, keystore, '');
  await expect(details.getByTestId('stealth-export-encrypted')).toBeDisabled();

  // The right file with a wrong passphrase is refused.
  await useKeystore(details, keystore, `${KEYSTORE_PASS} wrong`);
  await fillNewPassphrase(details);
  await details.getByTestId('stealth-export-encrypted').click();
  await expect(details.getByRole('alert')).toContainText(/Wrong passphrase/i, { timeout: 60_000 });
  expect(downloads.names).toEqual([]);

  // The keystore of the loaded keys with its passphrase authorizes the export.
  await useKeystore(details, keystore);
  await fillNewPassphrase(details);
  const enc = await download(page, () => details.getByTestId('stealth-export-encrypted').click());
  expect(enc.name).toBe('ghostpay-stealth-keypair.json');
  expect(await decryptInNode(enc.text, 84532)).toEqual({ scope: 'single', addresses: [ADDRESS], keys: [A1_KEY.slice(2)] });
  expect(downloads.names).toEqual(['ghostpay-stealth-keypair.json']);
});

test('a fresh browser with no keys opens an encrypted keypair file and validates its address; a wrong passphrase shows nothing', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
    const page = await context.newPage();
    await page.goto('/');
    expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, dbs: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, dbs: 0 });
    await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
    await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();

    const file = VECTORS.files.single.text;
    let open = await openExportFile(page, 'ghostpay-stealth-keypair.json', file, `${EXPORT_PASS}x`);
    await expect(open.getByRole('alert')).toBeVisible({ timeout: 60_000 });
    await expect(open.getByRole('alert')).toContainText(/passphrase/i);
    await expect(open.getByTestId('stealth-export-open-keypair')).toHaveCount(0);
    await expect(open.getByRole('button', { name: /^Download private key for / })).toHaveCount(0);
    await expect(open.getByLabel('Export file passphrase')).toHaveValue('');

    open = await openExportFile(page, 'ghostpay-stealth-keypair.json', file, EXPORT_PASS);
    const result = open.getByTestId('stealth-export-open-keypair');
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result).toContainText('1 payment key on Ethereum Sepolia (chain ID 11155111), scope: single payment. Every key was checked against its address.');
    await expect(result.locator('code', { hasText: ADDRESS })).toBeVisible();
    await expect(open.getByRole('alert')).toHaveCount(0);

    // The recovered key downloads only after its own confirmation, as the exact section-6 text of the vector.
    const downloads = countDownloads(page);
    await result.getByRole('button', { name: `Download private key for ${ADDRESS}` }).click();
    const confirm = result.getByRole('group', { name: 'Download a plain-text private key?' });
    await expect(confirm).toBeFocused();
    expect(downloads.names).toEqual([]);
    const raw = await download(page, () => confirm.getByRole('button', { name: 'Download the private key', exact: true }).click());
    expect(raw.name).toBe('ghostpay-stealth-private-key.txt');
    expect(raw.text).toBe(VECTORS.files.rawPrivateKey.text);

    await open.getByRole('button', { name: 'Close the export and wipe its keys' }).click();
    await expect(result).toHaveCount(0);
    await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('narrow-viewport verification-only flow rejects malformed and public files, authenticates a backup, and installs no wallet', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  const recovery = page.getByTestId('stealth-export-open');
  const file = recovery.getByLabel('Stealth key export file');
  const pass = recovery.getByLabel('Export file passphrase');
  const verify = recovery.getByRole('button', { name: 'Verify backup without importing' });
  const select = async (text: string): Promise<void> => {
    await file.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  };

  await select('{"not":"an export"}');
  await verify.click();
  await expect(recovery.getByRole('alert')).toContainText('not a valid GhostPay stealth key export');
  await select(`\uFEFF${VECTORS.files.single.text}`);
  await pass.fill(EXPORT_PASS);
  await verify.click();
  await expect(recovery.getByRole('alert')).toContainText('not a valid GhostPay stealth key export');
  await select(VECTORS.files.public.text);
  await verify.click();
  await expect(recovery.getByRole('alert')).toContainText('contains no private keys');

  await select(VECTORS.files.single.text);
  await pass.fill('wrong backup password');
  await verify.click();
  await expect(recovery.getByRole('alert')).toContainText('Wrong passphrase', { timeout: 60_000 });
  await pass.fill(EXPORT_PASS);
  await verify.focus();
  await page.keyboard.press('Enter');
  await expect(recovery).toContainText('Backup verified. It decrypted successfully', { timeout: 60_000 });
  await expect(pass).toHaveValue('');
  await expect(recovery.getByTestId('stealth-export-open-keypair')).toHaveCount(0);
  await expect(recovery.getByTestId('stealth-export-open-master')).toHaveCount(0);
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await page.content()).toLowerCase()).not.toContain(A1_KEY.slice(2));

  await select(VECTORS.files.archive.text);
  await expect(recovery).not.toContainText('Backup verified. It decrypted successfully');
});

test('a fresh browser restores master spending authority and replacing a saved wallet still requires fresh consent', async ({ context, page }) => {
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
  await page.goto('/');
  const original = await generateKeys(page);
  await saveVault(page);
  const recovery = await openExportFile(page, 'master.json', VECTORS.files.master.text, EXPORT_PASS);
  const master = recovery.getByTestId('stealth-export-open-master');
  await expect(master).toBeVisible({ timeout: 60_000 });
  await master.getByRole('button', { name: 'Load these spending and viewing keys' }).click();
  await expect(master).toContainText('Replace the currently loaded keys?');
  await expect(keysView(page).locator('code', { hasText: original })).toBeVisible();
  await master.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(keysView(page).locator('code', { hasText: original })).toBeVisible();
  await master.getByRole('button', { name: 'Load these spending and viewing keys' }).click();
  await expect(master).toContainText('Replace the currently loaded keys?');
  await master.getByRole('button', { name: 'Replace the loaded keys', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(recovery).toContainText('Spending and viewing keys loaded from the master backup, with a new invoice-signing key.');
  await expect(keysView(page).locator('code', { hasText: VECTORS.seller.metaAddress })).toBeVisible();
  await expect(recovery.getByTestId('stealth-export-open-master')).toHaveCount(0);
});

test('keyboard navigation opens the saved-file chooser and verifies a backup without importing', async ({ context, page }) => {
  await context.route('**/*', (route) => (new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort()));
  await page.goto('/');
  const sellerKeys = nav(page).getByRole('button', { name: 'Seller keys', exact: true });
  await sellerKeys.focus();
  await page.keyboard.press('Enter');
  const recovery = page.getByTestId('stealth-export-open');
  const chooser = page.waitForEvent('filechooser');
  await recovery.getByLabel('Stealth key export file').focus();
  await page.keyboard.press('Enter');
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(VECTORS.files.single.text) });
  await page.keyboard.press('Tab');
  await expect(recovery.getByLabel('Export file passphrase')).toBeFocused();
  await page.keyboard.type(EXPORT_PASS);
  await page.keyboard.press('Tab');
  await expect(recovery.getByRole('button', { name: 'Open export', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(recovery.getByRole('button', { name: 'Verify backup without importing' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(recovery).toContainText('Backup verified. It decrypted successfully', { timeout: 60_000 });
  await expect(recovery.getByTestId('stealth-export-open-keypair')).toHaveCount(0);
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});

test('secret-leak guard: no exported private key in requests, console, URL/history, storage, IndexedDB or clipboard', async ({ context, page }) => {
  const recorder = await recordLeaks(context, page);
  await sellerWithPayment(context, page, { vault: true });
  const match = await scanOnePayment(page, ADDRESS);
  const details = await openDetails(match);
  const files = [];

  files.push(await download(page, () => details.getByTestId('stealth-export-public').click()));
  await useVault(details);
  await fillNewPassphrase(details);
  files.push(await download(page, () => details.getByTestId('stealth-export-encrypted').click()));
  await useVault(details);
  await details.getByTestId('stealth-export-raw').click();
  files.push(await download(page, () => details.getByTestId('stealth-export-raw-confirm').click()));

  const archivePanel = page.getByTestId('payment-keys-archive');
  await archivePanel.getByRole('button', { name: 'Export all payment keys (encrypted)' }).click();
  await expect(archivePanel.getByTestId('payment-keys-archive-summary')).toHaveText('1 payment key found on Base Sepolia (chain ID 84532), scope: all discovered payments.');
  await useVault(archivePanel);
  await fillNewPassphrase(archivePanel);
  const archive = await download(page, () => archivePanel.getByTestId('payment-keys-archive-download').click());
  expect(archive.name).toBe('ghostpay-stealth-keypairs.json');
  files.push(archive);
  await expect(okNotice(page, 'Encrypted payment key archive generated; download initiated. Keep and verify the saved file.')).toBeVisible();
  expect(await decryptInNode(archive.text, 84532)).toEqual({ scope: 'all-discovered', addresses: [ADDRESS], keys: [A1_KEY.slice(2)] });

  // Master backup, then the archive and the master file reopened in this session.
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  const master = page.getByTestId('stealth-master-backup');
  await useVault(master);
  await fillNewPassphrase(master);
  const masterFile = await download(page, () => master.getByTestId('stealth-master-download').click());
  expect(masterFile.name).toBe('ghostpay-stealth-master.json');
  files.push(masterFile);
  await expect(okNotice(page, 'Master backup generated; download initiated. Keep and verify the saved file.')).toBeVisible();
  const open = await openExportFile(page, archive.name, archive.text, EXPORT_PASS);
  const opened = open.getByTestId('stealth-export-open-keypair');
  await expect(opened).toBeVisible({ timeout: 60_000 });
  await opened.getByRole('button', { name: `Download private key for ${ADDRESS}` }).click();
  files.push(await download(page, () => opened.getByRole('button', { name: 'Download the private key', exact: true }).click()));
  await open.getByRole('button', { name: 'Close the export and wipe its keys' }).click();
  await openExportFile(page, masterFile.name, masterFile.text, EXPORT_PASS);
  await expect(page.getByTestId('stealth-export-open-master')).toContainText('These spending and viewing keys are already loaded.', { timeout: 60_000 });
  await open.getByRole('button', { name: 'Close the export and wipe its keys' }).click();

  // Positive control: the needle is the key the raw downloads actually carry.
  const rawFiles = files.filter((f) => f.name === 'ghostpay-stealth-private-key.txt');
  expect(rawFiles).toHaveLength(2);
  for (const f of rawFiles) expect(f.text).toContain(A1_KEY);
  for (const f of files.filter((f) => f.name.endsWith('.json'))) expect(leaksOf([f.text], [A1_KEY])).toEqual([]);

  const observed = [...recorder.seen, ...(await recorder.snapshot()), ...files.map((f) => `filename ${f.name}`)];
  expect(observed.some((e) => e.startsWith('request ') && e.includes(RPC))).toBe(true);
  expect(observed.some((e) => e.startsWith('indexedDB '))).toBe(true);
  expect(leaksOf(observed, [A1_KEY])).toEqual([]);
  // The master secrets and the typed passphrases leave no trace either.
  expect(leaksOf(observed, [VECTORS.seller.spendingPrivateKey, VECTORS.seller.viewingPrivateKey, EXPORT_PASS, VAULT_PASS])).toEqual([]);
  expect(observed.filter((e) => e.startsWith('clipboard '))).toEqual([]);
});

// Timers cannot fire inside the scrypt loop (noble yields with scheduler.yield, whose continuations run before other
// tasks), so the idle lock is made due while the export's AES-GCM step after the KDF is held; a wipe click, an input
// event, is delivered between scrypt chunks and lands inside the export KDF itself.
test('the idle lock while the export is still deriving and encrypting discards the result: no download, keys stay loaded', async ({ context, page }) => {
  await context.clock.install();
  await installCryptoProbe(context);
  const state: MockNetworkState = {};
  await mockNetwork(context, state);
  await configureRpc(page);
  await page.goto('/');
  const meta = await generateKeys(page);
  // A downloaded but unverified keystore keeps the keys loaded through the idle lock, so the panel stays mounted.
  const keystore = await downloadKeystore(page);
  const mine = makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: meta, block: 120, index: 1, caller: FAKE_ROUTER });
  state.logs = [mine.log];
  const downloads = countDownloads(page);
  const match = await scanOnePayment(page, mine.stealthAddress);
  const details = await openDetails(match);
  await useKeystore(details, keystore);
  await fillNewPassphrase(details);

  const before = await readProbe(page);
  await holdNext(page, 'encrypt');
  const held = page.waitForEvent('console', { predicate: (m) => m.text() === 'gp-probe:encrypt-held', timeout: 120_000 });
  await details.getByTestId('stealth-export-encrypted').click();
  await held;
  const atHold = await readProbe(page);
  // Re-authentication decrypted the keystore, then both scrypt runs yielded, and this is the export's only encryption.
  expect(atHold.decrypts).toBeGreaterThan(before.decrypts);
  expect(atHold.encrypts).toBe(before.encrypts + 1);
  expect(atHold.yields).toBeGreaterThan(before.yields);

  await page.clock.fastForward('16:00');
  await expect(page.getByText('Local tags locked after inactivity. Seller keys stay loaded because their downloaded backup is not verified yet.').first()).toBeVisible();
  await releaseHold(page);
  await page.waitForTimeout(5_000);
  expect(downloads.names).toEqual([]);
  await expect(okNotice(page, 'Encrypted keypair generated; download initiated. Keep and verify the saved file.')).toHaveCount(0);
  await expect(details).toBeVisible();
  await expect(details.getByLabel('Passphrase of the keystore backup file')).toHaveValue('');
  await expect(details.getByLabel('New passphrase for the export file (at least 14 characters)')).toHaveValue('');

  // Control: the same export without a lock produces the file.
  await useKeystore(details, keystore);
  await fillNewPassphrase(details);
  const enc = await download(page, () => details.getByTestId('stealth-export-encrypted').click());
  expect(enc.name).toBe('ghostpay-stealth-keypair.json');
  expect(downloads.names).toEqual(['ghostpay-stealth-keypair.json']);
});

test('wiping the keys while the master backup KDF runs discards the result: no download', async ({ context, page }) => {
  await installCryptoProbe(context);
  const { keystore } = await sellerWithPayment(context, page, { vault: false });
  if (keystore === undefined) throw new Error('keystore expected');
  const downloads = countDownloads(page);
  const master = page.getByTestId('stealth-master-backup');
  await expect(master.getByRole('heading', { name: 'Master stealth key backup (encrypted)' })).toBeVisible();
  await useKeystore(master, keystore);
  await fillNewPassphrase(master);

  // Hold the end of re-authentication (its keystore decryption) to place the pointer on the wipe button.
  await holdNext(page, 'decrypt');
  const held = page.waitForEvent('console', { predicate: (m) => m.text() === 'gp-probe:decrypt-held', timeout: 120_000 });
  await master.getByTestId('stealth-master-download').click();
  await held;
  const wipe = keysView(page).getByRole('button', { name: 'Wipe keys from memory' });
  await wipe.scrollIntoViewIfNeeded();
  const box = await wipe.boundingBox();
  if (box === null) throw new Error('wipe button not laid out');
  // A slow CPU stretches the production-cost export KDF to seconds, as on a slow device.
  const cpu = await throttleCpu(context, page);
  const atRelease = await readProbe(page);
  const kdf = page.waitForEvent('console', { predicate: (m) => m.text() === 'gp-probe:kdf-yield', timeout: 120_000 });
  await announceNextYield(page);
  await releaseHold(page);
  await kdf;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(keysView(page).getByText('Keys wiped from memory.', { exact: true })).toBeVisible({ timeout: 120_000 });
  await cpu.restore();
  await page.waitForTimeout(5_000);

  const after = await readProbe(page);
  const atClick = after.yieldsAtClick.at(-1) ?? -1;
  // The click arrived after the export KDF had started and before it finished.
  expect(atClick).toBeGreaterThan(atRelease.yields);
  expect(after.yields).toBeGreaterThan(atClick);
  expect(downloads.names).toEqual([]);
  await expect(master).toHaveCount(0);
  await expect(okNotice(page, 'Master backup generated; download initiated. Keep and verify the saved file.')).toHaveCount(0);
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();
});
