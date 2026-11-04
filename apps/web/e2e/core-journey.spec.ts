import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { invoiceDigest as calculateInvoiceDigest, parseFragment } from '@ghostpay/invoice-schema';
import { ANNOUNCEMENT_TOPIC, decodePaymentCalldata, type Address, type Hex } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { encodeAbiParameters, keccak256, parseTransaction, recoverTransactionAddress } from 'viem';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER } from '../src/test/fakeManifest';
import { verifyReceipt } from '../src/lib/receipts';
import { ORIGIN, createInvoice, generateKeys, openFresh } from './helpers';
import { DESTINATION, readSweepJournal } from './sweep-network';

/*
 * One chained lean-core journey on authored, test-only data: seller keys -> signed invoice -> payer consent and payment
 * -> Worker scan -> invoice-bound receipt -> direct sweep -> encrypted backup -> restore in an independent profile, plus
 * the refusal and honest-outcome cases. The payment that the scan detects is derived from the exact calldata the
 * checkout handed to the (mock) wallet, so every stage consumes the previous stage's real product output. The mock RPC
 * only answers; built app, Worker, KDF, signing and journal code are unchanged. No real network, funds or keys.
 */

const kdfExpect = expect.configure({ timeout: 45_000 });

const RPC = 'https://rpc.core.e2e.test';
const CHAIN_HEX = '0x14a34';
const PAYER = '0x5555555555555555555555555555555555555555';
const VAULT_PASS = 'violet comet maple lantern harbor';
const BACKUP_PASS = 'amber falcon quiet meadow river';
const DB = 'ghostpay-encrypted-seller-vault';
const ORACLE = '0x420000000000000000000000000000000000000f';
const CODE: Readonly<Record<string, Hex>> = {
  [FAKE_ROUTER]: '0x60016000',
  [FAKE_SWEEP_RELAYER]: '0x60026000',
  [FAKE_ANNOUNCER.toLowerCase()]: '0x60036000',
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const word = (value: string): Hex => `0x${value.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
const selector = (signature: string): string => keccak256(new TextEncoder().encode(signature)).slice(0, 10);
const quantity = (n: bigint | number): string => `0x${n.toString(16)}`;
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

interface WalletTx { from?: string; to: string; data: string; value?: string }
interface MinedPayment {
  readonly hash: Hex;
  readonly block: number;
  readonly blockHash: Hex;
  readonly stealth: Address;
  readonly net: bigint;
  readonly log: Record<string, unknown>;
  readonly transaction: Record<string, unknown>;
  readonly receipt: Record<string, unknown>;
}

/**
 * Authored single-chain simulator shared by every browser profile of one test. Payments exist only once the mock
 * wallet received the checkout's exact transaction; `fork` replaces block hashes from a height (reorg) and drops every
 * payment there; `lookups: 'reset'` makes transaction lookups fail at the transport (unknown outcome).
 */
class ChainSim {
  head = 500;
  mineAt = 120;
  fork: number | undefined;
  /**
   * Progress-keyed reorg trigger, independent of which heights the scanner happens to read: once the payment's log has
   * been served and its receipt looked up (verification runs after the page commit), the chain forks from `from` right
   * before the next block-header read above the payment block, i.e. between scan pages of the same run.
   */
  forkPlan: { payment: Hex; block: number; from: number; stage: 'log' | 'receipt' | 'next-page' | 'forked'; forkedAtRead?: number } | undefined;
  /** How many eth_getLogs replies carried a payment's announcement (old fork included). */
  paymentLogsServed = 0;
  lookups: 'ok' | 'reset' = 'ok';
  walletTxs: WalletTx[] = [];
  payments: MinedPayment[] = [];
  raws: Hex[] = [];
  sweepMined = false;
  unexpected: string[] = [];
  /** Every RPC method in arrival order, and those already answered. */
  methods: string[] = [];
  served: string[] = [];
  private held = new Map<string, { reached: () => void; wait: Promise<void>; release: () => void }>();
  private walletCount = 0;

  blockHash(n: number): Hex {
    return this.fork !== undefined && n >= this.fork ? word(`f${n.toString(16)}`) : word(n.toString(16));
  }

  canonical(p: MinedPayment): boolean {
    return p.blockHash === this.blockHash(p.block);
  }

  /** The next RPC call of `method` waits until released; resolves once that call arrived. */
  hold(method: string): { arrived: Promise<void>; release: () => void } {
    let reached = (): void => undefined;
    const arrived = new Promise<void>((resolve) => { reached = resolve; });
    let release = (): void => undefined;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    this.held.set(method, { reached, wait, release });
    return { arrived, release };
  }

  /** Called with the exact object the checkout passed to `eth_sendTransaction`; returns the wallet's hash. */
  walletSend(tx: WalletTx): Hex {
    this.walletTxs.push(tx);
    this.walletCount += 1;
    const hash = keccak256(new TextEncoder().encode(`core-journey-wallet-${String(this.walletCount)}-${tx.data}`));
    this.mine(hash, tx, this.mineAt);
    return hash;
  }

  /** Mines exactly the wallet's payNative/payERC20 call: announcement, receipt and transaction derive from its calldata. */
  mine(hash: Hex, tx: WalletTx, block: number): MinedPayment {
    const value = BigInt(tx.value ?? '0x0');
    const preview = decodePaymentCalldata({ to: tx.to as Address, data: tx.data as Hex, value }, 84532);
    const blockHash = this.blockHash(block);
    const common = { blockHash, blockNumber: quantity(block), transactionHash: hash };
    const log = {
      ...common,
      address: FAKE_ANNOUNCER,
      topics: [ANNOUNCEMENT_TOPIC, word('1'), word(preview.stealth), word(FAKE_ROUTER)],
      data: encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [preview.ephemeralPublicKey, preview.metadata]),
      logIndex: '0x0',
      transactionIndex: '0x0',
      removed: false,
    };
    const from = (tx.from ?? PAYER).toLowerCase();
    const payment: MinedPayment = {
      hash, block, blockHash, stealth: preview.stealth, net: preview.net, log,
      transaction: { hash, from, to: tx.to.toLowerCase(), input: tx.data.toLowerCase(), value: quantity(value), chainId: CHAIN_HEX, nonce: '0x0', blockHash, blockNumber: quantity(block), transactionIndex: '0x0' },
      receipt: { ...common, status: '0x1', from, to: tx.to.toLowerCase(), logs: [log], transactionIndex: '0x0' },
    };
    this.payments.push(payment);
    return payment;
  }

  private canonicalPayment(hash: string): MinedPayment | undefined {
    return this.payments.find((p) => p.hash.toLowerCase() === hash.toLowerCase() && this.canonical(p) && p.block <= this.head);
  }

  async install(context: BrowserContext): Promise<void> {
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN || ['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue();
      this.unexpected.push(url.origin);
      return route.abort();
    });
    await context.route(`${RPC}/**`, (route) => this.answer(route));
    await context.addInitScript((rpc) => {
      window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
    }, RPC);
  }

  private async answer(route: Route): Promise<void> {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(route.request().postData() ?? '{}') as { id: number; method: string; params: unknown[] };
    this.methods.push(body.method);
    const reply = async (result: unknown): Promise<void> => {
      await route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }) });
      this.served.push(body.method);
    };
    const hold = this.held.get(body.method);
    if (hold !== undefined) {
      this.held.delete(body.method);
      hold.reached();
      await hold.wait;
    }
    switch (body.method) {
      case 'eth_chainId': return reply(CHAIN_HEX);
      case 'eth_blockNumber': return reply(quantity(this.head));
      case 'eth_getBlockByNumber': {
        const tag = String(body.params[0]);
        const n = /^0x[0-9a-f]+$/i.test(tag) ? Number.parseInt(tag, 16) : this.head;
        if (this.forkPlan?.stage === 'next-page' && n > this.forkPlan.block) {
          this.fork = this.forkPlan.from;
          this.forkPlan.forkedAtRead = n;
          this.forkPlan.stage = 'forked';
        }
        if (n > this.head) return reply(null);
        const block = { number: quantity(n), hash: this.blockHash(n), parentHash: this.blockHash(n - 1), timestamp: quantity(Math.floor(Date.now() / 1000) - (this.head - n) * 2) };
        return reply(block);
      }
      case 'eth_getLogs': {
        const filter = body.params[0] as { fromBlock: string; toBlock: string; address?: string | string[]; topics?: (string | string[] | null)[] };
        const from = Number.parseInt(filter.fromBlock, 16);
        const to = Number.parseInt(filter.toBlock, 16);
        const addresses = filter.address === undefined ? undefined : [filter.address].flat().map((a) => a.toLowerCase());
        const logs = this.payments.filter((p) => this.canonical(p) && p.block >= from && p.block <= to && p.block <= this.head).map((p) => p.log).filter((raw) => {
          const log = raw as { address: string; topics: string[] };
          return (addresses === undefined || addresses.includes(log.address.toLowerCase()))
            && (filter.topics ?? []).every((topic, i) => topic === null || [topic].flat().some((t) => t.toLowerCase() === log.topics[i]?.toLowerCase()));
        });
        this.paymentLogsServed += logs.length;
        const plan = this.forkPlan;
        if (plan?.stage === 'log' && this.payments.some((p) => p.hash.toLowerCase() === plan.payment.toLowerCase() && logs.includes(p.log))) plan.stage = 'receipt';
        return reply(logs);
      }
      case 'eth_getCode': return reply(CODE[String(body.params[0]).toLowerCase()] ?? '0x');
      case 'eth_getBalance': {
        const owner = String(body.params[0]).toLowerCase();
        if (owner === PAYER) return reply(quantity(10n ** 19n)); // 10 authored test ETH.
        const paid = this.payments.filter((p) => this.canonical(p) && p.stealth.toLowerCase() === owner).reduce((sum, p) => sum + p.net, 0n);
        return reply(quantity(this.sweepMined ? 0n : paid));
      }
      case 'eth_gasPrice': return reply('0x3b9aca00');
      case 'eth_getTransactionCount': return reply('0x0');
      case 'eth_estimateGas': return reply('0x5208');
      case 'eth_call': {
        const call = body.params[0] as { to: string; data?: string; input?: string };
        const to = call.to.toLowerCase();
        const data = call.data ?? call.input ?? '0x';
        if (to === FAKE_ROUTER) {
          if (data.startsWith(selector('FEE_RECIPIENT()'))) return reply(word(FAKE_FEE_RECIPIENT));
          if (data.startsWith(selector('ANNOUNCER()'))) return reply(word(FAKE_ANNOUNCER));
          if (data.startsWith(selector('FEE_BPS()'))) return reply(word('19'));
          return reply('0x'); // The checkout's dry run of payNative: a successful call without return data.
        }
        if (to === ORACLE) return reply(word('0')); // OP-stack fee reads, as in sweep-network.ts.
        // The direct native sweep's dry run: a plain value transfer to the seller's own EOA returns no data.
        if (to === DESTINATION.toLowerCase() && data === '0x') return reply('0x');
        this.unexpected.push(`eth_call:${to}:${data.slice(0, 10)}`);
        return reply(null);
      }
      case 'eth_getTransactionByHash': {
        if (this.lookups === 'reset') return route.abort('connectionreset');
        const hash = String(body.params[0]).toLowerCase();
        const payment = this.canonicalPayment(hash);
        if (payment !== undefined) return reply(payment.transaction);
        return reply(this.raws.some((raw) => keccak256(raw) === hash) ? { hash } : null);
      }
      case 'eth_getTransactionReceipt': {
        if (this.lookups === 'reset') return route.abort('connectionreset');
        const hash = String(body.params[0]).toLowerCase();
        const payment = this.canonicalPayment(hash);
        if (this.forkPlan?.stage === 'receipt' && hash === this.forkPlan.payment.toLowerCase()) this.forkPlan.stage = 'next-page';
        if (payment !== undefined) return reply(payment.receipt);
        const raw = this.raws.find((candidate) => keccak256(candidate) === hash);
        return reply(this.sweepMined && raw !== undefined ? { transactionHash: hash, status: '0x1' } : null);
      }
      case 'eth_sendRawTransaction': {
        const raw = body.params[0] as Hex;
        this.raws.push(raw);
        return reply(keccak256(raw));
      }
      default:
        this.unexpected.push(body.method);
        return reply(null);
    }
  }
}

interface Profile { context: BrowserContext; page: Page }

async function newProfile(browser: Browser, sim: ChainSim, opts: { clock?: boolean } = {}): Promise<Profile> {
  const context = await browser.newContext({ baseURL: ORIGIN, serviceWorkers: 'block', acceptDownloads: true });
  if (opts.clock === true) await context.clock.install({ time: new Date() });
  await sim.install(context);
  const page = await context.newPage();
  return { context, page };
}

/** An EIP-6963 wallet whose `eth_sendTransaction` hands the exact request object to the simulator. */
async function injectWallet(page: Page, sim: ChainSim): Promise<void> {
  await page.exposeFunction('__coreWalletSend', (tx: WalletTx) => sim.walletSend(tx));
  await page.addInitScript((account) => {
    const w = window as unknown as { __coreWalletSend: (tx: unknown) => Promise<string> };
    const provider = {
      on: (): void => undefined,
      removeListener: (): void => undefined,
      request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [account];
          case 'eth_chainId':
            return '0x14a34';
          case 'net_version':
            return '84532';
          case 'eth_sendTransaction':
            return w.__coreWalletSend({ ...(params?.[0] as Record<string, string>) });
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
    };
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'core-journey-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e.core' }, provider },
      }));
    });
  }, PAYER);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const keysView = (page: Page) => page.locator('section[aria-labelledby="keys-h"]');
