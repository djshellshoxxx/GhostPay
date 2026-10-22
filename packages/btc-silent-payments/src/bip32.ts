import { bytesToNumberBE } from '@noble/curves/utils.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { compress, G, modN, scalarBytes, ser32 } from './ecc.js';
import { fail } from './errors.js';
import { CURVE_ORDER, wrapSecret, zeroize, type SecretScalar } from './secret.js';

/** Offset added to a child index to request hardened derivation. */
export const HARDENED_OFFSET = 0x80000000;

/** A derived BIP-32 private node. */
export interface Bip32Node {
  readonly privateKey: SecretScalar;
  readonly chainCode: Uint8Array;
}

const MASTER_KEY = utf8ToBytes('Bitcoin seed');

/**
 * BIP-32 master node from a seed.
 *
 * @param seed 16 to 64 bytes (BIP-32 allows 128 to 512 bits).
 * @returns Master private key and chain code.
 * @throws {SilentPaymentError} `INVALID_SEED`, `DERIVATION_FAILED` (probability about 2^-127).
 * @security The seed and every intermediate key are secrets. Intermediates are zeroized
 * best-effort; JavaScript gives no constant-time or erasure guarantee.
 */
export function bip32Master(seed: Uint8Array): Bip32Node {
  if (!(seed instanceof Uint8Array) || seed.length < 16 || seed.length > 64) return fail('INVALID_SEED');
  const i = hmac(sha512, MASTER_KEY, seed);
  try {
    const il = bytesToNumberBE(i.subarray(0, 32));
    if (il < 1n || il >= CURVE_ORDER) return fail('DERIVATION_FAILED');
    return { privateKey: wrapSecret(i.subarray(0, 32)), chainCode: i.slice(32) };
  } finally {
    zeroize(i);
  }
}

/**
 * BIP-32 private child key derivation (CKDpriv), hardened or not.
 *
 * @remarks BIP-32 says to continue with the next index when the result is invalid
 * (probability about 2^-127). This function fails closed instead, so the caller never
 * silently ends up on a different path.
 *
 * @param parent Parent node.
 * @param index Child index; add {@link HARDENED_OFFSET} for hardened derivation.
 * @returns Child node.
 * @throws {SilentPaymentError} `INVALID_INPUT`, `DERIVATION_FAILED`.
 * @security See {@link bip32Master}.
 */
export function bip32Child(parent: Bip32Node, index: number): Bip32Node {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) return fail('INVALID_INPUT');
  const k = bytesToNumberBE(parent.privateKey);
  const data =
    index >= HARDENED_OFFSET
      ? concatBytes(Uint8Array.of(0), parent.privateKey, ser32(index))
      : concatBytes(compress(G.multiply(k)), ser32(index));
  const i = hmac(sha512, parent.chainCode, data);
  try {
    const il = bytesToNumberBE(i.subarray(0, 32));
    const child = modN(il + k);
    if (il >= CURVE_ORDER || child === 0n) return fail('DERIVATION_FAILED');
    const childBytes = scalarBytes(child);
    const node = { privateKey: wrapSecret(childBytes), chainCode: i.slice(32) };
    zeroize(childBytes);
    return node;
  } finally {
    zeroize(i, data);
  }
}

/**
 * Derives along a full path from a seed.
 *
 * @param seed BIP-32 seed.
 * @param path Child indices (hardened ones include {@link HARDENED_OFFSET}).
 * @returns The final node.
 * @throws {SilentPaymentError} See {@link bip32Master} and {@link bip32Child}.
 * @security See {@link bip32Master}.
 */
export function bip32Derive(seed: Uint8Array, path: readonly number[]): Bip32Node {
  let node = bip32Master(seed);
  for (const index of path) {
    const next = bip32Child(node, index);
    zeroize(node.privateKey, node.chainCode);
    node = next;
  }
  return node;
}
