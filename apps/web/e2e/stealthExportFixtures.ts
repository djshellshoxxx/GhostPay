import { readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { encodeAbiParameters, toHex } from 'viem';
import { ANNOUNCEMENT_TOPIC, type RpcLog } from '@ghostpay/chain-adapters';
import { buildErc20Metadata } from '@ghostpay/core-crypto';
import { TOKEN_84532 } from '../src/test/announcements';
import { FAKE_ANNOUNCER, FAKE_ROUTER } from '../src/test/fakeManifest';

// Spec 18 e2e fixtures: the public reference vectors (TEST-ONLY keys and passphrase), an announcement log built from
// them, UI steps shared by the export journeys, and recorders for the secret-leak guard.

interface VectorFile {
  readonly chainId: number;
  readonly passphrase: string;
  readonly seller: { readonly spendingPrivateKey: string; readonly viewingPrivateKey: string; readonly metaAddress: string };
  readonly announcements: readonly {
    readonly id: string;
    readonly announcement: { readonly stealthAddress: string; readonly ephemeralPublicKey: string };
    readonly expected: { readonly stealthAddress: string; readonly privateKey: string; readonly announcedViewTag: string };
  }[];
  readonly files: {
    readonly master: { readonly text: string };
    readonly single: { readonly text: string };
    readonly archive: { readonly text: string };
    readonly rawPrivateKey: { readonly text: string };
  };
}

export const VECTORS = JSON.parse(readFileSync(new URL('../../../test-vectors/stealth-export.json', import.meta.url), 'utf8')) as VectorFile;
const a1 = VECTORS.announcements.find((a) => a.id === 'a1');
if (a1 === undefined) throw new Error('vector a1 missing');
export const A1 = a1;
/** The one-time private key of vector a1: the needle of the leak guard. */
export const A1_KEY = A1.expected.privateKey.toLowerCase();
/** TEST-ONLY passphrases; never use them for real keys. */
export const VAULT_PASS = 'violet comet maple lantern harbor';
export const EXPORT_PASS = VECTORS.passphrase;
export const KEYSTORE_PASS = 'orbit cedar plume tundra ginger';
const SIGNING_KEY = '05'.repeat(32);

/** Announcement of vector a1 (its ephemeral key, address and view tag) as the fake announcer logs it on Base Sepolia. */
export function vectorLog(block = 120, index = 1): RpcLog {
  const word = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
  const metadata = toHex(buildErc20Metadata(Number.parseInt(A1.expected.announcedViewTag, 16), TOKEN_84532, 1_000_000n));
  return {
    address: FAKE_ANNOUNCER,
    topics: [ANNOUNCEMENT_TOPIC, `0x${'1'.padStart(64, '0')}`, word(A1.announcement.stealthAddress), word(FAKE_ROUTER)],
    data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [A1.announcement.ephemeralPublicKey as `0x${string}`, metadata]),
    blockNumber: `0x${block.toString(16)}`,
    blockHash: `0x${block.toString(16).padStart(64, '0')}`,
    logIndex: `0x${index.toString(16)}`,
    transactionHash: `0x${(BigInt(block) * 4096n + BigInt(index)).toString(16).padStart(64, '0')}`,
  };
}

export const nav = (page: Page): Locator => page.getByRole('navigation', { name: 'Main' });
export const keysView = (page: Page): Locator => page.locator('section[aria-labelledby="keys-h"]');

/** Loads the vector seller through "Import existing keys (hex)" with a fixed signing key, so every key has a copy. */
export async function importVectorSeller(page: Page): Promise<void> {
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  await page.getByText('Import existing keys (hex)', { exact: true }).click();
  await page.getByLabel('Spending private key (64 hex characters)').fill(VECTORS.seller.spendingPrivateKey.slice(2));
  await page.getByLabel('Viewing private key (64 hex characters)').fill(VECTORS.seller.viewingPrivateKey.slice(2));
  await page.getByLabel('Invoice-signing private key (optional)', { exact: true }).fill(SIGNING_KEY);
  await page.getByRole('button', { name: 'Load keys', exact: true }).click();
  await expect(page.locator('code', { hasText: VECTORS.seller.metaAddress })).toBeVisible();
}

