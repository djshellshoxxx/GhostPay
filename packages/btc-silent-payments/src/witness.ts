import { fail } from './errors.js';
import { merkleRoot, sha256d, verifyBlockData, type BlockHeader, type HeaderNetwork } from './header.js';

/**
 * BIP-141 witness binding: raw transaction parsing (txid and wtxid) and the coinbase witness commitment
 * check of Bitcoin Core `CheckWitnessMalleation`. With {@link verifyBlockData} this binds every
 * transaction's inputs, outputs AND witnesses to the block header. Prevout scripts and amounts (which live
 * in earlier blocks) are still not covered.
 */

export interface RawTxInput {
  /** Display-order hex. */
  readonly txid: string;
  readonly vout: number;
  readonly scriptSig: Uint8Array;
  readonly sequence: number;
  readonly witness: readonly Uint8Array[];
}

export interface RawTxOutput {
  readonly value: bigint;
  readonly script: Uint8Array;
}

export interface ParsedTransaction {
  /** Display-order hex of sha256d over the non-witness serialization. */
  readonly txid: string;
  /** Display-order hex of sha256d over the full serialization (equals txid without witness). */
  readonly wtxid: string;
  readonly version: number;
  readonly inputs: readonly RawTxInput[];
  readonly outputs: readonly RawTxOutput[];
  readonly locktime: number;
  /** At least one input has a non-empty witness. */
  readonly hasWitness: boolean;
  readonly isCoinbase: boolean;
}

const MAX_SIZE = 0x02000000;
const ZERO64 = '0'.repeat(64);
/** OP_RETURN, push 36, `aa21a9ed` (BIP-141 commitment header). */
const COMMITMENT_HEADER = Uint8Array.of(0x6a, 0x24, 0xaa, 0x21, 0xa9, 0xed);

function bad(): never {
  return fail('INVALID_RESPONSE');
}

function hex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function displayHash(b: Uint8Array): string {
  return hex(sha256d(b).reverse());
}

class Reader {
  public pos = 0;
  public constructor(private readonly b: Uint8Array) {}
  public get done(): boolean {
    return this.pos === this.b.length;
  }
  public peek(o = 0): number | undefined {
    return this.b[this.pos + o];
  }
  public bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.b.length) return bad();
    const out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  public u32(): number {
    const x = this.bytes(4);
    return ((x[0] as number) | ((x[1] as number) << 8) | ((x[2] as number) << 16) | ((x[3] as number) << 24)) >>> 0;
  }
  public u64(): bigint {
    const lo = BigInt(this.u32());
    return (BigInt(this.u32()) << 32n) | lo;
  }
  /** Canonical CompactSize, at most MAX_SIZE (Core `ReadCompactSize`). */
  public compact(): number {
    const first = this.bytes(1)[0] as number;
    let n: number;
    if (first < 0xfd) n = first;
    else if (first === 0xfd) {
      const x = this.bytes(2);
      n = (x[0] as number) | ((x[1] as number) << 8);
      if (n < 0xfd) return bad();
    } else if (first === 0xfe) {
      n = this.u32();
      if (n < 0x10000) return bad();
    } else {
      this.u64();
      return bad(); // non-canonical below 2^32, above MAX_SIZE otherwise
    }
    if (n > MAX_SIZE) return bad();
    return n;
  }
  public varBytes(): Uint8Array {
    return this.bytes(this.compact());
  }
}

