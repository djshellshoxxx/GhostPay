// @vitest-environment jsdom
import type { RpcClient } from '@ghostpay/chain-adapters';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { notifyAppLock } from '../lib/appLock';
import * as keyVault from '../lib/keyVault';
import { MemoryKeyVaultStore, setKeyVaultStoreForTests } from '../lib/keyVault';
import type { ScanMatch } from '../lib/scanClient';
import { clearSession, generateSession, suspendSession } from '../lib/session';
import { ServicesContext, type Services } from '../lib/services';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../lib/settings';
import * as sweepLib from '../lib/sweep';
import { SWEEP_JOURNAL_KEY } from '../lib/sweepAttemptJournal';
import { AppContext, beginSweepAttempt, getSweepAttempt, resetSweepAttemptsForTests, type AppState } from '../state';
import { FAKE_FEE_RECIPIENT, FAKE_SWEEP_RELAYER } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { makeServices } from '../test/render';
import { Sweep } from './Sweep';

const CHAIN = 84532;
const OWNER = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const DESTINATION = '0x6666666666666666666666666666666666666666';
const OTHER_DESTINATION = '0x7777777777777777777777777777777777777777';
const READ = 'Read balance from the Settings RPC';
const QUOTE = 'Get relayer quote';
const SIGN = 'Sign and submit to relayer';
const DIRECT = 'Sign and broadcast directly';
const RESIGN = 'Sign and broadcast the replacement';
const REVIEW_DIRECT = 'Review the direct sweep';
const REVIEW_RESIGN = 'Review a replacement with the same nonce';
const HASH = '0x' + '34'.repeat(32);
const ORIGINAL_DIRECT_LOCK: sweepLib.SweepLock = {
  chainId: CHAIN, owner: OWNER, nonce: 7, expectedHash: `0x${'12'.repeat(32)}`,
  otherHashes: [`0x${'56'.repeat(32)}`], status: 'unknown-after-handoff',
};
const ORDER: sweepLib.RelayedOrderRef = { relayer: FAKE_SWEEP_RELAYER, nonce: 1n, deadline: 1_800_001_200 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetSweepAttemptsForTests();
  setKeyVaultStoreForTests(new MemoryKeyVaultStore());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); clearSession(); setKeyVaultStoreForTests(undefined); });

function mount() {
  let amount = 5_000_000n;
  let rpcGate: Promise<void> | undefined;
  let rpcCalls = 0;
  const requests: { url: string; body: unknown; reply: ReturnType<typeof deferred<Response>> }[] = [];
  const fetchFn: Services['fetchFn'] = (url, init) => {
    const reply = deferred<Response>();
    requests.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined, reply });
    return reply.promise;
  };
  const inner: RpcClient = {
    chainId: CHAIN,
    request: () => Promise.resolve('0x' + amount.toString(16).padStart(64, '0')),
    blockNumber: () => Promise.resolve(0n), getBlock: () => Promise.resolve(null),
    getLogs: () => Promise.resolve([]),
  };
  const rpc = withManifestChain(inner);
  const match = { chainId: CHAIN, stealthAddress: OWNER, metadata: { kind: 'erc20', token: TOKEN }, announcement: {} } as unknown as ScanMatch;
  let app: AppState = {
    view: 'sweep', setView: () => undefined,
    settings: { ...DEFAULT_SETTINGS, relayerUrl: 'https://relay.test', rpcUrls: { [String(CHAIN)]: 'https://rpc.test/' } },
    updateSettings: () => true, session: generateSession(), fragment: undefined, setFragment: () => undefined,
    matches: [match], setMatches: () => undefined, sweepTarget: { match, chainId: CHAIN }, selectForSweep: () => undefined,
    getRpc: async () => { rpcCalls++; await rpcGate; return rpc; }, getSecondaryRpc: () => Promise.resolve(undefined), announce: () => undefined,
  };
  let services = makeServices({ fetchFn, loadManifest: (id) => Promise.resolve({ status: 'loaded', manifest: backedManifest(id) }) });
  const view = () => <ServicesContext.Provider value={services}><AppContext.Provider value={app}><Sweep /></AppContext.Provider></ServicesContext.Provider>;
  const rendered = render(view());
  return {
    requests, rpc, app: () => app, rpcCalls: () => rpcCalls,
    setAmount(next: bigint) { amount = next; },
    holdRpc(gate: Promise<void>) { rpcGate = gate; },
    update(patch: Partial<AppState>) { app = { ...app, ...patch }; rendered.rerender(view()); },
    updateServices(patch: Partial<Services>) { services = { ...services, ...patch }; rendered.rerender(view()); },
    unmount: rendered.unmount,
  };
}

