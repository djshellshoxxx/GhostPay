import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { SilentPaymentError } from './errors.js';
import {
  compareBytes,
  parseWitness,
  serializeOutpoint,
  smallestOutpoint,
  taprootOutputKey,
  taprootScriptPubKey,
  txInputFromHex,
} from './tx.js';
import { toHex } from './ecc.js';

const txidA = `${'00'.repeat(31)}01`;
const txidB = `01${'00'.repeat(31)}`;

describe('outpoints', () => {
  it('serializes txid reversed then vout little-endian', () => {
    const s = serializeOutpoint({ txid: `${'00'.repeat(30)}aabb`, vout: 0x01020304 });
    expect(toHex(s)).toBe(`bbaa${'00'.repeat(30)}04030201`);
  });

  it('picks the smallest by BYTES, not by vout integer or txid order', () => {
    // vout 256 serializes as 00 01 00 00, vout 1 as 01 00 00 00: bytes say 256 < 1
    const small = smallestOutpoint([
      { txid: txidA, vout: 1 },
      { txid: txidA, vout: 256 },
    ]);
    expect(toHex(small.slice(32))).toBe('00010000');
    // reversed txid: txidA is 01 00.. (LE), txidB is 00..01 (LE) so B is smaller
    const s2 = smallestOutpoint([
      { txid: txidA, vout: 0 },
      { txid: txidB, vout: 0 },
    ]);
    expect(toHex(s2.slice(0, 1))).toBe('00');
  });

  it('rejects malformed txids, vouts and empty lists', () => {
    for (const bad of ['', 'zz'.repeat(32), '00'.repeat(31), `${'00'.repeat(31)}0`]) {
      expect(() => serializeOutpoint({ txid: bad, vout: 0 })).toThrow(SilentPaymentError);
    }
    for (const v of [-1, 1.5, 2 ** 32, Number.NaN])
      expect(() => serializeOutpoint({ txid: txidA, vout: v })).toThrow(SilentPaymentError);
    expect(() => smallestOutpoint([])).toThrow(SilentPaymentError);
  });

  it('compareBytes orders by prefix then length', () => {
    expect(compareBytes(Uint8Array.of(1), Uint8Array.of(1, 0))).toBeLessThan(0);
    expect(compareBytes(Uint8Array.of(2), Uint8Array.of(1, 9))).toBeGreaterThan(0);
    expect(compareBytes(Uint8Array.of(1), Uint8Array.of(1))).toBe(0);
  });
});

describe('witness parsing', () => {
  it('parses empty, simple and 0xfd-length items', () => {
    expect(parseWitness('')).toEqual([]);
    expect(parseWitness('0201aa02bbcc').map(toHex)).toEqual(['aa', 'bbcc']);
    const big = `01fd0001${'ab'.repeat(256)}`;
    expect(parseWitness(big)[0]).toHaveLength(256);
    expect(parseWitness('0100')[0]).toHaveLength(0);
  });

  it('rejects truncation, trailing bytes, oversized counts and bad hex', () => {
    for (const bad of [
      '01',
      '0201aa',
      '0100ff',
      '01fd0001',
      'fe',
      'fd',
      '01fe',
      'ff0000000000000000',
      'zz',
      '0',
    ]) {
      expect(() => parseWitness(bad), bad).toThrow(SilentPaymentError);
    }
    // non-canonical compact sizes are rejected, as are well-formed ones that exceed the data length
    expect(() => parseWitness('fd0100')).toThrow(SilentPaymentError);
    expect(() => parseWitness('fe01000000')).toThrow(SilentPaymentError);
    expect(() => parseWitness('01fe00000100')).toThrow(SilentPaymentError);
    expect(() => parseWitness('01ff0000000100000000')).toThrow(SilentPaymentError);
  });
});

describe('tx helpers', () => {
  it('txInputFromHex converts and validates', () => {
    const i = txInputFromHex({
      txid: txidA,
      vout: 2,
      scriptSig: '00',
      txinwitness: '0101aa',
      prevoutScriptPubKey: '5120' + '11'.repeat(32),
    });
    expect(i.scriptSig).toEqual(hexToBytes('00'));
    expect(i.witness).toHaveLength(1);
    expect(() =>
      txInputFromHex({ txid: 'xx', vout: 0, scriptSig: '', txinwitness: '', prevoutScriptPubKey: '' }),
    ).toThrow(SilentPaymentError);
  });

  it('taproot script helpers', () => {
    const k = new Uint8Array(32).fill(5);
    expect(toHex(taprootScriptPubKey(k))).toBe(`5120${'05'.repeat(32)}`);
    expect(taprootOutputKey(taprootScriptPubKey(k))).toEqual(k);
    expect(taprootOutputKey(hexToBytes('0014' + '00'.repeat(20)))).toBeUndefined();
    expect(taprootOutputKey(hexToBytes('5120' + '00'.repeat(31)))).toBeUndefined();
    expect(() => taprootScriptPubKey(new Uint8Array(31))).toThrow(SilentPaymentError);
  });
});