/** Parses one network-serialized transaction (strictly: canonical sizes, no trailing bytes, BIP-144 flag rules). */
export function parseRawTransaction(input: string | Uint8Array): ParsedTransaction {
  let raw: Uint8Array;
  if (typeof input === 'string') {
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(input)) return bad();
    raw = Uint8Array.from(input.match(/../g) as string[], (h) => Number.parseInt(h, 16));
  } else if (input instanceof Uint8Array) raw = input;
  else return bad();
  const r = new Reader(raw);
  const version = r.u32() | 0;
  let segwit = false;
  if (r.peek() === 0x00) {
    if (r.peek(1) !== 0x01) return bad(); // unknown optional data / zero-input tx
    r.bytes(2);
    segwit = true;
  }
  const nIn = r.compact();
  if (nIn === 0) return bad();
  const ins: { txid: string; vout: number; scriptSig: Uint8Array; sequence: number }[] = [];
  for (let i = 0; i < nIn; i++) {
    const prev = r.bytes(32);
    ins.push({ txid: hex(prev.reverse()), vout: r.u32(), scriptSig: r.varBytes(), sequence: r.u32() });
  }
  const nOut = r.compact();
  const outputs: RawTxOutput[] = [];
  for (let i = 0; i < nOut; i++) outputs.push({ value: r.u64(), script: r.varBytes() });
  const outEnd = r.pos;
  const witnesses: Uint8Array[][] = [];
  if (segwit) {
    for (let i = 0; i < nIn; i++) {
      const n = r.compact();
      const items: Uint8Array[] = [];
      for (let j = 0; j < n; j++) items.push(r.varBytes());
      witnesses.push(items);
    }
    if (witnesses.every((w) => w.length === 0)) return bad(); // superfluous witness record
  }
  const locktimeStart = r.pos;
  const locktime = r.u32();
  if (!r.done) return bad();
  // Non-witness serialization: version || inputs || outputs || locktime.
  const nonWitness = segwit
    ? Uint8Array.from([...raw.subarray(0, 4), ...raw.subarray(6, outEnd), ...raw.subarray(locktimeStart)])
    : raw;
  const txid = displayHash(nonWitness);
  const inputs: RawTxInput[] = ins.map((x, i) => ({ ...x, witness: witnesses[i] ?? [] }));
  const isCoinbase = nIn === 1 && ins[0]?.txid === ZERO64 && ins[0].vout === 0xffffffff;
  return {
    txid,
    wtxid: segwit ? displayHash(raw) : txid,
    version,
    inputs,
    outputs,
    locktime,
    hasWitness: witnesses.some((w) => w.length > 0),
    isCoinbase,
  };
}

/** Index of the coinbase output holding the witness commitment (the LAST matching one), or -1. */
export function witnessCommitmentIndex(coinbase: ParsedTransaction): number {
  let idx = -1;
  coinbase.outputs.forEach((o, i) => {
    if (o.script.length >= 38 && COMMITMENT_HEADER.every((b, j) => o.script[j] === b)) idx = i;
  });
  return idx;
}

/**
 * Checks the block's witness data against the coinbase commitment (BIP-141; Core `CheckWitnessMalleation`).
 * `txs` is every transaction of the block in order. Without a commitment, no transaction may carry witness data.
 *
 * @returns `true` when a commitment was present and matched, `false` for a block without witness data.
 * @throws {SilentPaymentError} `INVALID_RESPONSE` on any mismatch, a malformed coinbase, or a missing commitment
 * with witness data present.
 */
export function verifyWitnessCommitment(txs: readonly ParsedTransaction[]): boolean {
  const coinbase = txs[0];
  if (coinbase?.isCoinbase !== true || txs.slice(1).some((t) => t.isCoinbase)) return bad();
  const idx = witnessCommitmentIndex(coinbase);
  if (idx < 0) {
    if (txs.some((t) => t.hasWitness)) return bad();
    return false;
  }
  const nonce = coinbase.inputs[0]?.witness;
  if (nonce?.length !== 1 || nonce[0]?.length !== 32) return bad();
  const rootDisplay = merkleRoot([ZERO64, ...txs.slice(1).map((t) => t.wtxid)]);
  const root = Uint8Array.from(rootDisplay.match(/../g) as string[], (h) => Number.parseInt(h, 16)).reverse();
  const both = new Uint8Array(64);
  both.set(root, 0);
  both.set(nonce[0], 32);
  const expected = hex(sha256d(both));
  const script = (coinbase.outputs[idx] as RawTxOutput).script;
  if (hex(script.subarray(6, 38)) !== expected) return bad();
  return true;
}

/**
 * Header + transactions check for a whole block: header hash, proof of work, txid Merkle root and the witness
 * commitment. Binds inputs, outputs and witnesses of every transaction to the header (not prevouts, and not
 * the header to the best chain: use `HeaderChain` for that).
 */
export function verifyBlockTransactions(p: {
  readonly headerHex: string;
  readonly expectedHash: string;
  readonly rawTxs: readonly (string | Uint8Array)[];
  readonly network: HeaderNetwork;
}): { readonly header: BlockHeader; readonly txs: readonly ParsedTransaction[]; readonly witnessCommitted: boolean } {
  const txs = p.rawTxs.map((t) => parseRawTransaction(t));
  const header = verifyBlockData({ headerHex: p.headerHex, expectedHash: p.expectedHash, txids: txs.map((t) => t.txid), network: p.network });
  return { header, txs, witnessCommitted: verifyWitnessCommitment(txs) };
}
