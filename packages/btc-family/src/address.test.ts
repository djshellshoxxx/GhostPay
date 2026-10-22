import { bech32, bech32m } from '@scure/base';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeAddress, encodeAddress } from './address.js';
import { bech32mDecode, bech32mEncode } from './bech32m.js';
import { toHex } from './ecc.js';
import { BtcFamilyError } from './errors.js';
import { generateKeys } from './keys.js';
import {
  BITCOIN_CASH_MAINNET,
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  BUILTIN_CHAINS,
  DOGECOIN_MAINNET,
  LITECOIN_MAINNET,
  LITECOIN_TESTNET,
} from './params.js';
import { seededRng } from './rng.testutil.js';

const keys = generateKeys(seededRng('address'));

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

function payload(scan: Uint8Array, spend: Uint8Array): number[] {
  const p = new Uint8Array(66);
  p.set(scan, 0);
  p.set(spend, 33);
  return bech32m.toWords(p);
}

describe('address encode/decode per chain', () => {
  it('round-trips on every built-in chain, with the right prefix and length', () => {
    for (const c of BUILTIN_CHAINS) {
      const a = encodeAddress(c, keys.scanPublicKey, keys.spendPublicKey);
      expect(a.startsWith(`${c.spHrp}1q`)).toBe(true);
      expect(a).toHaveLength(c.spHrp.length + 1 + 1 + 106 + 6);
      const d = decodeAddress(c, a);
      expect(d.chainId).toBe(c.id);
      expect(d.version).toBe(0);
      expect(toHex(d.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
      expect(toHex(d.spendPublicKey)).toBe(toHex(keys.spendPublicKey));
    }
  });

  it('Bitcoin addresses are 116 (sp) and 117 (tsp) characters', () => {
    expect(encodeAddress(BITCOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey)).toHaveLength(116);
    expect(encodeAddress(BITCOIN_TESTNET, keys.scanPublicKey, keys.spendPublicKey)).toHaveLength(117);
  });

  it('property: encode/decode is the identity for random key pairs on all chains', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), (seed) => {
        const k = generateKeys(seededRng(seed));
        for (const c of BUILTIN_CHAINS) {
          const d = decodeAddress(c, encodeAddress(c, k.scanPublicKey, k.spendPublicKey));
          expect(toHex(d.scanPublicKey)).toBe(toHex(k.scanPublicKey));
          expect(toHex(d.spendPublicKey)).toBe(toHex(k.spendPublicKey));
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe('cross-chain rejection', () => {
  it('an address of chain A is rejected by every other chain', () => {
    for (const a of BUILTIN_CHAINS) {
      const addr = encodeAddress(a, keys.scanPublicKey, keys.spendPublicKey);
      for (const b of BUILTIN_CHAINS) {
        if (a.id === b.id) continue;
        expect(code(() => decodeAddress(b, addr))).toBe('NETWORK_MISMATCH');
      }
    }
  });

  it('mainnet vs testnet of the same family are different', () => {
    const l = encodeAddress(LITECOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey);
    expect(code(() => decodeAddress(LITECOIN_TESTNET, l))).toBe('NETWORK_MISMATCH');
    const b = encodeAddress(BITCOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey);
    expect(code(() => decodeAddress(BITCOIN_TESTNET, b))).toBe('NETWORK_MISMATCH');
  });

  it('a bare segwit-style HRP (ltc, tltc, bc, tb, bcrt) is not a silent payment address', () => {
    for (const hrp of ['ltc', 'tltc', 'bc', 'tb', 'bcrt', 'bitcoincash']) {
      const a = bech32mEncode(hrp, [0, ...payload(keys.scanPublicKey, keys.spendPublicKey)], 1023);
      for (const c of BUILTIN_CHAINS) expect(code(() => decodeAddress(c, a))).toBe('NETWORK_MISMATCH');
    }
  });

  it('suffix lookalikes do not confuse HRP matching', () => {
    const sp = encodeAddress(BITCOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey);
    // `ltcsp`/`dogesp`/`bchsp` end in `sp` but must not decode as Bitcoin `sp`.
    for (const c of [LITECOIN_MAINNET, DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      const a = encodeAddress(c, keys.scanPublicKey, keys.spendPublicKey);
      expect(code(() => decodeAddress(BITCOIN_MAINNET, a))).toBe('NETWORK_MISMATCH');
      expect(code(() => decodeAddress(c, sp))).toBe('NETWORK_MISMATCH');
    }
  });
});

describe('negative address cases', () => {
  const good = encodeAddress(BITCOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey);
  const w = payload(keys.scanPublicKey, keys.spendPublicKey);

  it('rejects uppercase, mixed case, non-strings and the empty string', () => {
    expect(code(() => decodeAddress(BITCOIN_MAINNET, good.toUpperCase()))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeAddress(BITCOIN_MAINNET, `S${good.slice(1)}`))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeAddress(BITCOIN_MAINNET, 5 as unknown as string))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeAddress(BITCOIN_MAINNET, ''))).toBe('INVALID_ADDRESS');
  });

  it('rejects a corrupted checksum, a truncated string and a classic-bech32 checksum', () => {
    const last = good.at(-1) === 'q' ? 'p' : 'q';
    expect(code(() => decodeAddress(BITCOIN_MAINNET, good.slice(0, -1) + last))).toBe('INVALID_ADDRESS');
    expect(code(() => decodeAddress(BITCOIN_MAINNET, good.slice(0, -10)))).toBe('INVALID_ADDRESS');
    const legacy = bech32.encode('sp', [0, ...w], 1023);
    expect(code(() => decodeAddress(BITCOIN_MAINNET, legacy))).toBe('INVALID_ADDRESS');
  });

  it('rejects address with no data, wrong payload size and bad padding', () => {
    expect(code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [], 1023)))).toBe('INVALID_ADDRESS');
    expect(
      code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [0, ...w.slice(0, -2)], 1023))),
    ).toBe('INVALID_ADDRESS');
    expect(code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [0, ...w, 0, 0], 1023)))).toBe(
      'INVALID_ADDRESS',
    );
    // 106 data words -> trailing partial group with non-zero padding bits
    expect(
      code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [0, ...w.slice(0, -1), 31], 1023))),
    ).toBe('INVALID_ADDRESS');
  });

  it('versions: 31 rejected, 1 to 30 read forward-compatibly, short v1 rejected', () => {
    expect(code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [31, ...w], 1023)))).toBe(
      'UNSUPPORTED_VERSION',
    );
    const extra = bech32m.toWords(new Uint8Array(70).fill(7));
    expect(extra.length).toBeGreaterThan(0);
    const long = new Uint8Array(70);
    long.set(keys.scanPublicKey, 0);
    long.set(keys.spendPublicKey, 33);
    const v1 = decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [1, ...bech32m.toWords(long)], 1023));
    expect(v1.version).toBe(1);
    expect(toHex(v1.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
    expect(
      code(() => decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [1, ...w.slice(0, 80)], 1023))),
    ).toBe('INVALID_ADDRESS');
  });

  it('rejects invalid points and wrong key prefixes', () => {
    const p = new Uint8Array(66);
    p.set(keys.scanPublicKey, 0);
    p.set(keys.spendPublicKey, 33);
    const badPrefix = Uint8Array.from(p);
    badPrefix[33] = 4;
    expect(
      code(() =>
        decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [0, ...bech32m.toWords(badPrefix)], 1023)),
      ),
    ).toBe('INVALID_POINT');
    const offCurve = Uint8Array.from(p);
    offCurve.fill(0xff, 34);
    offCurve[33] = 2;
    expect(
      code(() =>
        decodeAddress(BITCOIN_MAINNET, bech32mEncode('sp', [0, ...bech32m.toWords(offCurve)], 1023)),
      ),
    ).toBe('INVALID_POINT');
  });

  it('encoding rejects invalid keys', () => {
    expect(code(() => encodeAddress(BITCOIN_MAINNET, new Uint8Array(33), keys.spendPublicKey))).toBe(
      'INVALID_POINT',
    );
    expect(code(() => encodeAddress(BITCOIN_MAINNET, keys.scanPublicKey, keys.spendPublicKey.slice(1)))).toBe(
      'INVALID_POINT',
    );
    expect(
      code(() =>
        encodeAddress(
          BITCOIN_MAINNET,
          keys.scanPublicKey.map((b, i) => (i === 0 ? 4 : b)),
          keys.spendPublicKey,
        ),
      ),
    ).toBe('INVALID_POINT');
  });

  it('bech32m wrappers fail closed', () => {
    expect(code(() => bech32mEncode('', [0], 1023))).toBe('INVALID_ADDRESS');
    expect(code(() => bech32mEncode('sp', [99], 1023))).toBe('INVALID_ADDRESS');
    expect(code(() => bech32mDecode(7 as unknown as string, 1023))).toBe('INVALID_ADDRESS');
    expect(code(() => bech32mDecode('nodelimiter', 1023))).toBe('INVALID_ADDRESS');
    expect(bech32mDecode(good, 1023).hrp).toBe('sp');
  });

  it('property: arbitrary strings never decode and never throw a non-BtcFamilyError', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const c = code(() => decodeAddress(LITECOIN_TESTNET, s));
        expect(c === 'INVALID_ADDRESS' || c === 'NETWORK_MISMATCH').toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