const sweepView = (page: Page) => page.locator('section[aria-labelledby="sw-h"]');
const scanMatches = (page: Page) => page.locator('section[aria-labelledby="scan-h"] .matches > li');
const receiptPanel = (page: Page) => page.getByRole('region', { name: 'Seller-signed receipt' });
const walletJournal = (page: Page): Promise<unknown[]> => page.evaluate(() => JSON.parse(window.sessionStorage.getItem('ghostpay.wallet-attempts.v1') ?? '[]') as unknown[]);

async function identityOf(page: Page): Promise<{ meta: string; signer: string }> {
  const meta = keysView(page).locator('code', { hasText: /^st:eth:0x/ });
  const signer = keysView(page).locator('code', { hasText: /^0[23][0-9a-f]{64}$/ });
  await kdfExpect(meta).toBeVisible();
  await kdfExpect(signer).toBeVisible();
  return { meta: ((await meta.textContent()) ?? '').trim(), signer: ((await signer.textContent()) ?? '').trim() };
}

async function saveVault(page: Page): Promise<void> {
  await keysView(page).getByLabel('New vault passphrase (14+ characters)').fill(VAULT_PASS);
  await keysView(page).getByLabel('Repeat vault passphrase').fill(VAULT_PASS);
  await keysView(page).getByRole('button', { name: 'Save encrypted vault in this browser' }).click();
  await kdfExpect(keysView(page).getByText('Encrypted seller vault saved in this browser. The passphrase was cleared.', { exact: true })).toBeVisible();
}

