import type { SecretBox } from '@ghostpay/secret-box';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/** HKDF info for the Railgun wallet root. Separate from the Privacy Pools and mock routes. */
export const RG_HKDF_INFO = 'ghostpay/ext-pools/railgun/v1';

/**
 * Runs `fn` with 16 bytes of HKDF-SHA256 output of the root seed and wipes them afterwards.
 *
 * @param seed Root seed.
 * @param fn Callback; must not retain the buffer.
 * @param info Domain separation string.
 */
export function withEntropy<T>(seed: SecretBox, fn: (entropy: Uint8Array) => T, info: string = RG_HKDF_INFO): T {
  const e = seed.use((s) => hkdf(sha256, s, undefined, utf8ToBytes(info), 16));
  try {
    return fn(e);
  } finally {
    e.fill(0);
  }
}
