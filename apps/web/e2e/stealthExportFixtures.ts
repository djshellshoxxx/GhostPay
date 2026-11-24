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
    readonly public: { readonly text: string };
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

/** Scans Base Sepolia from block 0 and returns the list item of the single payment found. */
export async function scanOnePayment(page: Page, stealthAddress: string, opts: { readonly fromStart?: boolean } = {}): Promise<Locator> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  const startScan = page.getByRole('button', { name: 'Start scan', exact: true });
  if (opts.fromStart === true) {
    // Recovery restores the encrypted checkpoint too. Wait for it before explicitly requesting a full new scan.
    await expect(startScan).toBeEnabled();
    const resume = page.getByRole('checkbox', { name: 'Resume from checkpoint', exact: true });
    if (await resume.count() > 0) await resume.uncheck();
  }
  await page.getByLabel('Start block').fill('0');
  await startScan.click();
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
