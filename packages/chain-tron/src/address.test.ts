import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base58 } from '@scure/base';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeTronAddress,
  encodeTronAddress,
  evmToTronAddress,
  isTronAddress,
  parseTronAddress,
  tronAddressFromHex,
  tronAddressFromPublicKey,
  tronAddressToBytes20,
  tronAddressToHex,
  tronToEvmAddress,
} from './address.js';
import { TronError } from './errors.js';

/*
 * VECTORS. Provenance: the two real-world strings below were RECALLED from memory (widely
 * published: Tron zero address and mainnet USDT contract); raw GitHub fetch was unavailable
 * in this sandbox so they are NOT source-verified. They pass only because the codec's
 * sha256d checksum matches, which is strong (2^-32) evidence but not provenance.
 * SELF-DERIVED: address of scalar 1 (generator G); EVM form 0x7E5F...5Bdf is the widely known
 * Ethereum address of private key 1 (keccak of G.xy), cross-checked below with raw keccak.
 */
const ZERO_B58 = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const ZERO_HEX = `41${'00'.repeat(20)}`;
const USDT_B58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDT_HEX = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const FAKE_SCALAR_1 = hexToBytes(`${'00'.repeat(31)}01`);

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof TronError) return e.code;
    throw e;
  }
  return undefined;
}

/** Independent base58check encode for cross-checking. */
function refEncode(raw: Uint8Array): string {
  const sum = sha256(sha256(raw)).subarray(0, 4);
  return base58.encode(Uint8Array.from([...raw, ...sum]));
}

describe('known vectors (recalled, see header)', () => {
  it('zero address', () => {
    expect(tronAddressFromHex(ZERO_HEX)).toBe(ZERO_B58);
    expect(tronAddressToHex(ZERO_B58)).toBe(ZERO_HEX);
  });
  it('USDT contract', () => {
    expect(encodeTronAddress(hexToBytes(USDT_HEX))).toBe(USDT_B58);
    expect(tronAddressToHex(USDT_B58)).toBe(USDT_HEX);
    expect(tronToEvmAddress(USDT_B58)).toBe(`0x${USDT_HEX.slice(2)}`);
  });
  it('self-derived: scalar 1 address matches independent keccak/base58', async () => {
    const { keccak_256 } = await import('@noble/hashes/sha3.js');
    const pub = secp256k1.getPublicKey(FAKE_SCALAR_1, false);
    const h = keccak_256(pub.subarray(1)).subarray(12);
    expect(bytesToHex(h)).toBe('7e5f4552091a69125d5dfcb7b8c2659029395bdf');
    const t = tronAddressFromPublicKey(pub);
    expect(t).toBe(refEncode(Uint8Array.from([0x41, ...h])));
    expect(tronAddressFromPublicKey(secp256k1.getPublicKey(FAKE_SCALAR_1, true))).toBe(t);
  });
});

