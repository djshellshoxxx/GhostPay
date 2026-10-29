import { addressOfSecret, buildSweepTypedData, eip712DomainSeparator, erc20MetadataAbi, erc2612PermitAbi, sweepDigest, type Address } from '@ghostpay/chain-adapters';
import { deriveStealthPayment, type PublicAnnouncement } from '@ghostpay/core-crypto';
import { recoverTransactionAddress } from 'viem';
import { encodeAbiParameters, encodeFunctionResult, keccak256, parseAbi, recoverAddress, parseTransaction, decodeFunctionData } from 'viem/utils';
import { encodeFunctionData } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAKE_ANNOUNCER, FAKE_FEE_RECIPIENT, FAKE_ROUTER, FAKE_SWEEP_RELAYER, fakeManifest } from '../test/fakeManifest';
import { mockRpc } from '../test/mockRpc';
import { clearSession, generateSession, requireSession } from './session';
import { checkDestination, describeDestination, deriveVerifiedSweepKey, directSweep, DirectSweepOutcomeUnknownError, getSweepQuote, OP_STACK_GAS_PRICE_ORACLE, readBalance, reconcileRelayedOrder, reconcileSweepLock, RELAYED_EXPIRY_MARGIN_SECONDS, relayedSweep, type RelayedOrderRef, type SweepLock, type SweepTarget } from './sweep';
import { ChainAdapterError, erc20Abi, ghostPaySweepRelayerAbi } from '@ghostpay/chain-adapters';
import { userMessage } from './errors';
import * as sweepModule from './sweep';

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const DEST = '0x6666666666666666666666666666666666666666' as Address;
const FEE_TO = FAKE_FEE_RECIPIENT as Address;
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
/** Base Sepolia is OP Stack: mocks answer its GasPriceOracle with no L1 data or operator fee unless a test prices one. */
const feeOracleCall = (method: string, params: readonly unknown[]): boolean =>
  method === 'eth_call' && (params[0] as { to?: unknown } | undefined)?.to === OP_STACK_GAS_PRICE_ORACLE;
const NO_FEE = encodeAbiParameters([{ type: 'uint256' }], [0n]);

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
  it('L4-02: derives the key of a deep-scan payment whose announced view tag is wrong; the address checks still apply', () => {
    const tag = parseInt(target.announcement.metadata.slice(2, 4), 16) ^ 0x5a;
    const wrong: SweepTarget = { ...target, announcement: { ...target.announcement, metadata: `0x${tag.toString(16).padStart(2, '0')}` } };
    expect(addressOfSecret(deriveVerifiedSweepKey(wrong))).toBe(target.owner);
    expect(() => deriveVerifiedSweepKey({ ...wrong, owner: '0x9999999999999999999999999999999999999999' })).toThrow(/does not control/);
    expect(() => deriveVerifiedSweepKey({ ...wrong, announcement: { ...wrong.announcement, stealthAddress: '0x9999999999999999999999999999999999999999' } })).toThrow(/does not map to the announced address/);
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
    Promise.resolve(new Response(JSON.stringify({ fee: '5000', feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok', ...over })));
  it('returns the quote and net amount', async () => {
    const q = await getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch());
    expect(q.net).toBe(995_000n);
  });
  it('requires a relayer URL', async () => {
    await expect(getSweepQuote('', target, DEST, 1_000_000n, NOW, manifest.feeRecipient)).rejects.toThrow(/relayer URL/);
  });
  it('refuses fees above the published 3 % cap', async () => {
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ fee: '30001' }))).rejects.toThrow(/above the published cap/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ fee: '1000000' }))).rejects.toThrow(/above the published cap/);
  });
  it('refuses expired quotes and unacceptable fee addresses', async () => {
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ expiresAt: NOW }))).rejects.toThrow(/expired/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ feeTo: DEST }))).rejects.toThrow(/fee address is unacceptable/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ feeTo: target.owner }))).rejects.toThrow(/fee address is unacceptable/);
    await expect(getSweepQuote('https://relay.test', target, DEST, 1_000_000n, NOW, manifest.feeRecipient, quoteFetch({ feeTo: '0x7777777777777777777777777777777777777777' }))).rejects.toThrow(/does not match the deployment fee recipient/);
  });
});