export async function saveVault(page: Page): Promise<void> {
  await keysView(page).getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
  await keysView(page).getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
  await keysView(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await expect(keysView(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });
}

/** Downloads the keystore backup of the loaded keys from Seller keys and returns its text. */
export async function downloadKeystore(page: Page): Promise<string> {
  await keysView(page).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(KEYSTORE_PASS);
  await keysView(page).getByLabel('Repeat passphrase', { exact: true }).fill(KEYSTORE_PASS);
  const file = await download(page, () => keysView(page).getByRole('button', { name: 'Download encrypted keystore' }).click());
  expect(file.name).toBe('ghostpay-keystore.json');
  await expect(keysView(page).getByText(/^Encrypted keystore downloaded\./)).toBeVisible({ timeout: 60_000 });
  return file.text;
}

/** Scans Base Sepolia from block 0 and returns the list item of the single payment found. */
export async function scanOnePayment(page: Page, stealthAddress: string): Promise<Locator> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible({ timeout: 60_000 });
  const match = page.locator('section[aria-labelledby="scan-h"] .matches > li');
  await expect(match).toHaveCount(1);
  await expect(match.getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(stealthAddress);
  return match;
}

/** Opens "Payment details" of a match and returns the labelled section. */
export async function openDetails(match: Locator): Promise<Locator> {
  const toggle = match.getByTestId('payment-details').getByRole('button', { name: 'Payment details', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const details = match.getByRole('region', { name: 'Payment details', exact: true });
  await expect(details).toBeVisible();
  return details;
}

export async function fillNewPassphrase(scope: Locator, pass = EXPORT_PASS): Promise<void> {
  await scope.getByLabel('New passphrase for the export file (at least 14 characters)').fill(pass);
  await scope.getByLabel('Repeat the export file passphrase').fill(pass);
}

export async function useVault(scope: Locator): Promise<void> {
  await scope.getByRole('radio', { name: 'Use the encrypted vault in this browser' }).check();
  await scope.getByLabel('Passphrase of your encrypted vault').fill(VAULT_PASS);
}

export async function useKeystore(scope: Locator, keystore: string, pass = KEYSTORE_PASS): Promise<void> {
  await scope.getByRole('radio', { name: 'Use my keystore backup file' }).check();
  await scope.getByLabel('Keystore backup file of the loaded keys').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(keystore, 'utf8') });
  await scope.getByLabel('Passphrase of the keystore backup file').fill(pass);
}

export interface Downloaded {
  readonly name: string;
  readonly text: string;
}

/** Runs `action` and returns the download it starts. */
export async function download(page: Page, action: () => Promise<unknown>): Promise<Downloaded> {
  const event = page.waitForEvent('download', { timeout: 90_000 });
  await action();
  const d = await event;
  const path = await d.path();
  return { name: d.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

/** Counts every download the page starts, so a test can prove that none happened. */
export function countDownloads(page: Page): { readonly names: string[] } {
  const names: string[] = [];
  page.on('download', (d) => names.push(d.suggestedFilename()));
  return { names };
}

interface CryptoProbe {
  yields: number;
  encrypts: number;
  decrypts: number;
  readonly yieldsAtClick: number[];
  hold: 'encrypt' | 'decrypt' | undefined;
  release: (() => void) | undefined;
  announceYield: boolean;
}

export interface ProbeReading {
  readonly yields: number;
  readonly encrypts: number;
  readonly decrypts: number;
  readonly yieldsAtClick: readonly number[];
}

/**
 * Test-only instrumentation of the page, changing no result: counts scheduler.yield calls (noble scrypt yields between
 * chunks, so a count that grows means a KDF is running), records the count at every click, counts finished AES-GCM
 * encryptions and decryptions, and can hold the next one's result until {@link releaseHold}. Console markers
 * ("gp-probe:*") tell the test about these moments even while the page's main thread is busy.
 */
export async function installCryptoProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const probe: CryptoProbe = { yields: 0, encrypts: 0, decrypts: 0, yieldsAtClick: [], hold: undefined, release: undefined, announceYield: false };
    Object.defineProperty(window, '__gpProbe', { value: probe });
    const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    const original = sched?.yield?.bind(sched);
    if (sched !== undefined && original !== undefined) {
      sched.yield = () => {
        probe.yields++;
        if (probe.announceYield) { probe.announceYield = false; console.debug('gp-probe:kdf-yield'); }
        return original();
      };
    }
    window.addEventListener('click', () => { probe.yieldsAtClick.push(probe.yields); }, true);
    const subtle = crypto.subtle;
    for (const name of ['encrypt', 'decrypt'] as const) {
      const run = subtle[name].bind(subtle);
      Object.defineProperty(subtle, name, {
        configurable: true,
        value: async (...args: Parameters<SubtleCrypto['encrypt']>): Promise<ArrayBuffer> => {
          const out = await run(...args);
          if (name === 'encrypt') probe.encrypts++; else probe.decrypts++;
          if (probe.hold === name) {
            probe.hold = undefined;
            await new Promise<void>((resolve) => { probe.release = resolve; console.debug(`gp-probe:${name}-held`); });
          }
          return out;
        },
      });
    }
  });
}

