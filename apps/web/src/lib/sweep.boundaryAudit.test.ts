import { createClient, findChain, signDigest, tokensForChain, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, deriveStealthSecret, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { recoverTransactionAddress, type TransactionSerializedEIP1559 } from 'viem';
import { keccak256 } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { createNetworkAuthority } from './networkAuthorization';
import { clearSession, generateSession, subscribeSessionExpiryCheck, suspendSession } from './session';
import { SETTINGS_KEY } from './settings';
import {
  confirmNativeDirectSweep, directSweep, DirectSweepOutcomeUnknownError, prepareNativeDirectSweep,
  type NativeDirectSweepInput,
} from './sweep';

// Call real cryptography while observing only counts and the final public transaction.
vi.mock('@ghostpay/chain-adapters', async (load) => {
  const actual = await load<typeof import('@ghostpay/chain-adapters')>();
  return { ...actual, signDigest: vi.fn(actual.signDigest) };
});
vi.mock('@ghostpay/core-crypto', async (load) => {
  const actual = await load<typeof import('@ghostpay/core-crypto')>();
  return { ...actual, deriveStealthSecret: vi.fn(actual.deriveStealthSecret) };
});

const ENDPOINT = 'https://sweep-audit.invalid/';
const CHAIN = 11155111;
const BALANCE = 10n ** 17n;
const DESTINATION = '0x6666666666666666666666666666666666666666' as Address;
const cleanup: (() => void)[] = [];

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
  clearSession();
  vi.restoreAllMocks();
});

async function fixture() {
  const payment = deriveStealthPayment(generateSession().metaAddress);
  const hex = (bytes: Uint8Array): `0x${string}` => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const announcement: PublicAnnouncement = {
    schemeId: 1n, stealthAddress: payment.stealthAddress,
    ephemeralPublicKey: hex(payment.ephemeralPublicKey), metadata: hex(payment.viewTag),
  };
  const state = {
    methods: [] as string[], raw: undefined as TransactionSerializedEIP1559 | undefined,
    settings: JSON.stringify({ rpcUrls: { [String(CHAIN)]: ENDPOINT } }),
    afterDispatch: undefined as (() => void) | undefined,
  };
  const authority = createNetworkAuthority({
    storage: () => ({ getItem: (key) => key === SETTINGS_KEY ? state.settings : null }),
    fetchFn: (_url, init) => {
      if (typeof init.body !== 'string') throw new Error('Expected a JSON-RPC request');
      const message = JSON.parse(init.body) as { id: number; method: string; params: readonly unknown[] };
      state.methods.push(message.method);
      let result: unknown;
      switch (message.method) {
        case 'eth_chainId': result = `0x${CHAIN.toString(16)}`; break;
        case 'eth_gasPrice': result = '0x3b9aca00'; break;
        case 'eth_getTransactionCount': result = '0x7'; break;
        case 'eth_getBalance': result = `0x${BALANCE.toString(16)}`; break;
        case 'eth_estimateGas': result = '0x5208'; break;
        case 'eth_call': result = '0x'; break;
        case 'eth_sendRawTransaction': {
          const raw = message.params[0];
          if (typeof raw !== 'string' || !raw.startsWith('0x02')) throw new Error('Expected EIP-1559 transaction');
          state.raw = raw as TransactionSerializedEIP1559;
          result = keccak256(state.raw);
          state.afterDispatch?.();
          break;
        }
        default: throw new Error(`Unexpected public method: ${message.method}`);
      }
      return Promise.resolve(new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })));
    },
  });
  cleanup.push(authority.dispose);
  const grant = authority.authorize({ action: 'sweep-submit', category: 'rpc', endpoint: ENDPOINT,
    network: { kind: 'evm', chainId: CHAIN } });
  const rpc = await createClient(findChain(CHAIN)!, ENDPOINT, { retries: 0, transport: {
    async send(url, body) {
      authority.assertRpcAuthorization(grant, CHAIN, url, body);
      return (await grant.fetchFn(url, { method: 'POST', body })).text();
    },
  } });
  const input: NativeDirectSweepInput = {
    target: { chainId: CHAIN, token: 'native', owner: payment.stealthAddress, announcement },
    manifest: fakeManifest(CHAIN), destination: DESTINATION, amount: BALANCE, rpc,
    endpoint: ENDPOINT, context: {},
  };
  return { input, state, authority, grant };
}

function expectWiped(): void {
  for (const result of vi.mocked(deriveStealthSecret).mock.results) {
    if (result.type === 'return') expect((result.value as Uint8Array).every((value) => value === 0)).toBe(true);
  }
}

async function afterSignature(action: () => void): Promise<void> {
  const actual = await vi.importActual<typeof import('@ghostpay/chain-adapters')>('@ghostpay/chain-adapters');
  vi.mocked(signDigest).mockImplementationOnce(async (...args) => {
    const signed = await actual.signDigest(...args);
    action();
    return signed;
  });
}

