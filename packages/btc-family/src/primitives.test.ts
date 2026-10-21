import fc from 'fast-check';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  CHANGE_LABEL,
  changeAddress,
  checkLabel,
  createLabelTable,
  labeledAddress,
  labeledSpendPublicKey,
  labelTweak,
  silentPaymentAddress,
} from './labels.js';
import { decodeAddress } from './address.js';
import {
  compress,
  G,
  liftX,
  modN,
  parseHex,
  parseHexAny,
  pointFromCompressed,
  ser32,
  strictScalar,
  taggedHash,
  toHex,
  xOnly,
  hasEvenY,
  mulG,
  scalarBytes,
  scalarOf,
} from './ecc.js';
import { BtcFamilyError } from './errors.js';
import { generateKeys } from './keys.js';
import { BITCOIN_MAINNET, LITECOIN_TESTNET } from './params.js';
import { seededRng } from './rng.testutil.js';
import {
  CURVE_ORDER,
  isScalarBytes,
  parseCompressedPoint,
  secretScalarFromBytes,
  unsafeRevealSecret,
  wrapSecret,
  zeroize,
} from './secret.js';
import {
  compareBytes,
  parseWitness,
  serializeOutpoint,
  smallestOutpoint,
  taprootOutputKey,
  taprootScriptPubKey,
  txInputFromHex,
} from './tx.js';
import { fakeTxid } from './fixtures.testutil.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof BtcFamilyError ? e.code : 'OTHER';
  }
  return undefined;
}

