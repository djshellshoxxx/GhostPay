import { Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { merkleRoot, parseHeader, reverseHex, sha256d } from './header.js';
import { REGTEST_GENESIS_HASH, hexOf, mine, u32 } from './headers.testutil.js';
import { parseRawTransaction, verifyBlockTransactions, verifyWitnessCommitment, witnessCommitmentIndex } from './witness.js';

const MAINNET_GENESIS_HEADER =
  '0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c';
const GENESIS_COINBASE =
  '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000';

const compact = (n: number): string => (n < 0xfd ? hexOf(Uint8Array.of(n)) : `fd${hexOf(Uint8Array.of(n & 0xff, n >> 8))}`);
const varb = (h: string): string => compact(h.length / 2) + h;
const u64 = (v: bigint): string => u32(Number(v & 0xffffffffn)) + u32(Number(v >> 32n));

interface In { txid: string; vout: number; scriptSig?: string; sequence?: number; witness?: string[] }
interface Out { value: bigint; script: string }

function rawTx(ins: In[], outs: Out[], segwit: boolean, locktime = 0): string {
  let s = u32(2) + (segwit ? '0001' : '') + compact(ins.length);
  for (const i of ins) s += reverseHex(i.txid) + u32(i.vout) + varb(i.scriptSig ?? '') + u32(i.sequence ?? 0xfffffffd);
  s += compact(outs.length);
  for (const o of outs) s += u64(o.value) + varb(o.script);
  if (segwit) for (const i of ins) s += compact((i.witness ?? []).length) + (i.witness ?? []).map(varb).join('');
  return s + u32(locktime);
}

const dsha = (h: string): string => hexOf(sha256d(Uint8Array.from(Buffer.from(h, 'hex'))));
const P2TR = `5120${'11'.repeat(32)}`;
const spend = (n: number, witness: string[] = [`${'aa'.repeat(64)}`]): string =>
  rawTx([{ txid: dsha(u32(n)), vout: n, witness }], [{ value: 50_000n + BigInt(n), script: P2TR }], true);
const legacy = (n: number): string => rawTx([{ txid: dsha(u32(n + 100)), vout: 0, scriptSig: '00' }], [{ value: 1000n, script: P2TR }], false);

/** Coinbase committing to the given other transactions' wtxids (BIP-141). */
function coinbaseFor(others: string[], opts: { reserved?: string; tamper?: boolean; extraAfter?: string } = {}): string {
  const reserved = opts.reserved ?? '00'.repeat(32);
  const root = merkleRoot(['0'.repeat(64), ...others.map((t) => parseRawTransaction(t).wtxid)]);
  let commitment = dsha(reverseHex(root) + reserved);
  if (opts.tamper === true) commitment = `ff${commitment.slice(2)}`;
  const outs: Out[] = [{ value: 5_000_000_000n, script: P2TR }, { value: 0n, script: `6a24aa21a9ed${commitment}` }];
  if (opts.extraAfter !== undefined) outs.push({ value: 0n, script: opts.extraAfter });
  return rawTx([{ txid: '0'.repeat(64), vout: 0xffffffff, scriptSig: '0101', witness: [reserved] }], outs, true);
}

function block(txs: string[]): { headerHex: string; expectedHash: string; rawTxs: string[]; network: 'regtest' } {
  const headerHex = mine(REGTEST_GENESIS_HASH, 1_700_000_000, 0x207fffff, { merkle: merkleRoot(txs.map((t) => parseRawTransaction(t).txid)) });
  return { headerHex, expectedHash: parseHeader(headerHex).hash, rawTxs: txs, network: 'regtest' };
}

describe('parseRawTransaction', () => {
  it('reproduces the mainnet genesis coinbase txid and flags it as coinbase', () => {
    const t = parseRawTransaction(GENESIS_COINBASE);
    expect(t.txid).toBe('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b');
    expect(t.wtxid).toBe(t.txid);
    expect(t).toMatchObject({ isCoinbase: true, hasWitness: false, version: 1, locktime: 0 });
    expect(t.outputs[0]?.value).toBe(5_000_000_000n);
  });
  it('computes txid over the stripped serialization and wtxid over the full one (independent of @scure/btc-signer)', () => {
    const raw = spend(1, ['aa'.repeat(64), 'bb']);
    const t = parseRawTransaction(raw);
    const lib = Transaction.fromRaw(Buffer.from(raw, 'hex'), { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true });
    expect(t.txid).toBe(lib.id);
    expect(t.wtxid).toBe(reverseHex(dsha(raw)));
    expect(t.wtxid).not.toBe(t.txid);
    expect(t.inputs[0]?.witness.map(hexOf)).toEqual(['aa'.repeat(64), 'bb']);
    expect(t).toMatchObject({ hasWitness: true, isCoinbase: false });
    expect(parseRawTransaction(Buffer.from(legacy(1), 'hex')).hasWitness).toBe(false);
  });
  it('rejects malformed encodings', () => {
    const good = spend(1);
    const cases = [
      '',
      'zz',
      `${good}00`, // trailing byte
      good.slice(0, -2), // truncated
      `${good.slice(0, 8)}0002${good.slice(12)}`, // unknown flag
      rawTx([{ txid: dsha('00'), vout: 0, witness: [] }], [{ value: 1n, script: P2TR }], true), // superfluous witness
      `${u32(2)}00${'00'.repeat(4)}`, // zero inputs
      `${u32(2)}fd0100`, // non-canonical compact size
      `${u32(2)}fe00000100`, // non-canonical 4-byte size
      `${u32(2)}ff0000000001000000`, // 8-byte size
      `${u32(2)}fe00000004`, // above MAX_SIZE
    ];
    for (const c of cases) expect(() => parseRawTransaction(c), c).toThrow(/invalid response/);
    expect(() => parseRawTransaction(7 as never)).toThrow(/invalid response/);
  });
});

describe('witness commitment (BIP-141)', () => {
  it('accepts a block whose coinbase commits to every wtxid', () => {
    const others = [spend(1), legacy(2), spend(3)];
    const r = verifyBlockTransactions(block([coinbaseFor(others), ...others]));
    expect(r.witnessCommitted).toBe(true);
    expect(r.txs).toHaveLength(4);
  });
  it('detects a witness swapped after the fact (txid unchanged, wtxid changed)', () => {
    const others = [spend(1), spend(3)];
    const cb = coinbaseFor(others);
    const forged = spend(3, ['cc'.repeat(64)]);
    expect(parseRawTransaction(forged).txid).toBe(parseRawTransaction(others[1]!).txid);
    expect(() => verifyBlockTransactions(block([cb, others[0]!, forged]))).toThrow(/invalid response/);
  });
  it('accepts a block without witness data and no commitment (genesis), refuses witness data without a commitment', () => {
    const g = verifyBlockTransactions({
      headerHex: MAINNET_GENESIS_HEADER,
      expectedHash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      rawTxs: [GENESIS_COINBASE],
      network: 'mainnet',
    });
    expect(g.witnessCommitted).toBe(false);
    const cb = rawTx([{ txid: '0'.repeat(64), vout: 0xffffffff, scriptSig: '0101' }], [{ value: 1n, script: P2TR }], false);
    expect(verifyWitnessCommitment([cb, legacy(1)].map((t) => parseRawTransaction(t)))).toBe(false);
    expect(() => verifyWitnessCommitment([cb, spend(1)].map((t) => parseRawTransaction(t)))).toThrow(/invalid response/);
  });
  it('uses the LAST matching commitment output, like Bitcoin Core', () => {
    const others = [spend(1)];
    const decoy = `6a24aa21a9ed${'ee'.repeat(32)}`;
    const cbDecoyLast = coinbaseFor(others, { extraAfter: decoy });
    expect(witnessCommitmentIndex(parseRawTransaction(cbDecoyLast))).toBe(2);
    expect(() => verifyWitnessCommitment([cbDecoyLast, ...others].map((t) => parseRawTransaction(t)))).toThrow(/invalid response/);
    // A shorter OP_RETURN with the same header is not a commitment.
    const cbShort = coinbaseFor(others, { extraAfter: '6a24aa21a9ed' });
    expect(verifyWitnessCommitment([cbShort, ...others].map((t) => parseRawTransaction(t)))).toBe(true);
  });
  it('refuses a wrong commitment, a bad reserved value, and misplaced coinbases', () => {
    const others = [spend(1)];
    const p = (txs: string[]) => txs.map((t) => parseRawTransaction(t));
    expect(() => verifyWitnessCommitment(p([coinbaseFor(others, { tamper: true }), ...others]))).toThrow(/invalid response/);
    expect(() => verifyWitnessCommitment(p([coinbaseFor(others, { reserved: '00'.repeat(31) }), ...others]))).toThrow(/invalid response/);
    expect(verifyWitnessCommitment(p([coinbaseFor(others, { reserved: '07'.repeat(32) }), ...others]))).toBe(true);
    expect(() => verifyWitnessCommitment(p([...others, coinbaseFor(others)]))).toThrow(/invalid response/);
    expect(() => verifyWitnessCommitment(p([coinbaseFor(others), coinbaseFor(others)]))).toThrow(/invalid response/);
    expect(() => verifyWitnessCommitment([])).toThrow(/invalid response/);
  });
  it('still requires the txid Merkle root to match the header', () => {
    const others = [spend(1), spend(3)];
    const b = block([coinbaseFor(others), ...others]);
    expect(() => verifyBlockTransactions({ ...b, rawTxs: [b.rawTxs[0]!, b.rawTxs[2]!, b.rawTxs[1]!] })).toThrow(/invalid response/);
  });
});