describe('independent final Sweep authority audit', () => {
  it('preserves one authorized signature and one real-client handoff', async () => {
    const h = await fixture();
    const review = await prepareNativeDirectSweep(h.input);
    expect(vi.mocked(signDigest).mock.calls.length).toBe(0);
    const handoff = vi.fn();
    const result = await confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff });
    expect(vi.mocked(signDigest).mock.calls.length).toBe(1);
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(h.state.methods.filter((method) => method === 'eth_sendRawTransaction')).toHaveLength(1);
    expect(result.attempt.status).toBe('submitted');
    expect(h.state.raw).toBeDefined();
    expect(await recoverTransactionAddress({ serializedTransaction: h.state.raw! })).toBe(h.input.target.owner);
    expectWiped();
  });

  it.each(['silent clear', 'suspension', 'replacement', 'delayed expiry'] as const)(
    'refuses a completed local signature after %s without creating a handoff', async (event) => {
      const h = await fixture();
      const review = await prepareNativeDirectSweep(h.input);
      let expired = false;
      if (event === 'delayed expiry') cleanup.push(subscribeSessionExpiryCheck(() => {
        if (expired) { expired = false; suspendSession(); }
      }));
      await afterSignature(() => {
        if (event === 'silent clear') clearSession(false);
        if (event === 'suspension') suspendSession();
        if (event === 'replacement') generateSession();
        if (event === 'delayed expiry') expired = true;
      });
      const handoff = vi.fn();
      await expect(confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff })).rejects.toThrow();
      expect(vi.mocked(signDigest).mock.calls.length).toBe(1);
      expect(handoff).not.toHaveBeenCalled();
      expect(h.state.methods).not.toContain('eth_sendRawTransaction');
      expect(h.state.raw).toBeUndefined();
      expectWiped();
    },
  );

  it.each(['invalidate network', 'replace endpoint'] as const)(
    'does not transmit a completed signature after %s; retains conservative journal uncertainty', async (event) => {
      const h = await fixture();
      const review = await prepareNativeDirectSweep(h.input);
      await afterSignature(() => {
        if (event === 'invalidate network') h.authority.invalidate();
        if (event === 'replace endpoint') h.state.settings = JSON.stringify({ rpcUrls: { [String(CHAIN)]: 'https://replacement.invalid/' } });
      });
      const handoff = vi.fn();
      await expect(confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff })).rejects.toBeInstanceOf(DirectSweepOutcomeUnknownError);
      expect(vi.mocked(signDigest).mock.calls.length).toBe(1);
      expect(handoff).toHaveBeenCalledTimes(1);
      expect(h.state.methods).not.toContain('eth_sendRawTransaction');
      expect(h.state.raw).toBeUndefined();
      expectWiped();
    },
  );

  it('rechecks session revocation after the synchronous journal callback and before RPC dispatch', async () => {
    const h = await fixture();
    const review = await prepareNativeDirectSweep(h.input);
    const handoff = vi.fn(() => { clearSession(false); });
    await expect(confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff })).rejects.toBeInstanceOf(DirectSweepOutcomeUnknownError);
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(h.state.methods).not.toContain('eth_sendRawTransaction');
    expectWiped();
  });

  it('retains the exact expected hash when session revocation interrupts an accepted transport response', async () => {
    const h = await fixture();
    const review = await prepareNativeDirectSweep(h.input);
    h.state.afterDispatch = suspendSession;
    const handoff = vi.fn();
    let error: unknown;
    try { await confirmNativeDirectSweep(review, { ...h.input, onBeforeHandoff: handoff }); }
    catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(DirectSweepOutcomeUnknownError);
    if (!(error instanceof DirectSweepOutcomeUnknownError)) throw new Error('Expected uncertain transport outcome');
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(h.state.methods.filter((method) => method === 'eth_sendRawTransaction')).toHaveLength(1);
    expect(h.state.raw).toBeDefined();
    expect(error.attempt.expectedHash).toBe(keccak256(h.state.raw!));
    expect(error.attempt.status).toBe('unknown-after-handoff');
    expect(await recoverTransactionAddress({ serializedTransaction: h.state.raw! })).toBe(h.input.target.owner);
    expectWiped();
  });

  it.each(['silent clear', 'invalidate network'] as const)(
    'refuses final ERC-20 dispatch after %s in the journal callback', async (event) => {
      const h = await fixture();
      const token = tokensForChain(CHAIN)[0];
      if (token === undefined) throw new Error('Expected an allowlisted testnet token');
      const handoff = vi.fn(() => {
        if (event === 'silent clear') clearSession(false);
        if (event === 'invalidate network') h.authority.invalidate();
      });
      await expect(directSweep({ ...h.input, target: { ...h.input.target, token: token.address },
        amount: 1_000_000n, onBeforeHandoff: handoff,
      })).rejects.toBeInstanceOf(DirectSweepOutcomeUnknownError);
      expect(vi.mocked(signDigest).mock.calls.length).toBe(1);
      expect(handoff).toHaveBeenCalledTimes(1);
      expect(h.state.methods).not.toContain('eth_sendRawTransaction');
      expect(h.state.raw).toBeUndefined();
      expectWiped();
    },
  );
});