/** Downloads the encrypted keystore through the product; vault-bound keys must show (and pass) the step-up field. */
async function exportKeystore(page: Page, opts: { stepUp: boolean }): Promise<string> {
  await nav(page).getByRole('button', { name: 'Seller keys' }).click();
  await keysView(page).getByLabel('Passphrase (at least 14 characters)', { exact: true }).fill(BACKUP_PASS);
  await keysView(page).getByLabel('Repeat passphrase', { exact: true }).fill(BACKUP_PASS);
  const stepUp = keysView(page).locator('input[name="ghostpay-step-up-export"]');
  if (opts.stepUp) {
    await expect(stepUp).toBeVisible();
    await stepUp.fill(VAULT_PASS);
  } else {
    await expect(stepUp).toHaveCount(0);
  }
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await keysView(page).getByRole('button', { name: 'Download encrypted keystore' }).click();
  const path = await (await download).path();
  await kdfExpect(keysView(page).getByText(/^Encrypted keystore downloaded\./)).toBeVisible();
  await kdfExpect(keysView(page).getByLabel('Passphrase (at least 14 characters)', { exact: true })).toHaveValue('');
  return readFileSync(path, 'utf8');
}

async function importKeystore(page: Page, keystore: string): Promise<void> {
  await nav(page).getByRole('button', { name: 'Seller keys' }).click();
  const fileInput = keysView(page).getByLabel('Keystore file');
  if (!(await fileInput.isVisible())) await keysView(page).getByText('Import an encrypted keystore', { exact: true }).click();
  await fileInput.setInputFiles({ name: 'ghostpay-keystore.json', mimeType: 'application/json', buffer: Buffer.from(keystore, 'utf8') });
  await keysView(page).getByLabel('Passphrase', { exact: true }).fill(BACKUP_PASS);
  await keysView(page).getByRole('button', { name: 'Decrypt and load' }).click();
  await kdfExpect(keysView(page).getByText('Keystore decrypted; keys are in memory.', { exact: true })).toBeVisible();
}

