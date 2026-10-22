import { describe, expect, it } from 'vitest';
import { BillingError, parseEvmAddress, parseMetaAddress, toChecksumAddress } from './index.js';
import { META } from './fixtures.testutil.js';

// EIP-55 reference vectors.
const VECTORS = [
  '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
  '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
];

describe('EVM address', () => {
  it.each(VECTORS)('accepts valid checksum %s', (a) => {
    expect(parseEvmAddress(a)).toBe(a);
    expect(toChecksumAddress(a.toLowerCase())).toBe(a);
  });
  it('lowercase only when allowed; uppercase never', () => {
    const a = VECTORS[0] as string;
    expect(() => parseEvmAddress(a.toLowerCase())).toThrow(/checksum required/);
    expect(parseEvmAddress(a.toLowerCase(), true)).toBe(a);
    expect(() => parseEvmAddress('0x' + a.slice(2).toUpperCase(), true)).toThrow(BillingError);
  });
  it('rejects a single flipped case letter', () => {
    const a = VECTORS[0] as string;
    const i = a.search(/[a-f]/i);
    const flipped = a.slice(0, i) + (a[i] === a[i]?.toUpperCase() ? a[i]?.toLowerCase() : a[i]?.toUpperCase()) + a.slice(i + 1);
    expect(() => parseEvmAddress(flipped)).toThrow(/bad checksum/);
  });
  it('rejects homoglyph / non-ASCII / malformed / zero', () => {
    const a = VECTORS[0] as string;
    const cyr = a.replace('a', 'а'); // Cyrillic a
    const fullwidth = a.replace('5', '５');
    for (const s of [cyr, fullwidth, a + ' ', ' ' + a, a.slice(0, -1), a + '0', '0X' + a.slice(2), a.slice(2), '0x' + '0'.repeat(40), 'vitalik.eth', '', a + '​'])
      expect(() => parseEvmAddress(s, true)).toThrow(BillingError);
    expect(() => parseEvmAddress(7)).toThrow(BillingError);
    expect(() => toChecksumAddress('nope')).toThrow(BillingError);
  });
});

describe('meta-address', () => {
  it('accepts canonical', () => expect(parseMetaAddress(META)).toBe(META));
  it('rejects non-canonical, off-curve, identical halves, non-string', () => {
    const body = META.slice(9);
    for (const s of [META.toUpperCase(), META + '00', 'st:eth:0x' + body.slice(0, 66) + body.slice(0, 66), 'st:eth:0x' + '05'.repeat(66), 'st:btc:0x' + body, 'st:eth:0x' + body.replace('0', '０')])
      expect(() => parseMetaAddress(s)).toThrow(BillingError);
    expect(() => parseMetaAddress(null)).toThrow(BillingError);
  });
});
