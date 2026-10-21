import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { secretScalarFromBytes } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { tronAddressFromPublicKey } from './address.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { decodeFields, fBytes, varint } from './protobuf.js';
import {
  buildTrc20Transfer,
  buildTrxTransfer,
  decodeRawTx,
  encodeSignedTransactionHex,
  encodeTrc20TransferData,
  recoverTronSigner,
  signTronTx,
} from './tx.js';

const V = JSON.parse(readFileSync(new URL('../test-vectors/tron.json', import.meta.url), 'utf8')) as {
  txs: Record<string, string>[];
};
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const A = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
const refBlock = { number: 0x12345n, blockId: `0000000000012345${'00112233445566778899aabbccddeeff0011223344556677'}`.slice(0, 64) };
const base = { owner: A, refBlock, timestampMs: 1_700_000_000_000n };

describe('tx builders', () => {
  it('reproduce the independently cross-checked vectors', () => {
    for (const t of V.txs) {
      const common = {
        owner: t['owner'] as string,
        refBlock: { number: BigInt(t['refBlockNumber'] as string), blockId: t['refBlockId'] as string },
        timestampMs: BigInt(t['timestampMs'] as string),
        expirationMs: BigInt(t['expirationMs'] as string),
        memo: Uint8Array.from(Buffer.from(t['memoHex'] as string, 'hex')),
      };
      const tx =
        t['kind'] === 'trc20'
          ? buildTrc20Transfer({ ...common, contract: t['contract'] as string, to: t['to'] as string, amount: BigInt(t['amount'] as string), feeLimitSun: BigInt(t['feeLimitSun'] as string) })
          : buildTrxTransfer({ ...common, to: t['to'] as string, amountSun: BigInt(t['amount'] as string) });
      expect(tx.rawDataHex).toBe(t['rawDataHex']);
      expect(tx.txID).toBe(t['txID']);
    }
  });
  it('calldata layout: selector, 12 zero pad, 20-byte address, big-endian amount', () => {
    const d = encodeTrc20TransferData(USDT, 0x0102n);
    expect(d.length).toBe(68);
    expect(bytesToHex(d.subarray(0, 4))).toBe('a9059cbb');
    expect(d.subarray(4, 16).every((b) => b === 0)).toBe(true);
    expect(bytesToHex(d.subarray(16, 36))).toBe('a614f803b6fd780986a42c78ec9c7f77e6ded13c');
    expect(d[66]).toBe(1);
    expect(d[67]).toBe(2);
    expect(() => encodeTrc20TransferData(USDT, 0n)).toThrow();
    expect(() => encodeTrc20TransferData(USDT, 1n << 256n)).toThrow();
  });
  it('decode round-trips and txID = sha256(raw)', () => {
    const memo = Uint8Array.of(1, 2, 3);
    const tx = buildTrc20Transfer({ ...base, contract: USDT, to: A, amount: 77n, feeLimitSun: 5n, memo });
    expect(tx.txID).toBe(bytesToHex(sha256(tx.rawData)));
    const d = decodeRawTx(tx.rawData);
    expect(d).toMatchObject({ kind: 'trc20', owner: A, to: A, contract: USDT, amount: 77n, feeLimitSun: 5n, timestampMs: 1_700_000_000_000n, expirationMs: 1_700_000_600_000n });
    expect([...d.memo]).toEqual([1, 2, 3]);
    expect([...d.refBlockBytes]).toEqual([0x23, 0x45]);
    const t2 = decodeRawTx(buildTrxTransfer({ ...base, to: USDT, amountSun: 9n }).rawData);
    expect(t2).toMatchObject({ kind: 'trx', owner: A, to: USDT, amount: 9n, feeLimitSun: 0n });
    expect(t2.memo.length).toBe(0);
  });
  it('validates inputs', () => {
    const ok = { ...base, contract: USDT, to: A, amount: 1n, feeLimitSun: 1n };
    expect(() => buildTrc20Transfer({ ...ok, feeLimitSun: 0n })).toThrow();
    expect(() => buildTrc20Transfer({ ...ok, contract: 'nope' })).toThrow();
    expect(() => buildTrc20Transfer({ ...ok, refBlock: { ...refBlock, blockId: 'zz' } })).toThrow();
    expect(() => buildTrc20Transfer({ ...ok, expirationMs: base.timestampMs })).toThrow();
    expect(() => buildTrc20Transfer({ ...ok, refBlock: { ...refBlock, number: -1n } })).toThrow();
    expect(() => buildTrxTransfer({ ...base, to: A, amountSun: 0n })).toThrow();
  });
  it('decodeRawTx rejects foreign structures', () => {
    expect(() => decodeRawTx(fBytes(1, Uint8Array.of(1)))).toThrow(); // no contract
    expect(() => decodeRawTx(fBytes(99, Uint8Array.of(1)))).toThrow(); // unknown field
    const tx = buildTrc20Transfer({ ...base, contract: USDT, to: A, amount: 1n, feeLimitSun: 1n });
    const bad = tx.rawData.slice();
    bad[bad.length - 1] ^= 0; // keep valid
    expect(() => decodeRawTx(bad.subarray(0, bad.length - 3))).toThrow(); // truncated
  });
});