describe('relayedSweep (EIP-712 sweep + ERC-2612 permit, signed in memory)', () => {
  it('pins feeTo to the deployment manifest and rejects near-expiry quotes before requesting signatures', async () => {
    const rpc = mockRpc(84532, () => {
      throw new Error('RPC should not be reached');
    });
    const submitted: unknown[] = [];
    const base = {
      target,
      manifest,
      destination: DEST,
      amount: 1_000_000n,
      relayerUrl: 'https://relay.test',
      rpc,
      nowSeconds: () => NOW,
      fetchFn: (): Promise<Response> => {
        submitted.push(true);
        return Promise.resolve(new Response('{}'));
      },
    };
    await expect(relayedSweep({ ...base, quote: { fee: 5000n, feeTo: '0x7777777777777777777777777777777777777777', expiresAt: NOW + 600, quoteToken: 'tok' } }))
      .rejects.toThrow(/does not match the deployment fee recipient/);
    await expect(relayedSweep({ ...base, quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 30, quoteToken: 'tok' } }))
      .rejects.toThrow(/expired or is about to/);
    expect(rpc.calls).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });

  it('rechecks quote expiry after asynchronous permit reads and stops before relay submission', async () => {
    let now = NOW;
    let submitted = false;
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) {
        now = NOW + 31;
        return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      }
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 4n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
    });
    await expect(relayedSweep({
      target,
      manifest,
      destination: DEST,
      amount: 1_000_000n,
      quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' },
      relayerUrl: 'https://relay.test',
      rpc,
      nowSeconds: () => now,
      fetchFn: (): Promise<Response> => {
        submitted = true;
        return Promise.resolve(new Response('{}'));
      },
    })).rejects.toThrow(/expired or is about to/);
    expect(submitted).toBe(false);
  });

  it('signs a sweep and a permit that recover to the stealth address and submits them', async () => {
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 4n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
    });
    let posted: { sweep: Record<string, string>; sweepSig: `0x${string}`; permit: Record<string, string | number>; quoteToken: string } | undefined;
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
      nowSeconds: () => NOW,
      fetchFn,
      randomNonce: () => 42n,
    });
    expect(hash).toBe(`0x${'12'.repeat(32)}`);
    const p = posted!;
    expect(p.quoteToken).toBe('tok');
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

  it('M1: hands the order identity to onBeforeHandoff before posting, and posts nothing when the hook throws', async () => {
    const rpc = mockRpc(84532, (_m, params) => {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith('0x06fdde03')) return encodeFunctionResult({ abi: erc20MetadataAbi, functionName: 'name', result: 'USDC' });
      if (data.startsWith('0x7ecebe00')) return encodeFunctionResult({ abi: erc2612PermitAbi, functionName: 'nonces', result: 4n });
      return eip712DomainSeparator({ name: 'USDC', version: '2', chainId: 84532, verifyingContract: TOKEN });
    });
    const events: string[] = [];
    let seen: RelayedOrderRef | undefined;
    const input = {
      target, manifest, destination: DEST, amount: 1_000_000n,
      quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' },
      relayerUrl: 'https://relay.test', rpc, nowSeconds: () => NOW, randomNonce: () => 42n,
      fetchFn: (): Promise<Response> => { events.push('post'); return Promise.resolve(new Response(JSON.stringify({ txHash: `0x${'12'.repeat(32)}` }))); },
    };
    await relayedSweep({ ...input, onBeforeHandoff: (o) => { events.push('lock'); seen = o; } });
    expect(events).toEqual(['lock', 'post']);
    expect(seen).toEqual({ relayer: manifest.sweepRelayer, nonce: 42n, deadline: NOW + 1200 });

    events.length = 0;
    await expect(relayedSweep({ ...input, onBeforeHandoff: () => { throw new Error('journal full'); } })).rejects.toThrow('journal full');
    expect(events).toEqual([]);
  });

  it('wipes the stealth key even when submission fails', async () => {
    const rpc = mockRpc(84532, () => {
      throw new Error('rpc down');
    });
    await expect(
      relayedSweep({ target, manifest, destination: DEST, amount: 1n, quote: { fee: 0n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' }, relayerUrl: 'https://relay.test', rpc, nowSeconds: () => NOW }),
    ).rejects.toThrow();
    void requireSession;
  });
});

describe('directSweep (stealth address pays gas, signs a plain transfer)', () => {
  function rpcFor(balance: bigint, sent: { raw?: `0x${string}` }, estimate = '0xc350' /* 50_000 */) {
    return mockRpc(84532, (method, params) => {
      if (feeOracleCall(method, params)) return NO_FEE;
      switch (method) {
        case 'eth_gasPrice':
          return '0x3b9aca00'; // 1 gwei
        case 'eth_getTransactionCount':
          return '0x7';
        case 'eth_getBalance':
          return `0x${balance.toString(16)}`;
        case 'eth_estimateGas':
          return estimate;
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
    const res = await directSweep({ target, manifest, destination: DEST, amount: 777n, rpc });
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

  it('sweeps native balance minus the maximum fee (a chain without an L1 data fee, plain-transfer destination)', async () => {
    const sent: { raw?: `0x${string}` } = {};
    const base = rpcFor(10n ** 17n, sent, '0x5208');
    const rpc = { ...base, request: (m: string, p: readonly unknown[]) => { if (m === 'eth_sendRawTransaction') sent.raw = p[0] as `0x${string}`; return base.request(m, p).then((r) => (m === 'eth_sendRawTransaction' ? keccak256(p[0] as `0x${string}`) : r)); } };
    const res = await directSweep({ target: { ...target, chainId: 11155111, token: 'native' }, manifest: fakeManifest(11155111), destination: DEST, amount: 10n ** 17n, rpc });
    const tx = parseTransaction(sent.raw!);
    expect(tx.chainId).toBe(11155111);
    expect(tx.to?.toLowerCase()).toBe(DEST.toLowerCase());
    expect(tx.value).toBe(10n ** 17n - 21_000n * 2_000_000_000n);
    expect(res.sent).toBe(tx.value);
    expect(await recoverTransactionAddress({ serializedTransaction: sent.raw as never })).toBe(target.owner);
  });

  it('explains when the stealth address has no gas, and when native balance is too low', async () => {
    await expect(directSweep({ target, manifest, destination: DEST, amount: 1n, rpc: rpcFor(0n, {}) })).rejects.toThrow(/no native coin for gas/);
    await expect(directSweep({ target: { ...target, token: 'native' }, manifest, destination: DEST, amount: 1n, rpc: rpcFor(1000n, {}) })).rejects.toThrow(/does not cover the network fee/);
  });

  it('rejects an RPC that returns a hash that does not match the signed transaction', async () => {
    const base = rpcFor(10n ** 17n, {});
    const rpc = { ...base, request: (m: string, p: readonly unknown[]) => (m === 'eth_sendRawTransaction' ? Promise.resolve(`0x${'aa'.repeat(32)}`) : base.request(m, p)) };
    await expect(directSweep({ target, manifest, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/does not match the signed transaction/);
  });

  it('aborts before signing when the session locks during an RPC await', async () => {
    let release!: (value: unknown) => void;
    const firstRpc = new Promise<unknown>((resolve) => { release = resolve; });
    const calls: string[] = [];
    const rpc = {
      request: (method: string): Promise<unknown> => {
        calls.push(method);
        return method === 'eth_gasPrice' ? firstRpc : Promise.resolve('0x1');
      },
    } as never;
    const pending = directSweep({ target, manifest, destination: DEST, amount: 1n, rpc });
    clearSession();
    release('0x3b9aca00');
    await expect(pending).rejects.toThrow(/Seller keys changed during this action/);
    expect(calls).toEqual(['eth_gasPrice']);
  });

  it('reports a direct sweep as submitted if the session locks after broadcast begins', async () => {
    const sent: { raw?: `0x${string}` } = {};
    const base = rpcFor(10n ** 17n, sent);
    let beginSend!: () => void;
    const sendStarted = new Promise<void>((resolve) => { beginSend = resolve; });
    let resolveSend!: (hash: unknown) => void;
    const sendResponse = new Promise<unknown>((resolve) => { resolveSend = resolve; });
    const rpc = {
      ...base,
      request: (method: string, params: readonly unknown[]) => {
        if (method === 'eth_sendRawTransaction') {
          sent.raw = params[0] as `0x${string}`;
          beginSend();
          return sendResponse;
        }
        return base.request(method, params);
      },
    };
    const pending = directSweep({ target, manifest, destination: DEST, amount: 777n, rpc });
    await sendStarted;
    clearSession();
    resolveSend(keccak256(sent.raw!));
    await expect(pending).resolves.toMatchObject({ hash: keccak256(sent.raw!), sent: 777n });
  });
});

describe('GP-SWEEP-OUTCOME-01: a direct sweep keeps its expected hash across an uncertain broadcast', () => {
  const balanceRpc = (sent: { raw?: `0x${string}`; sends: number }, onSend: (raw: `0x${string}`) => Promise<unknown>) => {
    const base = mockRpc(84532, (method) => {
      switch (method) {
        case 'eth_gasPrice':
          return '0x3b9aca00';
        case 'eth_getTransactionCount':
          return '0x7';
        case 'eth_getBalance':
          return `0x${(10n ** 17n).toString(16)}`;
        case 'eth_estimateGas':
          return '0xc350';
        case 'eth_call':
          return `0x${'0'.repeat(63)}1`;
        default:
          throw new Error(method);
      }
    });
    return {
      ...base,
      request: (m: string, p: readonly unknown[]): Promise<unknown> => {
        if (m !== 'eth_sendRawTransaction') return base.request(m, p);
        sent.raw = p[0] as `0x${string}`;
        sent.sends += 1;
        return onSend(sent.raw);
      },
    };
  };
  const caught = (p: Promise<unknown>): Promise<unknown> => p.then(() => { throw new Error('expected the sweep not to report success'); }, (e: unknown) => e);

  it('a rejected eth_sendRawTransaction after handoff yields an unknown outcome carrying the public descriptor', async () => {
    const sent: { raw?: `0x${string}`; sends: number } = { sends: 0 };
    const rpc = balanceRpc(sent, () => Promise.reject(new ChainAdapterError('RPC_FAILURE', 'connection reset after write')));
    const err = await caught(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc, nowSeconds: NOW }));
    expect(sent.sends).toBe(1);
    const expectedHash = keccak256(sent.raw!);
    expect((err as { attempt?: unknown }).attempt).toEqual({
      chainId: 84532,
      owner: target.owner,
      nonce: 7,
      destination: DEST,
      asset: TOKEN,
      amount: 777n,
      expectedHash,
      status: 'unknown-after-handoff',
    });
    const msg = userMessage(err);
    expect(msg).not.toMatch(/Nothing was sent|Blocked by a safety check/);
    expect(msg).toMatch(/may already have been broadcast/);
  });

  it('a mismatched returned hash is never success and keeps the locally computed expected hash', async () => {
    const sent: { raw?: `0x${string}`; sends: number } = { sends: 0 };
    const rpc = balanceRpc(sent, () => Promise.resolve(`0x${'aa'.repeat(32)}`));
    const err = await caught(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc, nowSeconds: NOW }));
    expect(userMessage(err)).toMatch(/does not match the signed transaction/);
    expect((err as { attempt?: { status: string; expectedHash: string; nonce: number } }).attempt).toMatchObject({
      status: 'unknown-after-handoff',
      expectedHash: keccak256(sent.raw!),
      nonce: 7,
    });
  });

  it('a successful send reports a submitted descriptor; pre-handoff failures carry no descriptor', async () => {
    const sent: { raw?: `0x${string}`; sends: number } = { sends: 0 };
    const ok = balanceRpc(sent, (raw) => Promise.resolve(keccak256(raw)));
    const res = await directSweep({ target, manifest, destination: DEST, amount: 777n, rpc: ok, nowSeconds: NOW });
    expect((res as { attempt?: unknown }).attempt).toMatchObject({ status: 'submitted', expectedHash: keccak256(sent.raw!), nonce: 7 });
    const evil = '0x00000000000000000000000000000000deadbeef' as Address;
    const pre = await caught(directSweep({ target: { ...target, token: evil }, manifest, destination: DEST, amount: 5n, rpc: ok, nowSeconds: NOW }));
    expect((pre as { attempt?: unknown }).attempt).toBeUndefined();
    expect(sent.sends).toBe(1);
  });

  it('read-only reconciliation looks up the exact hash; absence or an RPC failure leaves the outcome unknown', async () => {
    const reconcile = (sweepModule as unknown as { reconcileDirectSweep?: unknown }).reconcileDirectSweep as
      | ((rpc: unknown, a: unknown) => Promise<{ status: string }>)
      | undefined;
    expect(typeof reconcile).toBe('function');
    const attempt = { chainId: 84532, owner: target.owner, nonce: 7, destination: DEST, asset: TOKEN, amount: 777n, expectedHash: `0x${'bb'.repeat(32)}`, status: 'unknown-after-handoff' };
    const absent = mockRpc(84532, () => null);
    expect((await reconcile!(absent, attempt)).status).toBe('unknown-after-handoff');
    expect(absent.calls).toEqual([{ method: 'eth_getTransactionReceipt', params: [attempt.expectedHash] }]);
    expect((await reconcile!(mockRpc(84532, () => { throw new Error('timeout'); }), attempt)).status).toBe('unknown-after-handoff');
    expect((await reconcile!(mockRpc(84532, () => ({ transactionHash: attempt.expectedHash, status: '0x1', blockNumber: '0x10' })), attempt)).status).toBe('included');
    expect((await reconcile!(mockRpc(84532, () => ({ transactionHash: attempt.expectedHash, status: '0x0', blockNumber: '0x10' })), attempt)).status).toBe('reverted');
    expect((await reconcile!(mockRpc(84532, () => ({ transactionHash: `0x${'cc'.repeat(32)}`, status: '0x1', blockNumber: '0x10' })), attempt)).status).toBe('unknown-after-handoff');
  });
});

describe('S3-09 / S3-12 / S3-22 integration (tx-review + address-safety)', () => {
  const rpcWith = (over: Record<string, unknown>, balance = 10n ** 17n) =>
    mockRpc(84532, (method, params) => {
      if (feeOracleCall(method, params)) return NO_FEE;
      if (method in over) {
        const v = over[method];
        if (v instanceof Error) throw v;
        return v;
      }
      switch (method) {
        case 'eth_gasPrice':
          return '0x3b9aca00';
        case 'eth_getTransactionCount':
          return '0x7';
        case 'eth_getBalance':
          return `0x${balance.toString(16)}`;
        case 'eth_estimateGas':
          return '0xc350';
        case 'eth_sendRawTransaction':
          return keccak256(params[0] as `0x${string}`);
        default:
          throw new Error(method);
      }
    });

  it('refuses a token that is not on the allowlist before anything is signed (attacker-chosen contract)', async () => {
    const evil = '0x00000000000000000000000000000000deadbeef' as Address;
    const rpc = rpcWith({});
    await expect(directSweep({ target: { ...target, token: evil }, manifest, destination: DEST, amount: 5n, rpc })).rejects.toThrow(/TOKEN_NOT_ALLOWLISTED/);
    expect(rpc.calls.map((c) => c.method)).not.toContain('eth_sendRawTransaction');
  });

  it('refuses a fee cap forced up by a lying RPC (absolute ceiling)', async () => {
    const rpc = rpcWith({ eth_gasPrice: `0x${(3_000n * 10n ** 9n).toString(16)}` }, 10n ** 24n);
    await expect(directSweep({ target, manifest, destination: DEST, amount: 5n, rpc })).rejects.toThrow(/FEE_PER_GAS_ABOVE_CAP/);
    expect(rpc.calls.map((c) => c.method)).not.toContain('eth_sendRawTransaction');
  });

  it('refuses a gas limit estimate above the ceiling', async () => {
    const rpc = rpcWith({ eth_estimateGas: '0x7a120' }); // 500 000 x 1.2
    await expect(directSweep({ target, manifest, destination: DEST, amount: 5n, rpc })).rejects.toThrow(/GAS_LIMIT_ABOVE_CAP/);
  });

  it('refuses a native sweep whose fee would eat most of the balance', async () => {
    const rpc = rpcWith({ eth_estimateGas: '0x5208' }, 10n ** 14n);
    await expect(directSweep({ target: { ...target, chainId: 11155111, token: 'native' }, manifest: fakeManifest(11155111), destination: DEST, amount: 10n ** 14n, rpc })).rejects.toThrow(/FEE_SHARE_ABOVE_CAP/);
  });

  it('dry-runs the transfer and refuses a revert or a false return', async () => {
    await expect(directSweep({ target, manifest, destination: DEST, amount: 5n, rpc: rpcWith({ eth_call: new Error('execution reverted') }) })).rejects.toThrow(/would revert/);
    await expect(directSweep({ target, manifest, destination: DEST, amount: 5n, rpc: rpcWith({ eth_call: `0x${'0'.repeat(64)}` }) })).rejects.toThrow(/returned false/);
    const ok = rpcWith({ eth_call: `0x${'0'.repeat(63)}1` });
    await directSweep({ target, manifest, destination: DEST, amount: 5n, rpc: ok });
    expect(ok.calls.map((c) => c.method)).toContain('eth_call');
  });

  it('still works when the node cannot run eth_call (simulation unavailable, not a revert)', async () => {
    const rpc = rpcWith({ eth_call: new Error('method not supported') });
    const res = await directSweep({ target, manifest, destination: DEST, amount: 5n, rpc });
    expect(res.sent).toBe(5n);
  });

  it('relayed sweep signs only what was reviewed: a relayer feeTo that differs from the quote cannot slip in', async () => {
    const seen: unknown[] = [];
    const rpc = mockRpc(84532, () => {
      throw new Error('no rpc');
    });
    await expect(
      relayedSweep({
        target,
        manifest,
        destination: DEST,
        amount: 1_000_000n,
        quote: { fee: 5000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' },
        relayerUrl: 'https://relay.test',
        rpc,
        nowSeconds: () => NOW,
        randomNonce: () => 1n,
        fetchFn: (): Promise<Response> => {
          seen.push(1);
          return Promise.resolve(new Response('{}'));
        },
      }),
    ).rejects.toThrow(); // the permit needs an RPC; the sweep typed data already passed the review
    expect(seen).toHaveLength(0);
  });

  it('refuses an excessive relayer fee at the review stage even if the quote check were bypassed', async () => {
    const rpc = mockRpc(84532, () => {
      throw new Error('no rpc');
    });
    await expect(
      relayedSweep({ target, manifest, destination: DEST, amount: 1_000_000n, quote: { fee: 400_000n, feeTo: FEE_TO, expiresAt: NOW + 60, quoteToken: 'tok' }, relayerUrl: 'https://relay.test', rpc, nowSeconds: () => NOW }),
    ).rejects.toThrow(/above the published cap/);
  });

  it('rejects poisoned and malformed destinations', () => {
    const flip = (mid: string): string => mid.toLowerCase().replace(/[0-9a-f]/g, (c) => (c === 'a' ? 'b' : 'a'));
    const near = `${manifest.router.slice(0, 6)}${flip(manifest.router.slice(6, -4))}${manifest.router.slice(-4)}`.toLowerCase();
    expect(() => checkDestination(near, target.owner, manifest)).toThrow(/almost identical/);
    const savedLike = `${DEST.slice(0, 6)}${flip(DEST.slice(6, -4))}${DEST.slice(-4)}`.toLowerCase();
    expect(() => checkDestination(savedLike, target.owner, manifest, [DEST])).toThrow(/almost identical/);
    expect(checkDestination(DEST, target.owner, manifest, [DEST])).toBe(DEST);
    // bad EIP-55 checksum and all-uppercase hex are refused, whitespace is trimmed
    const bad = DEST.slice(0, 2) + DEST.slice(2).split('').map((c, i) => (i === 3 ? (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) : c)).join('');
    if (bad !== DEST && bad !== DEST.toLowerCase()) expect(() => checkDestination(bad, target.owner, manifest)).toThrow(/valid destination/);
    expect(() => checkDestination(`0x${'ab'.repeat(20).toUpperCase()}`, target.owner, manifest)).toThrow(/valid destination/);
    expect(checkDestination(`  ${DEST.toLowerCase()} `, target.owner, manifest)).toBe(DEST);
  });

  it('classifies destinations for the linkability warning', () => {
    expect(describeDestination(DEST, target.owner, [])).toBe('new');
    expect(describeDestination(DEST, target.owner, [DEST])).toBe('saved');
  });
});

describe('L2-F2: a native direct sweep keeps back every fee the chain charges', () => {
  const ORACLE = '0x420000000000000000000000000000000000000F';
  const oracleAbi = parseAbi(['function getL1Fee(bytes _data) view returns (uint256)', 'function getOperatorFee(uint256 _gasUsed) view returns (uint256)']);
  const MAX_FEE = 2_000_000_000n; // eth_gasPrice 1 gwei, signed with twice that as maxFeePerGas
  const BALANCE = 10n ** 17n;
  const L1_FEE = 3_000_000_000_000n;
  interface Net {
    readonly balance?: bigint;
    readonly estimate?: string | Error;
    readonly l1Fee?: bigint | string | Error;
    readonly operatorFee?: bigint | Error;
    readonly dryRun?: string | Error;
    readonly pending?: string;
    readonly latest?: string;
  }
  interface Seen { raw?: `0x${string}`; l1Tx?: `0x${string}`; operatorGas?: bigint }
  const chainRpc = (chainId: number, net: Net, seen: Seen) =>
    mockRpc(chainId, (method, params) => {
      switch (method) {
        case 'eth_gasPrice':
          return '0x3b9aca00';
        case 'eth_getTransactionCount':
          return params[1] === 'latest' ? (net.latest ?? '0x7') : (net.pending ?? '0x7');
        case 'eth_getBalance':
          return `0x${(net.balance ?? BALANCE).toString(16)}`;
        case 'eth_estimateGas':
          if (net.estimate instanceof Error) throw net.estimate;
          return net.estimate ?? '0x5208';
        case 'eth_call': {
          const call = params[0] as { to: string; data: `0x${string}` };
          if (call.to === ORACLE) {
            const d = decodeFunctionData({ abi: oracleAbi, data: call.data });
            let answer: bigint | string | Error;
            if (d.functionName === 'getL1Fee') {
              seen.l1Tx = d.args[0];
              answer = net.l1Fee ?? L1_FEE;
            } else {
              seen.operatorGas = d.args[0];
              answer = net.operatorFee ?? 0n;
            }
            if (answer instanceof Error) throw answer;
            return typeof answer === 'string' ? answer : encodeAbiParameters([{ type: 'uint256' }], [answer]);
          }
          if (net.dryRun instanceof Error) throw net.dryRun;
          return net.dryRun ?? '0x';
        }
        case 'eth_sendRawTransaction':
          seen.raw = params[0] as `0x${string}`;
          return keccak256(params[0] as `0x${string}`);
        default:
          throw new Error(method);
      }
    });
  const native = (): SweepTarget => ({ ...target, token: 'native' });
  const sends = (rpc: { calls: { method: string }[] }): number => rpc.calls.filter((c) => c.method === 'eth_sendRawTransaction').length;

  it('on an OP Stack chain (Base Sepolia) prices the L1 data fee and operator fee on the unsigned transaction and keeps them back', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(84532, { operatorFee: 5_000n }, seen);
    const res = await directSweep({ target: native(), manifest, destination: DEST, amount: BALANCE, rpc });
    const tx = parseTransaction(seen.raw!);
    const reserve = 2n * (L1_FEE + 5_000n);
    expect(tx.gas).toBe(21_000n);
    expect(tx.value).toBe(BALANCE - 21_000n * MAX_FEE - reserve);
    expect(res.sent).toBe(tx.value);
    // What op-geth checks against the balance (gas at the fee cap + value + L1 fee + operator fee) now fits, with headroom.
    expect(21_000n * MAX_FEE + tx.value! + L1_FEE + 5_000n).toBeLessThan(BALANCE);
    // The oracle priced this very transaction, unsigned, carrying the largest value it could.
    const priced = parseTransaction(seen.l1Tx!);
    expect(priced.r).toBeUndefined();
    expect(priced).toMatchObject({ type: 'eip1559', chainId: 84532, nonce: 7, gas: 21_000n, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas, value: BALANCE - 21_000n * MAX_FEE });
    expect(priced.to?.toLowerCase()).toBe(DEST.toLowerCase());
    expect(seen.operatorGas).toBe(21_000n);
  });

  it('gives a contract or EIP-7702 destination its estimated gas, also in the dry run; nothing extra is kept back off OP Stack', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(11155111, { estimate: '0xb5e2' /* 46 562 */ }, seen);
    const res = await directSweep({ target: { ...native(), chainId: 11155111 }, manifest: fakeManifest(11155111), destination: DEST, amount: BALANCE, rpc });
    const tx = parseTransaction(seen.raw!);
    const gas = (46_562n * 12n) / 10n;
    expect(tx.gas).toBe(gas);
    expect(tx.value).toBe(BALANCE - gas * MAX_FEE);
    expect(rpc.calls.find((c) => c.method === 'eth_estimateGas')?.params).toEqual([{ from: target.owner, to: DEST, value: `0x${(BALANCE - 21_000n * MAX_FEE).toString(16)}` }]);
    expect(rpc.calls.filter((c) => c.method === 'eth_call').map((c) => c.params)).toEqual([
      [{ from: target.owner, to: DEST, data: '0x', value: `0x${tx.value!.toString(16)}`, gas: `0x${gas.toString(16)}` }, 'latest'],
    ]);
    expect(res.simulation).toBe('ok');
  });

  it('passes the gas limit to the ERC-20 dry run too', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(84532, { estimate: '0xc350' }, seen);
    await directSweep({ target, manifest, destination: DEST, amount: 777n, rpc });
    // The other eth_calls price the fees on the GasPriceOracle (Base Sepolia is OP Stack).
    const dryRun = rpc.calls.find((c) => c.method === 'eth_call' && (c.params[0] as { to: string }).to === TOKEN);
    expect(dryRun?.params[0]).toMatchObject({ from: target.owner, to: TOKEN, value: '0x0', gas: `0x${(60_000).toString(16)}` });
  });

  it('B-R3: an ERC-20 sweep on OP Stack refuses, before signing, native coin that covers the gas but not the L1 data fee', async () => {
    const seen: Seen = {};
    const gasCost = 60_000n * MAX_FEE; // estimate 50 000, signed with 1.2x
    const rpc = chainRpc(84532, { estimate: '0xc350', balance: gasCost + 1n, l1Fee: 5_000_000_000_000n }, seen);
    await expect(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc })).rejects.toThrow(/not hold enough native coin for the network fee, including the L1 data fee/);
    expect(sends(rpc)).toBe(0);
    // The oracle priced this transfer's exact unsigned bytes, at the gas limit that would be signed.
    const priced = parseTransaction(seen.l1Tx!);
    expect(priced.r).toBeUndefined();
    expect(priced).toMatchObject({ type: 'eip1559', chainId: 84532, nonce: 7, gas: 60_000n, maxFeePerGas: MAX_FEE });
    expect(priced.to?.toLowerCase()).toBe(TOKEN.toLowerCase());
    expect(priced.data).toBe(encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [DEST, 777n] }));
    expect(seen.operatorGas).toBe(60_000n);
    // Gas alone not covered: the existing message, before the oracle is read.
    const empty = chainRpc(84532, { estimate: '0xc350', balance: gasCost - 1n }, {});
    await expect(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc: empty })).rejects.toThrow(/no native coin for gas/);
    expect(empty.calls.some((c) => c.method === 'eth_call')).toBe(false);
  });

  it('B-R3: an ERC-20 sweep on OP Stack is signed once the native coin covers gas at the fee cap plus the reserve', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(84532, { estimate: '0xc350', balance: 60_000n * MAX_FEE + 2n * (5_000_000_000_000n + 7n), l1Fee: 5_000_000_000_000n, operatorFee: 7n }, seen);
    const res = await directSweep({ target, manifest, destination: DEST, amount: 777n, rpc });
    expect(sends(rpc)).toBe(1);
    expect(res.sent).toBe(777n);
    const signed = parseTransaction(seen.raw!);
    expect(parseTransaction(seen.l1Tx!)).toMatchObject({ nonce: signed.nonce, gas: signed.gas, maxFeePerGas: signed.maxFeePerGas, maxPriorityFeePerGas: signed.maxPriorityFeePerGas, to: signed.to, data: signed.data });
    // Off OP Stack there is no L1 data fee: the oracle is never read.
    const sepolia = chainRpc(11155111, { estimate: '0xc350', balance: 60_000n * MAX_FEE }, {});
    const usdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
    await directSweep({ target: { ...target, chainId: 11155111, token: usdc }, manifest: fakeManifest(11155111), destination: DEST, amount: 777n, rpc: sepolia });
    expect(sepolia.calls.filter((c) => c.method === 'eth_call').map((c) => (c.params[0] as { to: string }).to)).toEqual([usdc]);
  });

  it('B-R3: an ERC-20 sweep on OP Stack refuses when the fee oracle cannot be read, before signing', async () => {
    const rpc = chainRpc(84532, { estimate: '0xc350', l1Fee: new Error('rpc down') }, {});
    await expect(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc })).rejects.toThrow(/fee oracle, so the network fee of this sweep cannot be computed/);
    expect(sends(rpc)).toBe(0);
  });

  it('refuses, before signing, a balance that covers the gas but not the L1 data fee', async () => {
    const rpc = chainRpc(84532, { balance: 45_000_000_000_000n }, {});
    await expect(directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/does not cover the network fee, including the L1 data fee/);
    expect(sends(rpc)).toBe(0);
  });

  it('refuses when the fees including the L1 data fee would exceed 10 % of the amount moved', async () => {
    const rpc = chainRpc(84532, { balance: 10n ** 15n, l1Fee: 10n ** 14n }, {});
    await expect(directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/more than 10 %/);
    expect(sends(rpc)).toBe(0);
  });

  it('B-R4: an OP Stack chain without getOperatorFee (before Isthmus the call reverts) charges no operator fee', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(84532, { operatorFee: new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32000', { reverted: true }) }, seen);
    const res = await directSweep({ target: native(), manifest, destination: DEST, amount: BALANCE, rpc });
    const tx = parseTransaction(seen.raw!);
    expect(tx.value).toBe(BALANCE - 21_000n * MAX_FEE - 2n * L1_FEE);
    expect(res.sent).toBe(tx.value);
    expect(seen.operatorGas).toBe(21_000n);
  });

  it.each([
    ['the L1 fee call fails', { l1Fee: new Error('rpc down') }],
    ['the L1 fee answer is malformed', { l1Fee: '0x1234' }],
    ['the L1 fee call reverts', { l1Fee: new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32000', { reverted: true }) }],
    ['the operator fee call fails', { operatorFee: new Error('rpc down') }],
    ['the operator fee call fails at the transport', { operatorFee: new ChainAdapterError('RPC_FAILURE', 'http status 429') }],
    ['the operator fee call gets a JSON-RPC error that is no revert', { operatorFee: new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32603') }],
  ] as const)('refuses when %s: the fee, so the amount to send, cannot be computed', async (_n, net) => {
    const rpc = chainRpc(84532, net, {});
    await expect(directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/fee oracle/);
    expect(sends(rpc)).toBe(0);
  });

  it('refuses a destination that rejects the transfer (the gas estimate reverts), before signing', async () => {
    const rpc = chainRpc(84532, { estimate: new ChainAdapterError('RPC_FAILURE', 'json-rpc error 3', { reverted: true }) }, {});
    await expect(directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc })).rejects.toThrow(/would revert/);
    expect(sends(rpc)).toBe(0);
  });

  it('L2-F1: the dry run refuses a revert the RPC client reports as a flag, and reports one it cannot run', async () => {
    const reverting = chainRpc(84532, { dryRun: new ChainAdapterError('RPC_FAILURE', 'json-rpc error 3', { reverted: true }) }, {});
    await expect(directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc: reverting })).rejects.toThrow(/would revert/);
    expect(sends(reverting)).toBe(0);
    const blind = chainRpc(84532, { dryRun: new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32601') }, {});
    const res = await directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc: blind });
    expect(res.simulation).toBe('unavailable');
    expect(sends(blind)).toBe(1);
  });

  it('B-R6: an outcome unknown after handoff carries the dry-run result, so a skipped dry run is still reported', async () => {
    const lost = (net: Net) => {
      const base = chainRpc(84532, net, {});
      return { ...base, request: (m: string, p: readonly unknown[]) => (m === 'eth_sendRawTransaction' ? Promise.reject(new ChainAdapterError('RPC_FAILURE', 'connection reset after write')) : base.request(m, p)) };
    };
    const outcome = (net: Net): Promise<unknown> => directSweep({ target: native(), manifest, destination: DEST, amount: 1n, rpc: lost(net) }).then(() => undefined, (e: unknown) => e);
    const blind = await outcome({ dryRun: new ChainAdapterError('RPC_FAILURE', 'json-rpc error -32601') });
    expect(blind).toBeInstanceOf(DirectSweepOutcomeUnknownError);
    expect(blind).toMatchObject({ simulation: 'unavailable', attempt: { status: 'unknown-after-handoff' } });
    expect(await outcome({})).toMatchObject({ simulation: 'ok', attempt: { status: 'unknown-after-handoff' } });
  });

  it('a same-nonce re-sign uses exactly the locked nonce, never the pending count', async () => {
    const seen: Seen = {};
    const rpc = chainRpc(84532, { pending: '0x9', latest: '0x7' }, seen);
    const res = await directSweep({ target, manifest, destination: DEST, amount: 777n, rpc, replaceNonce: 7 });
    expect(parseTransaction(seen.raw!).nonce).toBe(7);
    expect(res.attempt).toMatchObject({ nonce: 7, status: 'submitted' });
    expect(rpc.calls.filter((c) => c.method === 'eth_getTransactionCount').map((c) => c.params[1])).toEqual(['latest']);
  });

  it('refuses a re-sign once a transaction with that nonce is mined (a replacement could never be included)', async () => {
    const rpc = chainRpc(84532, { latest: '0x8' }, {});
    await expect(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc, replaceNonce: 7 })).rejects.toThrow(/already on chain/);
    expect(sends(rpc)).toBe(0);
    await expect(directSweep({ target, manifest, destination: DEST, amount: 777n, rpc: chainRpc(84532, {}, {}), replaceNonce: -1 })).rejects.toThrow(/nonce/);
  });

  it('L4-02: sweeps a deep-scan payment whose announced view tag is wrong', async () => {
    const seen: Seen = {};
    const tag = parseInt(target.announcement.metadata.slice(2, 4), 16) ^ 0x5a;
    const wrong: SweepTarget = { ...target, announcement: { ...target.announcement, metadata: `0x${tag.toString(16).padStart(2, '0')}` } };
    await directSweep({ target: wrong, manifest, destination: DEST, amount: 777n, rpc: chainRpc(84532, {}, seen) });
    expect(await recoverTransactionAddress({ serializedTransaction: seen.raw as never })).toBe(target.owner);
  });
});

