import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { ORIGIN } from './helpers';

// Several production-cost scrypt operations run serially in independent profiles.
test.setTimeout(180_000);
const kdfExpect = expect.configure({ timeout: 30_000 });
const PASS_A = 'amber falcon quiet meadow river';
const PASS_B = 'violet comet maple lantern harbor';
const WRONG = 'completely wrong passphrase here';
const DB = 'ghostpay-encrypted-seller-vault';
const MAX_KEYSTORE_BYTES = 8 * 1024;

interface Env { context: BrowserContext; page: Page; blocked: string[] }
interface Identity { meta: string; signer: string }

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

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
  await openKeys(page);
  return { context, page, blocked };
}

async function openKeys(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Seller keys' }).click();
  await expect(page.getByRole('heading', { name: 'Seller keys', level: 2 })).toBeVisible();
}

async function reopenKeys(page: Page): Promise<void> {
  await page.reload();
  await openKeys(page);
}

// Read-only observer: absent DB -> null; an upgrade/create attempt is aborted and rejected; all other errors reject.
async function readVault(page: Page): Promise<string | null> {
  return page.evaluate(async (name) => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === name)) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let upgraded = false;
      const r = indexedDB.open(name);
      r.onupgradeneeded = () => {
        upgraded = true;
        r.transaction?.abort();
      };
      r.onsuccess = () => {
        if (upgraded) { r.result.close(); reject(new Error('observer opened an upgrading database')); return; }
        resolve(r.result);
      };
      r.onerror = () => { reject(new Error(`open failed: ${r.error?.name ?? 'unknown'}`)); };
      r.onblocked = () => { reject(new Error('open blocked')); };
    });
    try {
      if (!db.objectStoreNames.contains('vault')) throw new Error('vault object store missing');
      return await new Promise<string | null>((resolve, reject) => {
        const g = db.transaction('vault', 'readonly').objectStore('vault').get('current');
        g.onsuccess = () => {
          if (g.result === undefined) { resolve(null); return; }
          if (typeof g.result !== 'string') { reject(new Error('unexpected vault record type')); return; }
          resolve(g.result);
        };
        g.onerror = () => { reject(new Error(`read failed: ${g.error?.name ?? 'unknown'}`)); };
      });
    } finally {
      db.close();
    }
  }, DB);
}

async function vaultDigest(page: Page): Promise<string | null> {
  const v = await readVault(page);
  return v === null ? null : sha256(v);
}

async function webStorageContains(page: Page, secret: string): Promise<boolean> {
  return page.evaluate((s) => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(s), secret);
}

function checkEnvelope(text: string, id: Identity): void {
  expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(MAX_KEYSTORE_BYTES);
  const k = JSON.parse(text) as {
    v: number; kdf: string; kdfParams: { N: number; r: number; p: number; salt: string };
    cipher: string; iv: string; meta: { metaAddress: string; signer: string }; ciphertext: string;
  };
  expect(k.v).toBe(1);
  expect(k.kdf).toBe('scrypt');
  expect(k.kdfParams.N).toBe(131072);
  expect(k.kdfParams.r).toBe(8);
  expect(k.kdfParams.p).toBe(1);
  expect(k.cipher).toBe('AES-256-GCM');
  expect(typeof k.kdfParams.salt).toBe('string');
  expect(typeof k.iv).toBe('string');
  expect(typeof k.ciphertext).toBe('string');
  expect(k.meta.metaAddress).toBe(id.meta);
  expect(k.meta.signer).toBe(id.signer);
}

async function identityOf(page: Page): Promise<Identity> {
  const meta = view(page).locator('code', { hasText: /^st:eth:0x/ });
  const signer = view(page).locator('code', { hasText: /^0[23][0-9a-f]{64}$/ });
  await expect(meta).toBeVisible();
  await expect(signer).toBeVisible();
  return { meta: (await meta.textContent()) ?? '', signer: (await signer.textContent()) ?? '' };
}

async function expectIdentity(page: Page, id: Identity): Promise<void> {
  await kdfExpect(view(page).getByRole('heading', { name: 'Your meta-address (public)' })).toBeVisible();
  await kdfExpect(view(page).locator('code', { hasText: id.meta })).toBeVisible();
  await kdfExpect(view(page).locator('code', { hasText: id.signer })).toBeVisible();
}

async function expectNoIdentity(page: Page): Promise<void> {
  await kdfExpect(view(page).getByRole('heading', { name: 'Your meta-address (public)' })).toHaveCount(0);
}

async function generate(page: Page): Promise<Identity> {
  await view(page).getByRole('button', { name: 'Generate new keys' }).click();
  await kdfExpect(view(page).getByText('New keys generated in memory.', { exact: true })).toBeVisible();
  await page.getByLabel(/To continue without a backup, type/).fill('continue without backup');
  await page.getByRole('button', { name: 'Continue without a backup' }).click();
  return identityOf(page);
}

