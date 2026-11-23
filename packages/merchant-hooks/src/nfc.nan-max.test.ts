import { describe, expect, it } from 'vitest';
import { encodeNdefUri } from './nfc.js';

const paymentLink = (bytes: number): string =>
  `https://pay.example.com/#gpi=v1.${'A'.repeat(bytes)}`;

describe('NDEF maxBytes correctness at the hard cap', () => {
  it('rejects NaN policy rather than emitting a tag payload beyond the 8192-byte hard cap', () => {
    expect(() => encodeNdefUri(paymentLink(9000), { maxBytes: NaN })).toThrow(/too-large/);
    expect(() => encodeNdefUri(paymentLink(9000), { maxBytes: Number('invalid') })).toThrow(/too-large/);
  });

  it('enforces the 8192-byte hard limit even when the requested cap is larger', () => {
    expect(encodeNdefUri(paymentLink(8160), { maxBytes: 20_000 })).toHaveLength(8192);
    expect(() => encodeNdefUri(paymentLink(8161), { maxBytes: 20_000 })).toThrow(/too-large/);
  });

  it('preserves valid finite custom caps and the default cap', () => {
    const small = paymentLink(100);
    expect(encodeNdefUri(small, { maxBytes: 129 })).toHaveLength(129);
    expect(() => encodeNdefUri(small, { maxBytes: 128 })).toThrow(/too-large/);
    expect(encodeNdefUri(small)).toHaveLength(129);
  });
});
