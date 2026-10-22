import { describe, expect, it } from 'vitest';
import {
  GhostPayCryptoError,
  NATIVE_TOKEN_ADDRESS,
  buildErc20Metadata,
  buildNativeMetadata,
  parseMetadata,
} from './index.js';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const hex = (b: Uint8Array): string => `0x${Buffer.from(b).toString('hex')}`;
const MAX = (1n << 256n) - 1n;

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof GhostPayCryptoError ? e.code : 'other';
  }
  return 'none';
}

describe('metadata layouts', () => {
  it('ERC-20 layout is exact', () => {
    const m = buildErc20Metadata(0xab, USDC, 1_000_000n);
    expect(m.length).toBe(57);
    expect(hex(m)).toBe(
      '0xab' +
        'a9059cbb' +
        'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' +
        (1_000_000).toString(16).padStart(64, '0'),
    );
    expect(parseMetadata(m)).toEqual({ viewTag: 0xab, kind: 'erc20', token: USDC, netAmount: 1_000_000n });
  });
  it('native layout is exact', () => {
    const m = buildNativeMetadata(Uint8Array.of(0), MAX);
    expect(hex(m)).toBe('0x00' + 'eeeeeeee' + 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' + 'f'.repeat(64));
    expect(parseMetadata(hex(m))).toEqual({
      viewTag: 0,
      kind: 'native',
      token: NATIVE_TOKEN_ADDRESS,
      netAmount: MAX,
    });
  });
  it('accepts lowercase token addresses', () => {
    expect(buildErc20Metadata(1, USDC.toLowerCase(), 5n)).toEqual(buildErc20Metadata(1, USDC, 5n));
  });
  it('rejects bad build inputs', () => {
    expect(codeOf(() => buildErc20Metadata(256, USDC, 1n))).toBe('INVALID_VIEW_TAG');
    expect(codeOf(() => buildErc20Metadata(-1, USDC, 1n))).toBe('INVALID_VIEW_TAG');
    expect(codeOf(() => buildErc20Metadata(1.5, USDC, 1n))).toBe('INVALID_VIEW_TAG');
    expect(codeOf(() => buildErc20Metadata(new Uint8Array(2), USDC, 1n))).toBe('INVALID_VIEW_TAG');
    expect(codeOf(() => buildErc20Metadata(new Uint8Array(0), USDC, 1n))).toBe('INVALID_VIEW_TAG');
    expect(codeOf(() => buildErc20Metadata(1, USDC, 0n))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => buildErc20Metadata(1, USDC, -1n))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => buildErc20Metadata(1, USDC, MAX + 1n))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => buildNativeMetadata(1, 0n))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => buildErc20Metadata(1, '0x1234', 1n))).toBe('INVALID_ADDRESS');
    expect(codeOf(() => buildErc20Metadata(1, '0xa0B86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 1n))).toBe(
      'INVALID_ADDRESS',
    );
    expect(codeOf(() => buildErc20Metadata(1, '0x0000000000000000000000000000000000000000', 1n))).toBe(
      'INVALID_ADDRESS',
    );
    expect(codeOf(() => buildErc20Metadata(1, NATIVE_TOKEN_ADDRESS, 1n))).toBe('INVALID_ADDRESS');
  });
  it('rejects malformed metadata on parse', () => {
    const good = buildErc20Metadata(1, USDC, 7n);
    const nat = buildNativeMetadata(1, 7n);
    const mut = (src: Uint8Array, i: number, v: number): Uint8Array => {
      const c = Uint8Array.from(src);
      c[i] = v;
      return c;
    };
    const bads: Array<Uint8Array | string> = [
      new Uint8Array(0),
      good.subarray(0, 56),
      Uint8Array.from([...good, 0]),
      '0x',
      'abcd',
      '0xzz',
      '0xabc',
      mut(good, 1, 0x00), // unknown selector
      mut(nat, 5, 0xed), // native selector, non-native token
      Uint8Array.from([...good.subarray(0, 25), ...new Uint8Array(32)]), // zero amount
      Uint8Array.from([...good.subarray(0, 5), ...new Uint8Array(20), ...good.subarray(25)]), // zero token
      Uint8Array.from([...good.subarray(0, 5), ...nat.subarray(5, 25), ...good.subarray(25)]), // erc20 selector w/ native token
    ];
    for (const b of bads) expect(codeOf(() => parseMetadata(b))).toBe('INVALID_METADATA');
  });
});
