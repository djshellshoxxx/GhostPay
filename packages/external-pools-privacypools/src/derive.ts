import type { SecretBox } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/** HKDF info string for the Privacy Pools key root (EP-PP-10). Separate from the Railgun and mock routes. */
export const PP_HKDF_INFO = 'ghostpay/ext-pools/privacy-pools/v1';

/**
 * Runs `fn` with 16 bytes of entropy derived from the root seed (HKDF-SHA256) and wipes the entropy afterwards.
 *
 * @param seed Root seed.
 * @param fn Callback; must not retain the buffer.
 * @param info Domain-separation string (tests use another one to prove separation).
 * @security The 16 bytes become a BIP-39 mnemonic inside the SDK glue; they never equal or directly expose the seed.
 */
export function withEntropy<T>(seed: SecretBox, fn: (entropy: Uint8Array) => T, info: string = PP_HKDF_INFO): T {
  const e = seed.use((s) => hkdf(sha256, s, undefined, utf8ToBytes(info), 16));
  try {
    return fn(e);
  } finally {
    e.fill(0);
  }
}
