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
    expect(() => decodeRawTx(tx.rawData.subarray(0, tx.rawData.length - 1))).toThrow(); // truncated
  });
});

describe('decodeRawTx canonical strictness (EXTRA-09)', () => {
  const trx = buildTrxTransfer({ ...base, to: USDT, amountSun: 9n });
  const trc = buildTrc20Transfer({ ...base, contract: USDT, to: A, amount: 77n, feeLimitSun: 5n });
  const cat = (...p: Uint8Array[]): Uint8Array => Uint8Array.from(p.flatMap((x) => [...x]));
  const fv = (field: number, v: number): Uint8Array => cat(varint(field << 3), varint(v));

  it('rejects trailing bytes after a valid raw_data', () => {
    expect(() => decodeRawTx(cat(trx.rawData, Uint8Array.of(0)))).toThrow(); // dangling key
    expect(() => decodeRawTx(cat(trx.rawData, Uint8Array.of(0x08)))).toThrow(); // key without value
    expect(() => decodeRawTx(cat(trx.rawData, Uint8Array.of(0xff, 0xff)))).toThrow();
  });
  it('rejects unknown top-level fields, even appended', () => {
    expect(() => decodeRawTx(cat(trx.rawData, fv(12, 1)))).toThrow();
    expect(() => decodeRawTx(cat(trx.rawData, fBytes(3, Uint8Array.of(1))))).toThrow();
  });
  it('rejects duplicate scalar fields (a node would take the last value, a naive decoder the first)', () => {
    // timestamp, expiration, fee_limit, ref block, memo, contract repeated with a different value
    expect(() => decodeRawTx(cat(trx.rawData, fv(14, 1_700_000_000_001)))).toThrow();
    expect(() => decodeRawTx(cat(trx.rawData, fv(8, 1_700_000_999_000)))).toThrow();
    expect(() => decodeRawTx(cat(trc.rawData, fv(18, 999_999_999)))).toThrow();
    expect(() => decodeRawTx(cat(trx.rawData, fBytes(1, Uint8Array.of(9, 9))))).toThrow();
    expect(() => decodeRawTx(cat(trx.rawData, fBytes(10, Uint8Array.of(1))))).toThrow();
    expect(() => decodeRawTx(cat(trx.rawData, fBytes(11, Uint8Array.of(1))))).toThrow(); // second contract
  });
  it('rejects unknown, repeated and wrong-wire-type fields nested inside the contract', () => {
    const top = decodeFields(trx.rawData);
    const contract = top.find((f) => f.field === 11)?.bytes as Uint8Array;
    const rebuild = (nested: Uint8Array): Uint8Array =>
      cat(...top.map((f) => (f.field === 11 ? fBytes(11, nested) : f.bytes !== undefined ? fBytes(f.field, f.bytes) : fv(f.field, Number(f.varint)))));
    expect(() => decodeRawTx(rebuild(cat(contract, fv(5, 1))))).toThrow(); // Contract.permission_id
    expect(() => decodeRawTx(rebuild(cat(contract, fBytes(3, Uint8Array.of(1)))))).toThrow(); // Contract.provider
    const any = decodeFields(contract).find((f) => f.field === 2)?.bytes as Uint8Array;
    const val = decodeFields(any).find((f) => f.field === 2)?.bytes as Uint8Array;
    const withValue = (v: Uint8Array): Uint8Array => {
      const newAny = cat(fBytes(1, decodeFields(any).find((f) => f.field === 1)?.bytes as Uint8Array), fBytes(2, v));
      return rebuild(cat(fv(1, 1), fBytes(2, newAny)));
    };
    expect(() => decodeRawTx(withValue(val))).not.toThrow(); // control: unmodified value is accepted
    expect(() => decodeRawTx(withValue(cat(val, fv(3, 1))))).toThrow(); // second amount (last wins on a node)
    expect(() => decodeRawTx(withValue(cat(val, fv(4, 1))))).toThrow(); // unknown TransferContract field
    expect(() => decodeRawTx(withValue(cat(val, fBytes(1, Uint8Array.of(1)))))).toThrow(); // second owner
  });
  it('rejects an over-long (non-canonical) varint encoding', () => {
    // timestamp 1_700_000_000_000 written with an extra 0x80 0x00 continuation
    const ts = varint(1_700_000_000_000);
    const padded = cat(ts.subarray(0, ts.length - 1), Uint8Array.of((ts[ts.length - 1] as number) | 0x80, 0x00));
    const idx = Buffer.from(trx.rawData).indexOf(Buffer.concat([Buffer.from([0x70]), Buffer.from(ts)]));
    expect(idx).toBeGreaterThan(0);
    const mutated = cat(trx.rawData.subarray(0, idx + 1), padded, trx.rawData.subarray(idx + 1 + ts.length));
    expect(() => decodeRawTx(mutated)).toThrow();
  });
  it('rejects TRC-20 calldata that is not exactly transfer(address,uint256)', () => {
    const calldata = encodeTrc20TransferData(A, 77n);
    const bad = (mut: (d: Uint8Array) => Uint8Array): void => {
      const top = decodeFields(trc.rawData);
      const contract = decodeFields(top.find((f) => f.field === 11)?.bytes as Uint8Array);
      const any = decodeFields(contract.find((f) => f.field === 2)?.bytes as Uint8Array);
      const val = decodeFields(any.find((f) => f.field === 2)?.bytes as Uint8Array);
      const newVal = cat(...val.map((f) => fBytes(f.field, f.field === 4 ? mut(calldata) : (f.bytes as Uint8Array))));
      const newAny = cat(fBytes(1, any.find((f) => f.field === 1)?.bytes as Uint8Array), fBytes(2, newVal));
      const newContract = cat(fv(1, 31), fBytes(2, newAny));
      const raw = cat(...top.map((f) => (f.field === 11 ? fBytes(11, newContract) : f.bytes !== undefined ? fBytes(f.field, f.bytes) : fv(f.field, Number(f.varint)))));
      expect(() => decodeRawTx(raw)).toThrow();
    };
    bad((d) => cat(d, Uint8Array.of(0))); // trailing calldata byte
    bad((d) => d.subarray(0, 67)); // short
    bad((d) => cat(Uint8Array.of(0x09), d.subarray(1))); // other selector
    bad((d) => cat(d.subarray(0, 4), Uint8Array.of(1), d.subarray(5))); // dirty address padding
  });
  it('rejects a non-0x41 prefixed owner or recipient embedded in a node-built tx', () => {
    const top = decodeFields(trx.rawData);
    const contract = decodeFields(top.find((f) => f.field === 11)?.bytes as Uint8Array);
    const any = decodeFields(contract.find((f) => f.field === 2)?.bytes as Uint8Array);
    const val = decodeFields(any.find((f) => f.field === 2)?.bytes as Uint8Array);
    const badOwner = Uint8Array.from(val.find((f) => f.field === 1)?.bytes as Uint8Array);
    badOwner[0] = 0xa0;
    const newVal = cat(fBytes(1, badOwner), fBytes(2, val.find((f) => f.field === 2)?.bytes as Uint8Array), fv(3, 9));
    const newAny = cat(fBytes(1, any.find((f) => f.field === 1)?.bytes as Uint8Array), fBytes(2, newVal));
    const raw = cat(...top.map((f) => (f.field === 11 ? fBytes(11, cat(fv(1, 1), fBytes(2, newAny))) : f.bytes !== undefined ? fBytes(f.field, f.bytes) : fv(f.field, Number(f.varint)))));
    expect(() => decodeRawTx(raw)).toThrow();
  });
  it('accepts the canonical encodings produced by the builders (round trip unchanged)', () => {
    expect(decodeRawTx(trx.rawData).amount).toBe(9n);
    expect(decodeRawTx(trc.rawData).amount).toBe(77n);
    expect(decodeRawTx(buildTrc20Transfer({ ...base, contract: USDT, to: A, amount: 1n, feeLimitSun: 1n, memo: Uint8Array.of(7) }).rawData).memo).toEqual(Uint8Array.of(7));
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
    expect(() => decodeFields(Uint8Array.from([0x08, ...new Array<number>(9).fill(0xff), 0x7f]))).toThrow(); // > 2^64
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