const settle = async (): Promise<void> => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
const changeDestination = (value: string): void => { fireEvent.change(screen.getByLabelText(/^Destination address/), { target: { value } }); };
async function ready(m: ReturnType<typeof mount>): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: READ }));
  await screen.findByText('5 USDC');
  changeDestination(DESTINATION);
  await settle();
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: QUOTE }).disabled).toBe(false); });
  expect(m.requests).toEqual([]);
}
async function requestQuote(m: ReturnType<typeof mount>, count = 1): Promise<void> {
  // A new balance can render before `busy` clears in a separate update; a click on the still-disabled button is lost.
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: QUOTE }).disabled).toBe(false); });
  fireEvent.click(screen.getByRole('button', { name: QUOTE }));
  await waitFor(() => { expect(m.requests).toHaveLength(count); });
}
async function answer(m: ReturnType<typeof mount>, index = 0): Promise<void> {
  await act(async () => {
    m.requests[index]!.reply.resolve(new Response(JSON.stringify({ fee: '25000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: 1_800_000_100, quoteToken: 'synthetic-quote' })));
    await Promise.resolve();
  });
  await settle();
}

describe('Sweep quote lifecycle', () => {
  it('handles a session that locks before authorization without starting a request', async () => {
    const m = mount();
    await ready(m);
    act(() => { suspendSession(); });
    fireEvent.click(screen.getByRole('button', { name: QUOTE }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/locked/i);
    expect(m.requests).toEqual([]);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: QUOTE }).disabled).toBe(false);
  });

  it('handles a session cleared before authorization without starting a request', async () => {
    const m = mount();
    await ready(m);
    const reads = m.rpcCalls();
    // The session store can become unavailable before this context projection is replaced.
    act(() => { clearSession(false); });
    fireEvent.click(screen.getByRole('button', { name: QUOTE }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/load or generate seller keys/i);
    expect(m.requests).toEqual([]);
    expect(m.rpcCalls()).toBe(reads);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: QUOTE }).disabled).toBe(false);
  });

  it('keeps an authorized quote through an unrelated context render', async () => {
    const m = mount();
    await ready(m);
    await requestQuote(m);
    m.update({ fragment: 'unrelated' });
    await answer(m);
    expect(screen.getByText('You receive: 4.975 USDC')).toBeTruthy();
    expect(screen.getByRole('button', { name: SIGN })).toBeTruthy();
    expect(m.requests[0]!.body).toMatchObject({ amount: '5000000', owner: OWNER, destination: DESTINATION });
  });

  it('cannot restore an old quote after a balance refresh; a new click quotes the new amount', async () => {
    const m = mount();
    await ready(m);
    await requestQuote(m);
    // Read balance is disabled while the quote request is in flight, so a refresh cannot race it.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: READ }).disabled).toBe(true);
    await answer(m);
    expect(screen.getByRole('button', { name: SIGN })).toBeTruthy();
    m.setAmount(10_000_000n);
    fireEvent.click(screen.getByRole('button', { name: READ }));
    await screen.findByText('10 USDC');
    expect(screen.queryByRole('button', { name: SIGN })).toBeNull();
    expect(screen.queryByText(/You receive:/)).toBeNull();
    expect(m.requests).toHaveLength(1);
    await requestQuote(m, 2);
    await answer(m, 1);
    expect(screen.getByText('You receive: 9.975 USDC')).toBeTruthy();
    expect(m.requests[1]!.body).toMatchObject({ amount: '10000000' });
  });

  it.each(['recipient', 'recipient restored', 'payment', 'chain', 'provider', 'RPC factory', 'session', 'app lock', 'relayer', 'manifest', 'transport', 'mode', 'unmount'] as const)(
    'discards a pending quote when %s changes', async (change) => {
      const m = mount();
      await ready(m);
      await requestQuote(m);
      const original = m.app();
      if (change === 'recipient' || change === 'recipient restored') changeDestination(OTHER_DESTINATION);
      if (change === 'recipient restored') changeDestination(DESTINATION);
      if (change === 'payment') m.update({ sweepTarget: { chainId: CHAIN, match: { ...original.sweepTarget!.match, stealthAddress: OTHER_DESTINATION } } });
      if (change === 'chain') m.update({ sweepTarget: { ...original.sweepTarget!, chainId: 8453 } });
      if (change === 'provider') m.update({ settings: { ...original.settings, rpcUrls: { [String(CHAIN)]: 'https://other-rpc.test/' } } });
      if (change === 'RPC factory') m.update({ getRpc: () => Promise.resolve(m.rpc) });
      if (change === 'session') m.update({ session: generateSession() });
      if (change === 'app lock') act(() => { notifyAppLock('idle'); });
      if (change === 'relayer') m.update({ settings: { ...original.settings, relayerUrl: 'https://other-relayer.test' } });
      if (change === 'manifest') m.updateServices({ loadManifest: () => Promise.resolve({ status: 'invalid', reason: 'synthetic manifest change' }) });
      if (change === 'transport') m.updateServices({ fetchFn: () => Promise.reject(new Error('must not request another transport')) });
      if (change === 'mode') {
        fireEvent.click(screen.getByLabelText(/^Directly/));
        fireEvent.click(screen.getByLabelText(/^Through the relayer/));
      }
      if (change === 'unmount') m.unmount();
      await settle();
      await answer(m);
      expect(screen.queryByRole('button', { name: SIGN })).toBeNull();
      expect(screen.queryByText(/You receive:/)).toBeNull();
      expect(m.requests).toHaveLength(1);
    },
  );

  it.each(['recipient', 'provider', 'unmount'] as const)('does not send a quote request if %s changes while RPC creation is pending', async (change) => {
    const m = mount();
    await ready(m);
    const gate = deferred<void>();
    const priorCalls = m.rpcCalls();
    m.holdRpc(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: QUOTE }));
    await waitFor(() => { expect(m.rpcCalls()).toBe(priorCalls + 1); });
    if (change === 'recipient') changeDestination(OTHER_DESTINATION);
    if (change === 'provider') m.update({ settings: { ...m.app().settings, rpcUrls: { [String(CHAIN)]: 'https://other-rpc.test/' } } });
    if (change === 'unmount') m.unmount();
    await act(async () => { gate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(m.requests).toEqual([]);
  });

  it('does not show a stale quote error after the recipient changes', async () => {
    const m = mount();
    await ready(m);
    await requestQuote(m);
    changeDestination(OTHER_DESTINATION);
    await act(async () => { m.requests[0]!.reply.reject(new Error('synthetic provider failure')); await Promise.resolve(); });
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: SIGN })).toBeNull();
  });

  it('removes an already displayed quote when the relayer changes', async () => {
    const m = mount();
    await ready(m);
    await requestQuote(m);
    await answer(m);
    expect(screen.getByRole('button', { name: SIGN })).toBeTruthy();
    m.update({ settings: { ...m.app().settings, relayerUrl: 'https://other-relayer.test' } });
    await settle();
    expect(screen.queryByRole('button', { name: SIGN })).toBeNull();
    expect(m.requests).toHaveLength(1);
  });
});

