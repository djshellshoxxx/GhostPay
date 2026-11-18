import { fail } from './errors.js';
import { parseHeader, sha256d } from './header.js';
import { fromHex, toHex } from './hexbytes.js';
import { parseRawTransaction } from './witness.js';

/** Bounded Electrum/Esplora transaction branch: deepest sibling first, display-order hashes. */
export interface TransactionMerkleProof {
  readonly block_height: number;
  readonly pos: number;
  readonly merkle: readonly string[];
}

export interface TxOutputProof {
  readonly rawTransactionHex: string;
  readonly txid: string;
  readonly vout: number;
  readonly amountSats: bigint;
  readonly xOnlyPublicKey: Uint8Array;
  readonly headerHex: string;
  /** Obtain this hash from the validated HeaderChain at expectedHeight, never from the proof response alone. */
  readonly expectedBlockHash: string;
  readonly expectedHeight: number;
  readonly merkle: TransactionMerkleProof;
}

/** Even a transaction occupying a whole Bitcoin block cannot exceed this serialized byte bound. */
export const MAX_PROOF_TRANSACTION_BYTES = 4_000_000;
export const MAX_MERKLE_PROOF_DEPTH = 32;
const HASH = /^[0-9a-f]{64}$/;
const MAX_SATS = 2_100_000_000_000_000n;
const uint32 = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
const bad = (): never => fail('INVALID_RESPONSE');

/**
 * Proves that the exact P2TR output/value belongs to a non-coinbase transaction committed by the caller-pinned header.
 * Reuses the strict transaction parser, recomputes the non-witness txid and evaluates a bounded Merkle branch.
 *
 * This authenticates neither witness data nor input prevouts/scripts, spent status, total transaction count or
 * oracle completeness. The caller must anchor expectedBlockHash to a validated HeaderChain at expectedHeight.
 * Unlike a full-block check, a branch cannot establish that the entire Merkle tree is free from duplicate mutation:
 * equal right padding is legitimate for an odd width, whose exact value the header does not commit separately.
 * An equal left sibling is always rejected because a right-hand node cannot be legitimate odd-width padding.
 * Coinbase transactions are excluded: BIP-352 matches do not carry coinbase-maturity information.
 * Returns exactly true only after every inclusion and output check; invalid evidence throws INVALID_RESPONSE.
 */
export function verifyTxOutputProof(p: TxOutputProof): true {
  if (p === null || typeof p !== 'object' || typeof p.rawTransactionHex !== 'string' || p.rawTransactionHex.length === 0 ||
      p.rawTransactionHex.length > MAX_PROOF_TRANSACTION_BYTES * 2 || p.rawTransactionHex.length % 2 !== 0 ||
      typeof p.txid !== 'string' || !HASH.test(p.txid) || typeof p.expectedBlockHash !== 'string' || !HASH.test(p.expectedBlockHash) ||
      !uint32(p.vout) || !uint32(p.expectedHeight) || typeof p.amountSats !== 'bigint' || p.amountSats < 0n || p.amountSats > MAX_SATS ||
      !(p.xOnlyPublicKey instanceof Uint8Array) || p.xOnlyPublicKey.length !== 32) return bad();
  const proof = p.merkle;
  if (proof === null || typeof proof !== 'object' || !uint32(proof.block_height) || proof.block_height !== p.expectedHeight ||
      !uint32(proof.pos) || !Array.isArray(proof.merkle) || proof.merkle.length > MAX_MERKLE_PROOF_DEPTH ||
      proof.pos >= 2 ** proof.merkle.length) return bad();
  const header = parseHeader(p.headerHex);
  if (header.hash !== p.expectedBlockHash) return bad();
  const transaction = parseRawTransaction(p.rawTransactionHex);
  if (transaction.txid !== p.txid || transaction.isCoinbase) return bad();
  const output = transaction.outputs[p.vout];
  if (output === undefined || output.value !== p.amountSats || output.script.length !== 34 || output.script[0] !== 0x51 || output.script[1] !== 0x20 ||
      !p.xOnlyPublicKey.every((value, i) => value === output.script[i + 2])) return bad();

  let current = fromHex(transaction.txid).reverse(); let position = proof.pos;
  for (const siblingHash of proof.merkle) {
    if (typeof siblingHash !== 'string' || !HASH.test(siblingHash)) return bad();
    const sibling = fromHex(siblingHash).reverse();
    const right = position % 2 === 1;
    if (right && toHex(current) === toHex(sibling)) return bad();
    const pair = new Uint8Array(64);
    pair.set(right ? sibling : current); pair.set(right ? current : sibling, 32);
    current = sha256d(pair); position = Math.floor(position / 2);
  }
  if (toHex(current.reverse()) !== header.merkleRoot) return bad();
  return true;
}