describe('validation', () => {
  it('rejects bad checksum', () => {
    const bad = `${ZERO_B58.slice(0, -1)}c`;
    expect(code(() => decodeTronAddress(bad))).toBe('INVALID_CHECKSUM');
    expect(isTronAddress(bad)).toBe(false);
  });
  it('rejects non-alphabet characters and non-strings', () => {
    expect(code(() => decodeTronAddress(`${ZERO_B58.slice(0, -1)}0`))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeTronAddress(`${ZERO_B58.slice(0, -1)}l`))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeTronAddress(123 as unknown as string))).toBe('INVALID_ADDRESS');
    expect(code(() => parseTronAddress(undefined as unknown as string))).toBe('INVALID_ADDRESS');
    expect(code(() => tronAddressFromHex(5 as unknown as string))).toBe('INVALID_ADDRESS');
    expect(code(() => evmToTronAddress(5 as unknown as string))).toBe('INVALID_ADDRESS');
    expect(isTronAddress(5)).toBe(false);
  });
  it('rejects wrong prefix (valid checksum)', () => {
    const raw = hexToBytes(`42${'00'.repeat(20)}`);
    expect(code(() => decodeTronAddress(refEncode(raw)))).toBe('INVALID_PREFIX');
    expect(code(() => encodeTronAddress(raw))).toBe('INVALID_PREFIX');
    expect(code(() => tronAddressFromHex(`42${'00'.repeat(20)}`))).toBe('INVALID_PREFIX');
    // Bitcoin-style prefix 0x00 + 20 bytes (valid base58check, wrong chain)
    expect(code(() => decodeTronAddress(refEncode(new Uint8Array(21))))).toBe('INVALID_PREFIX');
  });
  it('rejects wrong length (valid checksum)', () => {
    expect(code(() => decodeTronAddress(refEncode(hexToBytes(`41${'00'.repeat(19)}`))))).toBe('INVALID_LENGTH');
    expect(code(() => decodeTronAddress(refEncode(hexToBytes(`41${'00'.repeat(21)}`))))).toBe('INVALID_LENGTH');
    expect(code(() => encodeTronAddress(new Uint8Array(20)))).toBe('INVALID_LENGTH');
    expect(code(() => tronAddressFromHex('41'))).toBe('INVALID_LENGTH');
    expect(code(() => tronAddressFromHex('zz'))).toBe('INVALID_ADDRESS');
    expect(code(() => evmToTronAddress('0x1234'))).toBe('INVALID_LENGTH');
    expect(code(() => evmToTronAddress('1234'))).toBe('INVALID_ADDRESS');
    expect(code(() => evmToTronAddress(`0x${'zz'.repeat(20)}`))).toBe('INVALID_ADDRESS');
  });
  it('rejects empty and whitespace', () => {
    expect(isTronAddress('')).toBe(false);
    expect(isTronAddress(` ${ZERO_B58}`)).toBe(false);
    expect(isTronAddress(`${ZERO_B58} `)).toBe(false);
  });
  it('rejects invalid public keys', () => {
    expect(code(() => tronAddressFromPublicKey(new Uint8Array(33)))).toBe('INVALID_PUBLIC_KEY');
    expect(code(() => tronAddressFromPublicKey(new Uint8Array(5)))).toBe('INVALID_PUBLIC_KEY');
  });
  it('error messages never embed input', () => {
    try {
      decodeTronAddress('SECRETSTRING');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRET');
    }
  });
});

describe('parse / conversions', () => {
  it('accepts hex (any case) and base58 and canonicalises', () => {
    expect(parseTronAddress(USDT_HEX.toUpperCase())).toBe(USDT_B58);
    expect(parseTronAddress(USDT_HEX)).toBe(USDT_B58);
    expect(parseTronAddress(USDT_B58)).toBe(USDT_B58);
    expect(isTronAddress(USDT_B58)).toBe(true);
  });
  it('EVM conversions', () => {
    expect(evmToTronAddress(`0x${'00'.repeat(20)}`)).toBe(ZERO_B58);
    expect(evmToTronAddress(`0x${USDT_HEX.slice(2).toUpperCase()}`)).toBe(USDT_B58);
    expect(tronToEvmAddress(USDT_HEX)).toBe(`0x${USDT_HEX.slice(2)}`);
    expect(bytesToHex(tronAddressToBytes20(USDT_B58))).toBe(USDT_HEX.slice(2));
  });
});

describe('properties', () => {
  const bytes20 = fc.uint8Array({ minLength: 20, maxLength: 20 });
  it('encode/decode round trip', () => {
    fc.assert(
      fc.property(bytes20, (b) => {
        const raw = Uint8Array.from([0x41, ...b]);
        const s = encodeTronAddress(raw);
        expect(s).toHaveLength(34);
        expect(s.startsWith('T')).toBe(true);
        expect(s).toBe(refEncode(raw));
        expect(decodeTronAddress(s)).toEqual(raw);
        expect(tronAddressFromHex(tronAddressToHex(s))).toBe(s);
      }),
    );
  });
  it('EVM round trip', () => {
    fc.assert(
      fc.property(bytes20, (b) => {
        const evm = `0x${bytesToHex(b)}` as const;
        expect(tronToEvmAddress(evmToTronAddress(evm))).toBe(evm);
      }),
    );
  });
  it('any single-character mutation is rejected', () => {
    fc.assert(
      fc.property(bytes20, fc.nat(33), fc.nat(57), (b, idx, rep) => {
        const s = encodeTronAddress(Uint8Array.from([0x41, ...b]));
        const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const c = alphabet[rep] as string;
        if (c === s[idx]) return;
        const mutated = s.slice(0, idx) + c + s.slice(idx + 1);
        expect(isTronAddress(mutated)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
  it('arbitrary strings never throw from isTronAddress', () => {
    fc.assert(fc.property(fc.string(), (s) => typeof isTronAddress(s) === 'boolean'));
  });
  it('non-0x41 prefixed 21 bytes always rejected', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 21, maxLength: 21 }), (b) => {
        fc.pre(b[0] !== 0x41);
        expect(code(() => decodeTronAddress(refEncode(b)))).toBe('INVALID_PREFIX');
      }),
    );
  });
});
