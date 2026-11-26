import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { bytesToHex } from '@noble/hashes/utils.js';
import { deriveStealthPayment, type RandomSource } from '@ghostpay/core-crypto';
import { privateKeyToAddress } from 'viem/accounts';

import { ORIGIN } from './helpers';

// A seller keystore downloaded from one browser profile is recovered after that profile is closed: first by the
// GhostPay-independent reference script (scripts/recovery/stealth-export-recover.mjs, node:crypto + noble only),
// then by the app in a fresh profile. Every key here is generated for this test and is TEST-ONLY.
test.setTimeout(180_000);
const kdfExpect = expect.configure({ timeout: 30_000 });
const PASS = 'amber falcon quiet meadow river';
const WRONG = 'completely wrong passphrase here';

interface Env { context: BrowserContext; page: Page; blocked: string[] }
interface Identity { meta: string; signer: string }
interface KeystoreHeader { metaAddress: string; signer: string; spendingPublicKey: string; viewingPublicKey: string }
interface RestoredPair { header: KeystoreHeader; spendingKey: Uint8Array; viewingKey: Uint8Array }
interface Derived { owned: boolean; stealthAddress: string; privateKey?: Uint8Array }
/** The parts of the reference recovery script this test uses; the script itself is untyped JavaScript. */
interface ReferenceReader {
  inspectSellerKeystore(text: string): { header: KeystoreHeader };
  decryptSellerKeystore(text: string, passphrase: string): Promise<RestoredPair>;
  deriveFromAnnouncement(pair: RestoredPair, announcement: { ephemeralPublicKey: string; stealthAddress: string }): Derived;
  wipe(...buffers: (Uint8Array | undefined)[]): void;
}

const READER = new URL('../../../scripts/recovery/stealth-export-recover.mjs', import.meta.url);
const loadReader = async (): Promise<ReferenceReader> => (await import(READER.href)) as ReferenceReader;
/** A fixed ephemeral scalar (0x4242...42, below the curve order) so the synthetic payment is reproducible. */
const fixedRng: RandomSource = {
  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(0x42);
    return array;
  },
};

function view(page: Page) {
  return page.locator('section[aria-labelledby="keys-h"]');
}

async function newEnv(browser: Browser): Promise<Env> {
  const blocked: string[] = [];
  const context = await browser.newContext({ baseURL: ORIGIN, serviceWorkers: 'block', acceptDownloads: true });
  // Installed before any navigation; non-origin traffic is aborted and recorded.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === ORIGIN || url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return route.continue();
    blocked.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await expect(page.getByRole('heading', { name: 'Seller keys', level: 2 })).toBeVisible();
  return { context, page, blocked };
}

async function identityOf(page: Page): Promise<Identity> {
  const meta = view(page).locator('code', { hasText: /^st:eth:0x/ });
  const signer = view(page).locator('code', { hasText: /^0[23][0-9a-f]{64}$/ });
  await expect(meta).toBeVisible();
  await expect(signer).toBeVisible();
  return { meta: (await meta.textContent()) ?? '', signer: (await signer.textContent()) ?? '' };
}

async function generate(page: Page): Promise<Identity> {
  await view(page).getByRole('button', { name: 'Generate new keys' }).click();
  await kdfExpect(view(page).getByText('New keys generated in memory.', { exact: true })).toBeVisible();
  await page.getByLabel(/To continue without a backup, type/).fill('continue without backup');
  await page.getByRole('button', { name: 'Continue without a backup' }).click();
  return identityOf(page);
}

