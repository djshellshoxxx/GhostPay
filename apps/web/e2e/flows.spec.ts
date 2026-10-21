import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { makeLog } from '../src/test/announcements';
import { FAKE_FEE_RECIPIENT, FAKE_ROUTER } from '../src/test/fakeManifest';
import { ORIGIN, createInvoice, generateKeys, openFresh } from './helpers';

const RPC = 'https://rpc.e2e.test';
// The bundle is built with e2e/fixtures/84532.json (see playwright.config.ts). The mock node below serves the matching
// contract code and immutables, so the REAL on-chain read-back (verifyDeployment) runs in the browser.
const CANONICAL_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
const ROUTER_CODE = '0x600160005260206000f3aa';
const RELAYER_CODE = '0x600260005260206000f3bb';
const ANNOUNCER_CODE = '0x600460005260206000f3dd';
const SEL_FEE_BPS = '0xbf333f2c';
const SEL_FEE_RECIPIENT = '0xebd09054';
const SEL_ANNOUNCER = '0x04e6b741';
const word = (hex: string): string => `0x${hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

interface SentTx {
  from: string;
  to: string;
  data: string;
  value: string;
}

/** Serves the (test-only, fake) manifest and a tiny JSON-RPC node; everything else off-origin stays blocked. */
async function mockNetwork(context: BrowserContext, state: { sent?: SentTx; logs?: unknown[]; routerCode?: string }): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await context.route(`${RPC}/**`, async (route: Route) => {
    const req = route.request();
    requests.push(req.url());
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(req.postData() ?? '{}') as { id: number; method: string; params: unknown[] };
    const reply = (result: unknown): Promise<void> =>
      route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
    switch (body.method) {
      case 'eth_chainId':
        return reply('0x14a34');
      case 'eth_blockNumber':
        return reply('0x1f4');
      case 'eth_getBlockByNumber': {
        const n = parseInt(String(body.params[0]), 16);
        const h = (x: number): string => `0x${x.toString(16).padStart(64, '0')}`;
        return reply({ number: `0x${n.toString(16)}`, hash: h(n), parentHash: h(n - 1) });
      }
      case 'eth_getCode': {
        const a = String(body.params[0]).toLowerCase();
        if (a === FAKE_ROUTER.toLowerCase()) return reply(state.routerCode ?? ROUTER_CODE);
        if (a === '0x2222222222222222222222222222222222222222') return reply(RELAYER_CODE);
        if (a === CANONICAL_ANNOUNCER.toLowerCase()) return reply(ANNOUNCER_CODE);
        return reply('0x');
      }
      case 'eth_call': {
        const data = (body.params[0] as { data: string }).data;
        if (data === SEL_FEE_BPS) return reply(word('0x19'));
        if (data === SEL_FEE_RECIPIENT) return reply(word(FAKE_FEE_RECIPIENT));
        if (data === SEL_ANNOUNCER) return reply(word(CANONICAL_ANNOUNCER));
        return reply(word('0x0'));
      }
      case 'eth_getLogs': {
        const f = body.params[0] as { fromBlock: string; toBlock: string; topics?: string[]; address?: string };
        if (f.topics?.[0] === TRANSFER_TOPIC) {
          const h = `0x${parseInt(f.fromBlock, 16).toString(16).padStart(64, '0')}`;
          return reply([{ address: f.address, blockHash: h, topics: f.topics, data: word('0xf4240') }]);
        }
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        return reply((state.logs ?? []).filter((l) => parseInt((l as { blockNumber: string }).blockNumber, 16) >= from && parseInt((l as { blockNumber: string }).blockNumber, 16) <= to));
      }
      case 'eth_getTransactionByHash':
        return reply(state.sent === undefined ? null : { hash: body.params[0], from: state.sent.from, to: state.sent.to, input: state.sent.data, value: state.sent.value, chainId: '0x14a34' });
      case 'eth_getTransactionReceipt':
        return reply(state.sent === undefined ? null : { status: '0x1', blockNumber: '0x1f5', to: state.sent.to });
      case 'eth_gasPrice':
        return reply('0x3b9aca00');
      default:
        return reply(null);
    }
  });
  return { requests };
}

/** An EIP-6963 wallet injected before any page script runs. */
async function injectWallet(page: Page, state: { sent?: SentTx }): Promise<void> {
  await page.exposeFunction('__recordTx', (tx: SentTx) => {
    state.sent = tx;
  });
  await page.addInitScript(() => {
    const account = '0x5555555555555555555555555555555555555555';
    const w = window as unknown as { __mutate?: boolean; __recordTx: (tx: unknown) => Promise<void> };
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [account];
          case 'eth_chainId':
            return '0x14a34';
          case 'net_version':
            return '84532';
          case 'eth_sendTransaction': {
            const tx = { ...(params?.[0] as Record<string, string>) };
            if (w.__mutate === true) tx['data'] = `${tx['data']?.slice(0, -2) ?? ''}ff`;
            await w.__recordTx(tx);
            return `0x${'9'.repeat(64)}`;
          }
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
    };
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'e2e-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e' }, provider } }));
    });
  });
}

