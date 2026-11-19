import { ChainAdapterError, createClient, findChain, signDigest, verifyManifestOnChain, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, deriveStealthSecret, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { recoverTransactionAddress, type TransactionSerializedEIP1559 } from 'viem';
import { keccak256, parseTransaction } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { backedManifest, withManifestChain } from '../test/manifestChain';
import { mockRpc } from '../test/mockRpc';
import { createNetworkAuthority } from './networkAuthorization';
import { clearSession, generateSession, suspendSession } from './session';
import { SETTINGS_KEY } from './settings';
import {
  assertNativeSweepReview, cancelNativeSweepReview, confirmNativeDirectSweep, DirectSweepOutcomeUnknownError,
  NATIVE_SWEEP_REVIEW_MS, prepareNativeDirectSweep, type NativeDirectSweepInput, type SweepLock,
} from './sweep';

// Observe real derivation and signatures. Failure diagnostics show counts, never secret arguments.
vi.mock('@ghostpay/chain-adapters', async (load) => {
  const actual = await load<typeof import('@ghostpay/chain-adapters')>();
  return { ...actual, signDigest: vi.fn(actual.signDigest) };
});
vi.mock('@ghostpay/core-crypto', async (load) => {
  const actual = await load<typeof import('@ghostpay/core-crypto')>();
  return { ...actual, deriveStealthSecret: vi.fn(actual.deriveStealthSecret) };
});

const DESTINATION = '0x6666666666666666666666666666666666666666' as Address;
const OTHER = '0x7777777777777777777777777777777777777777' as Address;
const ORACLE = '0x420000000000000000000000000000000000000F';
const BALANCE = 10n ** 17n;
const NOW = 1_800_000_000_000;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(chainId = 11155111) {
  const payment = deriveStealthPayment(generateSession().metaAddress);
  const hex = (bytes: Uint8Array): `0x${string}` => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const announcement: PublicAnnouncement = {
    schemeId: 1n, stealthAddress: payment.stealthAddress,
    ephemeralPublicKey: hex(payment.ephemeralPublicKey), metadata: hex(payment.viewTag),
  };
  const state = {
    wall: NOW, monotonic: 1_000, balance: BALANCE, nonce: 7n, gas: 21_000n, gasPrice: 1_000_000_000n,
    l1: 3_000_000_000_000n, operator: 1_000_000_000_000n,
    current: true, clockThrows: false, simulationFails: false, sendUnknown: false,
    onRequest: undefined as ((method: string, params: readonly unknown[]) => Promise<void> | void) | undefined,
    onSend: undefined as (() => void) | undefined,
    raw: undefined as TransactionSerializedEIP1559 | undefined,
  };
  const rpc = mockRpc(chainId, async (method, params) => {
    await state.onRequest?.(method, params);
    switch (method) {
      case 'eth_gasPrice': return `0x${state.gasPrice.toString(16)}`;
      case 'eth_getTransactionCount': return `0x${state.nonce.toString(16)}`;
      case 'eth_getBalance': return `0x${state.balance.toString(16)}`;
      case 'eth_estimateGas': return `0x${state.gas.toString(16)}`;
      case 'eth_call': {
        const call = params[0] as { to: string; data?: string };
        if (call.to.toLowerCase() === ORACLE.toLowerCase()) {
          const amount = call.data?.startsWith('0x49948e0e') === true ? state.l1 : state.operator;
          return `0x${amount.toString(16).padStart(64, '0')}`;
        }
        if (state.simulationFails) throw new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32601');
        return '0x';
      }
      case 'eth_sendRawTransaction': {
        const raw = params[0];
        if (typeof raw !== 'string' || !raw.startsWith('0x02')) throw new Error('Expected EIP-1559 transaction');
        state.raw = raw as TransactionSerializedEIP1559;
        state.onSend?.();
        if (state.sendUnknown) throw new ChainAdapterError('RPC_FAILURE', 'synthetic transport interruption');
        return keccak256(state.raw);
      }
      default: throw new Error(`Unexpected public RPC method: ${method}`);
    }
  });
  const input: NativeDirectSweepInput = {
    target: { chainId, owner: payment.stealthAddress, token: 'native', announcement },
    manifest: fakeManifest(chainId), destination: DESTINATION, amount: BALANCE, rpc,
    endpoint: 'https://rpc.test/', context: {},
    assertReviewCurrent: () => { if (!state.current) throw new Error('Review changed'); },
  };
  const clock = {
    nowMs: () => { if (state.clockThrows) throw new Error('untrusted clock detail'); return state.wall; },
    monotonicNow: () => state.monotonic,
  };
  return { input, clock, state, rpc };
}

function expectNoSignature(): void { expect(vi.mocked(signDigest).mock.calls.length).toBe(0); }
function expectDerivedBuffersWiped(): void {
  for (const result of vi.mocked(deriveStealthSecret).mock.results) {
    if (result.type === 'return') expect((result.value as Uint8Array).every((byte) => byte === 0)).toBe(true);
  }
}

describe('native direct-sweep fee review', () => {
  it('prepares exact public fees without signing, retaining a key or creating an attempt', async () => {
    const h = fixture();
    const review = await prepareNativeDirectSweep(h.input, h.clock);
    expect(review).toMatchObject({
      chainId: 11155111, owner: h.input.target.owner, destination: DESTINATION, balance: BALANCE,
      nonce: 7, gas: 21_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 100_000_000n,
      maxGasCost: 42_000_000_000_000n, additionalFeeReserve: 0n, totalFeeReserve: 42_000_000_000_000n,
      net: BALANCE - 42_000_000_000_000n, expiresAtMs: NOW + NATIVE_SWEEP_REVIEW_MS, simulation: 'ok',
    });
    expect(Object.isFrozen(review)).toBe(true);
    expectNoSignature(); expectDerivedBuffersWiped();
    expect(h.rpc.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction');
    expect(JSON.stringify(review, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)).not.toMatch(/secret|privateKey|signature/);
  });

  it('signs the exact reviewed native transaction only after a separate confirmation', async () => {
    const h = fixture();
    const review = await prepareNativeDirectSweep(h.input, h.clock);
    expectNoSignature();
    const handoff = vi.fn();
    const result = await confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff });
    expect(vi.mocked(signDigest).mock.calls.length).toBe(1); expect(handoff).toHaveBeenCalledTimes(1);
    expect(h.state.raw).toBeDefined();
    const tx = parseTransaction(h.state.raw!);
    expect(tx).toMatchObject({ chainId: review.chainId, nonce: review.nonce, gas: review.gas, to: review.destination,
      maxFeePerGas: review.maxFeePerGas, maxPriorityFeePerGas: review.maxPriorityFeePerGas, value: review.net });
    expect(await recoverTransactionAddress({ serializedTransaction: h.state.raw! })).toBe(review.owner);
    expect(result.sent).toBe(review.net); expect(result.attempt.status).toBe('submitted');
    expectDerivedBuffersWiped();
  });

  it('includes the current L1/operator reserve in the review and in the exact signed net', async () => {
    const h = fixture(84532);
    const review = await prepareNativeDirectSweep(h.input, h.clock);
    expect(review.additionalFeeReserve).toBe(2n * (h.state.l1 + h.state.operator));
    expect(review.totalFeeReserve).toBe(review.maxGasCost + review.additionalFeeReserve);
    expect(review.net).toBe(BALANCE - review.totalFeeReserve);
    await confirmNativeDirectSweep(review, h.input);
    expect(parseTransaction(h.state.raw!).value).toBe(review.net);
  });

  it('prepares through a real read-only action grant, including chain/code/oracle checks, without broadcast authority', async () => {
    const h = fixture(84532);
    const chain = findChain(84532)!;
    const backend = withManifestChain(h.rpc);
    const dispatched: string[] = [];
    const authority = createNetworkAuthority({
      storage: () => ({ getItem: (key) => key === SETTINGS_KEY ? JSON.stringify({ rpcUrls: { '84532': h.input.endpoint } }) : null }),
      fetchFn: async (_url, init) => {
        if (typeof init.body !== 'string') throw new Error('Expected a string JSON-RPC request body');
        const message = JSON.parse(init.body) as { id: number; method: string; params: readonly unknown[] };
        dispatched.push(message.method);
        const result = message.method === 'eth_chainId' ? '0x14a34' : await backend.request(message.method, message.params);
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      },
    });
    try {
      const grant = authority.authorize({ action: 'sweep-quote', category: 'rpc', endpoint: h.input.endpoint, network: { kind: 'evm', chainId: chain.chainId } });
      const rpc = await createClient(chain, h.input.endpoint, { retries: 0, transport: {
        async send(url, body) {
          authority.assertRpcAuthorization(grant, chain.chainId, url, body);
          return (await grant.fetchFn(url, { method: 'POST', body })).text();
        },
      } });
      const manifest = backedManifest(chain.chainId);
      await verifyManifestOnChain(manifest, rpc);
      const review = await prepareNativeDirectSweep({ ...h.input, manifest, rpc }, h.clock);
      expect(review.additionalFeeReserve).toBe(2n * (h.state.l1 + h.state.operator));
      for (const method of ['eth_chainId', 'eth_getCode', 'eth_call', 'eth_gasPrice', 'eth_getBalance', 'eth_getTransactionCount', 'eth_estimateGas']) {
        expect(dispatched).toContain(method);
      }
      const count = dispatched.length;
      await expect(rpc.request('eth_sendRawTransaction', ['0x02'])).rejects.toThrow();
      expect(dispatched).toHaveLength(count); expect(dispatched).not.toContain('eth_sendRawTransaction');
      expectNoSignature(); expectDerivedBuffersWiped();
      cancelNativeSweepReview(review);
    } finally { authority.dispose(); }
  });

  it('stops nested operator-fee reads when authority expires during the L1 fee response', async () => {
    const h = fixture(84532);
    h.state.onRequest = (method, params) => {
      const data = (params[0] as { data?: string } | undefined)?.data;
      if (method === 'eth_call' && data?.startsWith('0x49948e0e') === true) h.state.wall += NATIVE_SWEEP_REVIEW_MS;
    };
    await expect(prepareNativeDirectSweep(h.input, h.clock)).rejects.toThrow();
    expect(h.rpc.calls.filter((call) => call.method === 'eth_call')).toHaveLength(1);
    expectNoSignature(); expectDerivedBuffersWiped();
  });

  it('rejects a copied or forged review before deriving or contacting the RPC', async () => {
    const h = fixture();
    const review = await prepareNativeDirectSweep(h.input, h.clock);
    const reads = h.rpc.calls.length; const derives = vi.mocked(deriveStealthSecret).mock.calls.length;
    await expect(confirmNativeDirectSweep({ ...review }, h.input)).rejects.toThrow(/review/i);
    expect(h.rpc.calls).toHaveLength(reads); expect(vi.mocked(deriveStealthSecret).mock.calls.length).toBe(derives);
    expectNoSignature();
  });

  it.each(['destination', 'balance', 'chain', 'owner', 'announcement', 'endpoint', 'manifest', 'context'] as const)(
    'rejects a changed %s binding before any confirmation RPC or key loan', async (field) => {
      const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
      const changed: NativeDirectSweepInput = { ...h.input,
        ...(field === 'destination' ? { destination: OTHER } : {}),
        ...(field === 'balance' ? { amount: BALANCE + 1n } : {}),
        ...(field === 'chain' ? { target: { ...h.input.target, chainId: 84532 } } : {}),
        ...(field === 'owner' ? { target: { ...h.input.target, owner: OTHER } } : {}),
        ...(field === 'announcement' ? { target: { ...h.input.target, announcement: { ...h.input.target.announcement, metadata: '0xff' } } } : {}),
        ...(field === 'endpoint' ? { endpoint: 'https://another-rpc.test/' } : {}),
        ...(field === 'manifest' ? { manifest: { ...h.input.manifest, commit: 'another-source' } } : {}),
        ...(field === 'context' ? { context: {} } : {}),
      };
      const reads = h.rpc.calls.length; const derives = vi.mocked(deriveStealthSecret).mock.calls.length;
      await expect(confirmNativeDirectSweep(review, changed)).rejects.toThrow(/review/i);
      expect(h.rpc.calls).toHaveLength(reads); expect(vi.mocked(deriveStealthSecret).mock.calls.length).toBe(derives);
      await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
      expectNoSignature();
    },
  );

  it.each(['wall expiry', 'monotonic expiry', 'wall rollback', 'monotonic rollback', 'NaN', 'infinity', 'throw'] as const)(
    'permanently refuses %s even when a later clock looks valid', async (change) => {
      const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
      h.state.wall += 2_000; h.state.monotonic += 2_000; assertNativeSweepReview(review);
      if (change === 'wall expiry') h.state.wall = NOW + NATIVE_SWEEP_REVIEW_MS;
      if (change === 'monotonic expiry') h.state.monotonic = 1_000 + NATIVE_SWEEP_REVIEW_MS;
      if (change === 'wall rollback') h.state.wall -= 1_000;
      if (change === 'monotonic rollback') h.state.monotonic -= 1_000;
      if (change === 'NaN') h.state.wall = NaN;
      if (change === 'infinity') h.state.monotonic = Infinity;
      if (change === 'throw') h.state.clockThrows = true;
      await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
      h.state.wall = NOW + 3_000; h.state.monotonic = 4_000; h.state.clockThrows = false;
      await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
      expectNoSignature();
    },
  );

  it.each(['lock', 'replacement', 'cancel'] as const)('cannot revive a review after session %s', async (change) => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    if (change === 'lock') suspendSession();
    if (change === 'replacement') generateSession();
    if (change === 'cancel') cancelNativeSweepReview(review);
    const reads = h.rpc.calls.length;
    await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow();
    expect(h.rpc.calls).toHaveLength(reads); expectNoSignature();
  });

  it('discards an expired preparation continuation and stops its remaining RPC reads', async () => {
    const h = fixture(); const gate = deferred<void>(); const reached = deferred<void>();
    h.state.onRequest = (method) => { if (method === 'eth_gasPrice') { reached.resolve(); return gate.promise; } };
    const pending = prepareNativeDirectSweep(h.input, h.clock);
    const refusal = expect(pending).rejects.toThrow(/review/i);
    await reached.promise; h.state.wall += NATIVE_SWEEP_REVIEW_MS; gate.resolve();
    await refusal;
    expect(h.rpc.calls.map((call) => call.method)).toEqual(['eth_gasPrice']);
    expectNoSignature(); expectDerivedBuffersWiped();
  });

  it.each(['gasPrice', 'nonce', 'gas', 'l1', 'operator', 'balance'] as const)('requires a new review when fresh %s changes', async (field) => {
    const h = fixture(84532); const review = await prepareNativeDirectSweep(h.input, h.clock);
    h.state[field] += field === 'gas' ? 10_000n : 1n;
    const handoff = vi.fn();
    await expect(confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff })).rejects.toThrow();
    expectNoSignature(); expect(handoff).not.toHaveBeenCalled(); expectDerivedBuffersWiped();
    await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
  });

  it('does not silently replace a successful simulation with an unavailable one', async () => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    h.state.simulationFails = true;
    await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
    expectNoSignature();
  });

  it('allows only one of two concurrent confirmations to sign', async () => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    const gate = deferred<void>(); const reached = deferred<void>();
    h.state.onRequest = (method) => { if (method === 'eth_gasPrice') { reached.resolve(); return gate.promise; } };
    const first = confirmNativeDirectSweep(review, h.input);
    await reached.promise;
    await expect(confirmNativeDirectSweep(review, h.input)).rejects.toThrow(/review/i);
    expectNoSignature(); gate.resolve(); await first;
    expect(vi.mocked(signDigest).mock.calls.length).toBe(1);
    expect(h.rpc.calls.filter((call) => call.method === 'eth_sendRawTransaction')).toHaveLength(1);
  });

  it('cancels a confirmation pending on RPC without a later signature or handoff', async () => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    const gate = deferred<void>(); const reached = deferred<void>();
    h.state.onRequest = (method) => { if (method === 'eth_gasPrice') { reached.resolve(); return gate.promise; } };
    const pending = confirmNativeDirectSweep(review, h.input); const refusal = expect(pending).rejects.toThrow(/review/i);
    await reached.promise; cancelNativeSweepReview(review); gate.resolve(); await refusal;
    expectNoSignature(); expectDerivedBuffersWiped();
  });

  it('cannot borrow a prior same-nonce replacement review for another attempt', async () => {
    const h = fixture();
    const replacement: SweepLock & { nonce: number } = { chainId: 11155111, owner: h.input.target.owner, nonce: 7,
      expectedHash: `0x${'12'.repeat(32)}`, otherHashes: [], status: 'unknown-after-handoff' };
    const input = { ...h.input, replacement };
    const review = await prepareNativeDirectSweep(input, h.clock);
    await expect(confirmNativeDirectSweep(review, { ...input, replacement: { ...replacement, expectedHash: `0x${'34'.repeat(32)}` } })).rejects.toThrow(/review/i);
    expectNoSignature();
    const fresh = await prepareNativeDirectSweep(input, h.clock);
    await confirmNativeDirectSweep(fresh, input);
    expect(parseTransaction(h.state.raw!).nonce).toBe(7);
  });

  it('discards a signature if the review expires while signing', async () => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    const actual = await vi.importActual<typeof import('@ghostpay/chain-adapters')>('@ghostpay/chain-adapters');
    vi.mocked(signDigest).mockImplementationOnce(async (...args) => {
      const result = await actual.signDigest(...args); h.state.monotonic += NATIVE_SWEEP_REVIEW_MS; return result;
    });
    const handoff = vi.fn();
    await expect(confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff })).rejects.toThrow(/review/i);
    expect(vi.mocked(signDigest).mock.calls.length).toBe(1); expect(handoff).not.toHaveBeenCalled();
    expect(h.rpc.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction'); expectDerivedBuffersWiped();
  });

  it.each(['submitted', 'unknown'] as const)('preserves %s evidence after transport starts even if the review closes', async (outcome) => {
    const h = fixture(); const review = await prepareNativeDirectSweep(h.input, h.clock);
    h.state.onSend = () => { cancelNativeSweepReview(review); h.state.wall += NATIVE_SWEEP_REVIEW_MS; };
    h.state.sendUnknown = outcome === 'unknown';
    const handoff = vi.fn();
    const pending = confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff });
    if (outcome === 'unknown') await expect(pending).rejects.toBeInstanceOf(DirectSweepOutcomeUnknownError);
    else expect((await pending).attempt.status).toBe('submitted');
    expect(handoff).toHaveBeenCalledTimes(1); expectDerivedBuffersWiped();
  });
});