type ReviewChange = 'recipient' | 'balance' | 'provider' | 'mode' | 'selection';
async function changeReview(m: ReturnType<typeof mount>, change: ReviewChange, currentMode: 'relayer' | 'direct' = 'relayer'): Promise<void> {
  if (change === 'recipient') changeDestination(OTHER_DESTINATION);
  if (change === 'balance') {
    // Read balance is disabled while signing is busy, so a user cannot refresh mid-sign; the balance can still be
    // invalidated underneath the operation (here by an idle app lock), and the review must then be refused.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: READ }).disabled).toBe(true);
    act(() => { notifyAppLock('idle'); });
  }
  if (change === 'provider') m.update({ settings: { ...m.app().settings, rpcUrls: { [String(CHAIN)]: 'https://other-rpc.test/' } } });
  if (change === 'mode') fireEvent.click(screen.getByLabelText(currentMode === 'relayer' ? /^Directly/ : /^Through the relayer/));
  if (change === 'selection') m.update({ sweepTarget: { chainId: CHAIN, match: { ...m.app().sweepTarget!.match, stealthAddress: OTHER_DESTINATION } } });
  await settle();
}

async function reviewedQuote(m: ReturnType<typeof mount>): Promise<void> {
  await ready(m);
  await requestQuote(m);
  await answer(m);
  expect(screen.getByRole('button', { name: SIGN })).toBeTruthy();
}

