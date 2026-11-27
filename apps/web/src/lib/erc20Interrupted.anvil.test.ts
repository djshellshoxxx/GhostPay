import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerSplit } from '@ghostpay/chain-adapters';
import { stubJournalWindow } from '../test/locks';
import { resolveAttempt } from './attemptStatus';
import { DUPLICATE_ATTEMPT_MESSAGE, clearAttempt, readAttempts } from './duplicateAttemptJournal';
import { AnvilWallet, KEYS, erc20AnvilAvailable, erc20AnvilRequired, startLocalChain, FEE_RECIPIENT, type LocalChain } from './erc20Anvil.testutil';
import { approveIfNeeded, approveRouter, finalize, newSeller, payerSetup, prepareAndSend, scanSeller, signedInvoice } from './erc20Flow.testutil';
import { PostBroadcastError } from './payExec';
import { clearSession } from './session';
import { WalletSubmissionUnknownError } from './wallet';

// Interrupted payer flows on a real local chain: the page is lost after the wallet returned a hash (or crashed with an
// unknown outcome) and the browser reloads. What the app may claim after a reload comes from the durable attempt
// journal plus what the payer's own RPC says now, never from elapsed time, and a second payment is never offered.
it('needs anvil and the compiled contracts when REQUIRE_ANVIL=1', () => {
  if (erc20AnvilRequired) expect(erc20AnvilAvailable, 'REQUIRE_ANVIL=1 needs anvil and packages/contracts/out (run forge build)').toBe(true);
});

const DUPLICATE = { translation: { key: DUPLICATE_ATTEMPT_MESSAGE } };
const DRY_RUN_REFUSED = { translation: { key: 'error.txGuard.blockedADryRunOfThisTransactionFailsItWould' } };