export async function readProbe(page: Page): Promise<ProbeReading> {
  return page.evaluate(() => {
    const p = (window as unknown as { __gpProbe: CryptoProbe }).__gpProbe;
    return { yields: p.yields, encrypts: p.encrypts, decrypts: p.decrypts, yieldsAtClick: [...p.yieldsAtClick] };
  });
}

/** Holds the result of the next AES-GCM `kind` operation; the page logs "gp-probe:<kind>-held" when it is held. */
export async function holdNext(page: Page, kind: 'encrypt' | 'decrypt'): Promise<void> {
  await page.evaluate((k) => { (window as unknown as { __gpProbe: CryptoProbe }).__gpProbe.hold = k; }, kind);
}

export async function releaseHold(page: Page): Promise<void> {
  await page.evaluate(() => {
    const p = (window as unknown as { __gpProbe: CryptoProbe }).__gpProbe;
    const release = p.release;
    p.release = undefined;
    if (release === undefined) throw new Error('nothing held');
    release();
  });
}

/** The page logs "gp-probe:kdf-yield" at the next scheduler.yield call, i.e. once a KDF is running. */
export async function announceNextYield(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as { __gpProbe: CryptoProbe }).__gpProbe.announceYield = true; });
}

/**
 * Slows the page's CPU (Chromium DevTools emulation) so that a production-cost scrypt run lasts long enough for a lock
 * or wipe to land while it is still running, as on a slow device.
 */
export async function throttleCpu(context: BrowserContext, page: Page, rate = 20): Promise<{ readonly restore: () => Promise<void> }> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return {
    restore: async () => {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await cdp.detach();
    },
  };
}