describe('Sweep relayed signing context', () => {
  it.each([
    ['vault', 'recipient'], ['vault', 'balance'], ['vault', 'provider'], ['vault', 'mode'],
    ['RPC', 'recipient'], ['RPC', 'balance'], ['RPC', 'provider'], ['RPC', 'mode'],
  ] as const)('does not enter signing after %s work if %s changed', async (stage, change) => {
    const m = mount();
    await reviewedQuote(m);
    const vaultGate = deferred<Awaited<ReturnType<typeof keyVault.authorizeEncryptedVault>>>();
    const rpcGate = deferred<void>();
    if (stage === 'vault') vi.spyOn(keyVault, 'authorizeEncryptedVault').mockReturnValue(vaultGate.promise);
    else m.holdRpc(rpcGate.promise);
    const submitted = vi.spyOn(sweepLib, 'relayedSweep').mockResolvedValue(HASH);
    const priorCalls = m.rpcCalls();
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    if (stage === 'vault') await waitFor(() => { expect(keyVault.authorizeEncryptedVault).toHaveBeenCalledTimes(1); });
    else await waitFor(() => { expect(m.rpcCalls()).toBe(priorCalls + 1); });
    await changeReview(m, change);
    await act(async () => { vaultGate.resolve(undefined); rpcGate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(submitted).not.toHaveBeenCalled();
    expect(getSweepAttempt(CHAIN, OWNER)).toBeUndefined();
  });

  it.each(['recipient', 'balance', 'provider', 'mode'] as const)('refuses the handoff if %s changes after signing work begins', async (change) => {
    const m = mount();
    await reviewedQuote(m);
    const gate = deferred<void>();
    const dispatched = vi.fn();
    const submitted = vi.spyOn(sweepLib, 'relayedSweep').mockImplementation(async (input) => {
      await gate.promise;
      input.onBeforeHandoff?.(ORDER);
      dispatched();
      return HASH;
    });
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(submitted).toHaveBeenCalledTimes(1); });
    await changeReview(m, change);
    await act(async () => { gate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(dispatched).not.toHaveBeenCalled();
    expect(getSweepAttempt(CHAIN, OWNER)).toBeUndefined();
  });

  it.each(['submitted', 'unknown-after-handoff'] as const)('retains %s evidence when the recipient changes after handoff', async (outcome) => {
    const m = mount();
    await reviewedQuote(m);
    const response = deferred<string>();
    vi.spyOn(sweepLib, 'relayedSweep').mockImplementation((input) => {
      input.onBeforeHandoff?.(ORDER);
      return response.promise;
    });
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, OWNER)?.status).toBe('unknown-after-handoff'); });
    changeDestination(OTHER_DESTINATION);
    await act(async () => {
      if (outcome === 'submitted') response.resolve(HASH);
      else response.reject(new Error('synthetic interrupted response'));
      await Promise.resolve();
    });
    await settle();
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ chainId: CHAIN, owner: OWNER, order: ORDER, status: outcome });
    expect(getSweepAttempt(CHAIN, OWNER)?.expectedHash).toBe(outcome === 'submitted' ? HASH : undefined);
  });
});