async function configureRpc(page: Page): Promise<void> {
  await page.addInitScript((rpc) => {
    window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
  }, RPC);
}

test.describe('with a (fake, test-only) manifest, a mock wallet and a mock RPC', () => {
  test('pays a native invoice: preview equals calldata, the wallet gets exactly that, and the user RPC confirms it', async ({ page, context }) => {
    const state: { sent?: SentTx } = {};
    await mockNetwork(context, state);
    await injectWallet(page, state);
    await configureRpc(page);
    // Egress allow-list (APP_AND_RELAYER_SPEC section 1): only the app's own origin and the configured RPC may be contacted.
    const offOrigin: string[] = [];
    page.on('request', (r) => {
      const o = new URL(r.url()).origin;
      if (o !== ORIGIN && o !== RPC && r.url().startsWith('http')) offOrigin.push(r.url());
    });
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page);
    await openFresh(page, link);

    await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await expect(page.getByText('You pay (gross)')).toBeVisible();
    await expect(page.getByText('Contract (router), read from the chain')).toBeVisible();
    await expect(page.getByText(FAKE_ROUTER).first()).toBeVisible();
    await expect(page.getByText(FAKE_FEE_RECIPIENT).first()).toBeVisible();
    await expect(page.getByText(/GhostPay charges 0\.25 % on payments made through its checkout contract/)).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
    await page.getByRole('button', { name: 'Prepare payment' }).click();
    await expect(page.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible();
    await expect(page.getByText('payNative')).toBeVisible();
    expect(state.sent).toBeUndefined(); // nothing is sent before the explicit click
    await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();
    await expect(page.getByText(/Independently verified on your RPC/)).toBeVisible();
    expect(state.sent?.to.toLowerCase()).toBe(FAKE_ROUTER.toLowerCase());
    expect(BigInt(state.sent?.value ?? '0x0')).toBe(500_000_000_000_000_000n);
    expect(offOrigin).toEqual([]);
  });

  test('refuses when the wallet mutates the transaction', async ({ page, context }) => {
    const state: { sent?: SentTx } = {};
    await mockNetwork(context, state);
    await injectWallet(page, state);
    await configureRpc(page);
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page);
    await openFresh(page, link);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
    await page.getByRole('button', { name: 'Prepare payment' }).click();
    await expect(page.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __mutate: boolean }).__mutate = true;
    });
    await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(page.getByRole('alert')).toContainText('differs from the preview (call data)');
    await expect(page.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
  });

  test('FAILS CLOSED when the router code on-chain is not the reviewed bytecode (S3-01)', async ({ page, context }) => {
    const state: { sent?: SentTx; routerCode?: string } = { routerCode: '0x6000600060006000fd' };
    await mockNetwork(context, state);
    await injectWallet(page, state);
    await configureRpc(page);
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page);
    await openFresh(page, link);
    await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await expect(page.getByText(/router code hash differs from the manifest/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page.getByText('You pay (gross)')).toHaveCount(0);
    expect(state.sent).toBeUndefined();
  });

  test('scans in a real Web Worker under the CSP, finds my payment, and stores tags only as ciphertext', async ({ page, context }) => {
    const state: { logs?: unknown[] } = {};
    const net = await mockNetwork(context, state);
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    const offOrigin: string[] = [];
    page.on('request', (r) => {
      const o = new URL(r.url()).origin;
      if (o !== ORIGIN && o !== RPC && r.url().startsWith('http')) offOrigin.push(r.url());
    });
    await configureRpc(page);
    await page.goto('/');
    const meta = await generateKeys(page);
    const mine = makeLog({ announcer: CANONICAL_ANNOUNCER, metaAddress: meta, block: 120, index: 0, caller: FAKE_ROUTER });
    state.logs = [mine.log];

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Scan and receive' }).click();
    await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
    await page.getByLabel('Start block').fill('0');
    await page.getByRole('button', { name: 'Start scan' }).click();
    await expect(page.getByRole('heading', { name: 'Announcements addressed to you' })).toBeVisible();
    await expect(page.getByText(mine.stealthAddress)).toBeVisible();
    await expect(page.getByText(/Finished\. 1 announcements checked, 1 announcement addressed to you\./)).toBeVisible();
    // Only after the chain confirmed the transfer is it called received (S3-02).
    await expect(page.getByText(/Received: 1 USDC/)).toBeVisible();
    expect(workers.some((u) => u.startsWith(`${ORIGIN}/assets/scanner.worker-`))).toBe(true);
    expect(offOrigin).toEqual([]);
    expect(net.requests.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Unlock tags' }).click();
    await page.getByLabel(/Client tag/).fill('Acme Corp secret client');
    await page.getByRole('button', { name: 'Save tag' }).click();
    await expect(page.locator('strong', { hasText: 'Acme Corp secret client' })).toBeVisible();

    const idb = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('ghostpay-tags');
        r.onsuccess = (): void => res(r.result);
        r.onerror = (): void => rej(new Error('idb'));
      });
      const all = async (name: string): Promise<unknown[]> =>
        new Promise((res) => {
          const r = db.transaction(name).objectStore(name).getAll();
          r.onsuccess = (): void => res(r.result);
        });
      const out = JSON.stringify({ records: await all('records'), meta: await all('meta') });
      db.close();
      return out;
    });
    expect(idb).toContain('"ciphertext"');
    expect(idb).not.toContain('Acme');
    expect(idb.toLowerCase()).not.toContain(mine.stealthAddress.slice(2).toLowerCase());
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('Acme');

    await page.getByRole('button', { name: 'Lock tags' }).click();
    await expect(page.locator('strong', { hasText: 'Acme Corp secret client' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unlock tags' })).toBeVisible();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Delete all tags' }).click();
    const after = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((res) => {
        const r = indexedDB.open('ghostpay-tags');
        r.onsuccess = (): void => res(r.result);
      });
      const n = await new Promise<number>((res) => {
        const r = db.transaction('records').objectStore('records').count();
        r.onsuccess = (): void => res(r.result);
      });
      db.close();
      return n;
    });
    expect(after).toBe(0);
  });
});