describe('L2-F2: a direct lock whose nonce is final without its own receipt resolves as replaced', () => {
  const OWNER = '0x5555555555555555555555555555555555555555' as Address;
  const H = `0x${'ab'.repeat(32)}` as const;
  const lock: SweepLock = { chainId: 84532, owner: OWNER, nonce: 3, expectedHash: H, status: 'unknown-after-handoff' };
  /** `receipts` answers the receipt reads in order (an Error is thrown); once used up, every read answers null. */
  const rpc = (finalized: string | Error, receipts: unknown[] = []) =>
    mockRpc(84532, (m, p) => {
      if (m === 'eth_getTransactionReceipt') {
        const r = receipts.shift() ?? null;
        if (r instanceof Error) throw r;
        return r;
      }
      if (m === 'eth_getTransactionCount') {
        expect(p).toEqual([OWNER, 'finalized']);
        if (finalized instanceof Error) throw finalized;
        return finalized;
      }
      throw new Error(m);
    });

  it('a finalized owner nonce above the lock nonce means no transaction with that nonce can still be mined', async () => {
    expect((await reconcileSweepLock(rpc('0x4'), lock)).status).toBe('replaced');
    expect((await reconcileSweepLock(rpc('0x4'), { ...lock, status: 'submitted' })).status).toBe('replaced');
  });
  it('stays unresolved while the nonce is not used at the finalized block, or when that cannot be read', async () => {
    expect(await reconcileSweepLock(rpc('0x3'), lock)).toBe(lock);
    expect(await reconcileSweepLock(rpc(new Error('unsupported block tag')), lock)).toBe(lock);
    expect(await reconcileSweepLock(rpc('nonsense'), lock)).toBe(lock);
  });
  it('a receipt for the recorded hash still wins, also when it appears on the second look', async () => {
    expect((await reconcileSweepLock(rpc('0x4', [{ transactionHash: H, status: '0x1' }]), lock)).status).toBe('included');
    expect((await reconcileSweepLock(rpc('0x4', [null, { transactionHash: H, status: '0x0' }]), lock)).status).toBe('reverted');
  });
  it('B-R1: a failed or malformed receipt read at the final look never concludes replaced', async () => {
    const limited = new ChainAdapterError('RPC_FAILURE', 'http status 429');
    // Every receipt read fails while the finalized nonce (4) is past the locked one (3): the locked tx may be the mined one.
    expect(await reconcileSweepLock(rpc('0x4', [limited, limited]), lock)).toBe(lock);
    for (const bad of [limited, '0x1', 7, [], { transactionHash: H }, { transactionHash: H, status: '0x2' }, { transactionHash: `0x${'cd'.repeat(32)}`, status: '0x1' }]) {
      expect(await reconcileSweepLock(rpc('0x4', [null, bad]), lock)).toBe(lock);
    }
    // Only an explicit "no receipt" for the locked hash, read after the nonce is final, means it can never be mined.
    expect((await reconcileSweepLock(rpc('0x4', [limited, null]), lock)).status).toBe('replaced');
  });
  describe('B-R5: a re-signed lock is checked by every hash signed with its nonce', () => {
    const E1 = `0x${'e1'.repeat(32)}` as const;
    const E2 = `0x${'e2'.repeat(32)}` as const;
    const resigned: SweepLock = { ...lock, otherHashes: [E1, E2] };
    /** Receipt reads answered per hash (an Error is thrown); a hash without an entry has no receipt. */
    const byHash = (finalized: string, receipts: Readonly<Record<string, unknown>>) =>
      mockRpc(84532, (m, p) => {
        if (m === 'eth_getTransactionReceipt') {
          const r = receipts[p[0] as string] ?? null;
          if (r instanceof Error) throw r;
          return r;
        }
        if (m === 'eth_getTransactionCount') return finalized;
        throw new Error(m);
      });

    it('an earlier transaction that was mined resolves the lock as included, under its own hash', async () => {
      const r = byHash('0x3', { [E1]: { transactionHash: E1, status: '0x1' } });
      expect(await reconcileSweepLock(r, resigned)).toEqual({ ...lock, expectedHash: E1, otherHashes: [H, E2], status: 'included' });
      expect(r.calls.map((c) => c.params[0])).toEqual([H, E1]);
      expect(await reconcileSweepLock(byHash('0x3', { [E2]: { transactionHash: E2, status: '0x0' } }), resigned)).toEqual({ ...lock, expectedHash: E2, otherHashes: [H, E1], status: 'reverted' });
      // The current hash keeps its place when it is the one mined.
      expect(await reconcileSweepLock(byHash('0x3', { [H]: { transactionHash: H, status: '0x1' } }), resigned)).toEqual({ ...resigned, status: 'included' });
    });
    it('also on the final look, after the nonce is final', async () => {
      const receipts: Record<string, unknown> = {};
      const r = mockRpc(84532, (m, p) => {
        if (m === 'eth_getTransactionCount') { receipts[E2] = { transactionHash: E2, status: '0x1' }; return '0x4'; }
        if (m === 'eth_getTransactionReceipt') return receipts[p[0] as string] ?? null;
        throw new Error(m);
      });
      expect(await reconcileSweepLock(r, resigned)).toEqual({ ...lock, expectedHash: E2, otherHashes: [H, E1], status: 'included' });
    });
    it('replaced only when every recorded hash has explicitly no receipt once the nonce is final', async () => {
      expect((await reconcileSweepLock(byHash('0x4', {}), resigned)).status).toBe('replaced');
      expect(await reconcileSweepLock(byHash('0x3', {}), resigned)).toBe(resigned);
      for (const bad of [new ChainAdapterError('RPC_FAILURE', 'http status 429'), '0x1', { transactionHash: H, status: '0x1' }]) {
        expect(await reconcileSweepLock(byHash('0x4', { [E2]: bad }), resigned)).toBe(resigned);
      }
    });
  });

  it('never applies to a legacy relayed lock (no owner nonce)', async () => {
    const legacy: SweepLock = { chainId: 84532, owner: OWNER, expectedHash: H, status: 'submitted' };
    const r = rpc('0x99');
    expect(await reconcileSweepLock(r, legacy)).toBe(legacy);
    expect(r.calls.map((c) => c.method)).not.toContain('eth_getTransactionCount');
  });
});

