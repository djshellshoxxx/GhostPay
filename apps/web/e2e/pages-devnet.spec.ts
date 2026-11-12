import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  FRAGMENT_PREFIX, canonicalize, decodeBase64Url, encodeBase64Url, invoiceDigest as calculateInvoiceDigest, parseFragment,
} from '@ghostpay/invoice-schema';
import { ANNOUNCEMENT_TOPIC, decodePaymentCalldata, tokensForChain, type Hex } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { getAddress, keccak256, parseTransaction, recoverTransactionAddress, toHex, type Address } from 'viem';
import { verifyReceipt } from '../src/lib/receipts';
import { generateKeys, openFresh } from './helpers';
import { ANVIL_ACCOUNTS, APP_RPC, Anvil, loadDevnet, type DevnetState } from './devnet/chain';
import { identityOf, keysView, nav, receiptPanel, reviewToFinalCheck, scan, scanMatches, sweepJournal, sweepView, walletJournal } from './devnet/ui';
import {
  PAGES_BASE, PagesNetwork, PagesWallet, checkKeystore, configureRpc, createPagesInvoice, flipFileBytes, gitHead, openSite,
  readSellerVault, storedSettings, tamperCiphertext, type PagesNetworkOptions,
} from './devnet/pages';

/*
 * The ACTUAL GitHub Pages artifact (scripts/pages/build-pages.sh: lean profile, relative base, this run's signed 84532
 * devnet manifest bundled) served by scripts/pages/serve-pages.mjs under /GhostPay/ like a GitHub project page (no
 * security headers), driven in Chromium against a real local anvil with the real GhostPay contracts. Every payment and
 * sweep is a real transaction; every test asserts the chain directly through the test-side Anvil client. Public anvil
 * dev accounts only; no real funds, keys or networks. Run: BROWSER_DEVNET_MODE=pages bash scripts/beta/browser-devnet.sh
 */

// The mocked suite (playwright.config.ts, desktop project) does not ignore this file; it has no devnet there. The pages
// config refuses to start without GHOSTPAY_PAGES_OUT, so under the runner this guard never skips.
test.skip(process.env['GHOSTPAY_PAGES_OUT'] === undefined, 'Real-chain Pages journey: run BROWSER_DEVNET_MODE=pages scripts/beta/browser-devnet.sh');

let dn: DevnetState;
let anvil: Anvil;
test.beforeAll(() => {
  dn = loadDevnet();
  anvil = new Anvil(dn.rpcUrl);
});

const PRICE = 500_000_000_000_000_000n; // 0.5 ETH, the invoice's fixed native amount
const FINALITY = 100; // Base Sepolia finalityDepth in chain-adapters' chain table
const KEYSTORE_PASS = 'harbor lantern quiet meadow falcon';
const VAULT_PASS = 'copper violet river starlight maple';
const WRONG_PASS = 'completely wrong passphrase here';
const LEAN_NAV = ['Home', 'Seller keys', 'Create invoice', 'Pay', 'Scan and receive', 'Sweep', 'Public registry', 'Settings', 'About and privacy'];
/** Public anvil default accounts (mnemonic "test test ... junk"), distinct from the ones devnet-journey uses. LOCAL ONLY. */
const ACCOUNTS = {
  payer: getAddress('0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'), // index 5
  rejectPayer: getAddress('0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'), // index 7
  expiryPayer: getAddress('0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'), // index 8
  outagePayer: getAddress('0xa0Ee7A142d267C1f36714E4a8F75612F20a79720'), // index 9
  destination: ANVIL_ACCOUNTS.destination, // index 6: the seller's own cold wallet
} as const;
const txHashes = new Set<string>();

const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex');
const ledger = (page: Page): Locator => page.locator('section[aria-labelledby="ledger-heading"]');
const siteOrigin = (baseURL: string | undefined): string => new URL(baseURL ?? '').origin;

async function newContext(browser: Browser, baseURL: string | undefined, net: PagesNetwork, options: PagesNetworkOptions = {}): Promise<BrowserContext> {
  if (baseURL === undefined || !baseURL.endsWith(PAGES_BASE)) throw new Error('baseURL must be the /GhostPay/ site');
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', acceptDownloads: true });
  await net.install(context, options);
  return context;
}

async function openPayer(context: BrowserContext, account: Address): Promise<{ page: Page; wallet: PagesWallet }> {
  const page = await context.newPage();
  const wallet = new PagesWallet(anvil, account);
  await wallet.inject(page);
  return { page, wallet };
}

/** Generates keys and types the backup waiver (helpers.generateKeys) for the negative cases that need only an invoice. */
async function quickSeller(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await openSite(page);
  await generateKeys(page);
  return page;
}

async function download(page: Page, testInfo: TestInfo, click: () => Promise<void>, name: string): Promise<string> {
  const pending = page.waitForEvent('download', { timeout: 60_000 });
  await click();
  const d = await pending;
  expect(d.suggestedFilename()).toBe(name);
  const path = testInfo.outputPath(name);
  await d.saveAs(path);
  return readFileSync(path, 'utf8');
}

async function webStorageContains(page: Page, secret: string): Promise<boolean> {
  return page.evaluate((s) => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(s), secret);
}

/** Keystore import through the Seller keys form (the UI's only way to re-open a downloaded backup). */
async function importKeystore(page: Page, file: { name: string; buffer: Buffer }, passphrase: string): Promise<void> {
  const input = keysView(page).getByLabel('Keystore file', { exact: true });
  if (!(await input.isVisible())) await keysView(page).getByText('Import an encrypted keystore', { exact: true }).click();
  await input.setInputFiles({ name: file.name, mimeType: 'application/json', buffer: file.buffer });
  await keysView(page).getByLabel('Passphrase', { exact: true }).fill(passphrase);
  await keysView(page).getByRole('button', { name: 'Decrypt and load' }).click();
}

async function expectNoKeys(page: Page): Promise<void> {
  await expect(keysView(page).getByRole('button', { name: 'Generate new keys' })).toBeVisible({ timeout: 30_000 });
  await expect(keysView(page).locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);
}

/** Direct-sweep attempt of the currently selected payment; returns the sign button for the caller to click. */
async function prepareDirectSweep(page: Page, vaultPass?: string): Promise<Locator> {
  await sweepView(page).getByLabel(/Directly/).check();
  await sweepView(page).getByLabel('Destination address (your own wallet)').fill(ACCOUNTS.destination);
  if (vaultPass !== undefined) await sweepView(page).getByLabel('Vault passphrase (required for each sweep action)').fill(vaultPass);
  const sign = sweepView(page).getByRole('button', { name: 'Sign and broadcast directly' });
  await expect(sign).toBeEnabled();
  return sign;
}

async function scanFromZero(page: Page, resume: boolean): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  const resumeBox = page.getByLabel('Resume from checkpoint');
  if (await resumeBox.count() > 0) await resumeBox.setChecked(resume);
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/^Finished\./)).toBeVisible({ timeout: 60_000 });
}