async function exportBackup(page: Page, pass: string): Promise<string> {
  await view(page).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(pass);
  await view(page).getByLabel('Repeat passphrase', { exact: true }).fill(pass);
  const stepUp = view(page).locator('input[name="ghostpay-step-up-export"]');
  if (await stepUp.isVisible()) await stepUp.fill(pass);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await view(page).getByRole('button', { name: 'Download encrypted keystore' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('ghostpay-keystore.json');
  const path = await saved.path();
  await kdfExpect(view(page).getByText(/^Encrypted keystore downloaded\./)).toBeVisible();
  return readFileSync(path, 'utf8');
}

async function importBackup(page: Page, text: string, pass: string): Promise<void> {
  const fileInput = view(page).getByLabel('Keystore file', { exact: true });
  if (!(await fileInput.isVisible())) await view(page).getByText('Import an encrypted keystore', { exact: true }).click();
  await fileInput.setInputFiles({ name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await view(page).getByLabel('Passphrase', { exact: true }).fill(pass);
  await view(page).getByRole('button', { name: 'Decrypt and load' }).click();
}

const hex = (bytes: Uint8Array): `0x${string}` => `0x${bytesToHex(bytes)}`;

test('a keystore from a closed browser profile is recovered without GhostPay code, then restored in a fresh profile', async ({ browser }) => {
  const reader = await loadReader();

  // Original profile: generate seller keys and download the encrypted keystore through the normal controls.
  const original = await newEnv(browser);
  const id = await generate(original.page);
  const backup = await exportBackup(original.page, PASS);
  expect(backup.includes(PASS)).toBe(false);
  expect(original.blocked).toEqual([]);
  // The original profile, its storage and its in-memory session no longer exist from here on.
  await original.context.close();

  // The header names the seller GhostPay displayed, before any passphrase is entered.
  const { header } = reader.inspectSellerKeystore(backup);
  expect(header.metaAddress).toBe(id.meta);
  expect(header.signer).toBe(id.signer);

  // A wrong passphrase and a modified file are refused with fixed codes.
  await expect(reader.decryptSellerKeystore(backup, WRONG)).rejects.toMatchObject({ code: 'wrongPassphraseOrModified' });
  const modified = JSON.parse(backup) as { ciphertext: string };
  modified.ciphertext = (modified.ciphertext.startsWith('0') ? '1' : '0') + modified.ciphertext.slice(1);
  await expect(reader.decryptSellerKeystore(JSON.stringify(modified, null, 2), PASS)).rejects.toMatchObject({ code: 'wrongPassphraseOrModified' });

  // The passphrase restores the seller pair; it matches the displayed identity.
  const restored = await reader.decryptSellerKeystore(backup, PASS);
  try {
    expect(restored.header.metaAddress).toBe(id.meta);
    expect(restored.header.signer).toBe(id.signer);
    // A payer pays the displayed meta-address with GhostPay's own scheme-1 derivation...
    const payment = deriveStealthPayment(id.meta, fixedRng);
    const announcement = { ephemeralPublicKey: hex(payment.ephemeralPublicKey), stealthAddress: payment.stealthAddress };
    // ...and the independent reader derives that payment's one-time key from the restored pair.
    const derived = reader.deriveFromAnnouncement(restored, announcement);
    try {
      expect(derived.owned).toBe(true);
      expect(derived.stealthAddress).toBe(payment.stealthAddress);
      expect(derived.privateKey).toBeDefined();
      // A general EVM library (viem) agrees that this key controls the paid address.
      expect(privateKeyToAddress(hex(derived.privateKey ?? new Uint8Array(32)))).toBe(payment.stealthAddress);
    } finally {
      reader.wipe(derived.privateKey);
    }
  } finally {
    reader.wipe(restored.spendingKey, restored.viewingKey);
  }

  // A fresh profile, which never saw the original's storage or session, restores the same identity from the file.
  const fresh = await newEnv(browser);
  const noIdentity = view(fresh.page).getByRole('heading', { name: 'Your meta-address (public)' });
  try {
    await expect(noIdentity).toHaveCount(0);
    await expect(view(fresh.page).getByRole('button', { name: 'Unlock saved vault' })).toHaveCount(0);
    await importBackup(fresh.page, backup, WRONG);
    await kdfExpect(view(fresh.page).getByText(/Wrong passphrase/)).toBeVisible();
    await kdfExpect(noIdentity).toHaveCount(0);
    await importBackup(fresh.page, backup, PASS);
    await kdfExpect(view(fresh.page).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible();
    expect(await identityOf(fresh.page)).toEqual(id);
    expect(fresh.blocked).toEqual([]);
  } finally {
    await fresh.context.close();
  }
});