async function saveVault(page: Page, pass: string): Promise<void> {
  await view(page).getByLabel('New vault passphrase (14+ characters)').fill(pass);
  await view(page).getByLabel('Repeat vault passphrase').fill(pass);
  await view(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await kdfExpect(view(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible();
  await kdfExpect(view(page).getByText(/A vault already exists/)).toBeVisible();
}

async function exportBackup(page: Page, pass: string): Promise<string> {
  await view(page).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(pass);
  await view(page).getByLabel('Repeat passphrase', { exact: true }).fill(pass);
  const stepUp = view(page).locator('input[name="ghostpay-step-up-export"]');
  if (await stepUp.isVisible()) await stepUp.fill(pass);
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await view(page).getByRole('button', { name: 'Download encrypted keystore' }).click();
  const path = await (await download).path();
  await kdfExpect(view(page).getByText(/^Encrypted keystore downloaded\./)).toBeVisible();
  await kdfExpect(view(page).getByLabel('Passphrase (at least 14 characters)', { exact: true })).toHaveValue('');
  return readFileSync(path, 'utf8');
}

async function openImport(page: Page): Promise<void> {
  const fileInput = view(page).getByLabel('Keystore file');
  if (!(await fileInput.isVisible())) await view(page).getByText('Import an encrypted keystore', { exact: true }).click();
  await expect(fileInput).toBeVisible();
}

async function submitImport(page: Page, name: string, text: string, pass: string): Promise<void> {
  await openImport(page);
  await view(page).getByLabel('Keystore file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await view(page).getByLabel('Passphrase', { exact: true }).fill(pass);
  await view(page).getByRole('button', { name: 'Decrypt and load' }).click();
}

async function unlock(page: Page, pass: string): Promise<void> {
  await view(page).getByLabel('Vault passphrase').fill(pass);
  await view(page).getByRole('button', { name: 'Unlock saved vault' }).click();
}

test('cross-browser recovery: A backup -> independent B, B re-encrypts under a new passphrase', async ({ browser }) => {
  const envs: Env[] = [];
  try {
    const a = await newEnv(browser); envs.push(a);
    expect(await readVault(a.page)).toBeNull();
    const idA = await generate(a.page);
    expect(await readVault(a.page)).toBeNull();
    await saveVault(a.page, PASS_A);
    const vaultA = await readVault(a.page);
    expect(vaultA).not.toBeNull();
    const digestA = sha256(vaultA ?? '');
    checkEnvelope(vaultA ?? '', idA);

    const backup = await exportBackup(a.page, PASS_A);
    checkEnvelope(backup, idA);
    expect(backup.includes(PASS_A)).toBe(false);
    expect((vaultA ?? '').includes(PASS_A)).toBe(false);
    expect(await webStorageContains(a.page, PASS_A)).toBe(false);

    const b = await newEnv(browser); envs.push(b);
    expect(await readVault(b.page)).toBeNull();
    // A wrong file passphrase installs nothing, and retrying the same retained backup succeeds.
    await submitImport(b.page, 'ghostpay-keystore.json', backup, WRONG);
    await kdfExpect(view(b.page).getByText(/Wrong passphrase/)).toBeVisible();
    await expectNoIdentity(b.page);
    expect(await readVault(b.page)).toBeNull();
    await submitImport(b.page, 'ghostpay-keystore.json', backup, PASS_A);
    await kdfExpect(view(b.page).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible();
    await kdfExpect(view(b.page).getByLabel('Passphrase', { exact: true })).toHaveCount(0);
    await expectIdentity(b.page, idA);
    // Import is memory-only.
    expect(await readVault(b.page)).toBeNull();
    expect(await webStorageContains(b.page, PASS_A)).toBe(false);

    // Explicit re-encrypt under a different passphrase.
    await saveVault(b.page, PASS_B);
    const vaultB = await readVault(b.page);
    expect(vaultB).not.toBeNull();
    const digestB = sha256(vaultB ?? '');
    expect(digestB).not.toBe(digestA);
    checkEnvelope(vaultB ?? '', idA);
    expect((vaultB ?? '').includes(PASS_A)).toBe(false);
    expect((vaultB ?? '').includes(PASS_B)).toBe(false);
    expect(await webStorageContains(b.page, PASS_A)).toBe(false);
    expect(await webStorageContains(b.page, PASS_B)).toBe(false);

    await reopenKeys(b.page);
    await kdfExpect(view(b.page).getByRole('button', { name: 'Unlock saved vault' })).toBeVisible();
    await expectNoIdentity(b.page);

    for (const bad of [WRONG, PASS_A]) {
      await unlock(b.page, bad);
      await kdfExpect(view(b.page).getByText(/Wrong passphrase/)).toBeVisible();
      await kdfExpect(view(b.page).getByLabel('Vault passphrase')).toHaveValue('');
      await expectNoIdentity(b.page);
      expect(await vaultDigest(b.page)).toBe(digestB);
    }

    await unlock(b.page, PASS_B);
    await kdfExpect(view(b.page).getByText('Encrypted vault unlocked. Seller keys are back in memory.', { exact: true })).toBeVisible();
    await kdfExpect(view(b.page).getByLabel('Vault passphrase')).toHaveValue('');
    await expectIdentity(b.page, idA);
    expect(await vaultDigest(b.page)).toBe(digestB);
    expect(await webStorageContains(b.page, PASS_B)).toBe(false);
    expect(await webStorageContains(b.page, PASS_A)).toBe(false);

    // Source A retained its vault and public identity.
    expect(await vaultDigest(a.page)).toBe(digestA);
    await expectIdentity(a.page, idA);

    for (const e of envs) expect(e.blocked).toEqual([]);
  } finally {
    for (const e of envs) await e.context.close();
  }
});

test('damaged backup is refused and an occupied destination vault is never overwritten', async ({ browser }) => {
  const envs: Env[] = [];
  try {
    const a = await newEnv(browser); envs.push(a);
    await generate(a.page);
    const backup = await exportBackup(a.page, PASS_A);

    const d = await newEnv(browser); envs.push(d);
    const idD = await generate(d.page);
    await saveVault(d.page, PASS_B);
    const digestD = await vaultDigest(d.page);
    expect(digestD).not.toBeNull();
    await view(d.page).getByRole('button', { name: 'Wipe keys from memory' }).click();
    await kdfExpect(view(d.page).getByText('Keys wiped from memory.', { exact: true })).toBeVisible();
    await kdfExpect(view(d.page).getByRole('button', { name: 'Generate new keys' })).toBeVisible();

    // Damaged ciphertext: refused, nothing installed, storage untouched.
    const obj = JSON.parse(backup) as { ciphertext: string };
    obj.ciphertext = (obj.ciphertext[0] === '0' ? '1' : '0') + obj.ciphertext.slice(1);
    await submitImport(d.page, 'damaged.json', JSON.stringify(obj, null, 2), PASS_A);
    await kdfExpect(view(d.page).getByText(/Wrong passphrase, or the keystore was modified/)).toBeVisible();
    await kdfExpect(view(d.page).getByLabel('Passphrase', { exact: true })).toHaveValue('');
    await kdfExpect(view(d.page).getByRole('button', { name: 'Decrypt and load' })).toBeEnabled();
    await expectNoIdentity(d.page);
    expect(await vaultDigest(d.page)).toBe(digestD);

    // Malformed envelope: refused before any key install.
    await view(d.page).getByLabel('Keystore file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1}', 'utf8') });
    await view(d.page).getByLabel('Passphrase', { exact: true }).fill(PASS_A);
    await view(d.page).getByRole('button', { name: 'Decrypt and load' }).click();
    await kdfExpect(view(d.page).getByText(/not a valid GhostPay keystore/)).toBeVisible();
    await kdfExpect(view(d.page).getByLabel('Passphrase', { exact: true })).toHaveValue('');
    await kdfExpect(view(d.page).getByRole('button', { name: 'Decrypt and load' })).toBeEnabled();
    await expectNoIdentity(d.page);
    expect(await vaultDigest(d.page)).toBe(digestD);

    // Occupied destination: valid import loads into memory only; the existing vault is neither replaced nor deleted.
    await view(d.page).getByLabel('Keystore file').setInputFiles({ name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(backup, 'utf8') });
    await view(d.page).getByLabel('Passphrase', { exact: true }).fill(PASS_A);
    await view(d.page).getByRole('button', { name: 'Decrypt and load' }).click();
    await kdfExpect(view(d.page).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible();
    await kdfExpect(view(d.page).getByRole('heading', { name: 'Your meta-address (public)' })).toBeVisible();
    await kdfExpect(view(d.page).getByText(/A vault already exists/)).toBeVisible();
    await kdfExpect(view(d.page).getByLabel('New vault passphrase (14+ characters)')).toHaveCount(0);
    expect(await vaultDigest(d.page)).toBe(digestD);

    await reopenKeys(d.page);
    expect(await vaultDigest(d.page)).toBe(digestD);
    await unlock(d.page, PASS_B);
    await kdfExpect(view(d.page).getByText('Encrypted vault unlocked. Seller keys are back in memory.', { exact: true })).toBeVisible();
    await kdfExpect(view(d.page).getByLabel('Vault passphrase')).toHaveValue('');
    await expectIdentity(d.page, idD);
    expect(await vaultDigest(d.page)).toBe(digestD);
    expect(await webStorageContains(d.page, PASS_A)).toBe(false);
    expect(await webStorageContains(d.page, PASS_B)).toBe(false);

    for (const e of envs) expect(e.blocked).toEqual([]);
  } finally {
    for (const e of envs) await e.context.close();
  }
});
