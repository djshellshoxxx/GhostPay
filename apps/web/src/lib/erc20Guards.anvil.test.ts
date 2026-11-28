import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAINS, ChainAdapterError, buildPaymentTx, createClient, loadDeployment, routerSplit } from '@ghostpay/chain-adapters';
import { deriveStealthPayment } from '@ghostpay/core-crypto';
import { toFunctionSelector } from 'viem';
import { stubJournalWindow } from '../test/locks';
import { AnvilWallet, KEYS, erc20AnvilAvailable, erc20AnvilRequired, startLocalChain, FEE_RECIPIENT, type LocalChain } from './erc20Anvil.testutil';
import { approveIfNeeded, finalize, foreignRouterPayment, newSeller, payerSetup, prepareAndSend, realNow, scanSeller, signedInvoice, signedRawInvoice, walletInfo } from './erc20Flow.testutil';
import { createPayContext, reviewInvoice } from './pay';
import { PostBroadcastError } from './payExec';
import { clearSession, getSessionPublic } from './session';
import { connectWallet } from './wallet';

// Refusals on a real local chain: wrong chain, wrong token, a wallet that sends something other than the preview, and a
// token that does not deliver what the router pulls. In every case the wallet is not asked (or the app does not claim
// success), and the seller's chain view stays truthful.
it('needs anvil and the compiled contracts when REQUIRE_ANVIL=1', () => {
  if (erc20AnvilRequired) expect(erc20AnvilAvailable, 'REQUIRE_ANVIL=1 needs anvil and packages/contracts/out (run forge build)').toBe(true);
});