/** Opens a file in Seller keys > "Open a stealth key export". */
export async function openExportFile(page: Page, name: string, text: string, passphrase: string): Promise<Locator> {
  await nav(page).getByRole('button', { name: 'Seller keys', exact: true }).click();
  const open = page.getByTestId('stealth-export-open');
  await expect(open.getByRole('heading', { name: 'Open a stealth key export' })).toBeVisible();
  await open.getByLabel('Stealth key export file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
  await open.getByLabel('Export file passphrase').fill(passphrase);
  await open.getByTestId('stealth-export-open-submit').click();
  return open;
}

/**
 * Leak-guard recorders: every request (URL, headers, body) of the context, console output and page errors, and every
 * navigator.clipboard call (stubbed so nothing reaches the real clipboard). `snapshot` adds the URL, history, storage,
 * IndexedDB, Cache Storage and resource timing entries at that moment.
 */
export async function recordLeaks(context: BrowserContext, page: Page): Promise<{ readonly seen: string[]; readonly snapshot: () => Promise<string[]> }> {
  const seen: string[] = [];
  context.on('request', (r) => {
    seen.push(`request ${r.method()} ${r.url()} ${JSON.stringify(r.headers())} ${r.postData() ?? ''}`);
  });
  page.on('console', (m) => seen.push(`console ${m.type()} ${m.text()}`));
  page.on('pageerror', (e) => seen.push(`pageerror ${e.message} ${e.stack ?? ''}`));
  page.on('download', (d) => seen.push(`download-name ${d.suggestedFilename()} ${d.url()}`));
  await context.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__gpClipboardCalls', { value: calls });
    const clip = navigator.clipboard as Clipboard | undefined;
    const stub = (name: string, fn: (...args: unknown[]) => Promise<unknown>): void => {
      if (clip === undefined) return;
      Object.defineProperty(clip, name, { configurable: true, value: fn });
    };
    stub('writeText', (text) => { calls.push(`writeText ${String(text)}`); return Promise.resolve(); });
    stub('readText', () => { calls.push('readText'); return Promise.resolve(''); });
    stub('read', () => { calls.push('read'); return Promise.resolve([]); });
    stub('write', async (items) => {
      for (const item of items as ClipboardItem[]) {
        for (const type of item.types) calls.push(`write ${type} ${await (await item.getType(type)).text()}`);
      }
    });
    document.addEventListener('copy', () => calls.push(`copy-event ${String(document.getSelection())}`), true);
  });
  const snapshot = async (): Promise<string[]> => {
    const inPage = await page.evaluate(async () => {
      const out: string[] = [];
      const hex = (b: ArrayBuffer | ArrayBufferView): string => {
        const u = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
        return Array.from(u, (x) => x.toString(16).padStart(2, '0')).join('');
      };
      const ser = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => {
        if (x instanceof ArrayBuffer || ArrayBuffer.isView(x)) return `bytes:${hex(x)}`;
        if (typeof CryptoKey !== 'undefined' && x instanceof CryptoKey) return `CryptoKey ${x.algorithm.name} extractable=${String(x.extractable)}`;
        if (typeof x === 'bigint') return x.toString();
        if (x instanceof Blob) return `Blob ${x.type} ${x.size}`;
        return x;
      });
      const req = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { r.onsuccess = () => { resolve(r.result); }; r.onerror = () => { reject(r.error ?? new Error('idb')); }; });
      out.push(`url ${location.href}`, `history ${String(history.length)} ${ser(history.state)}`, `title ${document.title}`, `referrer ${document.referrer}`, `cookie ${document.cookie}`);
      for (const [label, store] of [['local', localStorage], ['session', sessionStorage]] as const) {
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i) ?? '';
          out.push(`${label}Storage ${k}=${store.getItem(k) ?? ''}`);
        }
      }
      for (const info of await indexedDB.databases()) {
        if (info.name === undefined) continue;
        const db = await req(indexedDB.open(info.name));
        for (const name of Array.from(db.objectStoreNames)) {
          const os = db.transaction(name, 'readonly').objectStore(name);
          const [keys, values] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
          out.push(`indexedDB ${info.name}/${name} ${ser({ keys, values })}`);
        }
        db.close();
      }
      if (typeof caches !== 'undefined') {
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          for (const r of await cache.keys()) out.push(`cache ${name} ${r.url} ${await (await cache.match(r))?.text() ?? ''}`);
        }
      }
      for (const e of performance.getEntries()) out.push(`performance ${e.entryType} ${e.name}`);
      out.push(...(window as unknown as { __gpClipboardCalls: string[] }).__gpClipboardCalls.map((c) => `clipboard ${c}`));
      return out;
    });
    return [`page.url ${page.url()}`, ...inPage];
  };
  return { seen, snapshot };
}

/** Every entry that contains one of `needles`, compared without case (hex may be upper- or lower-case). */
export function leaksOf(entries: readonly string[], needles: readonly string[]): string[] {
  const wanted = needles.map((n) => n.toLowerCase().replace(/^0x/, ''));
  return entries.filter((entry) => {
    const hay = entry.toLowerCase();
    return wanted.some((n) => hay.includes(n));
  });
}
