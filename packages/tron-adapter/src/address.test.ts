import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeTronAddress,
  encodeTronAddress,
  isTronAddress,
  tronAddressFromEvm,
  tronAddressFromHex,
  tronAddressFromPublicKey,
  tronAddressToEvmHex,
  tronAddressToHex,
} from './address.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';

const vectors = JSON.parse(readFileSync(new URL('../test-vectors/tron.json', import.meta.url), 'utf8')) as {
  addresses: { name: string; hex: string; base58: string }[];
};

describe('address', () => {
  it.each(vectors.addresses)('vector: $name', ({ hex, base58 }) => {
    expect(tronAddressFromHex(hex)).toBe(base58);
    expect(tronAddressToHex(base58)).toBe(hex);
    expect(isTronAddress(base58)).toBe(true);
  });
  it('USDT contract vector (published 41a614f8... <-> TR7NHqje...)', () => {
    expect(tronAddressFromHex('41a614f803b6fd780986a42c78ec9c7f77e6ded13c')).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  });
  it('secp256k1 private key 1 maps to TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC', () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    expect(tronAddressFromPublicKey(secp256k1.getPublicKey(one, true))).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC');
    expect(tronAddressFromPublicKey(secp256k1.getPublicKey(one, false))).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC');
    expect(tronAddressFromEvm('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf')).toBe('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC');
    expect(tronAddressToEvmHex('TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC')).toBe('7e5f4552091a69125d5dfcb7b8c2659029395bdf');
  });
  it('rejects bad checksum, length, charset, prefix', () => {
    const good = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    for (const bad of [
      good.slice(0, -1) + 'u',
      good.slice(0, -1),
      good + '1',
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj60', // 0 not in alphabet
      'rR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      '',
      '0x' + 'a6'.repeat(20),
    ]) {
      expect(isTronAddress(bad), bad).toBe(false);
    }
    expect(() => decodeTronAddress(123 as unknown as string)).toThrow();
  });
  it('rejects wrong prefix byte and length on encode, bad hex/evm', () => {
    expect(() => encodeTronAddress(new Uint8Array(21))).toThrow();
    expect(() => encodeTronAddress(new Uint8Array(20))).toThrow();
    expect(() => tronAddressFromHex('41zz')).toThrow();
    expect(() => tronAddressFromEvm('0x12')).toThrow();
    expect(() => tronAddressFromPublicKey(new Uint8Array(33))).toThrow();
  });
});