describe.skipIf(!erc20AnvilAvailable)('ERC-20 wrong chain, wrong token and substituted payments on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain(); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it('a payer who holds less than the gross is refused at the dry run before the payment is requested, after at most the exact approval', async () => {
    const parsed = await signedInvoice(local);
    const brokeKey = `0x${'f1'.repeat(32)}` as const;
    const wallet = new AnvilWallet(local, brokeKey);
    await local.setBalance(wallet.account, 10n ** 18n);
    await local.mint(local.usdc, wallet.account, 99_999_999n); // one base unit short of the 100 USDC gross
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const sendsAfterApproval = wallet.sendCount;
    await expect(prepareAndSend(setup)).rejects.toMatchObject({ translation: { key: 'error.txGuard.blockedADryRunOfThisTransactionFailsItWould' } });
    expect(wallet.sendCount).toBe(sendsAfterApproval);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(99_999_999n);
    expect(await scanSeller(local)).toEqual([]);
  });

  describe('wrong chain', () => {
    it('a wallet on another network that cannot switch is refused before any request', async () => {
      const parsed = await signedInvoice(local);
      const wallet = new AnvilWallet(local, KEYS.payer, { reportedChainId: 1 });
      await expect(connectWallet(walletInfo(wallet), local.chainId)).rejects.toThrow(/network|chain/i);
      expect(wallet.sendCount).toBe(0);
      await expect(payerSetup(local, parsed, wallet)).rejects.toThrow();
      expect(wallet.sendCount).toBe(0);
    });

    it('a wallet that switches network after review is refused before the payment is requested, with the allowance untouched', async () => {
      const parsed = await signedInvoice(local);
      const wallet = new AnvilWallet(local, KEYS.payer);
      const setup = await payerSetup(local, parsed, wallet);
      await approveIfNeeded(setup);
      const sends = wallet.sendCount;
      const before = await local.balanceOf(local.usdc, wallet.account);
      wallet.reportedChainId = 1;
      await expect(prepareAndSend(setup)).rejects.toThrow();
      expect(wallet.sendCount).toBe(sends);
      expect(await local.balanceOf(local.usdc, wallet.account)).toBe(before);
      expect(await scanSeller(local)).toEqual([]);
    });

    it('an RPC endpoint that serves another chain is refused by the verified client', async () => {
      const sepolia = CHAINS.find((c) => c.chainId === 11155111)!;
      await expect(createClient(sepolia, local.url, { allowInsecureLocalhost: true, retries: 0 })).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' });
      await expect(createClient(sepolia, local.url, { allowInsecureLocalhost: true, retries: 0 })).rejects.toBeInstanceOf(ChainAdapterError);
    });

    it('a deployment manifest of another chain cannot be used to pay this invoice', async () => {
      const parsed = await signedInvoice(local);
      const wallet = new AnvilWallet(local, KEYS.payer);
      const foreign = loadDeployment(JSON.stringify({
        chainId: 11155111, announcer: local.announcer, router: local.router, sweepRelayer: local.manifest.sweepRelayer, feeRecipient: FEE_RECIPIENT, feeBps: 25,
        deployTx: { router: `0x${'a'.repeat(64)}`, sweepRelayer: `0x${'b'.repeat(64)}` }, solcVersion: '0.8.28+commit.7893614a', commit: 'c'.repeat(40),
        bytecodeHashes: { router: `0x${'d'.repeat(64)}`, sweepRelayer: `0x${'e'.repeat(64)}` }, date: '2026-01-01T00:00:00Z',
      }), 11155111);
      let refused = false;
      try { await prepareAndSend(await payerSetup(local, parsed, wallet, foreign)); } catch { refused = true; }
      expect(refused).toBe(true);
      expect(wallet.sendCount).toBe(0);
    });

    it.each([
      { label: 'an unknown chain', chainId: 31337 },
      { label: 'a disabled mainnet', chainId: 1 },
    ])('an invoice for $label is blocked in review and cannot become a payment', async ({ chainId }) => {
      const parsed = await signedRawInvoice({ chainId, token: local.usdc.toLowerCase() });
      const review = reviewInvoice(parsed, realNow(), { status: 'loaded', manifest: local.manifest });
      expect(review.blockers.length).toBeGreaterThan(0);
      expect(review.blockers.join(' ')).toMatch(/chain|network/i);
      await expect(createPayContext(review, local.rpc, { nowSeconds: realNow() })).rejects.toThrow(/blocked/i);
    });
  });

  describe('wrong token', () => {
    it('an invoice for a token outside the allowlist is blocked in review: no context, no approval, no wallet request', async () => {
      const parsed = await signedRawInvoice({ chainId: local.chainId, token: local.rogueToken.toLowerCase() });
      const wallet = new AnvilWallet(local, KEYS.payer);
      const review = reviewInvoice(parsed, realNow(), { status: 'loaded', manifest: local.manifest });
      expect(review.token).toBeUndefined();
      expect(review.blockerMessages.map((m) => m.key)).toContain('pay.review.disallowedToken');
      await expect(createPayContext(review, local.rpc, { nowSeconds: realNow() })).rejects.toThrow(/blocked/i);
      expect(wallet.sendCount).toBe(0);
      expect(await local.balanceOf(local.rogueToken, local.router)).toBe(0n);
    });

    it('a wallet that swaps the token for an unlisted one is reported as a submission mismatch with the hash, never as a successful payment', async () => {
      const parsed = await signedInvoice(local);
      const probe = new AnvilWallet(local, KEYS.payer);
      const setup = await payerSetup(local, parsed, probe);
      await approveIfNeeded(setup);
      const rogueAllowance = `0x095ea7b3${local.router.slice(2).toLowerCase().padStart(64, '0')}${(10n ** 12n).toString(16).padStart(64, '0')}` as const;
      await local.send(KEYS.payer, { to: local.rogueToken, data: rogueAllowance });
      const swap = (tx: { to: `0x${string}`; data?: `0x${string}`; value?: string }) => ({
        // Both the token argument and the token inside the announcement metadata, so the router accepts the swapped call.
        ...tx, data: (tx.data ?? '0x').toLowerCase().split(local.usdc.slice(2).toLowerCase()).join(local.rogueToken.slice(2).toLowerCase()) as `0x${string}`,
      });
      const hostile = new AnvilWallet(local, KEYS.payer, { mutate: swap });
      let failure: unknown;
      try { await prepareAndSend(await payerSetup(local, parsed, hostile)); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(PostBroadcastError);
      expect((failure as PostBroadcastError).hash).toBe(hostile.hashes[0]);
      expect((failure as PostBroadcastError).outcome.phase).toBe('verification-incomplete');
      // Chain truth the seller can see: a real router payment, in the wrong token. It matches no USDC invoice.
      await finalize(local);
      const matches = await scanSeller(local);
      expect(matches).toHaveLength(1);
      expect((matches[0]?.metadata as { token: string }).token.toLowerCase()).toBe(local.rogueToken.toLowerCase());
    });
  });

  describe('a wallet that sends a different amount than previewed', () => {
    it('is reported as a submission mismatch with the hash; the real (different) payment is visible to the seller as such', async () => {
      const parsed = await signedInvoice(local);
      const probe = new AnvilWallet(local, KEYS.payer);
      const setup = await payerSetup(local, parsed, probe);
      await approveIfNeeded(setup);
      const smaller = buildPaymentTx({
        chain: local.chain, deployment: local.manifest, invoice: { chainId: local.chainId, token: local.usdc.toLowerCase() },
        payment: deriveStealthPayment(getSessionPublic()!.metaAddress), grossAmount: 90_000_000n, deadline: BigInt(realNow() + 900),
      });
      const hostile = new AnvilWallet(local, KEYS.payer, { mutate: (tx) => ({ ...tx, data: smaller.tx.data }) });
      let failure: unknown;
      try { await prepareAndSend(await payerSetup(local, parsed, hostile)); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(PostBroadcastError);
      expect((failure as PostBroadcastError).hash).toBe(hostile.hashes[0]);
      expect((failure as PostBroadcastError).message).toMatch(/call data|does not match|different/i);
      await finalize(local);
      const [match] = await scanSeller(local);
      expect(match?.metadata).toMatchObject({ kind: 'erc20', netAmount: routerSplit(90_000_000n).net });
      expect(await local.balanceOf(local.usdc, match!.stealthAddress)).toBe(routerSplit(90_000_000n).net);
    });
  });
});

