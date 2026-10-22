import { concatBytes } from '@noble/hashes/utils.js';
import { parseHex, parseHexAny } from './ecc.js';
import { fail } from './errors.js';

/**
 * The parts of a transaction input that silent payments needs. Byte fields are raw bytes;
 * `txid` is the usual big-endian display hex (as returned by `getrawtransaction`).
 */
export interface TxInput {
  /** 64 hex chars, display (big-endian) order. */
  readonly txid: string;
  readonly vout: number;
  readonly scriptSig: Uint8Array;
  /** Witness stack items, empty for non-witness inputs. */
  readonly witness: readonly Uint8Array[];
  /** `scriptPubKey` of the output being spent. */
  readonly prevoutScriptPubKey: Uint8Array;
}

/** Outpoint reference (display-order txid and output index). */
export interface Outpoint {
  readonly txid: string;
  readonly vout: number;
}

/**
 * Serializes an outpoint as Bitcoin does: 32-byte txid least-significant byte first, then the
 * 4-byte vout little-endian (BIP-352 "outpoint").
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` on a bad txid or vout.
 */
export function serializeOutpoint(outpoint: Outpoint): Uint8Array {
  const id = parseHex(outpoint.txid, 32);
  if (!Number.isInteger(outpoint.vout) || outpoint.vout < 0 || outpoint.vout > 0xffffffff)
    return fail('INVALID_INPUT');
  const out = new Uint8Array(36);
  out.set(id.reverse(), 0);
  new DataView(out.buffer).setUint32(32, outpoint.vout, true);
  return out;
}

/** @internal Byte-wise lexicographic comparison. */
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/**
 * The lexicographically smallest serialized outpoint (BIP-352 `outpoint_L`; byte order, not vout order).
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` when the list is empty or malformed.
 */
export function smallestOutpoint(outpoints: readonly Outpoint[]): Uint8Array {
  if (outpoints.length === 0) return fail('INVALID_INPUT');
  let best: Uint8Array | undefined;
  for (const o of outpoints) {
    const s = serializeOutpoint(o);
    if (best === undefined || compareBytes(s, best) < 0) best = s;
  }
  return best as Uint8Array;
}

/**
 * Parses a serialized witness (`getrawtransaction` `txinwitness` hex): a compact-size item
 * count followed by compact-size length-prefixed items. The empty string is an empty stack.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT` on truncation or trailing bytes.
 */
export function parseWitness(hex: string): Uint8Array[] {
  const bytes = parseHexAny(hex);
  if (bytes.length === 0) return [];
  let pos = 0;
  const readCompact = (): number => {
    const first = bytes[pos++];
    if (first === undefined) return fail('INVALID_INPUT');
    if (first < 0xfd) return first;
    const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
    if (pos + width > bytes.length) return fail('INVALID_INPUT');
    let v = 0n;
    for (let i = width - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[pos + i] as number);
    pos += width;
    const minimum = width === 2 ? 0xfdn : width === 4 ? 0x10000n : 0x100000000n;
    if (v < minimum || v > BigInt(bytes.length)) return fail('INVALID_INPUT'); // non-canonical or longer than the data
    return Number(v);
  };
  const count = readCompact();
  const items: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const len = readCompact();
    if (pos + len > bytes.length) return fail('INVALID_INPUT');
    items.push(bytes.slice(pos, pos + len));
    pos += len;
  }
  if (pos !== bytes.length) return fail('INVALID_INPUT');
  return items;
}

/** JSON-ish input as in `getrawtransaction verbosity=2` (all byte fields hex). */
export interface TxInputHex {
  readonly txid: string;
  readonly vout: number;
  readonly scriptSig: string;
  readonly txinwitness: string;
  readonly prevoutScriptPubKey: string;
}

/** Converts a hex description to a {@link TxInput}. @throws {SilentPaymentError} `INVALID_INPUT`. */
export function txInputFromHex(h: TxInputHex): TxInput {
  parseHex(h.txid, 32);
  return {
    txid: h.txid,
    vout: h.vout,
    scriptSig: parseHexAny(h.scriptSig),
    witness: parseWitness(h.txinwitness),
    prevoutScriptPubKey: parseHexAny(h.prevoutScriptPubKey),
  };
}

/** `OP_1 <32-byte x-only key>` (BIP-341 output script). */
export function taprootScriptPubKey(xOnlyPublicKey: Uint8Array): Uint8Array {
  if (xOnlyPublicKey.length !== 32) return fail('INVALID_INPUT');
  return concatBytes(Uint8Array.of(0x51, 0x20), xOnlyPublicKey);
}

/** The 32-byte key of a P2TR script, or `undefined` when the script is not P2TR. */
export function taprootOutputKey(scriptPubKey: Uint8Array): Uint8Array | undefined {
  return scriptPubKey.length === 34 && scriptPubKey[0] === 0x51 && scriptPubKey[1] === 0x20
    ? scriptPubKey.slice(2)
    : undefined;
}
