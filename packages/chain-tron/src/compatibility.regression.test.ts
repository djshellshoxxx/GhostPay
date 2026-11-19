import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { RandomSource } from '@ghostpay/core-crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deriveTronStealthPayment } from './stealth.js';

interface PaymentVector {
  readonly metaAddress: string;
  readonly ephemeralSecret: string;
  readonly ephemeralPublicKey: string;
  readonly viewTag: number;
  readonly stealthAddress: string;
  readonly memoHex: string;
}
const vectors = (JSON.parse(readFileSync(new URL('../../../test-vectors/meta-address-sol-tron-v1.json', import.meta.url), 'utf8')) as {
  readonly tron: { readonly payments: readonly PaymentVector[] };
}).tron.payments;
const fixedRng = (hex: string): RandomSource => ({
  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (array !== null) new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(hexToBytes(hex));
    return array;
  },
});

describe('TB-08: existing TRON derivation accepts the web recipient format', () => {
  it.each(vectors)('derives the same address, key, tag and memo for $metaAddress', (vector) => {
    const payment = deriveTronStealthPayment(vector.metaAddress, fixedRng(vector.ephemeralSecret));
    expect(payment.stealthAddress).toBe(vector.stealthAddress);
    expect(bytesToHex(payment.ephemeralPublicKey)).toBe(vector.ephemeralPublicKey);
    expect(payment.viewTag).toEqual(Uint8Array.of(vector.viewTag));
    expect(payment).toMatchObject({ memo: hexToBytes(vector.memoHex) });
  });

  it('rejects the EVM recipient format with the fixed legacy-format code', () => {
    const vector = vectors[0]!;
    const old = vector.metaAddress.replace('st:trx:', 'st:eth:');
    expect(() => deriveTronStealthPayment(old, fixedRng(vector.ephemeralSecret))).toThrowError(
      expect.objectContaining({ code: 'LEGACY_META_ADDRESS' }),
    );
  });
});
