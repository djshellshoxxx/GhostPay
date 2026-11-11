import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { invoiceDigest as calculateInvoiceDigest, parseFragment } from '@ghostpay/invoice-schema';
import { ANNOUNCEMENT_TOPIC, decodePaymentCalldata, type Address, type Hex } from '@ghostpay/chain-adapters';
import { bytesToHex } from '@noble/hashes/utils.js';
import { keccak256, parseTransaction, recoverTransactionAddress } from 'viem';
import { verifyReceipt } from '../src/lib/receipts';
import { generateKeys, openFresh } from './helpers';
import { ANVIL_ACCOUNTS, Anvil, DevnetNetwork, DevnetWallet, loadDevnet } from './devnet/chain';
import { createInvoiceAt, identityOf, nav, receiptPanel, reviewToFinalCheck, scan, scanMatches, sweepJournal, sweepView, walletJournal } from './devnet/ui';

/*
 * Real-chain browser journey: the BUILT app (vite build + preview, bundled signed manifest) against a local anvil with
 * the real GhostPay contracts. Every payment and sweep is a real transaction mined by anvil; the app reads the chain
 * through its normal RPC client (Playwright only relays bytes from the app's https RPC URL to the loopback anvil). The
 * test side reads anvil directly for independent on-chain assertions and controls mining. Public anvil dev accounts
 * only; no real funds, keys or networks. Run through scripts/beta/browser-devnet.sh.
 */

const dn = loadDevnet();
const anvil = new Anvil(dn.rpcUrl);
const PRICE = 500_000_000_000_000_000n; // 0.5 ETH, the invoice's fixed native amount
const FINALITY = 100; // Base Sepolia finalityDepth in chain-adapters' chain table
const txHashes = new Set<string>();

interface Profile { context: BrowserContext; page: Page }

async function withProfiles(browser: Browser, origin: string, body: (open: () => Promise<Profile>, net: DevnetNetwork) => Promise<void>): Promise<void> {
  const net = new DevnetNetwork(dn, origin);
  const profiles: Profile[] = [];
  try {
    await body(async () => {
      const context = await browser.newContext({ baseURL: origin, serviceWorkers: 'block', acceptDownloads: true });
      await net.install(context);
      const page = await context.newPage();
      profiles.push({ context, page });
      return { context, page };
    }, net);
    expect(net.unexpected).toEqual([]);
  } finally {
    await anvil.automine(true);
    for (const p of profiles) await p.context.close();
  }
}

async function openSeller(open: () => Promise<Profile>): Promise<Page> {
  const { page } = await open();
  await page.goto('/');
  await generateKeys(page);
  return page;
}

async function openPayer(open: () => Promise<Profile>, account: Address): Promise<{ page: Page; wallet: DevnetWallet }> {
  const { page } = await open();
  const wallet = new DevnetWallet(anvil, account);
  await wallet.inject(page);
  return { page, wallet };
}

test.afterAll(() => {
  console.log(`devnet journey: ${String(txHashes.size)} real anvil transactions asserted on chain: ${[...txHashes].join(', ')}`);
});

