import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import type { Hex } from 'viem';
import { APP_RPC, DevnetWallet, type DevnetState } from './chain';
import { nav } from './ui';

/*
 * Sub-path-safe drivers for the GitHub Pages artifact (e2e/pages-devnet.spec.ts). The site is served under /GhostPay/
 * like a GitHub project page, so nothing here navigates to "/" (that would leave the site): pages open "./" relative to
 * the context's baseURL. The network recorder is stricter than ./chain.ts DevnetNetwork: it records EVERY request of
 * every page and worker of a context (request events and the catch-all route), allows only the site's own sub-path
 * and the app's https RPC (relayed byte for byte to the loopback anvil), and can make that RPC unavailable on demand.
 */

export const PAGES_BASE = '/GhostPay/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const RPC_ORIGIN = new URL(APP_RPC).origin;

export function gitHead(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function post(rpcUrl: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(rpcUrl), { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    });
    req.on('timeout', () => req.destroy(new Error('anvil request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

export interface PagesNetworkOptions {
  /** Pre-seed Settings with the devnet RPC on every load (default). `false`: the user configures it in Settings. */
  readonly presetRpc?: boolean;
}

/** Records every request; forwards the app's https RPC to anvil; aborts and records anything else. */
export class PagesNetwork {
  /** Every request URL any page or worker of an installed context issued (request events). */
  readonly requests: string[] = [];
  /** Every URL that reached the catch-all route (also covers requests a worker made). */
  readonly routed: string[] = [];
  /** Requests to anything but the site's own sub-path or the RPC; the spec requires this to stay empty. */
  readonly violations: string[] = [];
  /** JSON-RPC methods the app sent, in order. */
  readonly methods: string[] = [];
  /** Raw signed transactions the app broadcast itself (sweeps). */
  readonly sentRaw: Hex[] = [];
  /** When true the RPC is unreachable (connection refused), as if the provider were down. */
  rpcDown = false;
  rpcDownHits = 0;

  public constructor(private readonly state: DevnetState, readonly siteOrigin: string) {}

  allowed(url: string): boolean {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true;
    if (u.origin === this.siteOrigin) return u.pathname.startsWith(PAGES_BASE);
    return u.origin === RPC_ORIGIN;
  }

  async install(context: BrowserContext, options: PagesNetworkOptions = {}): Promise<void> {
    context.on('request', (req) => {
      const url = req.url();
      this.requests.push(url);
      if (!this.allowed(url)) this.violations.push(`request: ${url}`);
    });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      this.routed.push(url);
      if (this.allowed(url) && new URL(url).origin === this.siteOrigin) return route.continue();
      if (!this.allowed(url)) this.violations.push(`route: ${url}`);
      return route.abort();
    });
    // Registered last, so it takes precedence for the RPC origin.
    await context.route(`${APP_RPC}/**`, (route) => this.forward(route));
    if (options.presetRpc !== false) {
      await context.addInitScript((rpc) => {
        window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
      }, APP_RPC);
    }
  }

  private async forward(route: Route): Promise<void> {
    this.routed.push(route.request().url());
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.rpcDown) {
      this.rpcDownHits += 1;
      return route.abort('connectionrefused');
    }
    const body = route.request().postData() ?? '';
    try {
      const parsed = JSON.parse(body) as { method?: string; params?: unknown[] } | { method?: string; params?: unknown[] }[];
      for (const call of [parsed].flat()) {
        this.methods.push(String(call.method));
        if (call.method === 'eth_sendRawTransaction') this.sentRaw.push(call.params?.[0] as Hex);
      }
    } catch {
      this.violations.push('unparseable RPC body');
    }
    let reply: string;
    try {
      reply = await post(this.state.rpcUrl, body);
    } catch {
      return route.abort('connectionreset');
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: reply });
  }

  /** Every same-origin request stayed under /GhostPay/ and nothing else was contacted. */
  expectClean(): void {
    expect(this.violations).toEqual([]);
    for (const url of [...this.requests, ...this.routed]) expect(this.allowed(url), url).toBe(true);
  }
}

type WalletReply = Awaited<ReturnType<DevnetWallet['handle']>>;

/** ./chain.ts DevnetWallet plus a user-rejection mode (EIP-1193 4001), as when the user presses Reject in the wallet. */
export class PagesWallet extends DevnetWallet {
  rejectSends = false;
  readonly rejected: unknown[] = [];

  override async handle(method: string, params: unknown[]): Promise<WalletReply> {
    if (method === 'eth_sendTransaction' && this.rejectSends) {
      this.rejected.push(params[0]);
      this.requests.push(method);
      return { error: { code: 4001, message: 'User rejected the request.' } };
    }
    return super.handle(method, params);
  }
}

/** Opens the site root under the sub-path ("./" against the context's /GhostPay/ baseURL). */
export async function openSite(page: Page): Promise<void> {
  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe(PAGES_BASE);
  await expect(nav(page)).toBeVisible();
}