/** A computed direct sweep as `reviewDirectSweep` returns it; the view only shows and forwards it. */
function syntheticReview(input: Omit<sweepLib.DirectSweepInput, 'onBeforeHandoff'>): sweepLib.DirectSweepReview {
  return {
    chainId: input.target.chainId, owner: input.target.owner, destination: input.destination, asset: input.target.token,
    sent: input.amount, maxGasCost: 1n, feeReserve: 0n, nativeBalance: 10n ** 15n,
    ...(input.replaceNonce === undefined ? {} : { replaceNonce: input.replaceNonce }),
    unsigned: { type: 'eip1559', chainId: input.target.chainId, nonce: input.replaceNonce ?? 7, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gas: 60_000n, to: TOKEN, value: 0n, data: '0x' },
    simulation: 'ok', reviewedAt: 1_800_000_000,
  };
}

function directAttempt(review: sweepLib.DirectSweepReview, input: sweepLib.SignReviewedDirectSweepInput): sweepLib.DirectSweepAttempt {
  return {
    chainId: input.target.chainId, owner: input.target.owner, nonce: review.replaceNonce ?? 7,
    destination: review.destination, asset: input.target.token, amount: review.sent,
    expectedHash: HASH as `0x${string}`, status: 'unknown-after-handoff',
  };
}

function directResult(review: sweepLib.DirectSweepReview, input: sweepLib.SignReviewedDirectSweepInput): sweepLib.DirectSweepResult {
  return {
    hash: HASH as `0x${string}`, sent: review.sent, maxGasCost: 1n,
    attempt: { ...directAttempt(review, input), status: 'submitted' }, simulation: 'ok',
  };
}

/** Opens the direct (or same-nonce replacement) review and waits until its signature can be requested. */
async function reviewedDirect(m: ReturnType<typeof mount>, resign: boolean): Promise<MockInstance<typeof sweepLib.reviewDirectSweep>> {
  await ready(m);
  fireEvent.click(screen.getByLabelText(/^Directly/));
  if (resign) act(() => { beginSweepAttempt(ORIGINAL_DIRECT_LOCK); });
  await settle();
  const reviewed = vi.spyOn(sweepLib, 'reviewDirectSweep').mockImplementation((input) => Promise.resolve(syntheticReview(input)));
  fireEvent.click(screen.getByRole('button', { name: resign ? REVIEW_RESIGN : REVIEW_DIRECT }));
  await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: resign ? RESIGN : DIRECT }).disabled).toBe(false); });
  return reviewed;
}