describe('protobuf', () => {
  it('varint boundaries and strict decoding', () => {
    expect([...varint(0)]).toEqual([0]);
    expect([...varint(300)]).toEqual([0xac, 0x02]);
    expect(() => varint(-1)).toThrow();
    expect(() => varint(1n << 64n)).toThrow();
    expect(() => decodeFields(Uint8Array.of(0x08))).toThrow(); // missing value
    expect(() => decodeFields(Uint8Array.of(0x0a, 5, 1))).toThrow(); // truncated bytes
    expect(() => decodeFields(Uint8Array.of(0x0d, 1, 2, 3, 4))).toThrow(); // wire type 5
    expect(() => decodeFields(Uint8Array.of(0x00, 1))).toThrow(); // field 0
    expect(() => decodeFields(new Uint8Array(11).fill(0xff))).toThrow(); // overlong varint
    expect(() => decodeFields(Uint8Array.from([0x08, ...Array(9).fill(0xff), 0x7f]))).toThrow(); // > 2^64
  });
});

describe('signing', () => {
  const secret = secretScalarFromBytes(Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)));
  it('signature recovers to the signer and encodes full tx', () => {
    const tx = buildTrxTransfer({ ...base, to: USDT, amountSun: 1n });
    const sig = signTronTx(tx, secret);
    expect(sig).toHaveLength(130);
    expect(['00', '01']).toContain(sig.slice(128));
    expect(recoverTronSigner(tx.txID, sig)).toBe(A);
    expect(recoverTronSigner(tx.txID, sig)).toBe(
      tronAddressFromPublicKey(secp256k1.getPublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 1 : 0)), true)),
    );
    const full = encodeSignedTransactionHex(tx, sig);
    const f = decodeFields(Uint8Array.from(Buffer.from(full, 'hex')));
    expect(f.map((x) => x.field)).toEqual([1, 2]);
    expect(bytesToHex(f[0]?.bytes as Uint8Array)).toBe(tx.rawDataHex);
    expect(bytesToHex(f[1]?.bytes as Uint8Array)).toBe(sig);
  });
  it('refuses inconsistent txID and bad signatures', () => {
    const tx = buildTrxTransfer({ ...base, to: USDT, amountSun: 1n });
    expect(() => signTronTx({ ...tx, txID: '00'.repeat(32) }, secret)).toThrow();
    expect(() => recoverTronSigner(tx.txID, '00'.repeat(64) + '05')).toThrow();
    expect(() => recoverTronSigner(tx.txID, '00'.repeat(65))).toThrow(); // r=s=0
    expect(() => recoverTronSigner(tx.txID, 'ab')).toThrow();
    expect(() => encodeSignedTransactionHex(tx, 'ab')).toThrow();
  });
});
