import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerSplit } from '@ghostpay/chain-adapters';
import { stubJournalWindow } from '../test/locks';
import { AnvilWallet, KEYS, erc20AnvilAvailable, erc20AnvilRequired, startLocalChain, FEE_RECIPIENT, type LocalChain } from './erc20Anvil.testutil';
import { approveAndPay, finalize, newSeller, noStatus, payerSetup, scanSeller, signedInvoice } from './erc20Flow.testutil';
import { classifyPayerPermit, preparePayment, sendPayment } from './payExec';
import { clearSession } from './session';

// Real compiled GhostPayRouter + announcer + ERC-20 code on a disposable local anvil (see erc20Anvil.testutil.ts). The
// app library runs exactly as the Pay and Scan views drive it; only the wallet and RPC endpoint are synthetic. This is
// a local qualification: not deployed USDC, not a live network and not an audit.
it('needs anvil and the compiled contracts when REQUIRE_ANVIL=1', () => {
  if (erc20AnvilRequired) expect(erc20AnvilAvailable, 'REQUIRE_ANVIL=1 needs anvil and packages/contracts/out (run forge build)').toBe(true);
});

describe.skipIf(!erc20AnvilAvailable)('ERC-20 payer to seller on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain(); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it('exact-amount payment: one approval, one router call, exact split on chain, seller scan pending then verified', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    const split = routerSplit(setup.ctx.request.grossAmount);
    expect(setup.ctx.request.grossAmount).toBe(100_000_000n);
    const payerBefore = await local.balanceOf(local.usdc, wallet.account);
    const feeBefore = await local.balanceOf(local.usdc, FEE_RECIPIENT);

    const { built, result } = await approveAndPay(setup);

    expect(result.verification).toBe('verified');
    expect(result.receipt?.status).toBe('success');
    // Exactly two wallet transactions: the exact approval and the router call. No hidden transfer or second payment.
    expect(wallet.sendCount).toBe(2);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(payerBefore - split.gross);
    expect(await local.balanceOf(local.usdc, FEE_RECIPIENT)).toBe(feeBefore + split.fee);
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(split.net);
    expect(await local.balanceOf(local.usdc, local.router)).toBe(0n);
    // The approval was exactly the gross: nothing is left for a second pull.
    expect(await local.raw('eth_call', [{ to: local.usdc, data: `0xdd62ed3e${wallet.account.slice(2).toLowerCase().padStart(64, '0')}${local.router.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest'])).toBe(`0x${'0'.repeat(64)}`);

    const early = await scanSeller(local);
    expect(early).toHaveLength(1);
    expect(early[0]).toMatchObject({ viaRouter: true, receipt: 'pending', stealthAddress: built.preview.stealth });
    expect(early[0]?.metadata).toMatchObject({ kind: 'erc20', netAmount: split.net });
    await finalize(local);
    const final = await scanSeller(local);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({ viaRouter: true, receipt: 'verified', stealthAddress: built.preview.stealth });
  });
});

describe.skipIf(!erc20AnvilAvailable)('ERC-20 permit payment on a real local chain', () => {
  let local: LocalChain;
  beforeAll(async () => { local = await startLocalChain({ token: 'permit' }); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { stubJournalWindow(vi.stubGlobal); newSeller(); });
  afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

  it('one signature and one router call: no approval transaction, exact split, permit nonce consumed, nothing left over', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    expect(await classifyPayerPermit(setup.ctx, setup.session, setup.rt)).toBe('ok_to_permit');
    const split = routerSplit(setup.ctx.request.grossAmount);
    const payerBefore = await local.balanceOf(local.usdc, wallet.account);

    const built = await preparePayment(setup.session, setup.ctx, { usePermit: true }, setup.rt, noStatus);
    expect(built.preview.method).toBe('payERC20WithPermit');
    const result = await sendPayment(setup.session, setup.ctx, built, setup.rt, noStatus);
    await local.mine(1);

    expect(result.verification).toBe('verified');
    expect(wallet.calls.filter((c) => c.method === 'eth_signTypedData_v4')).toHaveLength(1);
    expect(wallet.sendCount).toBe(1);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(payerBefore - split.gross);
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(split.net);
    expect(await local.balanceOf(local.usdc, FEE_RECIPIENT)).toBe(split.fee);
    // The permit allowed exactly the gross and was fully spent by the router.
    expect(await local.raw('eth_call', [{ to: local.usdc, data: `0xdd62ed3e${wallet.account.slice(2).toLowerCase().padStart(64, '0')}${local.router.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest'])).toBe(`0x${'0'.repeat(64)}`);
    expect(await local.raw('eth_call', [{ to: local.usdc, data: `0x7ecebe00${wallet.account.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest'])).toBe(`0x${'0'.repeat(63)}1`);
    await finalize(local);
    expect((await scanSeller(local)).map((m) => m.receipt)).toEqual(['verified']);
  });
});