async function readVault(page: Page): Promise<string | null> {
  return page.evaluate(async (name) => {
    if (!(await indexedDB.databases()).some((d) => d.name === name)) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => { resolve(r.result); };
      r.onerror = () => { reject(new Error('open failed')); };
    });
    try {
      return await new Promise<string | null>((resolve, reject) => {
        const g = db.transaction('vault', 'readonly').objectStore('vault').get('current');
        g.onsuccess = () => { resolve(typeof g.result === 'string' ? g.result : null); };
        g.onerror = () => { reject(new Error('read failed')); };
      });
    } finally {
      db.close();
    }
  }, DB);
}

/** Create invoice with an explicit validity (the shared helper keeps its fixed 24 h default). */
async function createShortInvoice(page: Page, hours: number): Promise<string> {
  await nav(page).getByRole('button', { name: 'Create invoice' }).click();
  await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
  await page.getByLabel('Token amount').fill('0.5');
  await page.getByLabel('Item 1 description').fill('Short-lived consulting');
  await page.getByLabel('Item 1 unit price').fill('50.00');
  await page.getByLabel('Invoice valid for (hours)').fill(String(hours));
  await page.getByRole('button', { name: 'Create invoice link' }).click();
  const box = page.getByRole('textbox', { name: 'Link', exact: true });
  await expect(box).toBeVisible();
  return box.inputValue();
}