describe.each(['direct', 'same-nonce replacement'] as const)('Sweep %s signing context', (flow) => {
  const resign = flow === 'same-nonce replacement';
  const action = resign ? RESIGN : DIRECT;

  it('submits an unchanged review and retains the original replacement hash', async () => {
    const m = mount();
    const reviewed = await reviewedDirect(m, resign);
    expect(reviewed).toHaveBeenCalledTimes(1);
    expect(reviewed.mock.calls[0]![0]).toMatchObject({ destination: DESTINATION, amount: 5_000_000n });
    expect(reviewed.mock.calls[0]![0].replaceNonce).toBe(resign ? 7 : undefined);
    const submitted = vi.spyOn(sweepLib, 'signReviewedDirectSweep').mockImplementation((review, input) => {
      input.onBeforeHandoff?.(directAttempt(review, input));
      return Promise.resolve(directResult(review, input));
    });
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, OWNER)?.status).toBe('submitted'); });
    expect(submitted).toHaveBeenCalledTimes(1);
    // Exactly the review that was shown is signed.
    expect(submitted.mock.calls[0]![0]).toBe(await reviewed.mock.results[0]!.value);
    expect(submitted.mock.calls[0]![0]).toMatchObject({ destination: DESTINATION, sent: 5_000_000n });
    expect(submitted.mock.calls[0]![0].replaceNonce).toBe(resign ? 7 : undefined);
    // One review, one signature: the review is gone once its transaction was handed off.
    expect(screen.queryByRole('button', { name: action })).toBeNull();
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ nonce: 7, expectedHash: HASH, status: 'submitted' });
    expect(getSweepAttempt(CHAIN, OWNER)?.otherHashes).toEqual(resign ? [...ORIGINAL_DIRECT_LOCK.otherHashes!, ORIGINAL_DIRECT_LOCK.expectedHash] : undefined);
    expect(m.requests).toEqual([]);
  });

  it.each([
    ['vault', 'recipient'], ['vault', 'balance'], ['vault', 'provider'], ['vault', 'mode'], ['vault', 'selection'],
    ['RPC', 'recipient'], ['RPC', 'balance'], ['RPC', 'provider'], ['RPC', 'mode'], ['RPC', 'selection'],
  ] as const)('does not enter signing after %s work if %s changed', async (stage, change) => {
    const m = mount();
    await reviewedDirect(m, resign);
    const original = getSweepAttempt(CHAIN, OWNER);
    const originalJournal = window.sessionStorage.getItem(SWEEP_JOURNAL_KEY);
    const vaultGate = deferred<Awaited<ReturnType<typeof keyVault.authorizeEncryptedVault>>>();
    const rpcGate = deferred<void>();
    if (stage === 'vault') vi.spyOn(keyVault, 'authorizeEncryptedVault').mockReturnValue(vaultGate.promise);
    else m.holdRpc(rpcGate.promise);
    const submitted = vi.spyOn(sweepLib, 'signReviewedDirectSweep').mockImplementation((review, input) => Promise.resolve(directResult(review, input)));
    const priorCalls = m.rpcCalls();
    fireEvent.click(screen.getByRole('button', { name: action }));
    if (stage === 'vault') await waitFor(() => { expect(keyVault.authorizeEncryptedVault).toHaveBeenCalledTimes(1); });
    else await waitFor(() => { expect(m.rpcCalls()).toBe(priorCalls + 1); });
    await changeReview(m, change, 'direct');
    await act(async () => { vaultGate.resolve(undefined); rpcGate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(submitted).not.toHaveBeenCalled();
    expect(getSweepAttempt(CHAIN, OWNER)).toEqual(original);
    expect(getSweepAttempt(CHAIN, OTHER_DESTINATION)).toBeUndefined();
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe(originalJournal);
  });

  it.each(['recipient', 'balance', 'provider', 'mode', 'selection'] as const)('refuses handoff and preserves the original journal if %s changes inside the helper', async (change) => {
    const m = mount();
    await reviewedDirect(m, resign);
    const original = getSweepAttempt(CHAIN, OWNER);
    const originalJournal = window.sessionStorage.getItem(SWEEP_JOURNAL_KEY);
    const gate = deferred<void>();
    const dispatched = vi.fn();
    const submitted = vi.spyOn(sweepLib, 'signReviewedDirectSweep').mockImplementation(async (review, input) => {
      await gate.promise;
      input.onBeforeHandoff?.(directAttempt(review, input));
      dispatched();
      return directResult(review, input);
    });
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => { expect(submitted).toHaveBeenCalledTimes(1); });
    await changeReview(m, change, 'direct');
    await act(async () => { gate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(dispatched).not.toHaveBeenCalled();
    expect(getSweepAttempt(CHAIN, OWNER)).toEqual(original);
    expect(getSweepAttempt(CHAIN, OTHER_DESTINATION)).toBeUndefined();
    expect(window.sessionStorage.getItem(SWEEP_JOURNAL_KEY)).toBe(originalJournal);
  });

  it.each(['submitted', 'unknown-after-handoff'] as const)('retains %s evidence and prior hashes after a post-handoff edit', async (outcome) => {
    const m = mount();
    await reviewedDirect(m, resign);
    const response = deferred<sweepLib.DirectSweepResult>();
    const submitted = vi.spyOn(sweepLib, 'signReviewedDirectSweep').mockImplementation((review, input) => {
      input.onBeforeHandoff?.(directAttempt(review, input));
      return response.promise;
    });
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, OWNER)?.expectedHash).toBe(HASH); });
    expect(getSweepAttempt(CHAIN, OWNER)?.status).toBe('unknown-after-handoff');
    changeDestination(OTHER_DESTINATION);
    const [review, input] = submitted.mock.calls[0]!;
    await act(async () => {
      if (outcome === 'submitted') response.resolve(directResult(review, input));
      else response.reject(new sweepLib.DirectSweepOutcomeUnknownError('synthetic interrupted response', directAttempt(review, input), 'unavailable'));
      await Promise.resolve();
    });
    await settle();
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ chainId: CHAIN, owner: OWNER, nonce: 7, expectedHash: HASH, status: outcome });
    expect(getSweepAttempt(CHAIN, OWNER)?.otherHashes).toEqual(resign ? [...ORIGINAL_DIRECT_LOCK.otherHashes!, ORIGINAL_DIRECT_LOCK.expectedHash] : undefined);
    if (outcome === 'unknown-after-handoff') expect(screen.getByText(/could not dry.run/i)).toBeTruthy();
  });
});

