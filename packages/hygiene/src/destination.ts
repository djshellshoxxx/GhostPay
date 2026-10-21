import { bytesToHex } from '@noble/hashes/utils.js';
import { hkdf, expand } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  deriveStealthPayment,
  deriveStealthSecret,
  zeroize,
  type SecretScalar,
  type StealthKeySet,
} from '@ghostpay/core-crypto';
import { addressOfSecret } from '@ghostpay/chain-adapters';
import { normAddress, type Address, type Hex } from './addr.js';
import { fail } from './errors.js';

const SALT = new TextEncoder().encode('ghostpay/hygiene/v1');
const MAX_U32 = 0xffff_ffff;
const MAX_REQUEST = 65_536;

/** A fresh self-derived destination (all fields public data; no secret inside). */
export interface FreshDestination {
  readonly index: number;
  readonly address: Address;
  /** 33-byte compressed ephemeral public key R, 0x-hex. */
  readonly ephemeralPublicKey: Hex;
  /** One-byte view tag, 0x-hex. */
  readonly viewTag: Hex;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
}

/**
 * Deterministic counter-mode byte stream shaped like `crypto.getRandomValues`.
 *
 * @remarks block_j = HKDF-Expand(seed, "rng" || u32be(j), 32), j = 0, 1, ... The counter
 * advances across calls, so `randomScalar` rejection-sampling retries consume fresh blocks.
 * The seed is copied; the copy is kept for the life of the returned object.
 *
 * @param seed 32-byte seed.
 * @returns Object with `getRandomValues` (Uint8Array views only, up to 65536 bytes per call).
 * @throws {HygieneError} `INVALID_INPUT` for a wrong-length seed, a non-byte-array view, or a counter overflow.
 * @security Deterministic by design: NEVER use as a general RNG. Used only to derive own-wallet destinations.
 */
export function hkdfRng(seed: Uint8Array): Pick<Crypto, 'getRandomValues'> {
  return hkdfStream(seed).rng;
}

/** @internal Stream plus a `wipe` that zeroizes the retained seed copy. */
function hkdfStream(seed: Uint8Array): { rng: Pick<Crypto, 'getRandomValues'>; wipe: () => void } {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) fail('INVALID_INPUT', 'seed must be 32 bytes');
  const prk = Uint8Array.from(seed);
  let counter = 0;
  const rng = {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (!(array instanceof Uint8Array)) return fail('INVALID_INPUT', 'Uint8Array required');
      if (array.length > MAX_REQUEST) return fail('INVALID_INPUT', 'request too large');
      let off = 0;
      while (off < array.length) {
        /* v8 ignore next -- 2^32 blocks cannot be drawn in a test */
        if (counter > MAX_U32) fail('INVALID_INPUT', 'rng counter exhausted');
        const block = expand(sha256, prk, concat(new TextEncoder().encode('rng'), u32be(counter)), 32);
        counter += 1;
        const n = Math.min(32, array.length - off);
        array.set(block.subarray(0, n), off);
        off += n;
        zeroize(block);
      }
      return array;
    },
  };
  return { rng: rng, wipe: () => zeroize(prk) };
}

/**
 * Derives the index-th fresh destination as an ordinary scheme-1 stealth address of the seller's own meta-address (HY-DST).
 *
 * @remarks seed = HKDF-SHA256(ikm, salt "ghostpay/hygiene/v1", info "dest" || u32be(index), 32);
 * the stealth ephemeral scalar comes from {@link hkdfRng}(seed). No announcement is posted and no
 * state is stored: D_i and its key are re-derivable from the keys and `index`. Address hygiene only:
 * the payer and chain observers still see S1 -> D_i; it does NOT hide that link.
 *
 * @param ownMeta Own scheme-1 meta-address.
 * @param withSeed Supplies the input key material (the spending-secret bytes) as a COPY to the callback and
 *   returns the callback's result. The copy is zeroized here on return and on throw.
 * @param index u32 derivation index (allocate with `DestLedger.nextIndex()`).
 * @returns Public destination data.
 * @throws {HygieneError} `INVALID_INPUT`; crypto errors from core-crypto for a bad meta-address.
 * @security Seed and ikm never leave this call and are zeroized on return and throw. Pure derivation: no chain context, no network.
 */
export function deriveFreshDestination(
  ownMeta: string,
  withSeed: <T>(f: (ikm: Uint8Array) => T) => T,
  index: number,
): FreshDestination {
  if (!Number.isInteger(index) || index < 0 || index > MAX_U32) fail('INVALID_INPUT', 'index must be a u32');
  if (typeof withSeed !== 'function') fail('INVALID_INPUT', 'withSeed required');
  return withSeed((ikm) => {
    let seed: Uint8Array | undefined;
    let wipe: (() => void) | undefined;
    try {
      if (!(ikm instanceof Uint8Array) || ikm.length === 0) fail('INVALID_INPUT', 'empty key material');
      seed = hkdf(sha256, ikm, SALT, concat(new TextEncoder().encode('dest'), u32be(index)), 32);
      const stream = hkdfStream(seed);
      wipe = stream.wipe;
      const p = deriveStealthPayment(ownMeta, stream.rng);
      return {
        index,
        address: p.stealthAddress,
        ephemeralPublicKey: `0x${bytesToHex(p.ephemeralPublicKey)}`,
        viewTag: `0x${bytesToHex(p.viewTag)}`,
      };
    } finally {
      if (seed !== undefined) zeroize(seed);
      if (wipe !== undefined) wipe();
      if (ikm instanceof Uint8Array) zeroize(ikm);
    }
  });
}

/**
 * Recovers the private key of a fresh destination from the keys and its public record.
 *
 * @param keys Own viewing and spending secrets.
 * @param d Destination from {@link deriveFreshDestination}.
 * @returns Redacting secret scalar whose address equals `d.address`.
 * @throws {HygieneError} `INVALID_ADDRESS` if the derived key does not map to `d.address`; core-crypto errors.
 * @security Output is a spendable private key: never log or transmit; zeroize after use.
 */
export function recoverDestinationKey(
  keys: Pick<StealthKeySet, 'viewingSecret' | 'spendingSecret'>,
  d: FreshDestination,
): SecretScalar {
  const secret = deriveStealthSecret(
    { stealthAddress: d.address, ephemeralPublicKey: d.ephemeralPublicKey, metadata: d.viewTag },
    keys,
  );
  /* v8 ignore start -- defence in depth: deriveStealthSecret already verifies the address */
  if (normAddress(addressOfSecret(secret)) !== normAddress(d.address)) {
    zeroize(secret);
    return fail('INVALID_ADDRESS', 'recovered key does not match destination');
  }
  /* v8 ignore stop */
  return secret;
}
