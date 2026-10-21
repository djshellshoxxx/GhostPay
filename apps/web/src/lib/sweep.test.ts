import { addressOfSecret, buildSweepTypedData, eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, sweepDigest, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { recoverTransactionAddress } from 'viem';
import { encodeFunctionResult, keccak256, recoverAddress, parseTransaction, decodeFunctionData } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { clearSession, generateSession, requireSession } from './session';
import { checkDestination, deriveVerifiedSweepKey, directSweep, getSweepQuote, readBalance, relayedSweep, type SweepTarget } from './sweep';
import { erc20Abi } from '@ghostpay/chain-adapters';

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const DEST = '0x6666666666666666666666666666666666666666' as Address;
const FEE_TO = '0x7777777777777777777777777777777777777777' as Address;
const NOW = 1_800_000_000;
const manifest = fakeManifest(84532);

let target: SweepTarget & { token: Address };
beforeEach(() => {
  const pub = generateSession();
  const p = deriveStealthPayment(pub.metaAddress);
  const announcement: PublicAnnouncement = {
    schemeId: 1n,
    stealthAddress: p.stealthAddress,
    ephemeralPublicKey: `0x${Array.from(p.ephemeralPublicKey, (b) => b.toString(16).padStart(2, '0')).join('')}`,
    metadata: `0x${Array.from(p.viewTag, (b) => b.toString(16).padStart(2, '0')).join('')}`,
  };
  target = { chainId: 84532, token: TOKEN, owner: p.stealthAddress, announcement };
});
afterEach(() => {
  clearSession();
});

const bodyText = (b: unknown): string => (typeof b === 'string' ? b : '');

describe('key derivation and destination checks', () => {
  it('derives a key that controls exactly the announced address', () => {
    const k = deriveVerifiedSweepKey(target);
    expect(addressOfSecret(k)).toBe(target.owner);
  });
  it('refuses when the owner is not the derived address (and wipes the key)', () => {
    expect(() => deriveVerifiedSweepKey({ ...target, owner: '0x9999999999999999999999999999999999999999' })).toThrow(/does not control/);
  });
  it('needs keys in memory', () => {
    clearSession();
    expect(() => deriveVerifiedSweepKey(target)).toThrow(/Load or generate/);
  });
  it('validates the destination', () => {
    expect(checkDestination(DEST.toLowerCase(), target.owner, manifest)).toBe(DEST);
    expect(() => checkDestination('nope', target.owner, manifest)).toThrow(/valid destination/);
    expect(() => checkDestination(target.owner, target.owner, manifest)).toThrow(/must differ/);
    for (const bad of [FAKE_ROUTER, FAKE_SWEEP_RELAYER, FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT]) {
      expect(() => checkDestination(bad, target.owner, manifest)).toThrow(/GhostPay contract or the fee recipient/);
    }
  });
});

describe('readBalance', () => {
  it('reads native and token balances strictly', async () => {
    expect(await readBalance(mockRpc(84532, () => '0x10'), target.owner, 'native')).toBe(16n);
    expect(await readBalance(mockRpc(84532, () => `0x${'0'.repeat(63)}9`), target.owner, TOKEN)).toBe(9n);
    await expect(readBalance(mockRpc(84532, () => '0x1'), target.owner, TOKEN)).rejects.toThrow(/unexpected balance/);
  });
});

describe('getSweepQuote', () => {
  const quoteFetch = (over: Record<string, unknown> = {}) => (): Promise<Response> =>
    Promise.resolve(new Response(JSON.stringify({ fee: '5000', feeTo: FAKE_FEE_RECIPIENT, expiresAt: NOW + 60, quoteToken: 'tok', ...over })));
  it('returns the quote and net amount', async () => {
    const q = await getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch());
    expect(q.net).toBe(995_000n);
  });
  it('requires a relayer URL', async () => {
    await expect(getSweepQuote('', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT)).rejects.toThrow(/relayer URL/);
  });
  it('refuses fees above the published 3 % cap', async () => {
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ fee: '30001' }))).rejects.toThrow(/above the published cap/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ fee: '1000000' }))).rejects.toThrow(/above the published cap/);
  });
  it('refuses a feeTo that is not the manifest fee recipient', async () => {
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ feeTo: FEE_TO }))).rejects.toThrow(/does not match the deployment fee recipient/);
  });
  it('refuses expired quotes and unacceptable fee addresses', async () => {
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ expiresAt: NOW }))).rejects.toThrow(/expired/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ feeTo: DEST }))).rejects.toThrow(/fee address is unacceptable/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, FAKE_FEE_RECIPIENT, quoteFetch({ feeTo: target.owner }))).rejects.toThrow(/fee address is unacceptable/);
  });
});