const REVIEW_CHANGED = 'The review changed while signing, before handoff. No transaction or order was sent. Review and sign again.';

describe('Sweep review-change messaging and read availability', () => {
  it.each(['relayed', 'direct'] as const)('says the review changed (not a vault cancellation) when the recipient is edited during %s signing', async (flow) => {
    const m = mount();
    if (flow === 'relayed') await reviewedQuote(m); else await reviewedDirect(m, false);
    const gate = deferred<void>();
    m.holdRpc(gate.promise);
    const priorCalls = m.rpcCalls();
    fireEvent.click(screen.getByRole('button', { name: flow === 'relayed' ? SIGN : DIRECT }));
    await waitFor(() => { expect(m.rpcCalls()).toBe(priorCalls + 1); });
    changeDestination(OTHER_DESTINATION);
    await act(async () => { gate.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(screen.getByText(REVIEW_CHANGED)).toBeTruthy();
    expect(screen.queryByText('Vault check cancelled.')).toBeNull();
  });

  it('disables Read balance while a signing operation is busy', async () => {
    const m = mount();
    await reviewedQuote(m);
    const gate = deferred<void>();
    m.holdRpc(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(screen.getByRole<HTMLButtonElement>('button', { name: READ }).disabled).toBe(true); });
    await act(async () => { gate.resolve(undefined); await Promise.resolve(); });
    await settle();
  });

  it('shows only the latest balance read when an earlier read resolves last', async () => {
    const m = mount();
    const first = deferred<void>();
    m.holdRpc(first.promise);
    fireEvent.click(screen.getByRole('button', { name: READ }));
    await waitFor(() => { expect(m.rpcCalls()).toBe(1); });
    m.holdRpc(Promise.resolve());
    m.setAmount(10_000_000n);
    fireEvent.click(screen.getByRole('button', { name: READ }));
    await screen.findByText('10 USDC');
    m.setAmount(1_000_000n);
    await act(async () => { first.resolve(undefined); await Promise.resolve(); });
    await settle();
    expect(screen.getByText('10 USDC')).toBeTruthy();
    expect(screen.queryByText('1 USDC')).toBeNull();
  });

  it.each(['balance refresh', 'app lock'] as const)('retains relayed handoff evidence after a %s following handoff', async (event) => {
    const m = mount();
    await reviewedQuote(m);
    vi.spyOn(sweepLib, 'relayedSweep').mockImplementation((input) => {
      input.onBeforeHandoff?.(ORDER);
      return Promise.resolve(HASH);
    });
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    await waitFor(() => { expect(getSweepAttempt(CHAIN, OWNER)?.status).toBe('submitted'); });
    await settle();
    if (event === 'balance refresh') {
      m.setAmount(10_000_000n);
      fireEvent.click(screen.getByRole('button', { name: READ }));
      await screen.findByText('10 USDC');
    } else {
      act(() => { notifyAppLock('idle'); });
      await settle();
    }
    expect(getSweepAttempt(CHAIN, OWNER)).toMatchObject({ chainId: CHAIN, owner: OWNER, order: ORDER, status: 'submitted', expectedHash: HASH });
  });
});

/** Storage written by another tab whose notification has not reached this one yet. */
function otherTabSaves(m: ReturnType<typeof mount>, patch: Partial<typeof DEFAULT_SETTINGS>): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...m.app().settings, ...patch }));
}
const REFUSED = /Nothing was sent: the RPC, relayer or scan privacy settings changed in another tab/;
const REPLACED = [
  ['the RPC', { rpcUrls: { [String(CHAIN)]: 'https://other-rpc.test/' } }],
  ['the relayer', { relayerUrl: 'https://other-relayer.test' }],
] as const;

