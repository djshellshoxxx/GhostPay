/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import { describe, expect, it } from 'vitest';
import { BaseError, ExecutionRevertedError, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { SecretBox } from '@ghostpay/secret-box';
import { createLogger, latencyBucket } from './log.js';
import { KNOWN_MAINNET_CHAIN_IDS, assertKeyNotFundedOnMainnet, paymasterSignerFromBox } from './keys.js';
import { createViemSponsorChain, isRevert, type PublicClientLike, type WalletClientLike } from './viemChain.js';
import { paymasterSignedHash } from '../erc4337/paymaster.js';
import { A } from '../vectors.testutil.js';
import { computeVectors } from '../vectors.testutil.js';
import { recoverMessageAddress } from 'viem';

describe('logger (PH-GEN-4)', () => {
  it('writes only the allowlisted fields even when extra data is smuggled in', () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log({ mode: 'permit-relay', chainId: 31337, outcome: 'ok', latencyBucket: '<1s', txHash: `0x${'ab'.repeat(32)}`, ...({ payer: '0xdead', ip: '1.2.3.4', calldata: '0x00' } as object) });
    log({ mode: 'unknown', chainId: 1, outcome: 'rejected', latencyBucket: '>=10s' });
    expect(JSON.parse(lines[0] ?? '')).toEqual({ mode: 'permit-relay', chainId: 31337, outcome: 'ok', latencyBucket: '<1s', txHash: `0x${'ab'.repeat(32)}` });
    expect(Object.keys(JSON.parse(lines[1] ?? '') as object)).toEqual(['mode', 'chainId', 'outcome', 'latencyBucket']);
    expect(lines.join('')).not.toMatch(/dead|1\.2\.3\.4|calldata/);
  });
  it('latency buckets', () => {
    expect([0, 99, 100, 999, 1000, 9999, 10_000, 99_999].map(latencyBucket)).toEqual(['<100ms', '<100ms', '<1s', '<1s', '<10s', '<10s', '>=10s', '>=10s']);
  });
});

describe('keys (SP-REQ-3)', () => {
  it('derives a signer from a SecretBox without exposing the key; signature recovers to the address', async () => {
    const box = SecretBox.copyOf(new Uint8Array(32).fill(0x42), { label: 'hot' });
    const { sign, address } = paymasterSignerFromBox(box);
    expect(address).toBe(privateKeyToAccount(`0x${'42'.repeat(32)}`).address);
    const v = computeVectors();
    const hash = paymasterSignedHash(v.withPm, { ...decode(v.withPm.paymasterAndData) }, v.chainId);
    const sig = await sign(hash);
    expect(await recoverMessageAddress({ message: { raw: hash }, signature: sig })).toBe(address);
    expect(String(box)).not.toContain('42');
    box.dispose();
    await expect(sign(hash)).rejects.toThrow();
    expect(() => paymasterSignerFromBox(SecretBox.copyOf(new Uint8Array(16)))).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }) as Error);
  });
  it('refuses a key funded on a mainnet chain id', async () => {
    const calls: number[] = [];
    await expect(assertKeyNotFundedOnMainnet(A.owner, async (id) => (calls.push(id), 0n))).resolves.toBeUndefined();
    expect(calls).toEqual([...KNOWN_MAINNET_CHAIN_IDS]);
    await expect(assertKeyNotFundedOnMainnet(A.owner, async (id) => (id === 8453 ? 1n : 0n))).rejects.toMatchObject({ code: 'MAINNET_FORBIDDEN' });
    await expect(assertKeyNotFundedOnMainnet(A.owner, async () => 1n, [1])).rejects.toMatchObject({ code: 'MAINNET_FORBIDDEN' });
  });
});

const hex32 = (b: string): Hex => `0x${b.repeat(32)}`;
const addrOf = (h: string): Address => `0x${h}`;