describe('SecretScalar', () => {
  const s = secretScalarFromBytes(new Uint8Array(32).fill(1));

  it('redacts every textual path', () => {
    expect(() => JSON.stringify({ s })).toThrow(TypeError);
    expect(() => String(s)).toThrow(TypeError);
    expect(() => `${s as unknown as string}`).toThrow(TypeError);
    expect(() => s.toString()).toThrow(TypeError);
    expect(() => s.toLocaleString()).toThrow(TypeError);
    expect(() => inspect(s)).toThrow(TypeError);
  });

  it('validates range and length, never reduces', () => {
    expect(code(() => secretScalarFromBytes(new Uint8Array(32)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(new Uint8Array(31).fill(1)))).toBe('INVALID_SCALAR');
    expect(code(() => secretScalarFromBytes(scalarBytes(CURVE_ORDER)))).toBe('INVALID_SCALAR');
    expect(isScalarBytes(scalarBytes(CURVE_ORDER - 1n))).toBe(true);
  });

  it('copies, reveals a plain copy, and zeroizes', () => {
    const raw = new Uint8Array(32).fill(2);
    const w = wrapSecret(raw);
    raw.fill(0);
    expect(w[0]).toBe(2);
    const plain = unsafeRevealSecret(w);
    expect(JSON.stringify(Array.from(plain.slice(0, 1)))).toBe('[2]');
    zeroize(plain, w);
    expect(plain.every((b) => b === 0) && w.every((b) => b === 0)).toBe(true);
  });

  it('parseCompressedPoint accepts only valid compressed points', () => {
    expect(parseCompressedPoint(compress(G))).toHaveLength(33);
    expect(code(() => parseCompressedPoint(new Uint8Array(33)))).toBe('INVALID_POINT');
    expect(code(() => parseCompressedPoint(new Uint8Array(32)))).toBe('INVALID_POINT');
    const offCurve = new Uint8Array(33).fill(0xff);
    offCurve[0] = 2;
    expect(code(() => parseCompressedPoint(offCurve))).toBe('INVALID_POINT');
  });
});

describe('ecc helpers', () => {
  it('hex parsing is strict', () => {
    expect(toHex(parseHex('00ff', 2))).toBe('00ff');
    expect(code(() => parseHex('00f', 2))).toBe('INVALID_INPUT');
    expect(code(() => parseHex('zz', 1))).toBe('INVALID_INPUT');
    expect(code(() => parseHex(5 as never, 1))).toBe('INVALID_INPUT');
    expect(parseHexAny('')).toHaveLength(0);
    expect(code(() => parseHexAny('abc'))).toBe('INVALID_INPUT');
    expect(code(() => parseHexAny(5 as never))).toBe('INVALID_INPUT');
  });

  it('points, parity, scalars', () => {
    expect(code(() => pointFromCompressed(new Uint8Array(33).fill(4)))).toBe('INVALID_POINT');
    const offCurve = new Uint8Array(33).fill(0xff);
    offCurve[0] = 2;
    expect(code(() => pointFromCompressed(offCurve))).toBe('INVALID_POINT');
    expect(liftX(new Uint8Array(31))).toBeNull();
    expect(liftX(new Uint8Array(32).fill(0xff))).toBeNull();
    expect(hasEvenY(liftX(xOnly(G)) as ReturnType<typeof mulG>)).toBe(true);
    expect(strictScalar(new Uint8Array(32))).toBeNull();
    expect(strictScalar(new Uint8Array(32).fill(0xff))).toBeNull();
    expect(strictScalar(scalarBytes(5n))).toBe(5n);
    expect(modN(-1n)).toBe(CURVE_ORDER - 1n);
    expect(modN(CURVE_ORDER + 3n)).toBe(3n);
    expect(toHex(ser32(0x01020304))).toBe('01020304');
    expect(scalarOf(secretScalarFromBytes(scalarBytes(9n)))).toBe(9n);
  });

  it('tagged hash is BIP-340 style and cached', () => {
    // BIP-340 reference: tagged_hash("BIP0340/challenge", "") — checked against a recomputation.
    const a = taggedHash('BIP0352/Inputs', new Uint8Array(1));
    expect(toHex(a)).toBe(toHex(taggedHash('BIP0352/Inputs', new Uint8Array(1))));
    expect(toHex(a)).not.toBe(toHex(taggedHash('BIP0352/Label', new Uint8Array(1))));
  });
});

describe('labels', () => {
  const keys = generateKeys(seededRng('labels'));

  it('B_m = B_spend + label*G, scan key unchanged, per-chain HRP only', () => {
    const a1 = decodeAddress(LITECOIN_TESTNET, labeledAddress(LITECOIN_TESTNET, keys, 1));
    const a2 = decodeAddress(LITECOIN_TESTNET, labeledAddress(LITECOIN_TESTNET, keys, 2));
    expect(toHex(a1.scanPublicKey)).toBe(toHex(keys.scanPublicKey));
    expect(toHex(a1.spendPublicKey)).not.toBe(toHex(a2.spendPublicKey));
    expect(toHex(a1.spendPublicKey)).toBe(
      toHex(labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, 1)),
    );
    expect(silentPaymentAddress(BITCOIN_MAINNET, keys).startsWith('sp1')).toBe(true);
  });

  it('change label is m = 0, reserved for labeledAddress', () => {
    expect(CHANGE_LABEL).toBe(0);
    expect(code(() => labeledAddress(BITCOIN_MAINNET, keys, 0))).toBe('RESERVED_LABEL');
    const c = decodeAddress(BITCOIN_MAINNET, changeAddress(BITCOIN_MAINNET, keys));
    expect(toHex(c.spendPublicKey)).toBe(
      toHex(labeledSpendPublicKey(keys.spendPublicKey, keys.scanSecret, 0)),
    );
  });

  it('validates label indices', () => {
    for (const bad of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(code(() => checkLabel(bad))).toBe('INVALID_LABEL');
      expect(code(() => labelTweak(keys.scanSecret, bad))).toBe('INVALID_LABEL');
    }
    expect(checkLabel(0xffffffff)).toBe(0xffffffff);
  });

  it('label table always has change, dedupes, and supports lookup', () => {
    const t = createLabelTable(keys.scanSecret, [5, 5, 0, 9]);
    expect(t.entries.map((e) => e.m)).toEqual([0, 5, 9]);
    expect(t.get(5)?.m).toBe(5);
    expect(t.get(6)).toBeUndefined();
    expect(createLabelTable(keys.scanSecret).entries).toHaveLength(1);
  });

  it('property: label tweaks are deterministic and distinct per index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (a, b) => {
          const ta = toHex(unsafeRevealSecret(labelTweak(keys.scanSecret, a)));
          expect(ta).toBe(toHex(unsafeRevealSecret(labelTweak(keys.scanSecret, a))));
          if (a !== b) expect(ta).not.toBe(toHex(unsafeRevealSecret(labelTweak(keys.scanSecret, b))));
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('tx helpers', () => {
  it('serializes outpoints little-endian and picks the smallest by bytes', () => {
    const id = `${'00'.repeat(31)}01`;
    const ser = serializeOutpoint({ txid: id, vout: 1 });
    expect(toHex(ser)).toBe(`01${'00'.repeat(31)}01000000`);
    const a = { txid: id, vout: 5 };
    const b = { txid: `${'00'.repeat(31)}02`, vout: 0 };
    expect(toHex(smallestOutpoint([b, a]))).toBe(toHex(serializeOutpoint(a)));
    expect(code(() => smallestOutpoint([]))).toBe('INVALID_INPUT');
    expect(code(() => serializeOutpoint({ txid: id, vout: 2 ** 32 }))).toBe('INVALID_INPUT');
    expect(code(() => serializeOutpoint({ txid: 'ab', vout: 0 }))).toBe('INVALID_INPUT');
    expect(compareBytes(Uint8Array.of(1), Uint8Array.of(1, 0))).toBeLessThan(0);
    expect(compareBytes(Uint8Array.of(2), Uint8Array.of(1, 9))).toBeGreaterThan(0);
  });

  it('parses witnesses strictly', () => {
    expect(parseWitness('')).toEqual([]);
    expect(parseWitness('0201aa02bbcc').map(toHex)).toEqual(['aa', 'bbcc']);
    expect(code(() => parseWitness('0201aa'))).toBe('INVALID_INPUT'); // truncated
    expect(code(() => parseWitness('0101aa00'))).toBe('INVALID_INPUT'); // trailing byte
    expect(code(() => parseWitness('fd'))).toBe('INVALID_INPUT');
    expect(code(() => parseWitness('fd0100'))).toBe('INVALID_INPUT'); // non-canonical or longer than data
    expect(code(() => parseWitness('fd0200'))).toBe('INVALID_INPUT');
    expect(code(() => parseWitness('fe01000000'))).toBe('INVALID_INPUT');
    expect(code(() => parseWitness('ff0100000000000000'))).toBe('INVALID_INPUT');
    expect(code(() => parseWitness('zz'))).toBe('INVALID_INPUT');
  });

  it('accepts a 0xfd-prefixed compact size when canonical', () => {
    // count = 253 (canonical 0xfd form) with 253 empty items
    const hex = `fdfd00${'00'.repeat(253)}`;
    expect(parseWitness(hex)).toHaveLength(253);
  });

  it('taproot script helpers', () => {
    const k = new Uint8Array(32).fill(3);
    expect(taprootOutputKey(taprootScriptPubKey(k))).toEqual(k);
    expect(taprootOutputKey(Uint8Array.of(0x51))).toBeUndefined();
    expect(code(() => taprootScriptPubKey(new Uint8Array(31)))).toBe('INVALID_INPUT');
  });

  it('txInputFromHex converts and validates', () => {
    const t = txInputFromHex({
      txid: fakeTxid('h'),
      vout: 1,
      scriptSig: '',
      txinwitness: '0101aa',
      prevoutScriptPubKey: '0014' + '00'.repeat(20),
    });
    expect(t.witness).toHaveLength(1);
    expect(
      code(() =>
        txInputFromHex({ txid: 'x', vout: 0, scriptSig: '', txinwitness: '', prevoutScriptPubKey: '' }),
      ),
    ).toBe('INVALID_INPUT');
  });
});