/** What `mount` shows is what is saved, so a later save differs from it only where the patch does. */
function savedBeforeOpening(): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, relayerUrl: 'https://relay.test', rpcUrls: { [String(CHAIN)]: 'https://rpc.test/' } }));
}

describe('Sweep after another tab replaced only the relayer', () => {
  beforeEach(savedBeforeOpening);

  it('still reads the balance, which asks no relayer anything', async () => {
    const m = mount();
    otherTabSaves(m, { relayerUrl: 'https://other-relayer.test' });
    fireEvent.click(screen.getByRole('button', { name: READ }));
    expect(await screen.findByText('5 USDC')).toBeTruthy();
    expect(m.requests).toEqual([]);
  });
});

describe.each(REPLACED)('Sweep after another tab replaced %s', (_name, patch) => {
  beforeEach(savedBeforeOpening);

  it('asks no relayer for a quote', async () => {
    const m = mount();
    await ready(m);
    const reads = m.rpcCalls();
    otherTabSaves(m, patch);
    fireEvent.click(screen.getByRole('button', { name: QUOTE }));
    expect((await screen.findByRole('alert')).textContent).toMatch(REFUSED);
    expect(m.requests).toEqual([]);
    expect(m.rpcCalls()).toBe(reads);
  });

  it('signs no relayed order', async () => {
    const m = mount();
    await reviewedQuote(m);
    const submitted = vi.spyOn(sweepLib, 'relayedSweep');
    otherTabSaves(m, patch);
    fireEvent.click(screen.getByRole('button', { name: SIGN }));
    expect((await screen.findByRole('alert')).textContent).toMatch(REFUSED);
    expect(submitted).not.toHaveBeenCalled();
  });

  it.each([false, true])('signs no direct sweep (replacement: %s)', async (resign) => {
    const m = mount();
    await reviewedDirect(m, resign);
    const submitted = vi.spyOn(sweepLib, 'signReviewedDirectSweep');
    const reads = m.rpcCalls();
    otherTabSaves(m, patch);
    fireEvent.click(screen.getByRole('button', { name: resign ? RESIGN : DIRECT }));
    expect((await screen.findByRole('alert')).textContent).toMatch(REFUSED);
    expect(submitted).not.toHaveBeenCalled();
    expect(m.rpcCalls()).toBe(reads);
  });

  it('hands off no direct sweep when the change lands while signing', async () => {
    const m = mount();
    await reviewedDirect(m, false);
    vi.spyOn(sweepLib, 'signReviewedDirectSweep').mockImplementation((review, input) => {
      otherTabSaves(m, patch);
      input.onBeforeHandoff?.(directAttempt(review, input));
      return Promise.resolve(directResult(review, input));
    });
    fireEvent.click(screen.getByRole('button', { name: DIRECT }));
    expect((await screen.findByRole('alert')).textContent).toMatch(REFUSED);
    expect(getSweepAttempt(CHAIN, OWNER)).toBeUndefined();
  });
});