describe.skipIf(!erc20AnvilAvailable)('ERC-20 token that delivers less than the router pulls (fee-on-transfer) on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain({ token: 'fee-on-transfer' }); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it('the router reverts with UnexpectedBalanceDelta, so no payment, fee or announcement exists', async () => {
    await foreignRouterPaymentApprove(local);
    const gross = 100_000_000n;
    const payerBefore = await local.balanceOf(local.usdc, new AnvilWallet(local, KEYS.payer2).account);
    // A reverted transaction is mined only when the gas limit is given explicitly (estimation would refuse it).
    const built = buildPaymentTx({
      chain: local.chain, deployment: local.manifest, invoice: { chainId: local.chainId, token: local.usdc.toLowerCase() },
      payment: deriveStealthPayment(getSessionPublic()!.metaAddress), grossAmount: gross, deadline: BigInt(realNow() + 900),
    });
    const hash = await local.send(KEYS.payer2, { to: built.tx.to, data: built.tx.data, gas: 500_000n });
    await local.mine(1);
    const receipt = await local.raw('eth_getTransactionReceipt', [hash]) as { status: string; logs: unknown[] };
    expect(receipt.status).toBe('0x0');
    expect(receipt.logs).toEqual([]);
    await expect(local.raw('eth_call', [{ from: new AnvilWallet(local, KEYS.payer2).account, to: built.tx.to, data: built.tx.data }, 'latest']))
      .rejects.toThrow(new RegExp(toFunctionSelector('UnexpectedBalanceDelta()').slice(2)));
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(0n);
    expect(await local.balanceOf(local.usdc, FEE_RECIPIENT)).toBe(0n);
    expect(await local.balanceOf(local.usdc, new AnvilWallet(local, KEYS.payer2).account)).toBe(payerBefore);
    await finalize(local);
    expect(await scanSeller(local)).toEqual([]);
  });

  it('the app refuses at the dry run, before the wallet is asked for the payment, and the seller sees nothing', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const sendsAfterApproval = wallet.sendCount;
    const before = await local.balanceOf(local.usdc, wallet.account);
    await expect(prepareAndSend(setup)).rejects.toMatchObject({ translation: { key: 'error.txGuard.blockedADryRunOfThisTransactionFailsItWould' } });
    expect(wallet.sendCount).toBe(sendsAfterApproval);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(before);
    await finalize(local);
    expect(await scanSeller(local)).toEqual([]);
    void foreignRouterPayment;
  });
});

/** Gives payer2 the router allowance needed by a hand-built payment. */
async function foreignRouterPaymentApprove(local: LocalChain): Promise<void> {
  const data = `0x095ea7b3${local.router.slice(2).toLowerCase().padStart(64, '0')}${(10n ** 12n).toString(16).padStart(64, '0')}` as const;
  await local.send(KEYS.payer2, { to: local.usdc, data });
  await local.mine(1);
}
