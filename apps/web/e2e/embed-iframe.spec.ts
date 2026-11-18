import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
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
 * The completions (gp:done) are synthetic: the payment flow is not driven here, so the test injects them from inside the real
 * checkout frame (or from deliberately wrong senders). What is real: the build, the handshake, the origin/source/nonce checks.
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
      let requested = '/';
      try { requested = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0] ?? '/'); } catch { /* malformed escape: serve the shell */ }
      const root = resolve(outDir);
      const candidate = resolve(root, `.${normalize(`/${requested}`)}`);
      const inside = relative(root, candidate);
      // Containment by path relation, not string prefix: a sibling such as `${root}-x` must not be served.
      let file = inside === '' || inside.startsWith('..') || isAbsolute(inside) ? join(root, 'index.html') : candidate;
      if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html');
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
    const listen = (srv: Server, port: number, host: string): Promise<void> =>
      new Promise<void>((resolveListen, rejectListen) => {
        srv.once('error', rejectListen);
        srv.listen(port, host, () => {
          srv.off('error', rejectListen);
          resolveListen();
        });
      });
    await listen(checkout, CHECKOUT_PORT, '127.0.0.1');
    await listen(merchant, MERCHANT_PORT, '0.0.0.0');
  });

  test.afterAll(async () => {
    await new Promise<void>((r) => merchant.close(() => r()));
    await new Promise<void>((r) => checkout.close(() => r()));
    if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
    if (fixtureDir !== '') rmSync(fixtureDir, { recursive: true, force: true });
  });

  /** Opens a merchant page; records every message it receives and every ghostpay:done. `profile` undefined = no data-profile. */
  async function openShop(context: BrowserContext, origin: string, profile: string | undefined): Promise<Page> {
    merchantHtml = `<!doctype html><title>Shop</title><body><button id="pay" data-ghostpay data-mode="iframe" data-invoice="${LINK}"${profile === undefined ? '' : ` data-profile="${profile}"`}></button>
<script>window.__msgs = []; window.__done = []; window.addEventListener('message', function (e) { window.__msgs.push({ origin: e.origin, data: e.data }); });
document.addEventListener('ghostpay:done', function (e) { window.__done.push(e.detail); });</script>
<script src="${CHECKOUT}/ghostpay-embed-v2.js"></script></body>`;
    const shop = await context.newPage();
    // Positive control for the negative tests: report (via console) every gp:hello that reaches a framed checkout document.
    await shop.addInitScript(() => {
      if (window === window.top) return;
      window.addEventListener('message', (e) => {
        const d = e.data as { t?: unknown } | null;
        if (d !== null && typeof d === 'object' && d.t === 'gp:hello') console.log(`GP_HELLO_SEEN ${e.origin}`);
      });
    });
    hellos.length = 0;
    shop.on('console', (m) => {
      if (m.text().startsWith('GP_HELLO_SEEN ')) hellos.push(m.text().slice('GP_HELLO_SEEN '.length));
    });
    await shop.clock.install();
    await shop.goto(`${origin}/`);
    await expect(shop.locator('#pay')).toHaveText('Pay with GhostPay');
    return shop;
  }
  const hellos: string[] = [];
  let fenceSeq = 0;

  type Msg = { origin: string; data: { t: string; n: string } };
  const received = (shop: Page): Promise<Msg[]> => shop.evaluate(() => (window as unknown as { __msgs: Msg[] }).__msgs);
  const doneEvents = (shop: Page): Promise<unknown[]> => shop.evaluate(() => (window as unknown as { __done: unknown[] }).__done);
  const inits = async (shop: Page): Promise<Msg[]> => (await received(shop)).filter((m) => m.data.t === 'gp:init');

  async function handshake(shop: Page): Promise<string> {
    await shop.locator('#pay').click();
    await expect.poll(async () => (await inits(shop)).length).toBeGreaterThan(0);
    const init = (await inits(shop))[0];
    expect(init?.origin).toBe(CHECKOUT);
    expect(init?.data.n).toMatch(/^[0-9a-f]{32}$/);
    return init?.data.n ?? '';
  }

  /** Orders after everything already queued for the merchant window: the page posts to itself and waits to see it. */
  async function fence(shop: Page): Promise<void> {
    const id = `fence-${++fenceSeq}`;
    await shop.evaluate((x) => { window.postMessage({ fence: x }, '*'); }, id);
    await expect.poll(async () => (await received(shop)).some((m) => (m.data as unknown as { fence?: string }).fence === id)).toBe(true);
  }

  async function expectFallbackToPopup(context: BrowserContext, shop: Page, withProfile = true): Promise<void> {
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 });
    await shop.locator('#pay').click();
    // Positive control: hellos did reach the checkout document (with the real merchant origin), so the refusal below is the
    // checkout's decision and not a broken handshake. Step fake time in small slices so the 4 s fallback cannot fire first.
    await expect.poll(async () => { await shop.clock.runFor(100); return hellos.length; }).toBeGreaterThan(0);
    expect(new Set(hellos).size).toBe(1);
    await shop.clock.runFor(5000); // handshake window elapses without a reply
    const popup = await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toContain(`${CHECKOUT}/`);
    if (withProfile) expect(popup.url()).toContain('gpm=');
    await expect(shop.locator('iframe')).toHaveCount(0);
    expect(await inits(shop)).toEqual([]);
  }

  test('accepts a signed profile that lists the embedding origin and delivers one verified completion', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    const nonce = await handshake(shop);
    const iframe = shop.locator('iframe[title="GhostPay checkout"]');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    expect(hellos).toContain(GOOD_MERCHANT);
    // The handshake answered, so the 4 s popup fallback must not fire even after the full window elapses.
    await shop.clock.runFor(6000);
    await expect(iframe).toHaveCount(1);
    expect(context.pages()).toHaveLength(1);

    const frame = shop.frames().find((f) => f.url().startsWith(CHECKOUT));
    expect(frame).toBeDefined();
    const post = (data: unknown): Promise<void> =>
      frame?.evaluate(([d, o]) => { window.parent.postMessage(d, o as string); }, [data, GOOD_MERCHANT] as const) ?? Promise.resolve();
    const tx = `0x${'ab'.repeat(32)}`;
    // Malformed completions from the right window are ignored: wrong nonce, extra field, submitted without a hash.
    await post({ t: 'gp:done', n: 'f'.repeat(32), v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx } });
    await post({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx, extra: 'x' } });
    await post({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532 } });
    // A valid one is delivered exactly once; messages are processed in order, so the bad ones above were already refused.
    await post({ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx } });
    await expect.poll(async () => (await doneEvents(shop)).length).toBe(1);
    await post({ t: 'gp:done', n: nonce, v: 1, data: { status: 'failed', chainId: 84532 } });
    await fence(shop);
    expect(await doneEvents(shop)).toEqual([{ status: 'submitted', chainId: 84532, txHash: tx }]);
    await expect(shop.locator('[data-ghostpay-status]')).toHaveText(`Payment submitted. Transaction ${tx}`);
    await expect(shop.locator('#pay')).toHaveAttribute('data-ghostpay-phase', 'submitted');
  });

  test('greets a reloaded checkout again, so a reload after gp:init does not lose the completion', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    const nonce = await handshake(shop);
    const frame = shop.frames().find((f) => f.url().startsWith(CHECKOUT));
    await frame?.evaluate(() => { location.reload(); });
    // The fresh document has not seen the nonce; the SDK's new burst of hellos makes it answer with a second gp:init.
    await expect.poll(async () => { await shop.clock.runFor(250); return (await inits(shop)).length; }).toBeGreaterThanOrEqual(2);
    expect((await inits(shop)).every((m) => m.data.n === nonce && m.origin === CHECKOUT)).toBe(true);
    const tx = `0x${'cd'.repeat(32)}`;
    await shop.frames().find((f) => f.url().startsWith(CHECKOUT))?.evaluate(
      ([d, o]) => { window.parent.postMessage(d, o as string); },
      [{ t: 'gp:done', n: nonce, v: 1, data: { status: 'submitted', chainId: 84532, txHash: tx } }, GOOD_MERCHANT] as const,
    );
    await expect.poll(async () => (await doneEvents(shop)).length).toBe(1);
  });

  test('ignores completions from the wrong source or wrong origin', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    const nonce = await handshake(shop);
    const msg = { t: 'gp:done', n: nonce, v: 1, data: { status: 'cancelled', chainId: 84532 } };

    // 1. The merchant page itself (right nonce, wrong source and origin).
    await shop.evaluate((m) => { window.postMessage(m, '*'); }, msg);
    // 2. A second frame on the checkout origin: right origin, wrong source (not the iframe the SDK opened).
    await shop.evaluate((url) => new Promise<void>((resolveLoad) => {
      const f = document.createElement('iframe');
      f.addEventListener('load', () => { resolveLoad(); });
      f.src = url;
      document.body.appendChild(f);
    }), `${CHECKOUT}/robots.txt`);
    const rogue = shop.frames().find((f) => f.url() === `${CHECKOUT}/robots.txt`);
    expect(rogue).toBeDefined();
    await rogue?.evaluate(([m, o]) => { window.parent.postMessage(m, o as string); }, [msg, GOOD_MERCHANT] as const);
    await fence(shop);
    expect(await doneEvents(shop)).toEqual([]);

    // 3. Right source, wrong origin: navigate the SDK's OWN iframe (same contentWindow) to a foreign origin and post the
    //    nonced completion from there. Only the `event.origin` check can refuse this one.
    await context.route('http://evil.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
    await shop.evaluate(() => { document.querySelector('iframe[title="GhostPay checkout"]')?.setAttribute('src', 'http://evil.test/'); });
    await expect.poll(() => shop.frames().some((f) => f.url() === 'http://evil.test/')).toBe(true);
    const foreign = shop.frames().find((f) => f.url() === 'http://evil.test/');
    await foreign?.evaluate(([m, o]) => { window.parent.postMessage(m, o as string); }, [msg, GOOD_MERCHANT] as const);
    await fence(shop);
    const seen = (await received(shop)).filter((m) => m.data.t === 'gp:done');
    expect(seen.map((m) => m.origin).sort()).toEqual(['http://evil.test', CHECKOUT, GOOD_MERCHANT].sort()); // all three really arrived
    expect(await doneEvents(shop)).toEqual([]);
    await expect(shop.locator('#pay')).not.toHaveAttribute('data-ghostpay-phase', /./);
  });

  test('refuses to answer when the embedding origin is not in the signed profile (popup fallback)', async ({ context }) => {
    // Framing is allowed by the header for 127.0.0.1, but the profile lists only localhost:4997.
    const shop = await openShop(context, OTHER_MERCHANT, b64url(makeProfile([GOOD_MERCHANT])));
    await expectFallbackToPopup(context, shop);
    expect(hellos[0]).toBe(OTHER_MERCHANT);
  });

  test('refuses a tampered profile (popup fallback)', async ({ context }) => {
    const p = makeProfile([GOOD_MERCHANT]);
    // Widen the origin list after signing; the signature no longer matches.
    const shop = await openShop(context, GOOD_MERCHANT, b64url({ ...p, origins: [GOOD_MERCHANT, OTHER_MERCHANT] }));
    await expectFallbackToPopup(context, shop);
  });

  test('refuses an unsigned profile (popup fallback)', async ({ context }) => {
    const { sig: _sig, ...unsigned } = makeProfile([GOOD_MERCHANT]);
    void _sig;
    const shop = await openShop(context, GOOD_MERCHANT, b64url(unsigned));
    await expectFallbackToPopup(context, shop);
  });

  test('refuses a checkout opened with no profile at all (popup fallback)', async ({ context }) => {
    const shop = await openShop(context, GOOD_MERCHANT, undefined);
    await expectFallbackToPopup(context, shop, false);
  });
});
