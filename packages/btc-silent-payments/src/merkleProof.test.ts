import { describe, expect, it } from 'vitest';
import { merkleRoot, parseHeader, reverseHex, sha256d } from './header.js';
import { REGTEST_GENESIS_HASH, hexOf, mine, u32 } from './headers.testutil.js';
import { parseRawTransaction } from './witness.js';
import { MAX_MERKLE_PROOF_DEPTH, MAX_PROOF_TRANSACTION_BYTES, verifyTxOutputProof, type TxOutputProof } from './merkleProof.js';

const KEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const raw = (tag: number, amount = 123456789n, witness = false): string =>
  `${u32(2)}${witness ? '0001' : ''}01${tag.toString(16).padStart(2, '0').repeat(32)}0000000000fdffffff01${u32(Number(amount & 0xffffffffn))}${u32(Number(amount >> 32n))}225120${KEY}${witness ? '0101aa' : ''}00000000`;
const hashPair = (a: string, b: string): string => reverseHex(hexOf(sha256d(Uint8Array.from(Buffer.from(reverseHex(a) + reverseHex(b), 'hex')))));

function fixture(pos = 1, count = 4, witness = false): TxOutputProof {
  const txs = Array.from({ length: count }, (_, i) => raw(i + 1, 123456789n, witness));
  let level = txs.map((tx) => parseRawTransaction(tx).txid);
  const merkle: string[] = []; let cursor = pos;
  while (level.length > 1) {
    merkle.push(level[cursor ^ 1] ?? level[cursor]!);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(hashPair(level[i]!, level[i + 1] ?? level[i]!));
    level = next; cursor = Math.floor(cursor / 2);
  }
  const headerHex = mine(REGTEST_GENESIS_HASH, 1_700_000_000, 0x207fffff, { merkle: merkleRoot(txs.map((tx) => parseRawTransaction(tx).txid)) });
  return { rawTransactionHex: txs[pos]!, txid: parseRawTransaction(txs[pos]!).txid, vout: 0, amountSats: 123456789n,
    xOnlyPublicKey: Uint8Array.from(Buffer.from(KEY, 'hex')), headerHex, expectedBlockHash: parseHeader(headerHex).hash,
    expectedHeight: 1, merkle: { block_height: 1, pos, merkle } };
}

function bindSingleTransaction(rawTransactionHex: string, amountSats = 123456789n): TxOutputProof {
  const txid = parseRawTransaction(rawTransactionHex).txid;
  const headerHex = mine(REGTEST_GENESIS_HASH, 1_700_000_000, 0x207fffff, { merkle: txid });
  return { ...fixture(0, 1), rawTransactionHex, txid, amountSats, headerHex, expectedBlockHash: parseHeader(headerHex).hash };
}

