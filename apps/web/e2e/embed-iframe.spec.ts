import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { merchantIdFor, signMerchantProfile, type MerchantProfile } from '@ghostpay/invoice-schema';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { prepareManifestFixture } from './prepare-manifest.mjs';

/**
 * Browser e2e for ghostpay-embed-v2.js in IFRAME mode against a real checkout build.
 *
 * The shared preview server (port 4173) is built without VITE_EMBED_IFRAME and sends frame-ancestors 'none', so it can never
 * answer a handshake. This suite therefore builds its own copy of the app with VITE_EMBED_IFRAME=1 and serves it with an
 * explicit frame-ancestors allowlist, like deploy/nginx/security-headers-embed.conf. All keys are ephemeral and generated here.
 * Excluded from the lean profile (the lean build omits the embed SDKs).
 */
const WEB_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const CHECKOUT_PORT = 4996;
const MERCHANT_PORT = 4997;
const CHECKOUT = `http://localhost:${CHECKOUT_PORT}`;
const GOOD_MERCHANT = `http://localhost:${MERCHANT_PORT}`;
const OTHER_MERCHANT = `http://127.0.0.1:${MERCHANT_PORT}`; // different origin, framing allowed by the header, absent from the profile
const LINK = `${CHECKOUT}/#gpi=v1.AAAA`; // the SDK only checks the origin and the fragment prefix; the handshake needs no invoice
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
};

function makeProfile(origins: readonly string[]): MerchantProfile {
  const key = secp256k1.utils.randomSecretKey();
  const signer = bytesToHex(secp256k1.getPublicKey(key, true));
  return signMerchantProfile(
    {
      v: 1,
      merchantId: merchantIdFor(signer),
      name: 'E2E Shop',
      signer,
      chains: [84532],
      tokens: ['ETH'],
      templates: [],
      origins,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    key,
  );
}

const b64url = (v: unknown): string => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v), 'utf8').toString('base64url');