describe('relayedSweep (EIP-712 sweep + ERC-2612 permit, signed in memory)', () => {
  it('signs a sweep and a permit that recover to the stealth address and submits them', async () => {
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 4n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
    });
    let posted: { chainId: number; sweep: Record<string, string>; sweepSig: `0x${string}`; permit: Record<string, string | number>; quoteToken: string } | undefined;
    const fetchFn = (_u: string, init: RequestInit): Promise<Response> => {
      posted = JSON.parse(bodyText(init.body)) as never;
      return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'12'.repeat(32)}` })));
    };
    const hash = await relayedSweep({
      target,
      manifest,
      destination: DEST,
      amount: 1_000_000n,
      quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' },
      relayerUrl: 'https://relay.test',
      rpc,
      nowSeconds: NOW,
      fetchFn,
      randomNonce: () => 42n,
    });
    expect(hash).toBe(`0x${'12'.repeat(32)}`);
    const p = posted!;
    expect(p.quoteToken).toBe('tok');
    expect(p.chainId).toBe(84532);
    expect(p.sweep).toMatchObject({ token: TOKEN, owner: target.owner, destination: DEST, feeTo: FEE_TO, amount: '1000000', fee: '5000', nonce: '42' });
    const td = buildSweepTypedData(84532, manifest.sweepRelayer, {
      token: TOKEN,
      owner: target.owner,
      destination: DEST,
      feeTo: FEE_TO,
      amount: 1_000_000n,
      fee: 5000n,
      deadline: BigInt(NOW + 1200),
      nonce: 42n,
    });
    expect(await recoverAddress({ hash: sweepDigest(td), signature: p.sweepSig })).toBe(target.owner);
    expect(p.permit['value']).toBe('1000000');
    expect([27, 28]).toContain(p.permit['v']);
  });

  it('wipes the stealth key even when submission fails', async () => {
    const rpc = mockRpc(84532, () => {
      throw new Error('rpc down');
    });
    await expect(
      relayedSweep({ target, manifest, destination: DEST, amount: 1n, quote: { fee: 0n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' }, relayerUrl: 'https://relay.test', rpc, nowSeconds: NOW }),
    ).rejects.toThrow();
    void requireSession;
  });
});

describe('directSweep (stealth address pays gas, signs a plain transfer)', () => {
  function rpcFor(balance: bigint, sent: { raw?: `0x${string}` }) {
    return mockRpc(84532, (method) => {
      switch (method) {
        case 'eth_gasPrice':
          return '0x3b9aca00'; // 1 gwei
        case 'eth_getTransactionCount':
          return '0x7';
        case 'eth_getBalance':
          return `0x${balance.toString(16)}`;
        case 'eth_estimateGas':
          return '0xc350'; // 50_000
        case 'eth_sendRawTransaction':
          return keccak256(sent.raw ?? '0x');
        default:
          throw new Error(method);
      }
    });
  }
  it('signs an EIP-1559 ERC-20 transfer that recovers to the stealth address', async () => {
    const sent: { raw?: `0x${string}` } = {};
    const base = rpcFor(10n ** 17n, sent);
    const rpc = { ...base, request: (m: string, p: readonly unknown[]) => { if (m === 'eth_sendRawTransaction') sent.raw = p[0] as `0x${string}`; return base.request(m, p).then((r) => (m === 'eth_sendRawTransaction' ? keccak256(p[0] as `0x${string}`) : r)); } };
    const res = await directSweep({ target, destination: DEST, amount: 777n, rpc });
    expect(res.hash).toBe(keccak256(sent.raw!));
    expect(res.sent).toBe(777n);
    const tx = parseTransaction(sent.raw!);
    expect(tx.chainId).toBe(84532);
    expect(tx.nonce).toBe(7);
    expect(tx.to?.toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(tx.value ?? 0n).toBe(0n);
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data! });
    expect(decoded.functionName).toBe('transfer');
    expect((decoded.args as [string, bigint])[0].toLowerCase()).toBe(DEST.toLowerCase());
    expect((decoded.args as [string, bigint])[1]).toBe(777n);
    expect(await recoverTransactionAddress({ serializedTransaction: sent.raw as never })).toBe(target.owner);
    expect(res.maxGasCost).toBe(60_000n * 2_000_000_000n);
  });

  it('sweeps native balance minus the maximum fee', async () => {
    const sent: { raw?: `0x${string}` } = {};
    const base = rpcFor(10n ** 17n, sent);
    const rpc = { ...base, request: (m: string, p: readonly unknown[]) => { if (m === 'eth_sendRawTransaction') sent.raw = p[0] as `0x${string}`; return base.request(m, p).then((r) => (m === 'eth_sendRawTransaction' ? keccak256(p[0] as `0x${string}`) : r)); } };
    const res = await directSweep({ target: { ...target, token: 'native' }, destination: DEST, amount: 10n ** 17n, rpc });
    const tx = parseTransaction(sent.raw!);
    expect(tx.to?.toLowerCase()).toBe(DEST.toLowerCase());
    expect(tx.value).toBe(10n ** 17n - 21_000n * 2_000_000_000n);
    expect(res.sent).toBe(tx.value);
    expect(await recoverTransactionAddress({ serializedTransaction: sent.raw as never })).toBe(target.owner);
  });

  it('explains when the stealth address has no gas, and when native balance is too low', async () => {
    await expect(directSweep({ target, destination: DEST, amount: 1n, rpc: rpcFor(0n, {}) })).rejects.toThrow(/no native coin for gas/);
    await expect(directSweep({ target: { ...target, token: 'native' }, destination: DEST, amount: 1n, rpc: rpcFor(1000n, {}) })).rejects.toThrow(/does not cover the network fee/);
  });

  it('rejects an RPC that returns a hash that does not match the signed transaction', async () => {
    const base = rpcFor(10n ** 17n, {});
    const rpc = { ...base, request: (m: string, p: readonly unknown[]) => (m === 'eth_sendRawTransaction' ? Promise.resolve(`0x${'aa'.repeat(32)}`) : base.request(m, p)) };
    await expect(directSweep({ target, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/does not match the signed transaction/);
  });
});