describe('transaction output inclusion proof', () => {
  it.each([[0, 1], [0, 4], [1, 4], [2, 3], [4, 5], [6, 7]])('verifies position %i in %i transactions, including odd right padding', (pos, count) => {
    expect(verifyTxOutputProof(fixture(pos, count))).toBe(true);
  });
  it('uses the stripped txid for a witnessed transaction, while making no witness-authentication claim', () => {
    const p = fixture(1, 4, true); expect(parseRawTransaction(p.rawTransactionHex).txid).not.toBe(parseRawTransaction(p.rawTransactionHex).wtxid);
    expect(verifyTxOutputProof(p)).toBe(true);
    const witnessChanged = p.rawTransactionHex.replace('0101aa00000000', '0101bb00000000');
    expect(verifyTxOutputProof({ ...p, rawTransactionHex: witnessChanged })).toBe(true);
  });
  it.each([0n, 2_100_000_000_000_000n])('preserves exact satoshi amount at the boundary %s', (amount) => {
    expect(verifyTxOutputProof(bindSingleTransaction(raw(1, amount), amount))).toBe(true);
  });
  it.each(['225020', '225121', '235120'])('rejects a header-committed output with a non-P2TR script %s', (prefix) => {
    const tx = raw(1).replace(`225120${KEY}`, `${prefix}${KEY}${prefix.startsWith('23') ? '00' : ''}`);
    expect(() => verifyTxOutputProof(bindSingleTransaction(tx))).toThrow(/invalid response/i);
  });
  it('binds the selected output index when the transaction has multiple outputs', () => {
    const tx = raw(1).replace('fdffffff01', 'fdffffff02').replace('225120', '00' + '0000000000000000' + '225120');
    const p = { ...bindSingleTransaction(tx, 0n), vout: 1 };
    expect(verifyTxOutputProof(p)).toBe(true);
    expect(() => verifyTxOutputProof({ ...p, vout: 0, amountSats: 123456789n })).toThrow(/invalid response/i);
  });
  it('rejects a committed coinbase output because silent-payment matches do not track coinbase maturity', () => {
    const tx = raw(0); const coinbase = tx.slice(0, 74) + 'ffffffff020101' + tx.slice(84);
    expect(parseRawTransaction(coinbase).isCoinbase).toBe(true);
    expect(() => verifyTxOutputProof(bindSingleTransaction(coinbase))).toThrow(/invalid response/i);
  });
  it.each([
    ['raw transaction', (p: TxOutputProof) => ({ ...p, rawTransactionHex: raw(8) })],
    ['transaction id', (p: TxOutputProof) => ({ ...p, txid: 'ff'.repeat(32) })],
    ['wtxid as txid', (p: TxOutputProof) => ({ ...p, txid: parseRawTransaction(p.rawTransactionHex).wtxid, rawTransactionHex: raw(2, 123456789n, true) })],
    ['output index', (p: TxOutputProof) => ({ ...p, vout: 1 })],
    ['amount', (p: TxOutputProof) => ({ ...p, amountSats: p.amountSats + 1n })],
    ['key', (p: TxOutputProof) => ({ ...p, xOnlyPublicKey: new Uint8Array(32) })],
    ['block hash', (p: TxOutputProof) => ({ ...p, expectedBlockHash: 'aa'.repeat(32) })],
    ['header root', (p: TxOutputProof) => ({ ...p, headerHex: p.headerHex.slice(0, 72) + 'aa'.repeat(32) + p.headerHex.slice(136) })],
    ['height', (p: TxOutputProof) => ({ ...p, expectedHeight: 2 })],
    ['position', (p: TxOutputProof) => ({ ...p, merkle: { ...p.merkle, pos: 0 } })],
    ['sibling', (p: TxOutputProof) => ({ ...p, merkle: { ...p.merkle, merkle: ['ff'.repeat(32), ...p.merkle.merkle.slice(1)] } })],
    ['truncated branch', (p: TxOutputProof) => ({ ...p, merkle: { ...p.merkle, merkle: p.merkle.merkle.slice(1) } })],
  ])('rejects changed %s', (_name, alter) => {
    const p = fixture(1, 4, true); expect(() => verifyTxOutputProof(alter(p))).toThrow(/invalid response/i);
  });
  it('rejects duplicate-left ambiguity for a right-hand node', () => {
    const p = fixture(); const headerHex = mine(REGTEST_GENESIS_HASH, 1_700_000_000, 0x207fffff, { merkle: hashPair(p.txid, p.txid) });
    expect(() => verifyTxOutputProof({ ...p, headerHex, expectedBlockHash: parseHeader(headerHex).hash,
      merkle: { block_height: 1, pos: 1, merkle: [p.txid] } })).toThrow(/invalid response/i);
  });
  it.each([-1, 0.5, NaN, Infinity, 0x1_0000_0000])('rejects invalid numeric input %s', (value) => {
    const p = fixture();
    for (const altered of [{ ...p, vout: value }, { ...p, expectedHeight: value }, { ...p, merkle: { ...p.merkle, pos: value } }, { ...p, merkle: { ...p.merkle, block_height: value } }])
      expect(() => verifyTxOutputProof(altered)).toThrow(/invalid response/i);
  });
  it('rejects oversized proof positions/depth, input bodies and noncanonical fields before parsing', () => {
    const p = fixture();
    const cases: unknown[] = [null, {}, { ...p, merkle: null }, { ...p, merkle: { ...p.merkle, pos: 4 } },
      { ...p, merkle: { ...p.merkle, merkle: Array.from({ length: MAX_MERKLE_PROOF_DEPTH + 1 }, () => 'aa'.repeat(32)) } },
      { ...p, merkle: { ...p.merkle, merkle: ['AA'.repeat(32)] } }, { ...p, merkle: { ...p.merkle, merkle: [null] } },
      { ...p, txid: 'AA'.repeat(32) }, { ...p, expectedBlockHash: 'no' }, { ...p, rawTransactionHex: '00'.repeat(MAX_PROOF_TRANSACTION_BYTES + 1) },
      { ...p, rawTransactionHex: p.rawTransactionHex + '00' }, { ...p, rawTransactionHex: p.rawTransactionHex.slice(1) },
      { ...p, amountSats: -1n }, { ...p, amountSats: 2_100_000_000_000_001n }, { ...p, amountSats: 3 }, { ...p, xOnlyPublicKey: new Uint8Array(31) }];
    for (const value of cases) expect(() => verifyTxOutputProof(value as TxOutputProof)).toThrow(/invalid response/i);
  });
  it('accepts upper-case raw/header hex without accepting upper-case identity hashes', () => {
    const p = fixture(); expect(verifyTxOutputProof({ ...p, rawTransactionHex: p.rawTransactionHex.toUpperCase(), headerHex: p.headerHex.toUpperCase() })).toBe(true);
  });
});
