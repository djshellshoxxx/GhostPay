import { bech32m } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { decodeSilentPaymentAddress, encodeSilentPaymentAddress } from './address.js';
import { bech32mEncode } from './bech32m.js';
import { toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys } from './keys.js';
import { seededRng } from './rng.testutil.js';
import { loadSendReceiveVectors } from './vectors.testutil.js';

const keys = generateSilentPaymentKeys(seededRng('address'));
const other = generateSilentPaymentKeys(seededRng('address-2'));

function raw(hrp: string, version: number, payload: Uint8Array): string {
  return bech32mEncode(hrp, [version, ...bech32m.toWords(payload)], 1023);
}

function payload(): Uint8Array {
  const p = new Uint8Array(66);
  p.set(keys.scanPublicKey, 0);
  p.set(keys.spendPublicKey, 33);
  return p;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('silent payment address', () => {
  it('encodes version 0 with the sp1q / tsp1q prefix and the BIP lengths', () => {
    const main = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
    const test = encodeSilentPaymentAddress('testnet', keys.scanPublicKey, keys.spendPublicKey);
    expect(main).toMatch(/^sp1q/);
    expect(test).toMatch(/^tsp1q/);
    expect(main).toHaveLength(116);
    expect(test).toHaveLength(117);
  });

  it('round-trips and reports network, version and keys', () => {
    for (const network of ['mainnet', 'testnet'] as const) {
      const a = encodeSilentPaymentAddress(network, keys.scanPublicKey, keys.spendPublicKey);
      const d = decodeSilentPaymentAddress(a, network);
      expect(d.network).toBe(network);
      expect(d.version).toBe(0);
      expect(toHex(d.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
      expect(toHex(d.spendPublicKey)).toBe(toHex(keys.spendPublicKey));
    }
  });

  it('matches the official vector addresses (decode + re-encode)', () => {
    for (const c of loadSendReceiveVectors()) {
      for (const r of c.receiving) {
        for (const a of r.expected.addresses) {
          const d = decodeSilentPaymentAddress(a);
          expect(encodeSilentPaymentAddress(d.network, d.scanPublicKey, d.spendPublicKey)).toBe(a);
        }
      }
    }
  });

  it('rejects a mainnet address on testnet and vice versa (chain mismatch)', () => {
    const main = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
    const test = encodeSilentPaymentAddress('testnet', keys.scanPublicKey, keys.spendPublicKey);
    expect(code(() => decodeSilentPaymentAddress(main, 'testnet'))).toBe('NETWORK_MISMATCH');
    expect(code(() => decodeSilentPaymentAddress(test, 'mainnet'))).toBe('NETWORK_MISMATCH');
  });

  it('rejects other HRPs, uppercase, mixed case, whitespace and non-strings', () => {
    const a = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
    expect(code(() => decodeSilentPaymentAddress(raw('bc', 0, payload())))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(raw('sprt', 0, payload())))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(a.toUpperCase()))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(`${a.slice(0, 20)}${a.slice(20).toUpperCase()}`))).toBe(
      'INVALID_ADDRESS',
    );
    expect(code(() => decodeSilentPaymentAddress(` ${a}`))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(`${a}\n`))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(7 as unknown as string))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(''))).toBe('INVALID_ADDRESS');
  });

  it('rejects a corrupted checksum, a Bech32 (non-m) checksum and truncation', () => {
    const a = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
    const flipped = `${a.slice(0, -1)}${a.endsWith('q') ? 'p' : 'q'}`;
    expect(code(() => decodeSilentPaymentAddress(flipped))).toBe('INVALID_ADDRESS');
    const asBech32 = `sp1${a.slice(3, -6)}`; // checksum removed
    expect(code(() => decodeSilentPaymentAddress(asBech32))).toBe('INVALID_ADDRESS');
    const v0Bech32 = (): string => {
      const words = [0, ...bech32m.toWords(payload())];
      // Same data with the original Bech32 constant instead of Bech32m.
      return bech32mReplaceChecksum(words);
    };
    expect(code(() => decodeSilentPaymentAddress(v0Bech32()))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeSilentPaymentAddress(a.slice(0, -1)))).toBe('INVALID_ADDRESS');
  });

  it('enforces version rules: v0 exactly 66 bytes, v1-v30 forward compatible, v31 reserved', () => {
    const base = payload();
    // v0 with extra data or missing data
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 0, new Uint8Array([...base, 1]))))).toBe(
      'INVALID_ADDRESS',
    );
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 0, base.slice(0, 65))))).toBe('INVALID_ADDRESS');
    // v1 with extra data: first 66 bytes are used, the rest discarded
    const v1 = decodeSilentPaymentAddress(raw('sp', 1, new Uint8Array([...base, 1, 2, 3, 4, 5])));
    expect(v1.version).toBe(1);
    expect(toHex(v1.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
    expect(toHex(v1.spendPublicKey)).toBe(toHex(keys.spendPublicKey));
    // v30 accepted, v31 ('l') rejected, v1 with fewer than 66 bytes rejected
    expect(decodeSilentPaymentAddress(raw('sp', 30, base)).version).toBe(30);
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 31, base)))).toBe('UNSUPPORTED_VERSION');
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 1, base.slice(0, 40))))).toBe('INVALID_ADDRESS');
    // empty data section
    expect(code(() => decodeSilentPaymentAddress(bech32mEncode('sp', [], 1023)))).toBe('INVALID_ADDRESS');
  });

  it('rejects non-zero padding bits and keys that are not valid points', () => {
    const words = [0, ...bech32m.toWords(payload())];
    words[words.length - 1] = (words[words.length - 1] as number) | 1; // set a padding bit
    expect(code(() => decodeSilentPaymentAddress(bech32mEncode('sp', words, 1023)))).toBe('INVALID_ADDRESS');
    const badPrefix = payload();
    badPrefix[0] = 0x04;
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 0, badPrefix)))).toBe('INVALID_POINT');
    const offCurve = payload();
    offCurve.fill(0xff, 1, 33); // x >= p
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 0, offCurve)))).toBe('INVALID_POINT');
    const zeroSpend = payload();
    zeroSpend.fill(0, 33);
    expect(code(() => decodeSilentPaymentAddress(raw('sp', 0, zeroSpend)))).toBe('INVALID_POINT');
  });

  it('encode validates its key arguments', () => {
    expect(
      code(() => encodeSilentPaymentAddress('mainnet', keys.scanPublicKey.slice(1), keys.spendPublicKey)),
    ).toBe('INVALID_POINT');
    expect(code(() => encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, new Uint8Array(33)))).toBe(
      'INVALID_POINT',
    );
    expect(encodeSilentPaymentAddress('mainnet', other.scanPublicKey, other.spendPublicKey)).not.toBe(
      encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey),
    );
  });

  it('error messages never contain the address or key bytes', () => {
    const a = encodeSilentPaymentAddress('mainnet', keys.scanPublicKey, keys.spendPublicKey);
    try {
      decodeSilentPaymentAddress(a, 'testnet');
    } catch (e) {
      const text = JSON.stringify(e, Object.getOwnPropertyNames(e));
      expect(text).not.toContain(a.slice(8, 40));
      expect(text).not.toContain(toHex(keys.scanPublicKey));
    }
  });
});

/** Re-encodes `words` with the original BIP-173 Bech32 checksum constant (1), for negative tests. */
function bech32mReplaceChecksum(words: number[]): string {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  const polymod = (values: number[]): number => {
    let chk = 1;
    for (const v of values) {
      const top = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i] as number;
    }
    return chk >>> 0;
  };
  const hrp = 'sp';
  const expanded = [
    ...[...hrp].map((c) => c.charCodeAt(0) >>> 5),
    0,
    ...[...hrp].map((c) => c.charCodeAt(0) & 31),
  ];
  const mod = polymod([...expanded, ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >>> (5 * (5 - i))) & 31);
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join('')}`;
}