test('real chain: keys -> signed invoice -> consented payment (pending, then included) -> reload keeps hash, no duplicate -> scan (pending, then final) -> bound receipt -> direct sweep -> no second sweep', async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  const origin = baseURL ?? '';
  await withProfiles(browser, origin, async (open, net) => {
    // 1. Seller keys and a signed invoice.
    const s = await openSeller(open);
    const identity = await identityOf(s);
    const link = await createInvoiceAt(s, origin, 'Devnet consulting');
    const opened = await parseFragment(new URL(link).hash);
    expect(opened.verification.signatureValid).toBe(true);
    expect(opened.invoice.chainId).toBe(84532);
    const digest = `0x${bytesToHex(calculateInvoiceDigest(opened.invoice))}`;

    // 2. Payer reviews and consents; nothing reaches the wallet (or the chain) before the send click.
    const payer = await openPayer(open, ANVIL_ACCOUNTS.payer);
    const p = payer.page;
    const payerNonce = await anvil.nonce(ANVIL_ACCOUNTS.payer);
    const feeBefore = await anvil.balance(dn.feeRecipient);
    await openFresh(p, link);
    await reviewToFinalCheck(p, dn.router, payer.wallet.name);
    expect(payer.wallet.sends).toHaveLength(0);
    expect(await anvil.nonce(ANVIL_ACCOUNTS.payer)).toBe(payerNonce);

    // 3. Real transaction: held in anvil's mempool first (automine off), so the app's pending state is observable.
    await anvil.automine(false);
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect.poll(() => payer.wallet.hashes.length).toBe(1);
    const payHash = payer.wallet.hashes[0] as Hex;
    // Pending: the app waits for inclusion, the send control is disarmed and the returned hash is journaled in the tab.
    await expect(p.getByRole('status').filter({ hasText: 'Waiting for inclusion…' })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Send payment in my wallet' })).toBeDisabled();
    await expect(p.getByRole('region', { name: 'Wallet attempt journal' })).toContainText(payHash);
    const pending = await anvil.tx(payHash);
    expect(pending?.blockNumber).toBeNull();
    await expect(p.getByRole('heading', { name: 'Submitted' })).toHaveCount(0);
    await expect.poll(() => walletJournal(p)).toMatchObject([{ status: 'submitted', hash: payHash, chainId: 84532, kind: 'payment' }]);

    // Mined: the app's own receipt poll moves from pending to included, independently verified on its RPC.
    await anvil.mine(1);
    await anvil.automine(true);
    const payReceipt = await anvil.receipt(payHash);
    expect(payReceipt?.status).toBe('0x1');
    const payBlock = Number(BigInt(payReceipt?.blockNumber ?? '0x0'));
    await expect(p.getByRole('heading', { name: 'Submitted' })).toBeVisible({ timeout: 30_000 });
    await expect(p.getByText(/Independently verified on your RPC/)).toBeVisible();
    await expect(p.getByText(`Status: included in block ${String(payBlock)} (not necessarily final yet).`)).toBeVisible();
    txHashes.add(payHash);

    // On-chain truth: the router call is exactly the previewed payNative, split into seller net + 25 bps fee.
    const minedTx = await anvil.tx(payHash);
    expect(minedTx?.from.toLowerCase()).toBe(ANVIL_ACCOUNTS.payer.toLowerCase());
    expect(minedTx?.to?.toLowerCase()).toBe(dn.router.toLowerCase());
    expect(BigInt(minedTx?.value ?? '0x0')).toBe(PRICE);
    const preview = decodePaymentCalldata({ to: dn.router, data: (minedTx?.input ?? '0x') as Hex, value: PRICE }, 84532);
    const announcement = payReceipt?.logs.find((l) => l.address.toLowerCase() === dn.announcer.toLowerCase() && l.topics[0]?.toLowerCase() === ANNOUNCEMENT_TOPIC.toLowerCase());
    expect(announcement).toBeDefined();
    const stealth = preview.stealth;
    expect(await anvil.balance(stealth)).toBe(preview.net);
    const feePaid = (await anvil.balance(dn.feeRecipient)) - feeBefore;
    expect(feePaid + preview.net).toBe(PRICE);
    expect(feePaid).toBe((PRICE * 25n) / 10_000n);

    // 4. Reload after submission: the hash survives in the tab journal and the same payment cannot be sent again.
    await p.reload();
    const attempts = p.getByRole('region', { name: 'Wallet attempt journal' });
    await expect(attempts).toContainText(payHash);
    await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByRole('button', { name: `Connect ${payer.wallet.name}` }).click();
    await p.getByRole('button', { name: 'Prepare payment' }).click();
    await expect(p.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible({ timeout: 30_000 });
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(p.getByText('A previous wallet attempt for this action already exists in this tab.', { exact: false })).toBeVisible();
    expect(payer.wallet.sends).toHaveLength(1);
    expect(await anvil.nonce(ANVIL_ACCOUNTS.payer)).toBe(payerNonce + 1);

    // 5. Seller scan (scanner Worker, real eth_getLogs): first not final, then final after the chain is deep enough.
    await scan(s);
    await expect(scanMatches(s)).toHaveCount(1);
    await expect(scanMatches(s)).toContainText('waiting for enough confirmations');
    await expect(receiptPanel(s)).toHaveCount(0);
    await anvil.mine(FINALITY + 1);
    await scan(s);
    await expect(s.getByText(/payments found/)).toContainText('1 payments found');
    await expect(scanMatches(s)).toHaveCount(1);
    await expect(scanMatches(s).getByRole('paragraph').filter({ hasText: 'One-time address:' }).locator('code')).toHaveText(stealth);
    await expect(s.getByText(/waiting for enough confirmations/)).toHaveCount(0);
    await expect(receiptPanel(s)).toBeVisible();

    // 6. Invoice-bound receipt, with both consents; verified independently and by the payer against the invoice.
    const panel = receiptPanel(s);
    await panel.getByLabel('Signed invoice link or fragment').fill(link);
    await panel.getByLabel('I consent to opening this invoice locally to bind the receipt.').check();
    await panel.getByRole('button', { name: 'Validate invoice for receipt' }).click();
    await expect(panel.getByText(/Validated invoice matches this scan/)).toBeVisible();
    await panel.getByLabel('I consent to signing these invoice and payment facts.').check();
    await panel.getByRole('button', { name: 'Sign receipt', exact: true }).click();
    const receiptText = await panel.getByLabel('Signed receipt JSON').inputValue();
    const receipt: unknown = JSON.parse(receiptText);
    expect(verifyReceipt(receipt)).toBe(true);
    expect(receipt).toMatchObject({
      invoiceDigest: digest, chainId: 84532, asset: 'native', amountMinorUnits: preview.net.toString(),
      txHash: payHash.toLowerCase(), stealthAddress: stealth.toLowerCase(), signerPublicKey: identity.signer,
    });
    await openFresh(p, link);
    await p.getByLabel('Signed seller receipt JSON', { exact: true }).setInputFiles({ name: 'receipt.json', mimeType: 'application/json', buffer: Buffer.from(receiptText) });
    await p.getByLabel('I consent to opening private receipt details on this screen.').check();
    await p.getByRole('button', { name: 'Check receipt against this invoice' }).click();
    await expect(p.getByRole('region', { name: 'Import a seller receipt', exact: true }).getByRole('note').filter({ hasText: 'Receipt matches this invoice' })).toBeVisible();

    // 7. Direct sweep to the seller's own wallet: a real EIP-1559 transfer signed by the stealth key in the browser.
    const destBefore = await anvil.balance(ANVIL_ACCOUNTS.destination);
    const sweepRawBefore = net.sentRaw.length;
    await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
    await scanMatches(s).getByRole('button', { name: 'Sweep this payment' }).click();
    await sweepView(s).getByLabel(/Directly/).check();
    await sweepView(s).getByLabel('Destination address (your own wallet)').fill(ANVIL_ACCOUNTS.destination);
    const sign = sweepView(s).getByRole('button', { name: 'Sign and broadcast directly' });
    await expect(sign).toBeEnabled();
    await sign.click();
    await expect.poll(() => net.sentRaw.length, { timeout: 30_000 }).toBe(sweepRawBefore + 1);
    const raw = net.sentRaw.at(-1) as `0x02${string}`;
    const sweepHash = keccak256(raw);
    const sweepTx = parseTransaction(raw);
    expect(sweepTx.chainId).toBe(84532);
    expect(sweepTx.nonce).toBe(0);
    expect(sweepTx.to?.toLowerCase()).toBe(ANVIL_ACCOUNTS.destination.toLowerCase());
    expect((await recoverTransactionAddress({ serializedTransaction: raw })).toLowerCase()).toBe(stealth.toLowerCase());
    await expect.poll(async () => (await anvil.receipt(sweepHash))?.status, { timeout: 30_000 }).toBe('0x1');
    txHashes.add(sweepHash);
    const destGain = (await anvil.balance(ANVIL_ACCOUNTS.destination)) - destBefore;
    expect(destGain).toBe(sweepTx.value ?? -1n);
    expect(destGain).toBeGreaterThan((preview.net * 99n) / 100n); // fees are a tiny share of the payment
    const dust = await anvil.balance(stealth);
    expect(dust).toBeLessThan(preview.net - destGain);
    expect(await anvil.nonce(stealth)).toBe(1);
    const attemptCard = sweepView(s).getByRole('note').filter({ hasText: sweepHash });
    await expect(attemptCard).toHaveCount(1);
    await expect.poll(() => sweepJournal(s)).toMatchObject([{ chainId: 84532, owner: stealth, nonce: 0, expectedHash: sweepHash }]);
    const check = sweepView(s).getByRole('button', { name: 'Check status', exact: true });
    if (await check.count() > 0) await check.click();
    await expect(sweepView(s).getByRole('note').filter({ has: s.locator('.notice-title', { hasText: 'Included on chain' }) })).toHaveCount(1);
    await expect.poll(() => sweepJournal(s)).toMatchObject([{ expectedHash: sweepHash, status: 'included' }]);

    // 8. Already swept: a second sweep of the same one-time address is refused before signing; nothing new on chain.
    await nav(s).getByRole('button', { name: 'Scan and receive' }).click();
    await scanMatches(s).getByRole('button', { name: 'Sweep this payment' }).click();
    await sweepView(s).getByLabel(/Directly/).check();
    await sweepView(s).getByLabel('Destination address (your own wallet)').fill(ANVIL_ACCOUNTS.destination);
    const again = sweepView(s).getByRole('button', { name: 'Sign and broadcast directly' });
    if (dust > 0n) {
      await expect(again).toBeEnabled();
      await again.click();
      await expect(sweepView(s).getByText('The balance does not cover the network fee.', { exact: false })).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(again).toBeDisabled();
    }
    expect(net.sentRaw.length).toBe(sweepRawBefore + 1);
    expect(await anvil.nonce(stealth)).toBe(1);
    expect(await anvil.balance(ANVIL_ACCOUNTS.destination)).toBe(destBefore + destGain);
  });
});

test('real chain: reload while the payment is still pending keeps its hash and blocks a duplicate; it is mined exactly once', async ({ browser, baseURL }) => {
  const origin = baseURL ?? '';
  await withProfiles(browser, origin, async (open) => {
    const s = await openSeller(open);
    const link = await createInvoiceAt(s, origin, 'Devnet reload');
    const payer = await openPayer(open, ANVIL_ACCOUNTS.reloadPayer);
    const p = payer.page;
    const nonce = await anvil.nonce(ANVIL_ACCOUNTS.reloadPayer);
    await openFresh(p, link);
    await reviewToFinalCheck(p, dn.router, payer.wallet.name);
    await anvil.automine(false);
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect.poll(() => payer.wallet.hashes.length).toBe(1);
    const hash = payer.wallet.hashes[0] as Hex;
    await expect(p.getByRole('status').filter({ hasText: 'Waiting for inclusion…' })).toBeVisible();
    expect((await anvil.tx(hash))?.blockNumber).toBeNull();

    // Reload mid-flow: the transaction is still only in the mempool.
    await p.reload();
    await expect(p.getByRole('region', { name: 'Wallet attempt journal' })).toContainText(hash);
    await expect.poll(() => walletJournal(p)).toMatchObject([{ status: 'submitted', hash }]);
    await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByRole('button', { name: `Connect ${payer.wallet.name}` }).click();
    await p.getByRole('button', { name: 'Prepare payment' }).click();
    await expect(p.getByRole('heading', { name: 'Final check before your wallet' })).toBeVisible({ timeout: 30_000 });
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(p.getByText('A previous wallet attempt for this action already exists in this tab.', { exact: false })).toBeVisible();
    expect(payer.wallet.sends).toHaveLength(1);
    expect((await anvil.tx(hash))?.blockNumber).toBeNull();

    await anvil.mine(1);
    await anvil.automine(true);
    expect((await anvil.receipt(hash))?.status).toBe('0x1');
    txHashes.add(hash);
    expect(await anvil.nonce(ANVIL_ACCOUNTS.reloadPayer)).toBe(nonce + 1);
  });
});

test('real chain: a wallet on the wrong chain cannot connect, and a network change before send blocks the payment', async ({ browser, baseURL }) => {
  const origin = baseURL ?? '';
  await withProfiles(browser, origin, async (open) => {
    const s = await openSeller(open);
    const link = await createInvoiceAt(s, origin, 'Devnet wrong chain');
    const payer = await openPayer(open, ANVIL_ACCOUNTS.wrongChainPayer);
    const p = payer.page;
    const nonce = await anvil.nonce(ANVIL_ACCOUNTS.wrongChainPayer);

    // The wallet sits on 31337 and cannot switch: connection is refused.
    payer.wallet.chainOverride = '0x7a69';
    await openFresh(p, link);
    await expect(p.getByRole('heading', { level: 2, name: 'Review payment' })).toBeVisible();
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByRole('button', { name: `Connect ${payer.wallet.name}` }).click();
    await expect(p.getByText('Your wallet is on chain 31337 but this invoice requires chain 84532.', { exact: false })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Prepare payment' })).toHaveCount(0);

    // Connected on the right chain, then the wallet changes network before the send click: refused, nothing sent.
    payer.wallet.chainOverride = undefined;
    await openFresh(p, link);
    await reviewToFinalCheck(p, dn.router, payer.wallet.name);
    payer.wallet.chainOverride = '0x7a69';
    await p.getByRole('button', { name: 'Send payment in my wallet' }).click();
    await expect(p.getByText('The wallet network changed. Reconnect and review again.', { exact: false })).toBeVisible();
    await expect(p.getByRole('heading', { name: 'Payment sent, verifying' })).toHaveCount(0);
    expect(payer.wallet.sends).toHaveLength(0);
    expect(await walletJournal(p)).toEqual([]);
    expect(await anvil.nonce(ANVIL_ACCOUNTS.wrongChainPayer)).toBe(nonce);
  });
});