test.describe('embed SDK (iframe mode)', () => {
  let outDir = '';
  let fixtureDir = '';
  let checkout: Server;
  let merchant: Server;
  let merchantHtml = '';

  test.beforeAll(() => {
    test.setTimeout(240_000);
    const fixture = prepareManifestFixture();
    fixtureDir = fixture.directory;
    outDir = mkdtempSync(join(tmpdir(), 'ghostpay-embed-iframe-'));
    execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: WEB_ROOT,
      stdio: 'pipe',
      env: {
        ...process.env,
        VITE_EMBED_IFRAME: '1',
        GHOSTPAY_RELEASE_PUBKEYS: fixture.publicKey,
        GHOSTPAY_DEPLOYMENTS_DIR: fixture.directory,
        GHOSTPAY_LOCAL_BUILD_PROFILE: 'full',
      },
    });
    expect(existsSync(join(outDir, 'ghostpay-embed-v2.js'))).toBe(true);
  });

  test.beforeAll(async () => {
    checkout = createServer((req, res) => {
      const path = normalize(decodeURIComponent((req.url ?? '/').split(/[?#]/)[0] ?? '/')).replace(/^([/\\])+/, '');
      let file = join(outDir, path === '' ? 'index.html' : path);
      if (!file.startsWith(outDir) || !existsSync(file) || !statSync(file).isFile()) file = join(outDir, 'index.html');
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: wss:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${GOOD_MERCHANT} ${OTHER_MERCHANT}; worker-src 'self'`,
      });
      res.end(readFileSync(file));
    });
    merchant = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(merchantHtml);
    });
    await new Promise<void>((r) => checkout.listen(CHECKOUT_PORT, '127.0.0.1', r));
    await new Promise<void>((r) => merchant.listen(MERCHANT_PORT, '0.0.0.0', r));
  });

  test.afterAll(async () => {
    await new Promise<void>((r) => merchant.close(() => r()));
    await new Promise<void>((r) => checkout.close(() => r()));
    if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
    if (fixtureDir !== '') rmSync(fixtureDir, { recursive: true, force: true });
  });

  /** Opens a merchant page whose button embeds `profile`; records every message the page receives from any window. */
  async function openShop(context: BrowserContext, origin: string, profile: string): Promise<Page> {
    merchantHtml = `<!doctype html><title>Shop</title><body><button id="pay" data-ghostpay data-mode="iframe" data-invoice="${LINK}" data-profile="${profile}"></button>
<script>window.__msgs = []; window.__done = []; window.addEventListener('message', function (e) { window.__msgs.push({ origin: e.origin, data: e.data }); });
document.addEventListener('ghostpay:done', function (e) { window.__done.push(e.detail); });</script>
<script src="${CHECKOUT}/ghostpay-embed-v2.js"></script></body>`;
    const shop = await context.newPage();
    await shop.goto(`${origin}/`);
    await expect(shop.locator('#pay')).toHaveText('Pay with GhostPay');
    return shop;
  }

  const received = (shop: Page): Promise<{ origin: string; data: { t: string; n: string } }[]> =>
    shop.evaluate(() => (window as unknown as { __msgs: { origin: string; data: { t: string; n: string } }[] }).__msgs);

  async function expectFallbackToPopup(context: BrowserContext, shop: Page): Promise<void> {
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
    await shop.locator('#pay').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toContain(`${CHECKOUT}/`);
    expect(popup.url()).toContain('gpm=');
    // The iframe was torn down and no handshake reply ever reached the merchant page.
    await expect(shop.locator('iframe')).toHaveCount(0);
    expect((await received(shop)).filter((m) => m.data.t === 'gp:init')).toEqual([]);
  }

  test('accepts a signed profile that lists the embedding origin and delivers one verified completion', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    await shop.locator('#pay').click();
    const iframe = shop.locator('iframe[title="GhostPay checkout"]');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    await expect.poll(async () => (await received(shop)).filter((m) => m.data.t === 'gp:init').length).toBe(1);
    const init = (await received(shop)).find((m) => m.data.t === 'gp:init');
    expect(init?.origin).toBe(CHECKOUT);
    const nonce = init?.data.n ?? '';
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    // The handshake answered, so the 4 s popup fallback must not fire.
    await shop.waitForTimeout(4500);
    await expect(iframe).toHaveCount(1);
    expect(context.pages()).toHaveLength(1);

    const frame = shop.frames().find((f) => f.url().startsWith(CHECKOUT));
    expect(frame).toBeDefined();
    const done = (data: unknown): Promise<void> =>
      frame?.evaluate(([d, o]) => { window.parent.postMessage(d, o as string); }, [data, GOOD_MERCHANT] as const) ?? Promise.resolve();
    const tx = `0x${'ab'.repeat(32)}`;
    // Malformed completions from the right window are ignored: wrong nonce, extra field, submitted without a hash.
    await done({ t: 'gp:done', n: 'f'.repeat(32), v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx } });
    await done({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx, extra: 'x' } });
    await done({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532 } });
    await shop.waitForTimeout(300);
    expect(await shop.evaluate(() => (window as unknown as { __done: unknown[] }).__done)).toEqual([]);
    // A valid one is delivered exactly once.
    await done({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx } });
    await expect.poll(() => shop.evaluate(() => (window as unknown as { __done: unknown[] }).__done.length)).toBe(1);
    await done({ t: 'gp:done', n: nonce, v: 1, data: { status: 'failed', chainId: 84532 } });
    await shop.waitForTimeout(300);
    expect(await shop.evaluate(() => (window as unknown as { __done: unknown[] }).__done)).toEqual([{ status: 'submitted', chainId: 84532, txHash: tx }]);
    await expect(shop.locator('[data-ghostpay-status]')).toHaveText(`Payment submitted. Transaction ${tx}`);
    await expect(shop.locator('#pay')).toHaveAttribute('data-ghostpay-phase', 'submitted');
  });

  test('ignores completions from the wrong source or wrong origin', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    await shop.locator('#pay').click();
    await expect.poll(async () => (await received(shop)).filter((m) => m.data.t === 'gp:init').length).toBe(1);
    const nonce = (await received(shop)).find((m) => m.data.t === 'gp:init')?.data.n ?? '';
    const msg = { t: 'gp:done', n: nonce, v: 1, data: { status: 'cancelled', chainId: 84532 } };

    // 1. The merchant page itself (right nonce, wrong source and origin).
    await shop.evaluate((m) => { window.postMessage(m, '*'); }, msg);
    // 2. A second same-origin-as-checkout frame (right origin, wrong source: not the iframe the SDK opened).
    await shop.evaluate((url) => new Promise<void>((resolveLoad) => {
      const f = document.createElement('iframe');
      f.id = 'rogue';
      f.addEventListener('load', () => { resolveLoad(); });
      f.src = url;
      document.body.appendChild(f);
    }), `${CHECKOUT}/robots.txt`);
    const rogue = shop.frames().find((f) => f.url() === `${CHECKOUT}/robots.txt`);
    expect(rogue).toBeDefined();
    await rogue?.evaluate(([m, o]) => { window.parent.postMessage(m, o as string); }, [msg, GOOD_MERCHANT] as const);
    // 3. A frame on another origin (wrong origin and wrong source).
    const evil = await context.newPage();
    await evil.route('http://evil.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
    await evil.goto('http://evil.test/');
    await shop.waitForTimeout(500);
    expect(await shop.evaluate(() => (window as unknown as { __done: unknown[] }).__done)).toEqual([]);
    await expect(shop.locator('#pay')).not.toHaveAttribute('data-ghostpay-phase', /./);
    await expect(shop.locator('iframe[title="GhostPay checkout"]')).toHaveCount(1);
    await evil.close();
  });

  test('refuses to answer when the embedding origin is not in the signed profile (popup fallback)', async ({ context }) => {
    // Framing is allowed by the header for 127.0.0.1, but the profile lists only localhost:4997.
    const shop = await openShop(context, OTHER_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    await expectFallbackToPopup(context, shop);
  });

  test('refuses a tampered profile (popup fallback)', async ({ context }) => {
    const p = makeProfile([GOOD_MERCHANT]);
    // Widen the origin list after signing; the signature no longer matches.
    const tampered = { ...p, origins: [GOOD_MERCHANT, OTHER_MERCHANT] };
    const shop = await openShop(context, GOOD_MERCHANT, b64url(tampered));
    await expectFallbackToPopup(context, shop);
  });

  test('refuses an unsigned profile (popup fallback)', async ({ context }) => {
    const { sig: _sig, ...unsigned } = makeProfile([GOOD_MERCHANT]);
    void _sig;
    const shop = await openShop(context, GOOD_MERCHANT, b64url(unsigned));
    await expectFallbackToPopup(context, shop);
  });

  test('refuses a checkout opened with no profile at all (popup fallback)', async ({ context }) => {
    merchantHtml = `<!doctype html><title>Shop</title><body><button id="pay" data-ghostpay data-mode="iframe" data-invoice="${LINK}"></button>
<script>window.__msgs = []; window.addEventListener('message', function (e) { window.__msgs.push({ origin: e.origin, data: e.data }); });</script>
<script src="${CHECKOUT}/ghostpay-embed-v2.js"></script></body>`;
    const shop = await context.newPage();
    await shop.goto(`${GOOD_MERCHANT}/`);
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
    await shop.locator('#pay').click();
    await (await popupPromise).waitForLoadState();
    expect((await received(shop)).filter((m) => m.data.t === 'gp:init')).toEqual([]);
  });
});
