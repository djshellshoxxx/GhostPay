import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { makeLog } from '../src/test/announcements';
import {
  FAKE_ANNOUNCER,
  FAKE_FEE_RECIPIENT,
  FAKE_ROUTER,
  FAKE_SWEEP_RELAYER,
  fakeManifestJson,
} from '../src/test/fakeManifest';
import { decodeAbiParameters, encodeFunctionData, keccak256, toBytes } from 'viem';
import { ghostPayRouterAbi, grossForNet, type Address, type Hex } from '@ghostpay/chain-adapters';
import { parseMetadata } from '@ghostpay/core-crypto';
import { bindReceiptToInvoice, verifyReceipt } from '../src/lib/receipts';

/** Tiny fake runtime code per contract; the served manifest carries their real keccak256 so the on-chain read-back passes. */
const FAKE_CODE: Record<string, `0x${string}`> = {
  [FAKE_ROUTER]: '0x60016000',
  [FAKE_SWEEP_RELAYER]: '0x60026000',
  [FAKE_ANNOUNCER.toLowerCase()]: '0x60036000',
};
const word = (hex: string): string => `0x${hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
const SEL = (sig: string): string => keccak256(toBytes(sig)).slice(0, 10);
/** Manifest served to the app: bytecodeHashes match FAKE_CODE so the fail-closed on-chain verification succeeds. */
function e2eManifestJson(chainId: number): string {
  const m = JSON.parse(fakeManifestJson(chainId)) as { bytecodeHashes: Record<string, string> };
  m.bytecodeHashes = {
    router: keccak256(FAKE_CODE[FAKE_ROUTER] as `0x${string}`),
    sweepRelayer: keccak256(FAKE_CODE[FAKE_SWEEP_RELAYER] as `0x${string}`),
  };
  return JSON.stringify(m);
}
import { ORIGIN, createInvoice, generateKeys, openFresh } from './helpers';

const RPC = 'https://rpc.e2e.test';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

interface SentTx {
  from: string;
  to: string;
  data: string;
  value: string;
}

/** Serves the (test-only, fake) manifest and a tiny JSON-RPC node; everything else off-origin stays blocked. */
async function mockNetwork(
  context: BrowserContext,
  state: {
    sent?: SentTx;
    logs?: unknown[];
    /** Optional canonical tx/receipt fixture, used only by the verified-ERC20 scan scenario. */
    evidence?: { txHash: string; transaction: unknown; receipt: unknown };
  },
): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await context.route('**/deployments/84532.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: e2eManifestJson(84532) }),
  );
  await context.route(`${RPC}/**`, async (route: Route) => {
    const req = route.request();
    requests.push(req.url());
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = JSON.parse(req.postData() ?? '{}') as { id: number; method: string; params: unknown[] };
    const reply = (result: unknown): Promise<void> =>
      route.fulfill({
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result }),
      });
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
      case 'eth_getLogs': {
        const f = body.params[0] as {
          fromBlock: string;
          toBlock: string;
          address?: string | string[];
          topics?: (string | string[] | null)[];
        };
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        const wantAddresses =
          f.address === undefined ? undefined : (Array.isArray(f.address) ? f.address : [f.address]).map((a) => a.toLowerCase());
        return reply(
          (state.logs ?? []).filter((raw) => {
            const l = raw as { blockNumber: string; address: string; topics: string[] };
            const n = parseInt(l.blockNumber, 16);
            if (n < from || n > to) return false;
            if (wantAddresses !== undefined && !wantAddresses.includes(l.address.toLowerCase())) return false;
            return (f.topics ?? []).every((want, i) => {
              if (want === null || want === undefined) return true;
              return (Array.isArray(want) ? want : [want]).some((w) => w.toLowerCase() === l.topics[i]?.toLowerCase());
            });
          }),
        );
      }
      case 'eth_getTransactionByHash':
        if (state.evidence !== undefined) {
          return reply(String(body.params[0]).toLowerCase() === state.evidence.txHash.toLowerCase() ? state.evidence.transaction : null);
        }
        return reply(
          state.sent === undefined
            ? null
            : {
                hash: body.params[0],
                from: state.sent.from,
                to: state.sent.to,
                input: state.sent.data,
                value: state.sent.value,
                chainId: '0x14a34',
              },
        );
      case 'eth_getTransactionReceipt':
        if (state.evidence !== undefined) {
          return reply(String(body.params[0]).toLowerCase() === state.evidence.txHash.toLowerCase() ? state.evidence.receipt : null);
        }
        return reply(
          state.sent === undefined ? null : { status: '0x1', blockNumber: '0x1f5', to: state.sent.to },
        );
      case 'eth_gasPrice':
        return reply('0x3b9aca00');
      case 'eth_getCode':
        return reply(FAKE_CODE[String(body.params[0]).toLowerCase()] ?? '0x');
      case 'eth_call': {
        const call = body.params[0] as { to: string; data: string };
        const sel = call.data.slice(0, 10);
        if (call.to.toLowerCase() === FAKE_ROUTER) {
          if (sel === SEL('FEE_RECIPIENT()')) return reply(word(FAKE_FEE_RECIPIENT));
          if (sel === SEL('ANNOUNCER()')) return reply(word(FAKE_ANNOUNCER));
          if (sel === SEL('FEE_BPS()')) return reply(word((25).toString(16)));
        }
        return reply(null);
      }
      default:
        return reply(null);
    }
  });
  return { requests };
}

interface WalletControls {
  holdSend: boolean;
  pending: boolean;
  changeAccountOnRecheck: boolean;
  releaseSend(): void;
  changeAccount(): void;
  replaceProvider(): void;
}

/** An EIP-6963 wallet injected before any page script runs. */
async function injectWallet(page: Page, state: { sent?: SentTx; sendCalls?: number }): Promise<void> {
  await page.exposeFunction('__recordTx', (tx: SentTx) => {
    state.sent = tx;
    state.sendCalls = (state.sendCalls ?? 0) + 1;
  });
  await page.addInitScript(() => {
    let account = '0x5555555555555555555555555555555555555555';
    const w = window as unknown as { __mutate?: boolean; __recordTx: (tx: unknown) => Promise<void>; __e2eWallet: WalletControls };
    const listeners = new Map<string, Set<() => void>>();
    let resolveSend: (() => void) | undefined;
    const controls: WalletControls = {
      holdSend: false,
      pending: false,
      changeAccountOnRecheck: false,
      releaseSend: () => { resolveSend?.(); },
      changeAccount: () => {
        account = '0x6666666666666666666666666666666666666666';
        for (const listener of listeners.get('accountsChanged') ?? []) listener();
      },
      replaceProvider: () => {
        for (const listener of listeners.get('disconnect') ?? []) listener();
        announcedProvider = { ...provider };
      },
    };
    w.__e2eWallet = controls;
    const provider = {
      on: (event: string, listener: () => void): void => {
        const group = listeners.get(event) ?? new Set<() => void>();
        group.add(listener);
        listeners.set(event, group);
      },
      removeListener: (event: string, listener: () => void): void => { listeners.get(event)?.delete(listener); },
      request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [account];
          case 'eth_chainId':
            return '0x14a34';
          case 'net_version':
            if (controls.changeAccountOnRecheck) {
              controls.changeAccountOnRecheck = false;
              controls.changeAccount();
            }
            return '84532';
          case 'eth_sendTransaction': {
            const tx = { ...(params?.[0] as Record<string, string>) };
            if (w.__mutate === true) tx['data'] = `${tx['data']?.slice(0, -2) ?? ''}ff`;
            await w.__recordTx(tx);
            if (controls.holdSend) {
              controls.pending = true;
              await new Promise<void>((resolve) => { resolveSend = resolve; });
              controls.pending = false;
            }
            return `0x${'9'.repeat(64)}`;
          }
          default:
            throw new Error(`unsupported ${method}`);
        }
      },
    };
    let announcedProvider = provider;
    window.addEventListener('eip6963:requestProvider', () => {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: { info: { uuid: 'e2e-wallet', name: 'E2E Wallet', icon: '', rdns: 'test.e2e' }, provider: announcedProvider },
        }),
      );
    });
  });
}

