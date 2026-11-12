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

export interface SeenRequest {
  readonly url: string;
  readonly type: string;
}

/**
 * KNOWN APP DEFECT (reported, not worked around): the Home view's "Release check" resolves the entry script's relative
 * src (./assets/index-*.js) against window.location.origin instead of the document URL (apps/web/src/views/Home.tsx:23,
 * apps/web/src/lib/release.ts:13), so under /GhostPay/ it fetches <origin>/assets/index-*.js, outside the project site.
 * Exactly that request is recognised here so every other test still fails on any OTHER request leaving the sub-path;
 * the dedicated expected-failure test in pages-devnet.spec.ts keeps the strict check (and turns red once it is fixed).
 */
export function isHomeReleaseCheckDefect(r: SeenRequest, siteOrigin: string): boolean {
  const u = new URL(r.url);
  return r.type === 'fetch' && u.origin === siteOrigin && /^\/assets\/index-[\w-]+\.js$/.test(u.pathname);
}

/** Records every request; forwards the app's https RPC to anvil; aborts and records anything foreign. */
export class PagesNetwork {
  /** Every request any page or worker of an installed context issued (request events). */
  readonly requests: SeenRequest[] = [];
  /** Every request that reached a route handler (also covers requests a worker made). */
  readonly routed: SeenRequest[] = [];
  /** Requests to any origin but the site's and the RPC's: must stay empty (the browser never reached them). */
  readonly foreign: string[] = [];
  /** Same-origin requests outside /GhostPay/ (on GitHub Pages: another site of the same owner). Served, like Pages would. */
  readonly outsideBase: SeenRequest[] = [];
  /** JSON-RPC methods the app sent, in order. */
  readonly methods: string[] = [];
  /** The same calls with their parameters (e.g. to replay a dry run the app refused on). */
  readonly calls: { readonly method: string; readonly params: readonly unknown[] }[] = [];
  /** Raw signed transactions the app broadcast itself (sweeps). */
  readonly sentRaw: Hex[] = [];
  /** When true the RPC is unreachable (connection refused), as if the provider were down. */
  rpcDown = false;
  rpcDownHits = 0;

  public constructor(private readonly state: DevnetState, readonly siteOrigin: string) {}

  private classify(url: string): 'local' | 'site' | 'outside-base' | 'rpc' | 'foreign' {
    const u = new URL(url);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return 'local';
    if (u.origin === this.siteOrigin) return u.pathname.startsWith(PAGES_BASE) ? 'site' : 'outside-base';
    return u.origin === RPC_ORIGIN ? 'rpc' : 'foreign';
  }

  private record(list: SeenRequest[], url: string, type: string): ReturnType<PagesNetwork['classify']> {
    list.push({ url, type });
    const kind = this.classify(url);
    if (kind === 'foreign' && !this.foreign.includes(url)) this.foreign.push(url);
    if (kind === 'outside-base' && !this.outsideBase.some((r) => r.url === url && r.type === type)) this.outsideBase.push({ url, type });
    return kind;
  }

  async install(context: BrowserContext, options: PagesNetworkOptions = {}): Promise<void> {
    context.on('request', (req) => { this.record(this.requests, req.url(), req.resourceType()); });
    await context.route('**/*', (route) => {
      const kind = this.record(this.routed, route.request().url(), route.request().resourceType());
      // Same-origin requests go to the Pages stand-in, which answers 404 outside /GhostPay/ like GitHub Pages would.
      if (kind === 'local' || kind === 'site' || kind === 'outside-base') return route.continue();
      return route.abort();
    });
    // Registered last, so it takes precedence for the RPC origin.
    await context.route(`${APP_RPC}/**`, (route) => this.forward(route));
    if (options.presetRpc !== false) {
      // Only on the site's own documents: about:blank (openFresh) has no storage and would throw into the page.
      await context.addInitScript(({ rpc, origin }) => {
        if (window.location.origin !== origin) return;
        window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
      }, { rpc: APP_RPC, origin: this.siteOrigin });
    }
  }

  private async forward(route: Route): Promise<void> {
    this.record(this.routed, route.request().url(), route.request().resourceType());
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
        this.calls.push({ method: String(call.method), params: call.params ?? [] });
        if (call.method === 'eth_sendRawTransaction') this.sentRaw.push(call.params?.[0] as Hex);
      }
    } catch {
      this.foreign.push('unparseable RPC body');
    }
    let reply: string;
    try {
      reply = await post(this.state.rpcUrl, body);
    } catch {
      return route.abort('connectionreset');
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: reply });
  }

  /** Same-origin requests outside /GhostPay/ other than the one known, reported app defect. */
  unexplainedOutsideBase(): SeenRequest[] {
    return this.outsideBase.filter((r) => !isHomeReleaseCheckDefect(r, this.siteOrigin));
  }

  /** Nothing foreign was contacted and nothing (but the known defect) left the /GhostPay/ sub-path. */
  expectClean(): void {
    expect(this.foreign).toEqual([]);
    expect(this.unexplainedOutsideBase()).toEqual([]);
    for (const r of [...this.requests, ...this.routed]) expect(['local', 'site', 'outside-base', 'rpc'], r.url).toContain(this.classify(r.url));
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
  if (o.register === true) await page.getByRole('checkbox', { name: 'Register this invoice in my encrypted reconciliation vault for automatic local matching' }).check();
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
