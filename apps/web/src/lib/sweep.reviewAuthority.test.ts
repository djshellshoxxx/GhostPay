import { eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, signDigest, signPermit, signSweep, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, deriveStealthSecret, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { recoverTransactionAddress, type TransactionSerializedEIP1559 } from 'viem';
import { encodeFunctionResult, keccak256, parseTransaction } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { clearSession, generateSession } from './session';
import { directSweep, DirectSweepOutcomeUnknownError, relayedSweep, type SweepTarget } from './sweep';

// Observe actual signing and derivation while retaining their cryptographic implementations.
// Assert call counts separately so a failure never asks the reporter to render secret arguments.
vi.mock('@ghostpay/chain-adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/chain-adapters')>();
  return { ...actual, signDigest: vi.fn(actual.signDigest), signPermit: vi.fn(actual.signPermit), signSweep: vi.fn(actual.signSweep) };
});
vi.mock('@ghostpay/core-crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/core-crypto')>();
  return { ...actual, deriveStealthSecret: vi.fn(actual.deriveStealthSecret) };
});

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const DEST = '0x6666666666666666666666666666666666666666' as Address;
const NOW = 1_800_000_000;
const BALANCE = 10n ** 17n;
const HASH = `0x${'12'.repeat(32)}`;
let target: SweepTarget & { token: Address };
beforeEach(() => {
  vi.clearAllMocks();
  const payment = deriveStealthPayment(generateSession().metaAddress);
  const hex = (bytes: Uint8Array): `0x${string}` => `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const announcement: PublicAnnouncement = {
    schemeId: 1n, stealthAddress: payment.stealthAddress,
    ephemeralPublicKey: hex(payment.ephemeralPublicKey), metadata: hex(payment.viewTag),
  };
  target = { chainId: 84532, token: TOKEN, owner: payment.stealthAddress, announcement };
});
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

function review() {
  let current = true;
  return {
    revoke: () => { current = false; },
    assertCurrent: () => { if (!current) throw new Error('review replaced'); },
  };
}

function assertEip1559Transaction(value: unknown): asserts value is TransactionSerializedEIP1559 {
  expect(typeof value === 'string' && value.startsWith('0x02')).toBe(true);
}

function directInput(onRequest: (method: string) => void = () => undefined) {
  const authority = review();
  const rpc = mockRpc(11155111, (method, params) => {
    onRequest(method);
    switch (method) {
      case 'eth_gasPrice': return '0x3b9aca00';
      case 'eth_getTransactionCount': return '0x7';
      case 'eth_getBalance': return `0x${BALANCE.toString(16)}`;
      case 'eth_estimateGas': return '0x5208';
      case 'eth_call': return '0x';
      case 'eth_sendRawTransaction': return keccak256(params[0] as `0x${string}`);
      default: throw new Error(method);
    }
  });
  const handoff = vi.fn(authority.assertCurrent);
  const input = {
    target: { ...target, chainId: 11155111, token: 'native' as const },
    manifest: fakeManifest(11155111), destination: DEST, amount: BALANCE, rpc, nowSeconds: NOW,
    assertReviewCurrent: authority.assertCurrent, onBeforeHandoff: handoff,
  };
  return { input, authority, rpc, handoff };
}

function relayedInput(onRequest: () => void = () => undefined) {
  const authority = review();
  const manifest = fakeManifest(84532);
  const rpc = mockRpc(84532, (_method, params) => {
    onRequest();
    const data = (params[0] as { data: string }).data;
    if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
    if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 4n });
    return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
  });
  const fetchFn = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ txHash: HASH }))));
  const handoff = vi.fn(authority.assertCurrent);
  const input = {
    target, manifest, destination: DEST, amount: 1_000_000n, rpc,
    quote: { fee: 5000n, feeTo: manifest.feeRecipient, expiresAt: NOW + 60, quoteToken: 'tok' },
    relayerUrl: 'https://relay.test', nowSeconds: () => NOW, randomNonce: () => 42n, fetchFn,
    assertReviewCurrent: authority.assertCurrent, onBeforeHandoff: handoff,
  };
  return { input, authority, rpc, fetchFn, handoff };
}

describe('Sweep helper review authority', () => {
  it('refuses a revoked direct review before deriving or signing a key', async () => {
    const h = directInput(); h.authority.revoke();
    await expect(directSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(deriveStealthSecret).mock.calls.length).toBe(0); expect(vi.mocked(signDigest).mock.calls.length).toBe(0);
    expect(h.rpc.calls).toHaveLength(0); expect(h.handoff).not.toHaveBeenCalled();
  });

  it.each(['eth_gasPrice', 'eth_getTransactionCount', 'eth_getBalance', 'eth_estimateGas', 'eth_call'])('refuses a changed direct review during %s before signing', async (pausedMethod) => {
    const h = directInput((method) => { if (method === pausedMethod) h.authority.revoke(); });
    await expect(directSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(signDigest).mock.calls.length).toBe(0); expect(h.handoff).not.toHaveBeenCalled();
    expect(h.rpc.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction');
    const secret = vi.mocked(deriveStealthSecret).mock.results[0]?.value as Uint8Array;
    expect(Array.from(secret).every((byte) => byte === 0)).toBe(true);
  });

  it('discards a direct signature completed after its review was revoked', async () => {
    const h = directInput();
    const actual = await vi.importActual<typeof import('@ghostpay/chain-adapters')>('@ghostpay/chain-adapters');
    vi.mocked(signDigest).mockImplementationOnce(async (...args) => {
      const signed = await actual.signDigest(...args); h.authority.revoke(); return signed;
    });
    await expect(directSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(signDigest).mock.calls.length).toBe(1); expect(h.handoff).not.toHaveBeenCalled();
    expect(h.rpc.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction');
  });

  it.each(['submitted', 'unknown'])('retains the direct %s outcome when review changes after transport begins', async (outcome) => {
    const h = directInput();
    const base = h.input.rpc;
    let raw: `0x${string}` | undefined;
    const input = { ...h.input, rpc: { ...base, request: async (method: string, params: readonly unknown[]) => {
      if (method === 'eth_sendRawTransaction') {
        raw = params[0] as `0x${string}`; h.authority.revoke();
        if (outcome === 'unknown') throw new Error('transport interrupted');
      }
      return base.request(method, params);
    } } };
    if (outcome === 'submitted') expect((await directSweep(input)).attempt.status).toBe('submitted');
    else await expect(directSweep(input)).rejects.toBeInstanceOf(DirectSweepOutcomeUnknownError);
    expect(h.handoff).toHaveBeenCalledTimes(1); expect(raw).toBeDefined();
    assertEip1559Transaction(raw);
    expect(await recoverTransactionAddress({ serializedTransaction: raw })).toBe(target.owner);
  });

  it('refuses a revoked relayed review before deriving or requesting signatures', async () => {
    const h = relayedInput(); h.authority.revoke();
    await expect(relayedSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(deriveStealthSecret).mock.calls.length).toBe(0); expect(vi.mocked(signSweep).mock.calls.length).toBe(0);
    expect(vi.mocked(signPermit).mock.calls.length).toBe(0); expect(h.rpc.calls).toHaveLength(0);
    expect(h.handoff).not.toHaveBeenCalled(); expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('does not obtain a permit after the review changes during the sweep signature', async () => {
    const h = relayedInput();
    const actual = await vi.importActual<typeof import('@ghostpay/chain-adapters')>('@ghostpay/chain-adapters');
    vi.mocked(signSweep).mockImplementationOnce(async (...args) => {
      const signed = await actual.signSweep(...args); h.authority.revoke(); return signed;
    });
    await expect(relayedSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(signSweep).mock.calls.length).toBe(1); expect(vi.mocked(signPermit).mock.calls.length).toBe(0);
    expect(h.rpc.calls).toHaveLength(0); expect(h.handoff).not.toHaveBeenCalled(); expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a changed relayed review after permit RPC reads and before signing the permit', async () => {
    const h = relayedInput(() => { h.authority.revoke(); });
    await expect(relayedSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(signSweep).mock.calls.length).toBe(1); expect(vi.mocked(signPermit).mock.calls.length).toBe(0);
    expect(h.handoff).not.toHaveBeenCalled(); expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('discards a permit signature completed after its review was revoked', async () => {
    const h = relayedInput();
    const actual = await vi.importActual<typeof import('@ghostpay/chain-adapters')>('@ghostpay/chain-adapters');
    vi.mocked(signPermit).mockImplementationOnce(async (...args) => {
      const signed = await actual.signPermit(...args); h.authority.revoke(); return signed;
    });
    await expect(relayedSweep(h.input)).rejects.toThrow('review replaced');
    expect(vi.mocked(signPermit).mock.calls.length).toBe(1); expect(h.handoff).not.toHaveBeenCalled(); expect(h.fetchFn).not.toHaveBeenCalled();
  });

  it('retains successful relayer handoff even if the review is replaced during the response', async () => {
    const h = relayedInput();
    h.fetchFn.mockImplementationOnce(() => { h.authority.revoke(); return Promise.resolve(new Response(JSON.stringify({ txHash: HASH }))); });
    await expect(relayedSweep(h.input)).resolves.toBe(HASH);
    expect(vi.mocked(signSweep).mock.calls.length).toBe(1); expect(vi.mocked(signPermit).mock.calls.length).toBe(1);
    expect(h.handoff).toHaveBeenCalledTimes(1); expect(h.fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('native sweep reviewed balance', () => {
  it.each([BALANCE + 1n, BALANCE - 1n])('refuses a native balance changed to %s before signing or creating an attempt', async (freshBalance) => {
    const h = directInput();
    const base = h.input.rpc;
    const input = { ...h.input, rpc: { ...base, request: (method: string, params: readonly unknown[]) =>
      method === 'eth_getBalance' ? Promise.resolve(`0x${freshBalance.toString(16)}`) : base.request(method, params) } };
    await expect(directSweep(input)).rejects.toThrow('Your RPC returned an unexpected balance');
    expect(vi.mocked(signDigest).mock.calls.length).toBe(0); expect(h.handoff).not.toHaveBeenCalled();
    expect(base.calls.map((call) => call.method)).not.toContain('eth_estimateGas');
    expect(base.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction');
    const secret = vi.mocked(deriveStealthSecret).mock.results[0]?.value as Uint8Array;
    expect(Array.from(secret).every((byte) => byte === 0)).toBe(true);
  });

  it('refuses a changed balance returned by a pending native read with an otherwise current review', async () => {
    const h = directInput();
    const base = h.input.rpc;
    let answer!: (balance: string) => void;
    let reached!: () => void;
    const started = new Promise<void>((resolve) => { reached = resolve; });
    const input = { ...h.input, rpc: { ...base, request: (method: string, params: readonly unknown[]) => {
      if (method !== 'eth_getBalance') return base.request(method, params);
      reached();
      return new Promise<string>((resolve) => { answer = resolve; });
    } } };
    const pending = directSweep(input);
    const refused = expect(pending).rejects.toThrow('Your RPC returned an unexpected balance');
    await started;
    answer(`0x${(BALANCE + 10n ** 15n).toString(16)}`);
    await refused;
    expect(vi.mocked(signDigest).mock.calls.length).toBe(0); expect(h.handoff).not.toHaveBeenCalled();
    expect(base.calls.map((call) => call.method)).not.toContain('eth_sendRawTransaction');
  });

  it('applies the same balance binding to a same-nonce replacement', async () => {
    const h = directInput();
    const base = h.input.rpc;
    const input = { ...h.input, replaceNonce: 7, rpc: { ...base, request: (method: string, params: readonly unknown[]) =>
      method === 'eth_getBalance' ? Promise.resolve(`0x${(BALANCE + 1n).toString(16)}`) : base.request(method, params) } };
    await expect(directSweep(input)).rejects.toThrow('Your RPC returned an unexpected balance');
    expect(vi.mocked(signDigest).mock.calls.length).toBe(0); expect(h.handoff).not.toHaveBeenCalled();
  });

  it('signs only the reviewed native balance minus fees even if more funds arrive after the preflight read', async () => {
    let chainBalance = BALANCE;
    const h = directInput((method) => { if (method === 'eth_call') chainBalance += 10n ** 15n; });
    const base = h.input.rpc;
    let balanceReads = 0;
    let raw: `0x${string}` | undefined;
    const input = { ...h.input, rpc: { ...base, request: (method: string, params: readonly unknown[]) => {
      if (method === 'eth_getBalance') { balanceReads++; return Promise.resolve(`0x${chainBalance.toString(16)}`); }
      if (method === 'eth_sendRawTransaction') raw = params[0] as `0x${string}`;
      return base.request(method, params);
    } } };
    const result = await directSweep(input);
    const maximumGas = 21_000n * 2_000_000_000n;
    // Read at review, and before signing only to refuse a smaller balance: the larger one changes nothing signed.
    expect(chainBalance).toBeGreaterThan(BALANCE); expect(balanceReads).toBe(2);
    assertEip1559Transaction(raw);
    expect(parseTransaction(raw).value).toBe(BALANCE - maximumGas);
    expect(result.sent).toBe(BALANCE - maximumGas); expect(result.maxGasCost).toBe(maximumGas);
    expect(await recoverTransactionAddress({ serializedTransaction: raw })).toBe(target.owner);
  });
});