async function configureRpc(page: Page): Promise<void> {
  await page.addInitScript((rpc) => {
    window.localStorage.setItem('ghostpay.settings.v1', JSON.stringify({ rpcUrls: { '84532': rpc } }));
  }, RPC);
}

test.describe('with a (fake, test-only) manifest, a mock wallet and a mock RPC', () => {
  test('pays a native invoice: preview equals calldata, the wallet gets exactly that, and the user RPC confirms it', async ({
    page,
    context,
  }) => {
    const state: { sent?: SentTx } = {};
    await mockNetwork(context, state);
    await injectWallet(page, state);
    await configureRpc(page);
    await page.goto('/');
    await generateKeys(page);
    const link = await createInvoice(page);
    await openFresh(page, link);

    await expect(page.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await expect(page.getByText('You pay (gross)')).toBeVisible();
    await expect(page.getByText(FAKE_ROUTER).first()).toBeVisible();
    await expect(page.getByText(FAKE_FEE_RECIPIENT).first()).toBeVisible();
    await expect(
      page.getByText(/GhostPay charges 0\.25 % on payments made through its checkout contract/),
    ).toBeVisible();

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
  });

  test('retains a late wallet hash after seller-session, account and provider changes, and requires confirmed clearing before retry', async ({ page, context }) => {
    const state: { sent?: SentTx; sendCalls?: number } = {};
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
    await page.evaluate(() => { (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.holdSend = true; });
    await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.pending)).toBe(true);
    const journal = (): Promise<unknown[]> => page.evaluate(() => JSON.parse(window.sessionStorage.getItem('ghostpay.wallet-attempts.v1') ?? '[]') as unknown[]);
    await expect.poll(journal).toMatchObject([{ status: 'unknown', account: `0x${'5'.repeat(40)}` }]);
    expect(state.sendCalls).toBe(1);

    // A real UI session change unmounts checkout while the mock provider promise stays unresolved.
    await generateKeys(page);
    await page.evaluate(() => {
      const wallet = (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet;
      wallet.changeAccount();
      wallet.replaceProvider();
      wallet.releaseSend();
    });
    const hash = `0x${'9'.repeat(64)}`;
    await expect.poll(journal).toMatchObject([{ status: 'submitted', hash, account: `0x${'5'.repeat(40)}` }]);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Pay', exact: true }).click();
    const attempts = page.getByRole('region', { name: 'Wallet attempt journal' });
    await expect(attempts).toContainText(hash);
    await expect(attempts).toContainText('cannot cancel an in-flight wallet request or roll back a transaction');
    await expect(page.getByText(/Nothing was sent|request (?:was |has been )?cancelled|transaction (?:was |has been )?rolled back/i)).toHaveCount(0);

    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Connect E2E Wallet/ }).click();
    await page.getByRole('button', { name: 'Prepare payment' }).click();
    await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(page.getByRole('alert')).toContainText('previous wallet attempt');
    expect(state.sendCalls).toBe(1);
    await expect.poll(journal).toHaveLength(1);

    const clear = attempts.getByRole('button', { name: 'Clear this attempt after checking my wallet' });
    page.once('dialog', (dialog) => { void dialog.dismiss(); });
    await clear.click();
    await expect.poll(journal).toHaveLength(1);
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('It cannot cancel or roll back an in-flight request');
      void dialog.accept();
    });
    await clear.click();
    await expect.poll(journal).toHaveLength(0);
    expect(state.sendCalls).toBe(1); // Clearing itself never starts another wallet request.
  });

  test('refuses a changed wallet account during the final authority recheck before send', async ({ page, context }) => {
    const state: { sent?: SentTx; sendCalls?: number } = {};
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
    await page.evaluate(() => { (window as unknown as { __e2eWallet: WalletControls }).__e2eWallet.changeAccountOnRecheck = true; });
    await page.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(page.getByRole('alert')).toContainText('changed');
    expect(state.sendCalls ?? 0).toBe(0);
    expect(state.sent).toBeUndefined();
    expect(await page.evaluate(() => window.sessionStorage.getItem('ghostpay.wallet-attempts.v1'))).toBeNull();
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

  test('scans in a real Web Worker under the CSP, finds my payment, verifies it, signs a receipt only on consent, and stores tags only as ciphertext', async ({
    page,
    context,
  }) => {
    const state: Parameters<typeof mockNetwork>[1] = {};
    const net = await mockNetwork(context, state);
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    const cspConsole: string[] = [];
    page.on('console', (m) => {
      if (/content security policy/i.test(m.text())) cspConsole.push(m.text());
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        w.__csp.push(`${e.violatedDirective}|${e.blockedURI}`);
      });
    });
    const offOrigin: string[] = [];
    page.on('request', (r) => {
      const o = new URL(r.url()).origin;
      if (o !== ORIGIN && o !== RPC && r.url().startsWith('http')) offOrigin.push(r.url());
    });
    await configureRpc(page);
    await page.goto('/');
    const meta = await generateKeys(page);
    // Capture the seller key before scanning/signing, independently of the resulting receipt.
    const sellerSigner = ((await page.locator('code', { hasText: /^0[23][0-9a-f]{64}$/ }).textContent()) ?? '').trim();
    expect(sellerSigner).toMatch(/^0[23][0-9a-f]{64}$/);
    const mine = makeLog({
      announcer: FAKE_ANNOUNCER,
      metaAddress: meta,
      block: 120,
      index: 1,
      caller: FAKE_ROUTER,
    });
    // Full canonical evidence, derived on the Node side from public data only (same shape as Scan.test.tsx).
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const topicAddress = (a: string): string => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
    const [ephemeral, metadata] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], mine.log.data as Hex);
    const parsed = parseMetadata(metadata);
    if (parsed.kind !== 'erc20') throw new Error('ERC20 fixture required');
    const txHash = mine.log.transactionHash as string;
    const payer = `0x${'7'.repeat(40)}`;
    const transfer = {
      address: parsed.token.toLowerCase(),
      topics: [TRANSFER_TOPIC, topicAddress(payer), topicAddress(mine.stealthAddress)],
      data: `0x${parsed.netAmount.toString(16).padStart(64, '0')}`,
      blockNumber: mine.log.blockNumber,
      blockHash: mine.log.blockHash,
      transactionHash: txHash,
      logIndex: '0x0',
    };
    const common = { to: FAKE_ROUTER, from: payer, blockHash: mine.log.blockHash, blockNumber: mine.log.blockNumber };
    state.logs = [mine.log, transfer];
    state.evidence = {
      txHash,
      transaction: {
        ...common,
        hash: txHash,
        value: '0x0',
        input: encodeFunctionData({ abi: ghostPayRouterAbi, functionName: 'payERC20', args: [parsed.token, mine.stealthAddress as Address, grossForNet(parsed.netAmount), parsed.netAmount, 9999999999n, ephemeral, metadata] }),
      },
      receipt: { ...common, status: '0x1', transactionHash: txHash, logs: [transfer, mine.log] },
    };

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Scan and receive' })
      .click();
    await page.getByLabel('Chain').selectOption({ label: 'Base Sepolia' });
    await page.getByLabel('Start block').fill('0');
    await page.getByRole('button', { name: 'Start scan' }).click();
    await expect(page.getByRole('heading', { name: 'Payments found' })).toBeVisible();
    await expect(page.getByText(mine.stealthAddress).first()).toBeVisible();
    await expect(page.getByText(/Finished\. 1 announcements checked, 1 payments found\./)).toBeVisible();
    expect(workers.some((u) => u.startsWith(`${ORIGIN}/assets/scanner.worker-`))).toBe(true);
    expect(offOrigin).toEqual([]);
    expect(net.requests.length).toBeGreaterThan(0);

    // The matching Transfer evidence makes this a verified payment, not a claim.
    await expect(page.getByText(/Claimed, not confirmed/)).toHaveCount(0);
    const panel = page.getByRole('region', { name: 'Seller-signed receipt' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('The invoice digest is entered manually and is not matched against invoice contents.');
    // Nothing is signed without explicit consent.
    await expect(page.getByLabel('Signed receipt JSON')).toHaveCount(0);

    // Invalid manual input is refused through the UI and still creates no receipt.
    const digestInput = page.getByLabel('Invoice digest (entered manually)');
    await digestInput.fill('not-a-digest');
    await panel.getByRole('button', { name: 'Sign receipt' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Receipt invoice digest is invalid.' })).toBeVisible();
    await expect(page.getByLabel('Signed receipt JSON')).toHaveCount(0);

    const invoiceDigest = `0x${'b'.repeat(64)}`;
    await digestInput.fill(invoiceDigest);
    await panel.getByRole('button', { name: 'Sign receipt' }).click();
    const jsonBox = page.getByLabel('Signed receipt JSON');
    await expect(jsonBox).toBeVisible();
    const decoded: unknown = JSON.parse(await jsonBox.inputValue());
    expect(verifyReceipt(decoded)).toBe(true);
    const article = panel.locator('article.receipt-print');
    const fact = (label: string): string => `dt:text-is("${label}") + dd`;
    const uiSigner = ((await article.locator(fact('Signer public key')).textContent()) ?? '').trim();
    expect(uiSigner).toBe(sellerSigner);
    const uiTx = ((await article.locator(fact('Transaction')).textContent()) ?? '').trim();
    const uiRecipient = ((await article.locator(fact('Recipient')).textContent()) ?? '').trim();
    expect(uiTx.toLowerCase()).toBe(txHash.toLowerCase());
    expect(uiRecipient.toLowerCase()).toBe(mine.stealthAddress.toLowerCase());
    await expect(article.locator(fact('Network'))).toContainText('84532');
    await expect(article.locator(fact('Asset and amount'))).toContainText(`${parsed.netAmount.toString()} base units`);
    await expect(article.locator(fact('Invoice digest'))).toContainText('seller-supplied, not matched');
    expect(decoded).toMatchObject({
      version: 1,
      chainId: 84532,
      txHash: txHash.toLowerCase(),
      stealthAddress: mine.stealthAddress.toLowerCase(),
      asset: parsed.token.toLowerCase(),
      amountMinorUnits: parsed.netAmount.toString(),
      invoiceDigest,
      signerPublicKey: sellerSigner,
    });
    // Independent Node-side checks: correct facts are accepted, a mismatched fact and a tampered receipt are rejected.
    const binding = {
      invoiceDigest,
      chainId: 84532,
      asset: parsed.token.toLowerCase(),
      amountMinorUnits: parsed.netAmount.toString(),
      invoiceSignerPublicKey: sellerSigner,
      invoiceSignatureValid: false,
      trustedSignerPublicKey: sellerSigner,
      txHash,
      stealthAddress: mine.stealthAddress,
    };
    expect(bindReceiptToInvoice(decoded, binding).signerMatch).toBe('explicitly-trusted-key');
    expect(() => bindReceiptToInvoice(decoded, { ...binding, amountMinorUnits: (parsed.netAmount + 1n).toString() })).toThrow(/amount/);
    expect(verifyReceipt({ ...(decoded as Record<string, unknown>), amountMinorUnits: (parsed.netAmount + 1n).toString() })).toBe(false);

    // Real built Worker, no off-origin surprises, no CSP violations (CSP itself unchanged).
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(cspConsole).toEqual([]);
    expect(offOrigin).toEqual([]);

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
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(
      'Acme',
    );

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

  test('opens the checkout popup for a same-origin link; refuses other origins', async ({
    page,
    context,
  }) => {
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
});