/** A copy of a signed invoice link whose public amount was changed after signing (the signature no longer verifies). */
function tamperInvoiceLink(link: string): string {
  const url = new URL(link);
  expect(url.hash.startsWith(FRAGMENT_PREFIX)).toBe(true);
  const envelope = JSON.parse(new TextDecoder().decode(decodeBase64Url(url.hash.slice(FRAGMENT_PREFIX.length)))) as { alg: string; inv: { amountPolicy: { mode: string; tokenAmount: string } }; sig: string };
  expect(envelope.alg).toBe('none');
  expect(envelope.inv.amountPolicy.mode).toBe('fixed_token');
  envelope.inv.amountPolicy.tokenAmount = (BigInt(envelope.inv.amountPolicy.tokenAmount) / 10n).toString();
  url.hash = FRAGMENT_PREFIX + encodeBase64Url(new TextEncoder().encode(canonicalize(envelope)));
  return url.toString();
}

// ---------------------------------------------------------------------------------------------------------------------
// The journey: one seller profile (persistent IndexedDB/localStorage across the steps), payers and a restore profile.
// Serial: each step builds on the previous one's real chain state.
// ---------------------------------------------------------------------------------------------------------------------
test.describe.serial('GitHub Pages artifact on a real devnet', () => {
  let net: PagesNetwork;
  let seller: BrowserContext;
  let sp: Page;
  const contexts: BrowserContext[] = [];
  // State carried between steps (all of it public or test-only material).
  let identity: { meta: string; signer: string };
  let keystoreText = '';
  let vaultDigest = '';
  let link = '';
  let digest = '';
  let payHash: Hex;
  let stealth: Address;
  let net0 = 0n;
  let reconciliationBackup = '';
  let destAfterSweep = 0n;
  let sweepHash = '';

  test.beforeAll(async ({ browser, baseURL }) => {
    net = new PagesNetwork(dn, siteOrigin(baseURL));
    seller = await newContext(browser, baseURL, net);
    contexts.push(seller);
  });

  test.afterAll(async () => {
    await anvil.automine(true);
    for (const c of contexts) await c.close();
    if (txHashes.size > 0) console.log(`pages devnet: ${String(txHashes.size)} real anvil transactions asserted on chain: ${[...txHashes].join(', ')}`);
  });

  test('a. the artifact loads under /GhostPay/: served bytes = SHA256SUMS, lean navigation only, enforced meta CSP, build-info commit = git HEAD', async ({ baseURL, request }) => {
    const out = process.env['GHOSTPAY_PAGES_OUT'] ?? '';
    // The served site is byte for byte the verified build output (evidence/SHA256SUMS of build-pages.sh).
    const evidence = JSON.parse(readFileSync(join(out, 'evidence', 'pages-evidence.json'), 'utf8')) as { commit: string; profile: string; paymentsEnabledChainIds: number[]; files: number };
    expect(evidence).toMatchObject({ commit: gitHead(), profile: 'lean', paymentsEnabledChainIds: [84532] });
    const sums = readFileSync(join(out, 'evidence', 'SHA256SUMS'), 'utf8').trim().split('\n');
    expect(sums).toHaveLength(evidence.files);
    await checkServedSums(request, baseURL ?? '', sums);

    sp = await seller.newPage();
    const response = await sp.goto('./');
    expect(response?.status()).toBe(200);
    expect(new URL(sp.url()).pathname).toBe(PAGES_BASE);
    // Like GitHub Pages: no protective HTTP header at all; the document's meta CSP is the only policy.
    const headers = response?.headers() ?? {};
    for (const h of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'cross-origin-opener-policy', 'permissions-policy', 'referrer-policy', 'strict-transport-security']) {
      expect(headers[h], h).toBeUndefined();
    }
    const csp = await sp.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "connect-src 'self' https: wss:"]) {
      expect(csp, directive).toContain(directive);
    }
    // The meta CSP is enforced on the Pages origin: an injected inline script is refused and never runs.
    const blocked = await sp.evaluate(() => new Promise<string>((resolve) => {
      document.addEventListener('securitypolicyviolation', (e) => { resolve(e.effectiveDirective); }, { once: true });
      const s = document.createElement('script');
      s.textContent = 'window.__ghostpayInlineRan = true;';
      document.head.appendChild(s);
      setTimeout(() => { resolve('no violation'); }, 3_000);
    }));
    expect(blocked).toMatch(/^script-src/);
    expect(await sp.evaluate(() => (window as unknown as { __ghostpayInlineRan?: boolean }).__ghostpayInlineRan)).toBeUndefined();

    // Lean navigation only: the supported EVM views, no Bitcoin, Solana, TRON or Policy entries anywhere in the shell.
    await expect(nav(sp).getByRole('button')).toHaveText(LEAN_NAV);
    await expect(sp.locator('header, nav, main').getByText(/Bitcoin|Solana|TRON|Policy accounts/)).toHaveCount(0);
    for (const label of ['Bitcoin (test)', 'Solana (test)', 'TRON (test)', 'Policy accounts (experimental)']) {
      await expect(sp.getByRole('button', { name: label })).toHaveCount(0);
    }

    // Build provenance: the page's own same-origin fetch of build-info.json names the commit under test.
    const info = await sp.evaluate(async () => {
      const r = await fetch('./build-info.json', { cache: 'no-store' });
      return { status: r.status, type: r.headers.get('content-type'), body: await r.json() as { app: string; commit: string; manifestsSha256: string } };
    });
    expect(info.status).toBe(200);
    expect(info.type).toContain('application/json');
    expect(info.body.app).toBe('ghostpay-web');
    expect(info.body.commit).toBe(gitHead());
    // The bundled manifest is exactly this run's signed 84532 manifest (same digest rule as vite.config.ts and
    // build-pages.sh), and it describes the contracts that are really on this chain.
    const manifestText = readFileSync(join(dn.deploymentsDir, '84532.json'), 'utf8');
    expect(info.body.manifestsSha256).toBe(sha256(JSON.stringify({ '84532': manifestText })));
    const manifest = JSON.parse(manifestText) as { chainId: number; router: string; bytecodeHashes: { router: string; sweepRelayer: string }; sweepRelayer: string };
    expect(manifest.chainId).toBe(84532);
    expect(await anvil.call<string>('eth_chainId')).toBe('0x14a34');
    expect(keccak256(await anvil.call<Hex>('eth_getCode', [manifest.router, 'latest']))).toBe(manifest.bytecodeHashes.router);
    expect(keccak256(await anvil.call<Hex>('eth_getCode', [manifest.sweepRelayer, 'latest']))).toBe(manifest.bytecodeHashes.sweepRelayer);
    expect(await sp.locator('meta[name="ghostpay-build"]').getAttribute('content')).toBe(gitHead());
    // The app entry, its modules and the stylesheet were all loaded relative to the sub-path.
    expect(net.requests.some((r) => r.type === 'script' && /^\/GhostPay\/assets\/index-[\w-]+\.js$/.test(new URL(r.url).pathname))).toBe(true);
    expect(net.requests.some((r) => r.type === 'stylesheet' && /^\/GhostPay\/assets\/style-[\w-]+\.css$/.test(new URL(r.url).pathname))).toBe(true);
    net.expectClean();
  });

  test('b. seller: keys, encrypted keystore download, vault passphrase, signed registered invoice whose link lives under /GhostPay/ and opens on Pay', async ({ browser, baseURL }, testInfo) => {
    await nav(sp).getByRole('button', { name: 'Seller keys' }).click();
    await keysView(sp).getByRole('button', { name: 'Generate new keys' }).click();
    await expect(keysView(sp).getByText('New keys generated in memory.', { exact: true })).toBeVisible();
    // Fresh keys exist only in this tab: the meta-address stays behind the backup gate.
    await expect(sp.getByText('Back up these seller keys first')).toBeVisible();
    await expect(keysView(sp).locator('code', { hasText: /^st:eth:0x/ })).toHaveCount(0);

    // Encrypted keystore backup (download). It lifts the gate without the waiver.
    await keysView(sp).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(KEYSTORE_PASS);
    await keysView(sp).getByLabel('Repeat passphrase', { exact: true }).fill(KEYSTORE_PASS);
    keystoreText = await download(sp, testInfo, () => keysView(sp).getByRole('button', { name: 'Download encrypted keystore' }).click(), 'ghostpay-keystore.json');
    await expect(keysView(sp).getByText(/^Encrypted keystore downloaded\./)).toBeVisible({ timeout: 30_000 });
    await expect(keysView(sp).getByLabel('Passphrase (at least 14 characters)', { exact: true })).toHaveValue('');
    await expect(sp.getByText('Back up these seller keys first')).toHaveCount(0);
    identity = await identityOf(sp);
    // The UI offers no separate "verify backup" action; the file is checked here and re-opened through the UI in step f.
    checkKeystore(keystoreText, identity, KEYSTORE_PASS);

    // The passphrase-protected browser vault (persistent IndexedDB of this profile).
    expect(await readSellerVault(sp)).toBeNull();
    await keysView(sp).getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
    await keysView(sp).getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
    await keysView(sp).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
    await expect(keysView(sp).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible({ timeout: 60_000 });
    const vault = await readSellerVault(sp);
    expect(vault).not.toBeNull();
    checkKeystore(vault ?? '', identity, VAULT_PASS);
    vaultDigest = sha256(vault ?? '');
    expect(await webStorageContains(sp, VAULT_PASS)).toBe(false);
    expect(await webStorageContains(sp, KEYSTORE_PASS)).toBe(false);

    // A signed invoice, registered in the encrypted reconciliation vault (the lean build's local invoice history).
    link = await createPagesInvoice(sp, baseURL ?? '', { description: 'Pages devnet consulting', register: true });
    const opened = await parseFragment(new URL(link).hash);
    expect(opened.verification.signatureValid).toBe(true);
    expect(opened.invoice).toMatchObject({ chainId: 84532, token: 'native', signer: identity.signer, metaAddress: identity.meta });
    digest = `0x${bytesToHex(calculateInvoiceDigest(opened.invoice))}`;

    // A payer following the link in a brand-new profile lands on the Pay view of the same site, fragment cleared.
    const fresh = await newContext(browser, baseURL, net);
    contexts.push(fresh);
    const fp = await fresh.newPage();
    await openFresh(fp, link);
    await expect(fp.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await expect(nav(fp).getByRole('button', { name: 'Pay' })).toHaveAttribute('aria-current', 'page');
    expect(new URL(fp.url()).pathname).toBe(PAGES_BASE);
    expect(new URL(fp.url()).hash).toBe('');
    await expect(fp.getByText('Pages devnet consulting')).toBeVisible();
    await expect(fp.getByText(dn.router).first()).toBeVisible();
    await fresh.close();
    net.expectClean();
  });

  test('c. buyer: connect the test wallet, review, explicit confirm, native ETH payment pending -> included, duplicate blocked after reload', async ({ browser, baseURL }) => {
    const pc = await newContext(browser, baseURL, net);
    contexts.push(pc);
    const payer = await openPayer(pc, ACCOUNTS.payer);
    const p = payer.page;
    const payerNonce = await anvil.nonce(ACCOUNTS.payer);
    const feeBefore = await anvil.balance(dn.feeRecipient);
    await openFresh(p, link);
    await reviewToFinalCheck(p, dn.router, payer.wallet.name);
    // Nothing reaches the wallet or the chain before the explicit send click.
    expect(payer.wallet.sends).toHaveLength(0);
    expect(await anvil.nonce(ACCOUNTS.payer)).toBe(payerNonce);

    await anvil.automine(false);
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect.poll(() => payer.wallet.hashes.length).toBe(1);
    payHash = payer.wallet.hashes[0] as Hex;
    await expect(p.getByRole('status').filter({ hasText: 'Waiting for inclusion…' })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toBeDisabled();
    await expect(p.getByRole('region', { name: 'Wallet attempt journal' })).toContainText(payHash);
    expect((await anvil.tx(payHash))?.blockNumber).toBeNull();
    await expect(p.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
    await expect.poll(() => walletJournal(p)).toMatchObject([{ status: 'submitted', hash: payHash, chainId: 84532, kind: 'payment' }]);

    await anvil.mine(1);
    await anvil.automine(true);
    const payReceipt = await anvil.receipt(payHash);
    expect(payReceipt?.status).toBe('0x1');
    const payBlock = Number(BigInt(payReceipt?.blockNumber ?? '0x0'));
    await expect(p.getByRole('heading', { name: 'Submitted' })).toBeVisible({ timeout: 30_000 });
    await expect(p.getByText(/Independently verified on your RPC/)).toBeVisible();
    await expect(p.getByText(`Status: included in block ${String(payBlock)} (not necessarily final yet).`)).toBeVisible();
    txHashes.add(payHash);

    // On-chain truth, read independently: exactly the previewed payNative, seller net + 25 bps fee, one announcement.
    const minedTx = await anvil.tx(payHash);
    expect(minedTx?.from.toLowerCase()).toBe(ACCOUNTS.payer.toLowerCase());
    expect(minedTx?.to?.toLowerCase()).toBe(dn.router.toLowerCase());
    expect(BigInt(minedTx?.value ?? '0x0')).toBe(PRICE);
    const preview = decodePaymentCalldata({ to: dn.router, data: (minedTx?.input ?? '0x') as Hex, value: PRICE }, 84532);
    const announcements = payReceipt?.logs.filter((l) => l.address.toLowerCase() === dn.announcer.toLowerCase() && l.topics[0]?.toLowerCase() === ANNOUNCEMENT_TOPIC.toLowerCase()) ?? [];
    expect(announcements).toHaveLength(1);
    stealth = getAddress(preview.stealth);
    net0 = preview.net;
    expect(await anvil.balance(stealth)).toBe(preview.net);
    const feePaid = (await anvil.balance(dn.feeRecipient)) - feeBefore;
    expect(feePaid + preview.net).toBe(PRICE);
    expect(feePaid).toBe((PRICE * 25n) / 10_000n);

    // Reload: the fragment was cleared, the tab journal keeps the hash, and the same payment cannot be sent again.
    await p.reload();
    expect(new URL(p.url()).pathname).toBe(PAGES_BASE);
    expect(new URL(p.url()).hash).toBe('');
    await nav(p).getByRole('button', { name: 'Pay' }).click();
    await expect(p.getByRole('region', { name: 'Wallet attempt journal' })).toContainText(payHash);
    await openFresh(p, link);
    await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByRole('button', { name: `Connect ${payer.wallet.name}` }).click();
    await p.getByRole('button', { name: 'Prepare payment' }).click();
    await expect(p.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible({ timeout: 30_000 });
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(p.getByText('A previous wallet attempt for this action already exists in this tab.', { exact: false })).toBeVisible();
    expect(payer.wallet.sends).toHaveLength(1);
    expect(await anvil.nonce(ACCOUNTS.payer)).toBe(payerNonce + 1);
    expect(await anvil.balance(stealth)).toBe(preview.net);
    await pc.close();
    net.expectClean();
  });

  test('c2. ERC-20 on this devnet: the lean build offers only the canonical Base Sepolia USDC/EURC, which DeployDevnet does not deploy, and no gas-buffer control (finding, not faked)', async () => {
    await nav(sp).getByRole('button', { name: 'Create invoice' }).click();
    await sp.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
    const options = await sp.getByLabel('Token', { exact: true }).locator('option').evaluateAll((els) => els.map((e) => ({ value: (e as HTMLOptionElement).value, label: e.textContent ?? '' })));
    const listed = tokensForChain(84532).map((t) => ({ value: t.address.toLowerCase(), label: t.symbol }));
    expect(options).toEqual([{ value: 'native', label: 'ETH' }, ...listed]);
    // The stablecoin stand-ins DeployDevnet deploys (from this run's broadcast) are not on the compiled allowlist ...
    const broadcast = JSON.parse(readFileSync(join(dirname(process.env['GHOSTPAY_DEVNET_STATE'] ?? ''), 'broadcast', 'DeployDevnet.s.sol', '31337', 'run-latest.json'), 'utf8')) as { transactions: { contractName: string; contractAddress: string; transactionType: string }[] };
    const devTokens = broadcast.transactions.filter((t) => t.transactionType === 'CREATE' && /^DevP(?:ermit|lain)Stablecoin$/.test(t.contractName)).map((t) => t.contractAddress.toLowerCase());
    expect(devTokens).toHaveLength(3);
    for (const t of devTokens) expect(options.map((o) => o.value)).not.toContain(t);
    // ... and the allowlisted addresses have no code on this chain, so an ERC-20 invoice could never be paid here.
    for (const o of listed) expect(await anvil.call<string>('eth_getCode', [o.value, 'latest'])).toBe('0x');
    // The lean build has no gas-buffer control at all (buffer policies make an invoice v2, which lean refuses).
    await sp.getByLabel('Token', { exact: true }).selectOption({ label: listed[0]?.label ?? 'USDC' });
    await expect(sp.getByLabel('Gas buffer policy')).toHaveCount(0);
    await sp.getByLabel('Token', { exact: true }).selectOption({ value: 'native' });
    net.expectClean();
  });

  test('d. seller: scan finds the payment (pending, then final), receipt bound to the invoice, ledger entry, direct sweep on chain, second sweep refused', async () => {
    const s = sp;
    // Scanner Worker over the routed RPC (real eth_getLogs): first not final, then final once the chain is deep enough.
    await scan(s);
    await expect(scanMatches(s)).toHaveCount(1);
    await expect(scanMatches(s)).toContainText('waiting for enough confirmations');
    await expect(receiptPanel(s)).toHaveCount(0);
    await anvil.mine(FINALITY + 1);
    await scan(s);
    await expect(s.getByText(/^Finished\./)).toContainText(' 1 payments found');
    await expect(scanMatches(s)).toHaveCount(1);
    await expect(scanMatches(s).getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(stealth);
    await expect(s.getByText(/waiting for enough confirmations/)).toHaveCount(0);
    expect(net.routed.some((r) => new URL(r.url).origin === new URL(APP_RPC).origin)).toBe(true);
    expect(net.methods).toContain('eth_getLogs');

    // Invoice-bound receipt (lean offers no manual digest), verified independently, then archived encrypted.
    const panel = receiptPanel(s);
    await expect(panel).toBeVisible();
    await expect(panel.getByLabel('Invoice digest (entered manually)')).toHaveCount(0);
    await panel.getByLabel('Signed invoice link or fragment').fill(link);
    await panel.getByLabel('I consent to opening this invoice locally to bind the receipt.').check();
    await panel.getByRole('button', { name: 'Validate invoice for receipt' }).click();
    await expect(panel.getByText(/Validated invoice matches this scan/)).toBeVisible();
    await panel.getByLabel('I consent to signing these invoice and payment facts.').check();
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    const receipt: unknown = JSON.parse(await panel.getByLabel('Signed receipt JSON').inputValue());
    expect(verifyReceipt(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      invoiceDigest: digest, chainId: 84532, asset: 'native', amountMinorUnits: net0.toString(),
      txHash: payHash.toLowerCase(), stealthAddress: stealth.toLowerCase(), signerPublicKey: identity.signer,
    });
    await panel.getByRole('button', { name: 'Archive in encrypted vault' }).click();
    await expect(panel.getByRole('button', { name: 'Receipt archived' })).toBeVisible({ timeout: 30_000 });

    // Local reconciliation: the verified payment is saved and matched to the registered invoice.
    const l = ledger(s);
    await l.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }).click();
    await expect(l.getByText('0 stored records in the current seller and chain scope.')).toBeVisible({ timeout: 30_000 });
    await expect(l).toContainText(digest);
    await l.getByRole('button', { name: 'Add verified payment to ledger' }).click();
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible({ timeout: 30_000 });
    await expect(l).toContainText(payHash.toLowerCase());
    const confirmMatch = l.getByRole('button', { name: 'Confirm proposed invoice match' });
    await expect(confirmMatch.first()).toBeVisible();
    await confirmMatch.first().click();
    await expect(l.getByText('Linked to a verified observation.')).toBeVisible({ timeout: 30_000 });
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible();

    // Direct sweep to the seller's own wallet: an EIP-1559 transfer signed by the stealth key in the browser; the
    // vault-tied keys need the vault passphrase for each sweep action.
    const destBefore = await anvil.balance(ACCOUNTS.destination);
    const rawBefore = net.sentRaw.length;
    await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
    await scanMatches(s).getByRole('button', { name: 'Sweep this payment' }).click();
    const sign = await prepareDirectSweep(s, VAULT_PASS);
    await sign.click();
    await expect.poll(() => net.sentRaw.length, { timeout: 60_000 }).toBe(rawBefore + 1);
    const raw = net.sentRaw.at(-1) as `0x02${string}`;
    sweepHash = keccak256(raw);
    const sweepTx = parseTransaction(raw);
    expect(sweepTx.chainId).toBe(84532);
    expect(sweepTx.nonce).toBe(0);
    expect(sweepTx.to?.toLowerCase()).toBe(ACCOUNTS.destination.toLowerCase());
    expect((await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase()).toBe(stealth.toLowerCase());
    await expect.poll(async () => (await anvil.receipt(sweepHash))?.status, { timeout: 30_000 }).toBe('0x1');
    txHashes.add(sweepHash);
    const destGain = (await anvil.balance(ACCOUNTS.destination)) - destBefore;
    expect(destGain).toBe(sweepTx.value ?? -1n);
    expect(destGain).toBeGreaterThan((net0 * 99n) / 100n);
    const dust = await anvil.balance(stealth);
    expect(dust).toBeLessThan(net0 - destGain);
    expect(dust).toBeGreaterThan(0n);
    expect(await anvil.nonce(stealth)).toBe(1);
    destAfterSweep = destBefore + destGain;
    await expect(sweepView(s).getByRole('note').filter({ hasText: sweepHash })).toHaveCount(1);
    await expect.poll(() => sweepJournal(s)).toMatchObject([{ chainId: 84532, owner: stealth, nonce: 0, expectedHash: sweepHash }]);
    const check = sweepView(s).getByRole('button', { name: 'Check status', exact: true });
    if (await check.count() > 0) await check.click();
    await expect(sweepView(s).getByRole('note').filter({ has: s.locator('.notice-title', { hasText: 'Included on chain' }) })).toHaveCount(1);

    // A second sweep of the same one-time address is refused before signing; nothing new reaches the chain.
    await nav(s).getByRole('button', { name: 'Seller keys' }).click();
    await nav(s).getByRole('button', { name: 'Sweep' }).click();
    await expect(sweepView(s).locator('code', { hasText: stealth })).toBeVisible();
    const again = await prepareDirectSweep(s, VAULT_PASS);
    await again.click();
    await expect(sweepView(s).getByText('The balance does not cover the network fee.', { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(net.sentRaw.length).toBe(rawBefore + 1);
    expect(await anvil.nonce(stealth)).toBe(1);
    expect(await anvil.balance(ACCOUNTS.destination)).toBe(destAfterSweep);
    net.expectClean();
  });

  test('e. close every seller page, reopen in the same profile: vault unlock (wrong passphrase refused first) restores keys, invoice registry, ledger and scan checkpoint', async () => {
    const testInfo = test.info();
    for (const p of seller.pages()) await p.close();
    expect(seller.pages()).toHaveLength(0);
    sp = await seller.newPage();
    await openSite(sp);
    await nav(sp).getByRole('button', { name: 'Seller keys' }).click();
    await expect(keysView(sp).getByRole('heading', { name: 'Encrypted seller vault saved in this browser' })).toBeVisible({ timeout: 30_000 });
    await expectNoKeys(sp);
    expect(sha256((await readSellerVault(sp)) ?? '')).toBe(vaultDigest);

    // Wrong passphrase: refused, nothing loaded, vault untouched.
    await keysView(sp).getByLabel('Vault passphrase').fill(WRONG_PASS);
    await keysView(sp).getByRole('button', { name: 'Unlock saved vault' }).click();
    await expect(keysView(sp).getByText(/Wrong passphrase/)).toBeVisible({ timeout: 60_000 });
    await expect(keysView(sp).getByLabel('Vault passphrase')).toHaveValue('');
    await expectNoKeys(sp);
    expect(sha256((await readSellerVault(sp)) ?? '')).toBe(vaultDigest);

    await keysView(sp).getByLabel('Vault passphrase').fill(VAULT_PASS);
    await keysView(sp).getByRole('button', { name: 'Unlock saved vault' }).click();
    await expect(keysView(sp).getByText('Encrypted vault unlocked. Seller keys are back in memory.', { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await identityOf(sp)).toEqual(identity);
    expect(sha256((await readSellerVault(sp)) ?? '')).toBe(vaultDigest);
    expect(await webStorageContains(sp, VAULT_PASS)).toBe(false);

    // Scan state: the checkpoint persisted (localStorage); matches are in memory only, so none before a new scan.
    await nav(sp).getByRole('button', { name: 'Scan and receive' }).click();
    await sp.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
    await expect(sp.getByText(/^A checkpoint exists at block \d+\.$/)).toBeVisible();
    await expect(scanMatches(sp)).toHaveCount(0);
    // The sweep attempt journal is per tab (sessionStorage, by design): a new tab starts without it.
    expect(await sweepJournal(sp)).toEqual([]);

    // Invoice history and reconciliation: registered invoice, linked verified observation and archived receipt persist.
    const l = ledger(sp);
    await l.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }).click();
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible({ timeout: 30_000 });
    await expect(l).toContainText(payHash.toLowerCase());
    await expect(l).toContainText(stealth.toLowerCase());
    await expect(l).toContainText(digest);
    await expect(l.getByText('Linked to a verified observation.')).toBeVisible();
    await expect(l.getByText('No receipts archived.')).toHaveCount(0);
    await expect(l.locator('li.card').filter({ hasText: 'for invoice' })).toHaveCount(1);
    reconciliationBackup = await download(sp, testInfo, () => l.getByRole('button', { name: 'Export encrypted reconciliation backup' }).click(), 'ghostpay-reconciliation-encrypted.json');
    expect(reconciliationBackup).not.toContain(payHash.toLowerCase());
    expect(reconciliationBackup).not.toContain(digest);

    // Resuming from the checkpoint finds nothing new; a full rescan finds the one payment, which is not counted twice.
    await scanFromZero(sp, true);
    await expect(sp.getByText(/^Finished\./)).toContainText(' 0 payments found');
    await scanFromZero(sp, false);
    await expect(sp.getByText(/^Finished\./)).toContainText(' 1 payments found');
    await expect(scanMatches(sp)).toHaveCount(1);
    await l.getByRole('button', { name: 'Add verified payment to ledger' }).click();
    await expect(sp.getByRole('status').filter({ hasText: 'Observation saved in the encrypted reconciliation vault.' })).toHaveCount(1, { timeout: 30_000 });
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible();
    await expect(l.locator('li.card').filter({ hasText: payHash.toLowerCase() }).filter({ hasText: 'Router-verified when scanned' })).toHaveCount(1);

    // The swept address cannot be swept again from the reopened profile either.
    const rawBefore = net.sentRaw.length;
    await scanMatches(sp).getByRole('button', { name: 'Sweep this payment' }).click();
    const sign = await prepareDirectSweep(sp, VAULT_PASS);
    await sign.click();
    await expect(sweepView(sp).getByText('The balance does not cover the network fee.', { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(net.sentRaw.length).toBe(rawBefore);
    expect(await anvil.nonce(stealth)).toBe(1);
    expect(await anvil.balance(ACCOUNTS.destination)).toBe(destAfterSweep);
    net.expectClean();
  });

  test('f. restore in a brand-new profile: damaged and wrong-passphrase backups refused, then the downloaded backup restores the keys; rescan shows the payment once, already swept', async ({ browser, baseURL }) => {
    // Empty storage, and no RPC preset: the user configures it in Settings like on a new device.
    const rc = await newContext(browser, baseURL, net, { presetRpc: false });
    contexts.push(rc);
    const rp = await rc.newPage();
    await openSite(rp);
    expect(await storedSettings(rp)).toBeNull();
    await nav(rp).getByRole('button', { name: 'Seller keys' }).click();
    await expectNoKeys(rp);
    expect(await readSellerVault(rp)).toBeNull();
    const methodsBefore = net.methods.length;
    const rawBefore = net.sentRaw.length;

    // g. Corrupted backups: flipped raw bytes (not a keystore at all), then a flipped ciphertext digit (AEAD fails).
    await importKeystore(rp, { name: 'ghostpay-keystore.json', buffer: flipFileBytes(keystoreText) }, KEYSTORE_PASS);
    await expect(keysView(rp).getByText('This is not a valid GhostPay keystore file.', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expectNoKeys(rp);
    await importKeystore(rp, { name: 'ghostpay-keystore.json', buffer: Buffer.from(tamperCiphertext(keystoreText), 'utf8') }, KEYSTORE_PASS);
    await expect(keysView(rp).getByText('Wrong passphrase, or the keystore was modified.', { exact: false })).toBeVisible({ timeout: 60_000 });
    await expect(keysView(rp).getByLabel('Passphrase', { exact: true })).toHaveValue('');
    await expectNoKeys(rp);
    // g. Wrong passphrase on the genuine file: refused the same way, nothing installed.
    await importKeystore(rp, { name: 'ghostpay-keystore.json', buffer: Buffer.from(keystoreText, 'utf8') }, WRONG_PASS);
    await expect(keysView(rp).getByText('Wrong passphrase, or the keystore was modified.', { exact: false })).toBeVisible({ timeout: 60_000 });
    await expectNoKeys(rp);
    // No state change: no vault, no settings written, no RPC call and certainly no transaction.
    expect(await readSellerVault(rp)).toBeNull();
    expect(await storedSettings(rp)).toBeNull();
    expect(net.methods.length).toBe(methodsBefore);
    expect(net.sentRaw.length).toBe(rawBefore);

    // The genuine backup with its passphrase restores exactly the seller's keys (memory only, no vault written).
    await importKeystore(rp, { name: 'ghostpay-keystore.json', buffer: Buffer.from(keystoreText, 'utf8') }, KEYSTORE_PASS);
    await expect(keysView(rp).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible({ timeout: 60_000 });
    expect(await identityOf(rp)).toEqual(identity);
    expect(await readSellerVault(rp)).toBeNull();
    expect(await webStorageContains(rp, KEYSTORE_PASS)).toBe(false);

    await configureRpc(rp, APP_RPC);
    expect(await storedSettings(rp)).toMatchObject({ rpcUrls: { '84532': new URL(APP_RPC).href } });

    // Rescan from block 0 in the new profile: the same single payment, final.
    await scanFromZero(rp, false);
    await expect(rp.getByText(/^Finished\./)).toContainText(' 1 payments found');
    await expect(scanMatches(rp)).toHaveCount(1);
    await expect(scanMatches(rp).getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(stealth);
    await expect(rp.getByText(/waiting for enough confirmations/)).toHaveCount(0);

    // The reconciliation vault is not part of the keystore: empty here until its own encrypted backup is imported.
    const l = ledger(rp);
    await l.getByRole('button', { name: 'Unlock encrypted reconciliation vault' }).click();
    await expect(l.getByText('No records saved.')).toBeVisible({ timeout: 30_000 });
    await l.getByLabel('Encrypted reconciliation backup file', { exact: true }).and(l.locator('input[type="file"]')).setInputFiles({ name: 'ghostpay-reconciliation-encrypted.json', mimeType: 'application/json', buffer: Buffer.from(reconciliationBackup, 'utf8') });
    await l.getByRole('button', { name: 'Preview encrypted backup' }).click();
    await expect(l.getByText(/^1 historical observation; 1 registered invoice; 1 archived receipt/)).toBeVisible({ timeout: 30_000 });
    await l.getByRole('button', { name: 'Activate previewed historical records' }).click();
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible({ timeout: 30_000 });
    const record = l.locator('li.card').filter({ hasText: payHash.toLowerCase() }).filter({ hasText: 'Block ' });
    await expect(record).toHaveCount(1);
    await expect(record).toContainText('Imported historical observation — untrusted until independently rescanned.');
    await expect(record).toContainText(digest);
    await expect(l.getByText('Linked to a verified observation.')).toBeVisible();
    // Adding the freshly rescanned, verified observation upgrades that same record instead of counting the payment twice.
    await l.getByRole('button', { name: 'Add verified payment to ledger' }).click();
    await expect(record).toContainText('Router-verified when scanned; historical observation, not current payment proof.', { timeout: 30_000 });
    await expect(l.getByText('1 stored record in the current seller and chain scope.')).toBeVisible();
    await expect(record).toHaveCount(1);
    await expect(record).toContainText(digest);

    // Already swept: the restored keys see the dust balance and refuse; nothing new on chain.
    await scanMatches(rp).getByRole('button', { name: 'Sweep this payment' }).click();
    await expect(sweepView(rp).locator('code', { hasText: stealth })).toBeVisible();
    const sign = await prepareDirectSweep(rp);
    await sign.click();
    await expect(sweepView(rp).getByText('The balance does not cover the network fee.', { exact: false })).toBeVisible({ timeout: 30_000 });
    expect(net.sentRaw.length).toBe(rawBefore);
    expect(await anvil.nonce(stealth)).toBe(1);
    expect(await anvil.balance(ACCOUNTS.destination)).toBe(destAfterSweep);
    expect((await anvil.receipt(sweepHash))?.status).toBe('0x1');
    net.expectClean();
  });

  test('a (whole journey). every request of every page and worker went only to the site under /GhostPay/ or the routed devnet RPC', () => {
    net.expectClean();
    const all = [...net.requests, ...net.routed];
    const origins = new Set(all.map((r) => new URL(r.url).origin));
    expect([...origins].sort()).toEqual([new URL(APP_RPC).origin, net.siteOrigin].sort());
    const sitePaths = new Set(all.map((r) => new URL(r.url)).filter((u) => u.origin === net.siteOrigin && u.pathname.startsWith(PAGES_BASE)).map((u) => u.pathname));
    // The scanner Worker was loaded from the sub-path too.
    expect([...sitePaths].some((p) => /^\/GhostPay\/assets\/scanner\.worker-[\w-]+\.js$/.test(p))).toBe(true);
    console.log(`pages devnet: ${String(net.requests.length)} requests across the journey (${String(sitePaths.size)} distinct /GhostPay/ paths, ${String(net.methods.length)} RPC calls); no foreign origin; nothing outside /GhostPay/`);
  });
});

async function checkServedSums(request: APIRequestContext, baseURL: string, sums: string[]): Promise<void> {
  for (const line of sums) {
    const m = /^([0-9a-f]{64}) {2}\.\/(.+)$/.exec(line);
    expect(m, line).not.toBeNull();
    const [, hash, rel] = m ?? [];
    if (rel === '.nojekyll') continue; // no extension: not a served type (Pages would serve it; nothing loads it)
    const res = await request.get(new URL(rel ?? '', baseURL).toString());
    expect(res.status(), rel).toBe(200);
    expect(sha256(await res.body()), rel).toBe(hash);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Negative cases: each in its own profiles, each asserting the user-visible refusal AND that nothing was sent.
// ---------------------------------------------------------------------------------------------------------------------
test.describe('GitHub Pages artifact: refusals', () => {
  // Regression for the Home release check that resolved ./assets/index-*.js against the origin root instead of the
  // document URL, so under /GhostPay/ it fetched another site's path (fixed in apps/web/src/lib/release.ts).
  test('the Home release check stays inside /GhostPay/ and shows the served entry script hash', async ({ browser, baseURL }) => {
    const out = process.env['GHOSTPAY_PAGES_OUT'] ?? '';
    const entry = readFileSync(join(out, 'evidence', 'SHA256SUMS'), 'utf8').trim().split('\n')
      .map((l) => /^([0-9a-f]{64}) {2}\.\/(assets\/index-[\w-]+\.js)$/.exec(l)).find((m) => m !== null);
    expect(entry).toBeDefined();
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    try {
      const page = await c.newPage();
      await openSite(page);
      await expect(page.getByText(/computing…/)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator('section[aria-labelledby="home-h"]').getByText(entry?.[1] ?? 'missing', { exact: true })).toBeVisible({ timeout: 5_000 });
      expect(net.outsideBase).toEqual([]);
    } finally {
      await c.close();
    }
  });

  test('g. a tampered invoice fragment (amount changed after signing) is refused on the Pay view; nothing reaches the wallet', async ({ browser, baseURL }) => {
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    try {
      const s = await quickSeller(c);
      const genuine = await createPagesInvoice(s, baseURL ?? '', { description: 'Pages tamper check' });
      const forged = tamperInvoiceLink(genuine);
      expect((await parseFragment(new URL(forged).hash)).verification.signatureValid).toBe(false);
      const payer = await openPayer(c, ACCOUNTS.rejectPayer);
      const nonce = await anvil.nonce(ACCOUNTS.rejectPayer);
      await openFresh(payer.page, forged);
      const p = payer.page;
      await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
      await expect(p.getByText('The invoice signature is INVALID. Do not pay.')).toBeVisible();
      await expect(p.getByRole('button', { name: 'Continue' })).toBeDisabled();
      await expect(p.getByRole('button', { name: 'Prepare payment' })).toHaveCount(0);
      await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toHaveCount(0);
      expect(payer.wallet.requests.filter((m) => m === 'eth_sendTransaction')).toHaveLength(0);
      expect(await walletJournal(p)).toEqual([]);
      expect(await anvil.nonce(ACCOUNTS.rejectPayer)).toBe(nonce);
      expect(net.sentRaw).toHaveLength(0);
      net.expectClean();
    } finally {
      await c.close();
    }
  });

  test('g. Settings refuses invalid RPC endpoints (plain http, embedded credentials, not a URL) without changing the saved RPC or contacting them', async ({ browser, baseURL }) => {
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    try {
      const head = await anvil.head();
      const page = await c.newPage();
      for (const bad of ['http://example.com', 'https://user:pass@rpc.devnet.e2e.test', 'not a url']) {
        // A fresh load per value, so each refusal message belongs to this attempt only.
        await openSite(page);
        const before = await storedSettings(page);
        expect(before).toEqual({ rpcUrls: { '84532': APP_RPC } });
        await nav(page).getByRole('button', { name: 'Settings' }).click();
        const field = page.getByLabel('Base Sepolia RPC URL', { exact: true });
        // The saved value is shown normalized (URL serialization adds the root path).
        await expect(field).toHaveValue(new URL(APP_RPC).href);
        await field.fill(bad);
        await expect(page.getByText(/RPC URL rejected/)).toHaveCount(0);
        await page.getByRole('button', { name: 'Save settings' }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'RPC URL rejected: use https:// or wss://, with no username, password or fragment.' })).toBeVisible();
        await expect(page.getByText('Settings saved.', { exact: true })).toHaveCount(0);
        expect(await storedSettings(page)).toEqual(before);
        await page.getByRole('button', { name: 'Test Base Sepolia' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'RPC URL rejected' })).toBeVisible();
        expect(await storedSettings(page)).toEqual(before);
      }
      // Nothing was contacted: no request to example.com or to the credentialed URL, and no RPC call at all.
      expect([...net.requests, ...net.routed].filter((r) => /example\.com|user:pass@/.test(r.url))).toEqual([]);
      expect(net.methods).toEqual([]);
      // The saved endpoint still works after the refusals.
      await page.getByLabel('Base Sepolia RPC URL', { exact: true }).fill(APP_RPC);
      await page.getByRole('button', { name: 'Test Base Sepolia' }).click();
      await expect(page.getByText('Connected. The endpoint reports the expected chain id.')).toBeVisible({ timeout: 30_000 });
      expect(await storedSettings(page)).toEqual({ rpcUrls: { '84532': APP_RPC } });
      // On chain: nothing happened while the endpoints were refused (automine is on, so any transaction would show).
      expect(await anvil.head()).toBe(head);
      expect(net.sentRaw).toHaveLength(0);
      net.expectClean();
    } finally {
      await c.close();
    }
  });

  test('g. RPC unavailable: payment preparation and scanning show an error, the app keeps working and nothing is marked paid or sent', async ({ browser, baseURL }) => {
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    try {
      const s = await quickSeller(c);
      const invoice = await createPagesInvoice(s, baseURL ?? '', { description: 'Pages outage check' });
      const payer = await openPayer(c, ACCOUNTS.outagePayer);
      const p = payer.page;
      const nonce = await anvil.nonce(ACCOUNTS.outagePayer);
      const pageErrors: string[] = [];
      p.on('pageerror', (e) => { pageErrors.push(e.message); });
      s.on('pageerror', (e) => { pageErrors.push(e.message); });

      net.rpcDown = true;
      await openFresh(p, invoice);
      await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
      // The payment context needs the RPC (manifest cross-check, amounts): the review says so and Continue stays disarmed.
      await expect(p.getByRole('alert').filter({ hasText: 'Blocked by a safety check (RPC_FAILURE).' })).toBeVisible({ timeout: 60_000 });
      await expect(p.getByRole('button', { name: 'Continue' })).toBeDisabled();
      await expect(p.getByRole('heading', { name: 'Final check before your wallet' })).toHaveCount(0);
      await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toHaveCount(0);
      await expect(p.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
      expect(net.rpcDownHits).toBeGreaterThan(0);

      // The seller's scan over the same unavailable RPC fails visibly and finds nothing.
      await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
      await s.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
      await s.getByLabel('Start block').fill('0');
      await s.getByRole('button', { name: 'Start scan' }).click();
      await expect(s.locator('section[aria-labelledby="scan-h"]').getByRole('alert').filter({ hasText: 'Blocked by a safety check (RPC_FAILURE).' })).toBeVisible({ timeout: 60_000 });
      await expect(s.getByText(/^Finished\./)).toHaveCount(0);
      await expect(scanMatches(s)).toHaveCount(0);
      expect(net.rpcDownHits).toBeGreaterThan(0);

      // No crash: both pages still navigate, no uncaught error, no error boundary.
      expect(pageErrors).toEqual([]);
      for (const page of [p, s]) {
        await nav(page).getByRole('button', { name: 'Home' }).click();
        await expect(nav(page).getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
      }
      // Nothing was sent or marked paid.
      expect(payer.wallet.requests.filter((m) => m === 'eth_sendTransaction')).toHaveLength(0);
      expect(await walletJournal(p)).toEqual([]);
      expect(net.sentRaw).toHaveLength(0);
      expect(await anvil.nonce(ACCOUNTS.outagePayer)).toBe(nonce);

      // Once the RPC is back, the same invoice can be reviewed up to the final check again (no stuck state); not sent.
      net.rpcDown = false;
      await openFresh(p, invoice);
      await reviewToFinalCheck(p, dn.router, payer.wallet.name);
      expect(payer.wallet.sends).toHaveLength(0);
      expect(await anvil.nonce(ACCOUNTS.outagePayer)).toBe(nonce);
      net.expectClean();
    } finally {
      net.rpcDown = false;
      await c.close();
    }
  });

  test('g. wallet rejection: the user rejects in the wallet, the app says so and the invoice stays unpaid on chain', async ({ browser, baseURL }) => {
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    try {
      const s = await quickSeller(c);
      const invoice = await createPagesInvoice(s, baseURL ?? '', { description: 'Pages wallet rejection' });
      const payer = await openPayer(c, ACCOUNTS.rejectPayer);
      const p = payer.page;
      const nonce = await anvil.nonce(ACCOUNTS.rejectPayer);
      const balance = await anvil.balance(ACCOUNTS.rejectPayer);
      await openFresh(p, invoice);
      await reviewToFinalCheck(p, dn.router, payer.wallet.name);
      payer.wallet.rejectSends = true;
      await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
      await expect(p.getByRole('alert').filter({ hasText: 'You rejected the request in your wallet.' })).toBeVisible({ timeout: 30_000 });
      expect(payer.wallet.rejected).toHaveLength(1);
      expect(payer.wallet.hashes).toHaveLength(0);
      await expect(p.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
      // The tab journal keeps the attempt without a hash ("a wallet may have broadcast even when its response was lost"),
      // so this tab refuses to ask the wallet again for the same payment; still nothing is sent.
      expect(await walletJournal(p)).toMatchObject([{ status: 'unknown', chainId: 84532, kind: 'payment' }]);
      expect((await walletJournal(p))[0]?.hash).toBeUndefined();
      payer.wallet.rejectSends = false;
      await openFresh(p, invoice);
      await reviewToFinalCheck(p, dn.router, payer.wallet.name);
      await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
      await expect(p.getByText('A previous wallet attempt for this action already exists in this tab.', { exact: false })).toBeVisible();
      expect(payer.wallet.sends).toHaveLength(0);
      expect(payer.wallet.hashes).toHaveLength(0);
      // Unpaid on chain: the payer sent nothing, and the seller's scan of the whole chain finds no payment for its keys.
      expect(await anvil.nonce(ACCOUNTS.rejectPayer)).toBe(nonce);
      expect(await anvil.balance(ACCOUNTS.rejectPayer)).toBe(balance);
      await scanFromZero(s, false);
      await expect(s.getByText(/^Finished\./)).toContainText(' 0 payments found');
      expect(net.sentRaw).toHaveLength(0);
      net.expectClean();
    } finally {
      await c.close();
    }
  });

  // Last in the file: it moves the anvil clock forward for good, which later payments would otherwise inherit.
  test('g. an expired invoice (shortest UI expiry, 1 hour) is refused at review and at send by the browser clock, and by the router on chain', async ({ browser, baseURL }) => {
    const net = new PagesNetwork(dn, siteOrigin(baseURL));
    const c = await newContext(browser, baseURL, net);
    const extra: BrowserContext[] = [];
    try {
      const s = await quickSeller(c);
      const invoice = await createPagesInvoice(s, baseURL ?? '', { description: 'Pages expiry check', expiryHours: 1 });
      const parsed = await parseFragment(new URL(invoice).hash);
      const createdAt = Math.floor(Date.now() / 1000);
      expect(parsed.invoice.expiresAt - createdAt).toBeGreaterThan(3_500);
      expect(parsed.invoice.expiresAt - createdAt).toBeLessThanOrEqual(3_600);
      const past = new Date((parsed.invoice.expiresAt + 300) * 1000);
      const payer = await openPayer(c, ACCOUNTS.expiryPayer);
      const p = payer.page;
      const nonce = await anvil.nonce(ACCOUNTS.expiryPayer);

      // 1. Valid when prepared, expired by the time of the send click: refused before the wallet is asked.
      await openFresh(p, invoice);
      await reviewToFinalCheck(p, dn.router, payer.wallet.name);
      await p.clock.setSystemTime(past);
      await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
      await expect(p.getByText('This invoice has expired. Nothing was sent.', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
      expect(payer.wallet.requests.filter((m) => m === 'eth_sendTransaction')).toHaveLength(0);

      // 2. Opened after expiry: the review itself blocks the payment.
      await openFresh(p, invoice);
      await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
      await expect(p.getByText('This invoice has expired.', { exact: true })).toBeVisible();
      await expect(p.getByRole('button', { name: 'Continue' })).toBeDisabled();
      await expect(p.getByRole('button', { name: 'Prepare payment' })).toHaveCount(0);
      await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toHaveCount(0);
      expect(payer.wallet.requests.filter((m) => m === 'eth_sendTransaction')).toHaveLength(0);
      expect(await anvil.nonce(ACCOUNTS.expiryPayer)).toBe(nonce);

      // 3. A payer whose clock lags: the page thinks the invoice is valid, but the chain is past the router deadline
      //    (evm_increaseTime + evm_mine), so the transaction cannot execute and nothing is paid. Playwright's clock belongs
      //    to the browser context, so this payer gets its own context with the real clock.
      const lagging = await newContext(browser, baseURL, net);
      extra.push(lagging);
      const q = await openPayer(lagging, ACCOUNTS.expiryPayer);
      await openFresh(q.page, invoice);
      await reviewToFinalCheck(q.page, dn.router, q.wallet.name);
      await anvil.call('evm_increaseTime', [2 * 3600]);
      await anvil.call('evm_mine', []);
      const chainNow = Number(BigInt((await anvil.call<{ timestamp: string }>('eth_getBlockByNumber', ['latest', false])).timestamp));
      expect(chainNow).toBeGreaterThan(parsed.invoice.expiresAt);
      const callsBefore = net.calls.length;
      await q.page.getByRole('button', { name: 'Send payment in my wallet' }).click();
      await expect(q.page.getByRole('alert').filter({ hasText: 'Blocked: a dry run of this transaction fails (it would revert). Nothing was sent.' })).toBeVisible({ timeout: 30_000 });
      await expect(q.page.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
      expect(q.wallet.sends).toHaveLength(0);
      expect(q.wallet.hashes).toHaveLength(0);
      // The app's own dry run of the router call is what failed; replayed here, the router reverts with Expired().
      const dryRun = net.calls.slice(callsBefore).find((call) => ['eth_call', 'eth_estimateGas'].includes(call.method) && (call.params[0] as { to?: string } | undefined)?.to?.toLowerCase() === dn.router.toLowerCase());
      expect(dryRun).toBeDefined();
      const expiredSelector = keccak256(toHex('Expired()')).slice(0, 10);
      const replay = await anvil.call('eth_call', [dryRun?.params[0], 'latest']).then(() => 'succeeded', (e: unknown) => (e instanceof Error ? e.message : String(e)));
      expect(replay.toLowerCase()).toContain(expiredSelector.slice(2));
      expect(await anvil.nonce(ACCOUNTS.expiryPayer)).toBe(nonce);
      await scanFromZero(s, false);
      await expect(s.getByText(/^Finished\./)).toContainText(' 0 payments found');
      expect(net.sentRaw).toHaveLength(0);
      net.expectClean();
    } finally {
      for (const x of extra) await x.close();
      await c.close();
    }
  });
});
