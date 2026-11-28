import { generateKeySet } from '@ghostpay/core-crypto';
import { decodeFunctionData, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { buildDirectPayment, type DirectPaymentInput } from './direct.js';
import { MetadataHardeningError } from './guard.js';
import { seededRng } from './testutil.testutil.js';

const ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564';
const ROUTER = '0x2222222222222222222222222222222222222222';
const STEALTH = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x3333333333333333333333333333333333333333';
const eph = generateKeySet(seededRng(9)).spendingPublicKey;

const base: DirectPaymentInput = {
  chainId: 31337,
  announcer: ANNOUNCER,
  routerAddress: ROUTER,
  stealthAddress: STEALTH,
  asset: { kind: 'native' },
  amount: 5n,
  ephemeralPublicKey: eph,
  metadata: new Uint8Array([7]),
};

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

describe('MH-FEE-1 buildDirectPayment: unsupported inputs fail explicitly', () => {
  it('rejects an unknown asset kind instead of silently sending native value (regression)', () => {
    for (const asset of [{ kind: 'erc721', token: TOKEN }, { kind: 'ERC20', token: TOKEN }, { kind: '' }, { kind: undefined }, {}, null, undefined, 'native', 5, []]) {
      expect(codeOf(() => buildDirectPayment({ ...base, asset: asset as never }))).toBe('INVALID_INPUT');
    }
  });
  it('requires a token address for erc20 and ignores nothing else', () => {
    expect(codeOf(() => buildDirectPayment({ ...base, asset: { kind: 'erc20' } as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => buildDirectPayment({ ...base, asset: { kind: 'erc20', token: 5 } as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => buildDirectPayment({ ...base, asset: { kind: 'erc20', token: ROUTER } }))).toBe('POLICY_REJECTED');
  });
  it('requires a bigint amount in 1..2^256-1 (no number, string, or viem error text)', () => {
    for (const amount of [5, '5', 5.5, null, undefined, 0n, -1n, 1n << 256n, 1n << 300n, {}, []]) {
      expect(codeOf(() => buildDirectPayment({ ...base, amount: amount as never }))).toBe('INVALID_INPUT');
    }
    const max = (1n << 256n) - 1n;
    expect(buildDirectPayment({ ...base, asset: { kind: 'erc20', token: TOKEN }, amount: max }).calls[0].label).toBe('transfer');
    try {
      buildDirectPayment({ ...base, amount: 1n << 300n });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\d{30}/);
    }
  });
  it('requires Uint8Array key and metadata, rejecting strings and arrays that would encode to garbage (regression)', () => {
    for (const metadata of ['abc', [1, 2], {}, null, undefined, new Uint8Array(0), new Uint16Array(2), new DataView(new ArrayBuffer(2))]) {
      expect(codeOf(() => buildDirectPayment({ ...base, metadata: metadata as never }))).toBe('INVALID_INPUT');
    }
    for (const key of ['02', [2], null, undefined, new Uint8Array(33), new Uint8Array(32)]) {
      expect(codeOf(() => buildDirectPayment({ ...base, ephemeralPublicKey: key as never }))).not.toBe('NO_THROW');
    }
  });
  it('bounds metadata size', () => {
    expect(codeOf(() => buildDirectPayment({ ...base, metadata: new Uint8Array(1025) }))).toBe('LIMIT_EXCEEDED');
    expect(buildDirectPayment({ ...base, metadata: new Uint8Array(1024) }).calls).toHaveLength(2);
  });
  it('requires an options object and string addresses', () => {
    for (const v of [undefined, null, 5, 'x', []]) {
      expect(codeOf(() => buildDirectPayment(v as never))).toBe('INVALID_INPUT');
    }
    for (const a of [undefined, null, 5, {}, '0x', '0x12', `0x${'0'.repeat(40)}`, `0x${'g'.repeat(40)}`]) {
      for (const field of ['announcer', 'routerAddress', 'stealthAddress'] as const) {
        expect(codeOf(() => buildDirectPayment({ ...base, [field]: a }))).toBe('INVALID_INPUT');
      }
    }
  });
  it('rejects mainnet and still refuses the router as any target', () => {
    expect(codeOf(() => buildDirectPayment({ ...base, chainId: 1 }))).toBe('UNSUPPORTED_CHAIN');
    expect(codeOf(() => buildDirectPayment({ ...base, announcer: ROUTER }))).toBe('POLICY_REJECTED');
    expect(codeOf(() => buildDirectPayment({ ...base, stealthAddress: ROUTER }))).toBe('POLICY_REJECTED');
  });
});

describe('MH-FEE-1 buildDirectPayment: output is exactly the documented calls', () => {
  it('encodes announce(1, stealth, key, metadata) and a value transfer for native', () => {
    const r = buildDirectPayment(base);
    expect(r.calls[0]).toEqual({ label: 'transfer', to: STEALTH, data: '0x', value: 5n });
    const dec = decodeFunctionData({ abi: parseAbi(['function announce(uint256,address,bytes,bytes)']), data: r.calls[1].data as `0x${string}` });
    expect(dec.args?.[0]).toBe(1n);
    expect((dec.args?.[1] as string).toLowerCase()).toBe(STEALTH);
    expect(dec.args?.[3]).toBe('0x07');
    expect(r.warning).toMatch(/No GhostPay fee/);
  });
  it('accepts a cross-realm Uint8Array (an iframe or vm context)', async () => {
    const vm = await import('node:vm');
    const foreign = vm.runInNewContext('new Uint8Array([7])') as Uint8Array;
    expect(foreign instanceof Uint8Array).toBe(false);
    expect(buildDirectPayment({ ...base, metadata: foreign }).calls[1].data).toContain('07');
  });
  it('does not mutate its input and is repeatable', () => {
    const input = Object.freeze({ ...base, asset: Object.freeze({ kind: 'erc20' as const, token: TOKEN }) });
    const a = buildDirectPayment(input);
    const b = buildDirectPayment(input);
    expect(a).toEqual(b);
    expect(base.metadata).toEqual(new Uint8Array([7]));
  });
});