describe.skipIf(!erc20AnvilAvailable)('ERC-20 payer reload and interruption on a real local chain', () => {
  let local: LocalChain;
  // The durable journal outlives a "reload": a fresh page gets the same backing store and no in-memory state.
  let durable: Map<string, string>;
  const store = { getItem: (k: string): string | null => durable.get(k) ?? null, setItem: (k: string, v: string): void => { durable.set(k, v); }, removeItem: (k: string): void => { durable.delete(k); } };
  const reload = (): void => { vi.unstubAllGlobals(); stubJournalWindow(vi.stubGlobal, store); };

  beforeAll(async () => { local = await startLocalChain(); }, 120_000);
  afterAll(() => { local?.stop(); });
  beforeEach(() => { durable = new Map(); stubJournalWindow(vi.stubGlobal, store); newSeller(); });
  afterEach(async () => { await local.automine(true); clearSession(); vi.unstubAllGlobals(); });

  /**
   * A brand-new page (new review, new wallet connection, fresh stealth randomness) for the same invoice tries to pay
   * again. Returns what refused it; the new wallet must never have been asked.
   */
  async function secondAttempt(parsed: Awaited<ReturnType<typeof signedInvoice>>): Promise<unknown> {
    const fresh = new AnvilWallet(local, KEYS.payer);
    let refusal: unknown;
    try { await prepareAndSend(await payerSetup(local, parsed, fresh)); } catch (error) { refusal = error; }
    expect(refusal, 'a second payment must be refused').toBeDefined();
    expect(fresh.sendCount).toBe(0);
    return refusal;
  }

  /** Chain truth after the payment: the payer lost exactly one gross, the fee recipient got one fee, the stealth address one net. */
  async function expectExactlyOnePayment(before: { payer: bigint; fee: bigint }, wallet: AnvilWallet, stealth: `0x${string}`, gross = 100_000_000n): Promise<void> {
    const split = routerSplit(gross);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(before.payer - split.gross);
    expect(await local.balanceOf(local.usdc, FEE_RECIPIENT)).toBe(before.fee + split.fee);
    expect(await local.balanceOf(local.usdc, stealth)).toBe(split.net);
    expect(await local.balanceOf(local.usdc, local.router)).toBe(0n);
  }

  it('reload while the transaction is still in the mempool: pending, a second payment is refused, and exactly one payment is made once mined', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const before = { payer: await local.balanceOf(local.usdc, wallet.account), fee: await local.balanceOf(local.usdc, FEE_RECIPIENT) };
    await local.automine(false);
    const { built, result } = await prepareAndSend(setup);
    // The RPC shows the very transaction that was previewed, but there is no receipt yet: nothing is claimed as paid.
    expect(result).toMatchObject({ verification: 'verified', receipt: undefined });
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(0n);
    const [attempt] = readAttempts(store).filter((a) => a.kind === 'payment');
    expect(attempt).toMatchObject({ status: 'submitted', hash: result.hash, chainId: local.chainId, account: wallet.account.toLowerCase() });

    reload();
    // A fresh page for the same invoice (new review, new connection, new stealth randomness) cannot send again.
    const sendsBefore = wallet.sendCount;
    expect(await secondAttempt(parsed)).toMatchObject(DUPLICATE);
    expect(wallet.sendCount).toBe(sendsBefore);
    expect(await resolveAttempt(local.rpc, attempt!)).toMatchObject({ state: 'pending', reorged: false });

    await local.mine(1);
    const mined = await resolveAttempt(local.rpc, attempt!);
    expect(mined).toMatchObject({ state: 'confirmed' });
    await expectExactlyOnePayment(before, wallet, built.preview.stealth);
    // Two independent layers refuse a second payment: the spent exact allowance (the dry run fails before the wallet is
    // asked) and, when the payer re-approves, the durable attempt journal.
    expect(await secondAttempt(parsed)).toMatchObject(DRY_RUN_REFUSED);
    await approveRouter(local, KEYS.payer, local.usdc, 100_000_000n);
    expect(await secondAttempt(parsed)).toMatchObject(DUPLICATE);
    await expectExactlyOnePayment(before, wallet, built.preview.stealth);

    // The seller finds that one payment, still pending, then verified: no duplicate credit appears.
    expect((await scanSeller(local)).map((m) => m.receipt)).toEqual(['pending']);
    await finalize(local);
    expect((await scanSeller(local)).map((m) => m.receipt)).toEqual(['verified']);
  });

  it('page lost after the hash came back: the typed post-broadcast error carries the hash, the journal keeps it and the outcome is resolved from the chain', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const lost = new Error('page torn down');
    const setup = await payerSetup(local, parsed, wallet, local.manifest, { sleep: () => Promise.reject(lost) });
    await approveIfNeeded(setup);
    const before = { payer: await local.balanceOf(local.usdc, wallet.account), fee: await local.balanceOf(local.usdc, FEE_RECIPIENT) };
    await local.automine(false);
    let failure: unknown;
    try { await prepareAndSend(setup); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PostBroadcastError);
    const hash = wallet.hashes.at(-1)!;
    expect((failure as PostBroadcastError).hash).toBe(hash);
    expect((failure as PostBroadcastError).outcome.phase).toBe('verification-incomplete');

    reload();
    const [attempt] = readAttempts(store).filter((a) => a.kind === 'payment');
    expect(attempt).toMatchObject({ status: 'submitted', hash });
    expect(await resolveAttempt(local.rpc, attempt!)).toMatchObject({ state: 'pending' });
    await local.mine(1);
    expect(await resolveAttempt(local.rpc, attempt!)).toMatchObject({ state: 'confirmed' });
    const [match] = await scanSeller(local);
    await expectExactlyOnePayment(before, wallet, match!.stealthAddress);
    await approveRouter(local, KEYS.payer, local.usdc, 100_000_000n);
    expect(await secondAttempt(parsed)).toMatchObject(DUPLICATE);
    await expectExactlyOnePayment(before, wallet, match!.stealthAddress);
  });

  it('wallet crashed after broadcasting without returning a hash: unknown outcome, no hash is invented, retry is refused, the chain shows one payment', async () => {
    const parsed = await signedInvoice(local);
    const honest = new AnvilWallet(local, KEYS.payer);
    await approveIfNeeded(await payerSetup(local, parsed, honest));
    const wallet = new AnvilWallet(local, KEYS.payer, { mode: 'broadcast-then-error' });
    const setup = await payerSetup(local, parsed, wallet);
    const before = { payer: await local.balanceOf(local.usdc, wallet.account), fee: await local.balanceOf(local.usdc, FEE_RECIPIENT) };
    let failure: unknown;
    try { await prepareAndSend(setup); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(WalletSubmissionUnknownError);
    expect((failure as WalletSubmissionUnknownError).outcome.phase).toBe('broadcast-unknown');

    reload();
    const [attempt] = readAttempts(store).filter((a) => a.kind === 'payment');
    expect(attempt).toMatchObject({ status: 'unknown' });
    expect(attempt?.hash).toBeUndefined();
    // Without a hash the app cannot ask the chain about it, and says so instead of guessing.
    expect(await resolveAttempt(local.rpc, attempt!)).toEqual({ state: 'no-hash' });
    const sends = wallet.sendCount;
    await approveRouter(local, KEYS.payer, local.usdc, 100_000_000n);
    expect(await secondAttempt(parsed)).toMatchObject(DUPLICATE);
    expect(wallet.sendCount).toBe(sends);
    // Reality (read here directly from the chain, not by the app): the payment did happen, exactly once.
    const [match] = await scanSeller(local);
    await expectExactlyOnePayment(before, wallet, match!.stealthAddress);
    // Only an explicit confirmation clears the record; bookkeeping alone never re-enables a send silently.
    expect(() => clearAttempt(attempt!.key, false, store)).toThrow(/explicit confirmation/i);
    expect(readAttempts(store).some((a) => a.id === attempt!.id)).toBe(true);
  });

  it('transaction dropped from the mempool: not-found (never "failed"), nothing paid, still guarded; after the explicit clear exactly one payment is made', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const before = { payer: await local.balanceOf(local.usdc, wallet.account), fee: await local.balanceOf(local.usdc, FEE_RECIPIENT) };
    await local.automine(false);
    const dropped = await prepareAndSend(setup);
    const [attempt] = readAttempts(store).filter((a) => a.kind === 'payment');
    await local.dropTransaction(dropped.result.hash);
    reload();
    const gone = await resolveAttempt(local.rpc, attempt!);
    expect(gone).toMatchObject({ state: 'not-found', reorged: false });
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(before.payer);
    expect(await secondAttempt(parsed)).toMatchObject(DUPLICATE);

    // Another transaction takes the nonce: the original can never be mined, and the app says so with the nonce.
    await local.automine(true);
    await local.send(KEYS.payer, { to: FEE_RECIPIENT, value: 1n });
    await local.mine(1);
    expect(await resolveAttempt(local.rpc, attempt!)).toMatchObject({ state: 'nonce-consumed' });

    // The user explicitly clears the guard (bookkeeping only) and pays once more: one payment, not two.
    clearAttempt(attempt!.key, true, store);
    const retry = await payerSetup(local, parsed, new AnvilWallet(local, KEYS.payer));
    const second = await prepareAndSend(retry);
    expect(second.result.receipt?.status).toBe('success');
    await expectExactlyOnePayment(before, wallet, second.built.preview.stealth);
  });

  it('a mined payment that is reorged away is reported as not found again, and the chain shows no payment', async () => {
    const parsed = await signedInvoice(local);
    const wallet = new AnvilWallet(local, KEYS.payer);
    const setup = await payerSetup(local, parsed, wallet);
    await approveIfNeeded(setup);
    const before = { payer: await local.balanceOf(local.usdc, wallet.account), fee: await local.balanceOf(local.usdc, FEE_RECIPIENT) };
    const snapshot = await local.raw('evm_snapshot', []);
    const { result, built } = await prepareAndSend(setup);
    const [attempt] = readAttempts(store).filter((a) => a.kind === 'payment');
    expect(await resolveAttempt(local.rpc, attempt!)).toMatchObject({ state: 'confirmed' });
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(routerSplit(100_000_000n).net);

    expect(await local.raw('evm_revert', [snapshot])).toBe(true);
    await local.mine(1);
    const after = await resolveAttempt(local.rpc, attempt!);
    expect(after.state).toBe('not-found');
    expect(await local.balanceOf(local.usdc, built.preview.stealth)).toBe(0n);
    expect(await local.balanceOf(local.usdc, wallet.account)).toBe(before.payer + 0n);
    expect(result.hash).toBe(attempt?.hash);
  });
});