/** Payer: review -> explicit consent steps -> final check. Nothing reaches the wallet before the send click. */
async function reviewToFinalCheck(payer: Page, sim: ChainSim, link: string): Promise<void> {
  await openFresh(payer, link);
  await expect(payer.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
  await expect(payer.getByText(FAKE_ROUTER).first()).toBeVisible();
  await payer.getByRole('button', { name: 'Continue' }).click();
  await payer.getByRole('button', { name: /Connect E2E Wallet/ }).click();
  await payer.getByRole('button', { name: 'Prepare payment' }).click();
  await expect(payer.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible();
  await expect(payer.getByText('payNative')).toBeVisible();
  expect(sim.walletTxs).toHaveLength(0);
}

async function payThroughCheckout(payer: Page, sim: ChainSim, link: string): Promise<MinedPayment> {
  await reviewToFinalCheck(payer, sim, link);
  await payer.getByRole('button', { name: 'Send payment in my wallet' }).click();
  await expect(payer.getByRole('heading', { name: 'Submitted' })).toBeVisible();
  await expect(payer.getByText(/Independently verified on your RPC/)).toBeVisible();
  await expect(payer.getByText(`Status: included in block ${String(sim.mineAt)} (not necessarily final yet).`)).toBeVisible();
  expect(sim.walletTxs).toHaveLength(1);
  const payment = sim.payments.at(-1);
  if (payment === undefined) throw new Error('payment expected');
  return payment;
}

async function scan(page: Page, opts: { fromStart?: boolean } = {}): Promise<void> {
  await nav(page).getByRole('button', { name: 'Scan and receive' }).click();
  await page.getByLabel('Chain', { exact: true }).selectOption({ label: 'Base Sepolia' });
  const resume = page.getByRole('checkbox', { name: 'Resume from checkpoint', exact: true });
  if (opts.fromStart === true && (await resume.count()) > 0) await resume.uncheck();
  await page.getByLabel('Start block').fill('0');
  await page.getByRole('button', { name: 'Start scan' }).click();
  await expect(page.getByText(/^Finished\./)).toBeVisible({ timeout: 30_000 });
}

async function expectVerifiedMatch(page: Page, payment: MinedPayment): Promise<void> {
  await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();
  await expect(scanMatches(page)).toHaveCount(1);
  await expect(scanMatches(page).getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(payment.stealth);
  await expect(page.getByText(/Claimed, not confirmed/)).toHaveCount(0);
  await expect(page.getByText(/waiting for enough confirmations/)).toHaveCount(0);
  await expect(receiptPanel(page)).toBeVisible();
}


type OpenProfile = (opts?: { clock?: boolean }) => Promise<Profile>;

/** Runs a body against a fresh chain simulator; asserts no unexpected RPC traffic and closes every profile it opened. */
async function withChain(browser: Browser, body: (sim: ChainSim, open: OpenProfile) => Promise<void>): Promise<void> {
  const sim = new ChainSim();
  const profiles: Profile[] = [];
  try {
    await body(sim, async (opts) => {
      const profile = await newProfile(browser, sim, opts);
      profiles.push(profile);
      return profile;
    });
    expect(sim.unexpected).toEqual([]);
  } finally {
    for (const profile of profiles) await profile.context.close();
  }
}

/** Opens an independent seller profile with freshly generated keys. */
async function openSeller(open: OpenProfile): Promise<Page> {
  const { page } = await open();
  await page.goto('/');
  await generateKeys(page);
  return page;
}

/** Opens an independent payer profile with the mock wallet injected. */
async function openPayer(open: OpenProfile, sim: ChainSim, opts: { clock?: boolean } = {}): Promise<Profile> {
  const payer = await open(opts);
  await injectWallet(payer.page, sim);
  return payer;
}

/** Pays the invoice from the payer profile, then has the seller scan and see exactly that verified payment. */
async function payAndDetect(payer: Page, sim: ChainSim, link: string, seller: Page): Promise<MinedPayment> {
  const payment = await payThroughCheckout(payer, sim, link);
  await scan(seller);
  await expectVerifiedMatch(seller, payment);
  return payment;
}

test('core journey: keys -> signed invoice -> consented payment -> scan -> bound receipt -> sweep -> backup -> independent restore', async ({ browser }) => {
  // Several production-cost scrypt operations (vault save, sweep step-up, export step-up, import) run serially.
  test.setTimeout(180_000);
  await withChain(browser, async (sim, open) => {
    // 1. Seller keys, saved as an encrypted vault (production KDF).
    const { page: s } = await open();
    const workers: string[] = [];
    s.on('worker', (w) => workers.push(w.url()));
    await s.goto('/');
    await generateKeys(s);
    const identity = await identityOf(s);
    await saveVault(s);
    const vaultBefore = await readVault(s);
    expect(vaultBefore).not.toBeNull();

    // 2. Signed invoice.
    const link = await createInvoice(s, { description: 'Core journey consulting' });
    const opened = await parseFragment(new URL(link).hash);
    expect(opened.verification.signatureValid).toBe(true);
    const digest = `0x${bytesToHex(calculateInvoiceDigest(opened.invoice))}`;

    // 3. An independent payer profile reviews, consents and pays the exact previewed transaction.
    const payer = await openPayer(open, sim);
    const payment = await payThroughCheckout(payer.page, sim, link);
    const sent = sim.walletTxs[0];
    expect(sent?.to.toLowerCase()).toBe(FAKE_ROUTER.toLowerCase());
    expect(BigInt(sent?.value ?? '0x0')).toBe(500_000_000_000_000_000n);
    await expect.poll(() => walletJournal(payer.page)).toMatchObject([{ status: 'submitted', hash: payment.hash }]);

    // 4. The seller's Worker scan detects and verifies exactly that payment.
    await scan(s);
    expect(workers.some((u) => /\/assets\/scanner\.worker-/.test(u))).toBe(true);
    await expectVerifiedMatch(s, payment);

    // 5. Invoice-bound receipt: validate the signed invoice, then sign only after explicit consent.
    const panel = receiptPanel(s);
    await panel.getByLabel('Signed invoice link or fragment').fill(link);
    await panel.getByLabel('I consent to opening this invoice locally to bind the receipt.').check();
    await panel.getByRole('button', { name: 'Validate invoice for receipt' }).click();
    await expect(panel.getByText(/Validated invoice matches this scan/)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Sign receipt', exact: true })).toBeDisabled();
    await expect(s.getByLabel('Signed receipt JSON')).toHaveCount(0);
    await panel.getByLabel('I consent to signing these invoice and payment facts.').check();
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    const receiptText = await panel.getByLabel('Signed receipt JSON').inputValue();
    const receipt: unknown = JSON.parse(receiptText);
    expect(verifyReceipt(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      invoiceDigest: digest, chainId: 84532, asset: 'native', amountMinorUnits: payment.net.toString(),
      txHash: payment.hash.toLowerCase(), stealthAddress: payment.stealth.toLowerCase(), signerPublicKey: identity.signer,
    });
    await expect(panel.getByText(/matched to the validated signed invoice/)).toBeVisible();
    // The payer checks the seller's receipt against the invoice in their own profile, with its own consent.
    await openFresh(payer.page, link);
    const receiptImport = payer.page.getByRole('region', { name: 'Import a seller receipt', exact: true });
    await payer.page.getByLabel('Signed seller receipt JSON').setInputFiles({ name: 'receipt.json', mimeType: 'application/json', buffer: Buffer.from(receiptText) });
    await payer.page.getByLabel('I consent to opening private receipt details on this screen.').check();
    await payer.page.getByRole('button', { name: 'Check receipt against this invoice' }).click();
    await expect(receiptImport.getByRole('note').filter({ hasText: 'Receipt matches this invoice' })).toBeVisible();

    // 6. Direct sweep of that payment, step-up authorized with the vault passphrase; journaled, then included.
    await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
    await scanMatches(s).getByRole('button', { name: 'Sweep this payment' }).click();
    await sweepView(s).getByLabel(/Directly/).check();
    await sweepView(s).getByLabel('Destination address (your own wallet)').fill(DESTINATION);
    await sweepView(s).getByLabel('Vault passphrase (required for each sweep action)').fill(VAULT_PASS);
    const sign = sweepView(s).getByRole('button', { name: 'Sign and broadcast directly' });
    await expect(sign).toBeEnabled();
    await sign.click();
    await kdfExpect.poll(() => sim.raws.length).toBe(1);
    const raw = sim.raws[0];
    if (raw === undefined) throw new Error('raw sweep expected');
    const sweepTx = parseTransaction(raw);
    expect(sweepTx.chainId).toBe(84532);
    expect(sweepTx.nonce).toBe(0);
    expect(sweepTx.to?.toLowerCase()).toBe(DESTINATION.toLowerCase());
    expect(sweepTx.value ?? 0n).toBeGreaterThan(0n);
    expect((sweepTx.value ?? 0n) + (sweepTx.gas ?? 0n) * (sweepTx.maxFeePerGas ?? 0n)).toBeLessThanOrEqual(payment.net);
    expect((await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toLowerCase()).toBe(payment.stealth.toLowerCase());
    const sweepHash = keccak256(raw);
    const attemptCard = sweepView(s).getByRole('note').filter({ has: s.getByRole('button', { name: 'Check status', exact: true }) });
    await kdfExpect(attemptCard).toHaveCount(1);
    await expect(attemptCard.locator('code')).toHaveText(sweepHash);
    await expect(sign).toBeDisabled(); // One unresolved attempt per address: no duplicate signature.
    await expect.poll(() => readSweepJournal(s)).toMatchObject([{ chainId: 84532, owner: payment.stealth, nonce: 0, expectedHash: sweepHash, status: 'submitted' }]);
    sim.sweepMined = true;
    await sweepView(s).getByRole('button', { name: 'Check status', exact: true }).click();
    const included = sweepView(s).getByRole('note').filter({ has: s.locator('.notice-title', { hasText: 'Included on chain' }) });
    await expect(included).toHaveCount(1);
    await expect.poll(() => readSweepJournal(s)).toMatchObject([{ expectedHash: sweepHash, status: 'included' }]);
    expect(sim.raws).toHaveLength(1);

    // 7. Encrypted backup: scrypt + AES-GCM envelope, no passphrase in the file or web storage.
    const keystore = await exportKeystore(s, { stepUp: true });
    const envelope = JSON.parse(keystore) as { kdf: string; kdfParams: { N: number; r: number; p: number }; cipher: string; meta: { metaAddress: string; signer: string } };
    expect(envelope).toMatchObject({ kdf: 'scrypt', kdfParams: { N: 131072, r: 8, p: 1 }, cipher: 'AES-256-GCM', meta: { metaAddress: identity.meta, signer: identity.signer } });
    for (const secret of [BACKUP_PASS, VAULT_PASS]) {
      expect(keystore.includes(secret)).toBe(false);
      expect(await s.evaluate((x) => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(x), secret)).toBe(false);
    }

    // 8. Restore into an independent, fresh browser profile (no shared storage), memory only.
    const restored = await open();
    const r = restored.page;
    await r.goto('/');
    expect(await readVault(r)).toBeNull();
    await importKeystore(r, keystore);
    expect(await identityOf(r)).toEqual(identity);
    expect(await readVault(r)).toBeNull();
    // The restored keys independently detect the same payment.
    await scan(r);
    await expectVerifiedMatch(r, payment);

    // 9. The source profile is retained and still works: same keys, same vault bytes, can still sign invoices.
    await nav(s).getByRole('button', { name: 'Seller keys' }).click();
    expect(await identityOf(s)).toEqual(identity);
    const vaultAfter = await readVault(s);
    expect(sha256(vaultAfter ?? '')).toBe(sha256(vaultBefore ?? ''));
    const second = await parseFragment(new URL(await createInvoice(s, { description: 'After restore' })).hash);
    expect(second.verification.signatureValid).toBe(true);
  });
});

test('invoice expiry is refused at the final pay guard: nothing reaches the wallet', async ({ browser }) => {
  await withChain(browser, async (sim, open) => {
    const s = await openSeller(open);
    const link = await createShortInvoice(s, 1);
    const payer = await openPayer(open, sim, { clock: true });
    await reviewToFinalCheck(payer.page, sim, link);
    // The invoice expires between the reviewed final check and the send click.
    await payer.context.clock.setSystemTime(Date.now() + 2 * 3_600_000);
    await payer.page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(payer.page.getByText('This invoice has expired. Nothing was sent.')).toBeVisible();
    await expect(payer.page.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
    expect(sim.walletTxs).toHaveLength(0);
    expect(await walletJournal(payer.page)).toEqual([]);
    // Reopening the expired invoice offers no payment at all.
    await openFresh(payer.page, link);
    await expect(payer.page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await expect(payer.page.getByText('This payment cannot proceed')).toBeVisible();
    await expect(payer.page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(sim.walletTxs).toHaveLength(0);
  });
});

test('stale session: a lock and reimport of the same keys mid-sweep refuses the in-flight sweep and drops scan results', async ({ browser }) => {
  await withChain(browser, async (sim, open) => {
    const s = await openSeller(open);
    const identity = await identityOf(s);
    const keystore = await exportKeystore(s, { stepUp: false });
    const link = await createInvoice(s);
    const payer = await openPayer(open, sim);
    await payAndDetect(payer.page, sim, link, s);

    await scanMatches(s).getByRole('button', { name: 'Sweep this payment' }).click();
    await sweepView(s).getByLabel(/Directly/).check();
    await sweepView(s).getByLabel('Destination address (your own wallet)').fill(DESTINATION);
    const held = sim.hold('eth_gasPrice'); // The first RPC read inside the actual direct sweep, after its session capture.
    await sweepView(s).getByRole('button', { name: 'Sign and broadcast directly' }).click();
    await held.arrived;

    // Lock (wipe from memory), then reimport the very same keys while the sweep waits on its RPC.
    await nav(s).getByRole('button', { name: 'Seller keys' }).click();
    await keysView(s).getByRole('button', { name: 'Wipe keys from memory' }).click();
    await expect(keysView(s).getByText('Keys wiped from memory.', { exact: true })).toBeVisible();
    await importKeystore(s, keystore);
    expect(await identityOf(s)).toEqual(identity);
    const afterRelease = sim.methods.length;
    held.release();
    await expect.poll(() => sim.served.includes('eth_gasPrice')).toBe(true);
    // Even identical public keys start a new session: the earlier scan results and receipt eligibility are gone.
    await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
    await expect(s.getByText('No payments found yet.', { exact: true })).toBeVisible();
    await expect(receiptPanel(s)).toHaveCount(0);
    await expect(scanMatches(s)).toHaveCount(0);
    // The stale flow never asked for a nonce, signed or broadcast, and left no sweep lock behind.
    expect(sim.methods.slice(afterRelease)).not.toContain('eth_getTransactionCount');
    expect(sim.methods).not.toContain('eth_sendRawTransaction');
    expect(sim.raws).toHaveLength(0);
    expect(await readSweepJournal(s)).toEqual([]);
  });
});

test('reorg: the payment block is replaced mid-scan, the scan withdraws the match, invalidates the saved observation and offers no receipt', async ({ browser }) => {
  await withChain(browser, async (sim, open) => {
    sim.head = 50_050;
    sim.mineAt = 49_900;
    const s = await openSeller(open);
    const link = await createInvoice(s);
    const payer = await openPayer(open, sim);
    const payment = await payAndDetect(payer.page, sim, link, s);
    const ledger = s.getByRole('region', { name: 'Local payment reconciliation', exact: true });
    await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
    await ledger.getByRole('button', { name: 'Add verified payment to ledger', exact: true }).click();
    const record = ledger.locator('li.card').filter({ hasText: payment.hash });
    await expect(record).toContainText('Router-verified when scanned; historical observation, not current payment proof.');

    // A fresh multi-page scan from genesis. Its first page (blocks 0..49,999 at 50 x 1,000-block windows) is served
    // from the old fork and contains the verified payment (block 49,900: 151 confirmations at head 50,050, final; its
    // log window still within the finality tail, so not reused from the scan client's final-window cache). After that
    // page has served the payment's log and its receipt was looked up for verification, the chain reorganises from just
    // below the payment block at the next block-header read above it (progress-keyed, not tied to a specific checkpoint
    // height). Only the product's own reorg handling, triggered by the next page's checkpoint-hash comparison, can
    // withdraw the match that this run already found.
    sim.forkPlan = { payment: payment.hash, block: payment.block, from: payment.block - 10, stage: 'log' };
    const logsBefore = sim.paymentLogsServed;
    await scan(s, { fromStart: true });
    // The reorg happened inside this run, between pages.
    expect(sim.forkPlan.stage).toBe('forked');
    expect(sim.forkPlan.forkedAtRead).toBeLessThanOrEqual(sim.head);
    expect(sim.paymentLogsServed).toBe(logsBefore + 1); // This run did receive the payment's (old-fork) log.
    await expect(s.getByText(/Finished\. 1 announcements checked, 0 payments found\./)).toBeVisible();
    await expect(s.getByText('No payments found yet.', { exact: true })).toBeVisible();
    await expect(scanMatches(s)).toHaveCount(0);
    await expect(receiptPanel(s)).toHaveCount(0);
    await expect(s.getByRole('button', { name: 'Sweep this payment' })).toHaveCount(0);
    // The encrypted history keeps the observation, explicitly invalidated.
    await ledger.getByRole('button', { name: 'Lock reconciliation vault', exact: true }).click();
    await ledger.getByRole('button', { name: 'Unlock encrypted reconciliation vault', exact: true }).click();
    await expect(record).toContainText('Invalidated after a reorg; do not rely on this observation.');
    await expect(ledger.getByText('Router-verified when scanned; historical observation, not current payment proof.')).toHaveCount(0);
  });
});

test('unknown and late outcomes are shown honestly: no false success, pending until final', async ({ browser }) => {
  await withChain(browser, async (sim, open) => {
    const s = await openSeller(open);
    const link = await createInvoice(s);
    const payer = await open();
    const p = payer.page;
    await injectWallet(p, sim);
    await reviewToFinalCheck(p, sim, link);

    // The wallet hands back a hash, but the payer's RPC cannot be reached to check it.
    sim.lookups = 'reset';
    sim.mineAt = 480; // Will land in a recent block: 21 of Base Sepolia's 100 confirmations.
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(p.getByRole('heading', { name: 'Payment sent, verifying' })).toBeVisible({ timeout: 45_000 });
    const payment = sim.payments[0];
    if (payment === undefined) throw new Error('payment expected');
    await expect(p.getByText(/Your wallet already broadcast this payment\. Do not repeat it\./)).toContainText(payment.hash);
    await expect(p.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
    await expect(p.getByText(/Independently verified on your RPC/)).toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toHaveCount(0);
    await expect.poll(() => walletJournal(p)).toMatchObject([{ status: 'submitted', hash: payment.hash }]);
    expect(sim.walletTxs).toHaveLength(1);

    // Late: the transaction is visible but not final. The seller sees it pending, with no receipt to sign.
    sim.lookups = 'ok';
    await scan(s);
    await expect(scanMatches(s)).toHaveCount(1);
    await expect(scanMatches(s)).toContainText('waiting for enough confirmations');
    await expect(receiptPanel(s)).toHaveCount(0);
    // Once the chain is deep enough, the same payment is verified and becomes receipt-eligible.
    sim.head = 700;
    await scan(s);
    await expectVerifiedMatch(s, payment);
    expect(sim.walletTxs).toHaveLength(1);
  });
});