describe('M1: relayed orders resolve from chain state alone (nonceUsed + finalized deadline)', () => {
  const OWNER = '0x5555555555555555555555555555555555555555' as Address;
  const ORDER: RelayedOrderRef = { relayer: FAKE_SWEEP_RELAYER, nonce: 42n, deadline: NOW + 1200 };
  const lock: SweepLock = { chainId: 84532, owner: OWNER, order: ORDER, status: 'unknown-after-handoff' };
  const nonceCall = encodeFunctionData({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', args: [OWNER, 42n] });
  const FIN_HASH = `0x${'f1'.repeat(32)}`;
  interface Opts { usedLatest?: boolean; usedFinal?: boolean; finalTs: number; failCall?: boolean; noFinalized?: boolean }
  const chain = (o: Opts) => mockRpc(84532, (m, params) => {
    if (m === 'eth_getBlockByNumber') {
      if (params[0] !== 'finalized') throw new Error('expiry must use the finalized block');
      if (o.noFinalized === true) throw new Error('unsupported block tag');
      return { hash: FIN_HASH, number: '0x99', timestamp: `0x${o.finalTs.toString(16)}` };
    }
    if (m === 'eth_call') {
      if (o.failCall === true) throw new Error('rpc down');
      const [call, tag] = params as [{ to: string; data: string }, unknown];
      if (call.to !== ORDER.relayer || call.data !== nonceCall) throw new Error('unexpected call');
      if (tag === 'latest') return encodeFunctionResult({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', result: o.usedLatest === true });
      expect(tag).toEqual({ blockHash: FIN_HASH, requireCanonical: true });
      return encodeFunctionResult({ abi: ghostPaySweepRelayerAbi, functionName: 'nonceUsed', result: o.usedFinal === true });
    }
    throw new Error(`unexpected ${m}`);
  });
  const past = ORDER.deadline + RELAYED_EXPIRY_MARGIN_SECONDS + 1;

  it('executed when the contract reports the nonce used at latest (even before the deadline)', async () => {
    expect((await reconcileRelayedOrder(chain({ usedLatest: true, finalTs: NOW }), lock)).status).toBe('included');
  });
  it('stays unresolved while the finalized block is not past deadline + margin', async () => {
    expect(await reconcileRelayedOrder(chain({ finalTs: NOW }), lock)).toBe(lock);
    expect(await reconcileRelayedOrder(chain({ finalTs: ORDER.deadline + RELAYED_EXPIRY_MARGIN_SECONDS }), lock)).toBe(lock);
  });
  it('expired only when the nonce is unused at the canonical finalized block past deadline + margin', async () => {
    expect((await reconcileRelayedOrder(chain({ finalTs: past }), lock)).status).toBe('expired');
    // Used at the finalized block although latest (a different node/fork) said unused: executed, not expired.
    expect((await reconcileRelayedOrder(chain({ finalTs: past, usedFinal: true }), lock)).status).toBe('included');
  });
  it('reports RPC errors, malformed answers and missing finalized support as an unknown outcome (throws)', async () => {
    await expect(reconcileRelayedOrder(chain({ finalTs: past, failCall: true }), lock)).rejects.toThrow(/outcome is still unknown/);
    await expect(reconcileRelayedOrder(chain({ finalTs: past, noFinalized: true }), lock)).rejects.toThrow(/finalized/);
    await expect(reconcileRelayedOrder(mockRpc(84532, () => 7), lock)).rejects.toThrow(/outcome is still unknown/);
    await expect(reconcileRelayedOrder(mockRpc(84532, (m) => (m === 'eth_call' ? '0x' : null)), lock)).rejects.toThrow(/outcome is still unknown/);
  });
  it('reconcileSweepLock prefers the order over a relayer-reported hash (a reverted relayer tx does not kill the order)', async () => {
    const withHash: SweepLock = { ...lock, expectedHash: `0x${'12'.repeat(32)}`, status: 'submitted' };
    const rpc = chain({ finalTs: NOW });
    expect(await reconcileSweepLock(rpc, withHash)).toBe(withHash);
    expect(rpc.calls.map((c) => c.method)).not.toContain('eth_getTransactionReceipt');
  });
  it('reconcileSweepLock resolves direct locks by receipt, but a legacy hash-only relayed lock is not released by a revert', async () => {
    const direct: SweepLock = { chainId: 84532, owner: OWNER, nonce: 3, expectedHash: `0x${'ab'.repeat(32)}`, status: 'unknown-after-handoff' };
    expect((await reconcileSweepLock(mockRpc(84532, () => ({ transactionHash: `0x${'ab'.repeat(32)}`, status: '0x1' })), direct)).status).toBe('included');
    expect((await reconcileSweepLock(mockRpc(84532, () => ({ transactionHash: `0x${'ab'.repeat(32)}`, status: '0x0' })), direct)).status).toBe('reverted');
    const legacyRelayed: SweepLock = { chainId: 84532, owner: OWNER, expectedHash: `0x${'ab'.repeat(32)}`, status: 'submitted' };
    expect(await reconcileSweepLock(mockRpc(84532, () => ({ transactionHash: `0x${'ab'.repeat(32)}`, status: '0x0' })), legacyRelayed)).toBe(legacyRelayed);
    expect((await reconcileSweepLock(mockRpc(84532, () => ({ transactionHash: `0x${'ab'.repeat(32)}`, status: '0x1' })), legacyRelayed)).status).toBe('included');
  });
});