export interface PagesInvoiceOptions {
  readonly description: string;
  /** Register in the encrypted reconciliation vault (local matching / invoice history). */
  readonly register?: boolean;
  /** "Invoice valid for (hours)"; the UI's minimum is 1. */
  readonly expiryHours?: number;
}

/**
 * ./ui.ts createInvoiceAt for the sub-path: fixed 0.5 ETH on Base Sepolia (the local anvil under 84532). Asserts the link
 * the app really produces is `<site base URL>#gpi=v1.` (origin + /GhostPay/ + fragment) and returns it.
 */
export async function createPagesInvoice(page: Page, baseURL: string, o: PagesInvoiceOptions): Promise<string> {
  await nav(page).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount').fill('0.5');
  await page.getByLabel('Item 1 description').fill(o.description);
  await page.getByLabel('Item 1 unit price').fill('50.00');
  if (o.expiryHours !== undefined) await page.getByLabel('Invoice valid for (hours)').fill(String(o.expiryHours));
  if (o.register === true) await page.getByLabel('Register this invoice in my encrypted reconciliation vault for automatic local matching').check();
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(box).toBeVisible();
  const link = await box.inputValue();
  expect(baseURL.endsWith(PAGES_BASE)).toBe(true);
  expect(link.startsWith(`${baseURL}#gpi=v1.`)).toBe(true);
  expect(new URL(link).pathname).toBe(PAGES_BASE);
  if (o.register === true) await expect(page.getByText('Invoice registered in your encrypted reconciliation vault for local matching.')).toBeVisible({ timeout: 30_000 });
  return link;
}

/** Points Base Sepolia at the app RPC through the Settings form (a new device has no RPC configured). */
export async function configureRpc(page: Page, url: string): Promise<void> {
  await nav(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Test Base Sepolia' }).click();
  await expect(page.getByText('Connected. The endpoint reports the expected chain id.')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.', { exact: true })).toBeVisible();
}

/** The persisted settings object (localStorage), or null. */
export function storedSettings(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('ghostpay.settings.v1');
    return raw === null ? null : JSON.parse(raw) as unknown;
  });
}

/** Read-only look at the encrypted seller vault record (IndexedDB), never creating or upgrading the database. */
export function readSellerVault(page: Page): Promise<string | null> {
  return page.evaluate(async (name) => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === name)) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => { resolve(r.result); };
      r.onerror = () => { reject(new Error('open failed')); };
    });
    try {
      if (!db.objectStoreNames.contains('vault')) return null;
      return await new Promise<string | null>((resolve, reject) => {
        const g = db.transaction('vault', 'readonly').objectStore('vault').get('current');
        g.onsuccess = () => { resolve(typeof g.result === 'string' ? g.result : null); };
        g.onerror = () => { reject(new Error('read failed')); };
      });
    } finally {
      db.close();
    }
  }, 'ghostpay-encrypted-seller-vault');
}

export interface KeystoreEnvelope {
  readonly v: number;
  readonly kdf: string;
  readonly kdfParams: { readonly N: number; readonly r: number; readonly p: number; readonly salt: string };
  readonly cipher: string;
  readonly iv: string;
  readonly meta: { readonly metaAddress: string; readonly signer: string };
  readonly ciphertext: string;
}

/** The downloaded keystore is the documented encrypted envelope for exactly these public keys, and nothing in clear. */
export function checkKeystore(text: string, id: { meta: string; signer: string }, passphrase: string): KeystoreEnvelope {
  expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(8 * 1024);
  const k = JSON.parse(text) as KeystoreEnvelope;
  expect(k).toMatchObject({ v: 1, kdf: 'scrypt', kdfParams: { N: 131072, r: 8, p: 1 }, cipher: 'AES-256-GCM', meta: { metaAddress: id.meta, signer: id.signer } });
  expect(k.ciphertext).toMatch(/^[0-9a-f]{64,}$/i);
  expect(text.includes(passphrase)).toBe(false);
  return k;
}

/** Flips one hex digit of the ciphertext: still well-formed JSON, but the AEAD tag can no longer verify. */
export function tamperCiphertext(text: string): string {
  const k = JSON.parse(text) as { ciphertext: string };
  const i = Math.floor(k.ciphertext.length / 2);
  const c = k.ciphertext[i] === '0' ? '1' : '0';
  return JSON.stringify({ ...k, ciphertext: `${k.ciphertext.slice(0, i)}${c}${k.ciphertext.slice(i + 1)}` }, null, 2);
}

/** Flips bytes of the raw file (XOR 0xff over a short run in the middle): the file is no longer even JSON. */
export function flipFileBytes(text: string): Buffer {
  const b = Buffer.from(text, 'utf8');
  const mid = Math.floor(b.length / 2);
  for (let i = mid; i < Math.min(b.length, mid + 8); i += 1) b[i] = (b[i] ?? 0) ^ 0xff;
  return b;
}