function decode(pd: Hex) {
  const h = pd.slice(2);
  return {
    paymaster: addrOf(h.slice(0, 40)),
    verificationGasLimit: BigInt(`0x${h.slice(40, 72)}`),
    postOpGasLimit: BigInt(`0x${h.slice(72, 104)}`),
    validUntil: BigInt(`0x${h.slice(104, 116)}`),
    validAfter: BigInt(`0x${h.slice(116, 128)}`),
  };
}

describe('viem chain adapter', () => {
  const sponsor = A.sponsorFeeTo;
  const pub = (over: Partial<PublicClientLike> = {}): PublicClientLike => ({
    getGasPrice: async () => 7n,
    call: async () => ({ data: '0x1234' }),
    estimateGas: async () => 21_000n,
    waitForTransactionReceipt: async () => ({ status: 'success', gasUsed: 5n, effectiveGasPrice: 6n, logs: [{ address: A.router, topics: [hex32('01')], data: '0x' }] }),
    getCode: async () => '0x00',
    ...over,
  });
  const wallet = (sent: unknown[] = []): WalletClientLike => ({
    account: { address: sponsor },
    sendTransaction: async (a) => (sent.push(a), `0x${'ab'.repeat(32)}`),
  });
  it('maps every port method', async () => {
    const sent: unknown[] = [];
    const auth = [{ chainId: 31337, address: A.delegate, nonce: 0, r: hex32('01'), s: hex32('02'), yParity: 0 }];
    const c = createViemSponsorChain(31337, pub(), wallet(sent));
    expect(c.sponsorAddress).toBe(sponsor);
    expect(await c.gasPrice()).toBe(7n);
    expect(await c.call(A.router, '0x')).toBe('0x1234');
    expect(await c.simulate({ to: A.router, data: '0x' })).toEqual({ ok: true, gas: 21_000n });
    expect(await c.simulate({ to: A.router, data: '0x', authorizationList: auth })).toEqual({ ok: true, gas: 21_000n });
    expect(await c.send({ to: A.router, data: '0x' }, 100n)).toMatch(/^0x/);
    await c.send({ to: A.router, data: '0x', authorizationList: auth }, 100n);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ authorizationList: auth, gas: 100n });
    expect(sent[0]).not.toHaveProperty('authorizationList');
    expect(await c.waitForReceipt(`0x${'ab'.repeat(32)}`)).toEqual({ success: true, gasUsed: 5n, effectiveGasPrice: 6n, logs: [{ address: A.router, topics: [hex32('01')], data: '0x' }] });
    expect(await c.getCode(A.router)).toBe('0x00');
  });
  it('reverted receipts and empty call data', async () => {
    const c = createViemSponsorChain(84532, pub({ call: async () => ({}), waitForTransactionReceipt: async () => ({ status: 'reverted', gasUsed: 1n, effectiveGasPrice: 2n, logs: [] }) }), wallet());
    expect(await c.call(A.router, '0x')).toBe('0x');
    expect((await c.waitForReceipt(`0x${'ab'.repeat(32)}`)).success).toBe(false);
  });
  it('a revert is a failed simulation; transport errors propagate; mainnet refused', async () => {
    const revert = new ExecutionRevertedError({ message: 'execution reverted' });
    const wrapped = new BaseError('estimate failed', { cause: revert });
    const c = createViemSponsorChain(31337, pub({ estimateGas: async () => { throw wrapped; } }), wallet());
    expect(await c.simulate({ to: A.router, data: '0x' })).toEqual({ ok: false });
    const d = createViemSponsorChain(31337, pub({ estimateGas: async () => { throw new Error('ECONNRESET'); } }), wallet());
    await expect(d.simulate({ to: A.router, data: '0x' })).rejects.toThrow('ECONNRESET');
    expect(() => createViemSponsorChain(1, pub(), wallet())).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
    expect(isRevert(new Error('x'))).toBe(false);
    expect(isRevert(new BaseError('plain'))).toBe(false);
    expect(isRevert(wrapped)).toBe(true);
  });
});