test.describe('embed SDK (popup mode only)', () => {
  // A real second origin (different port) serving a merchant page; no request interception involved.
  const MERCHANT = 'http://localhost:4999/';
  let server: Server;
  let html = '';

  test.beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
    });
    await new Promise<void>((resolve) => server.listen(4999, '127.0.0.1', resolve));
  });
  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('opens the checkout popup for a same-origin link; refuses other origins', async ({ page, context }) => {
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page);
    html = `<!doctype html><title>Shop</title><body><button id="ok" data-ghostpay data-invoice="${link}"></button><button id="evil" data-ghostpay data-invoice="https://evil.test/#gpi=v1.abc">Pay</button><script src="${ORIGIN}/ghostpay-embed-v1.js"></script></body>`;
    const shop = await context.newPage();
    await shop.goto(MERCHANT);
    await expect(shop.locator('#ok')).toHaveText('Pay with GhostPay');
    await expect(shop.locator('#evil')).toBeDisabled();
    const popupPromise = context.waitForEvent('page');
    await shop.locator('#ok').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    expect(await popup.evaluate(() => (window.opener as unknown) === null)).toBe(true);
  });

  test('the versioned embed file loads with its published SHA-384 SRI value, and a wrong value is blocked (S3-10)', async ({ context }) => {
    const sri = JSON.parse(readFileSync(fileURLToPath(new URL('../dist/embed-sri.json', import.meta.url)), 'utf8')) as { file: string; integrity: string };
    expect(sri.file).toMatch(/^ghostpay-embed-v1\.[0-9a-f]{12}\.js$/);
    expect(sri.integrity).toMatch(/^sha384-/);
    const page = (integrity: string): string =>
      `<!doctype html><title>Shop</title><body><button id="b" data-ghostpay data-invoice="${ORIGIN}/#gpi=v1.abc"></button><script src="${ORIGIN}/${sri.file}" integrity="${integrity}" crossorigin="anonymous"></script></body>`;
    html = page(sri.integrity);
    const good = await context.newPage();
    await good.goto(MERCHANT);
    await expect(good.locator('#b')).toHaveText('Pay with GhostPay');
    html = page(`sha384-${'A'.repeat(64)}`);
    const bad = await context.newPage();
    await bad.goto(MERCHANT);
    await expect(bad.locator('#b')).toHaveText('');
  });
});
