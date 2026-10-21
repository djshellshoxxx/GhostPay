import { fail } from './errors.js';

const META = /^st:eth:0x([0-9a-fA-F]{132})$/;

/**
 * Validates and canonicalises (lowercase) a scheme-1 stealth meta-address
 * `st:eth:0x<66 bytes hex>` (shape as in @ghostpay/core-crypto).
 *
 * @remarks Format check only: it does NOT verify the keys are valid curve
 * points. The wallet's `decodeMetaAddress` must still run before paying.
 * @throws {LinkError} `TARGET`.
 * @security A wrong-but-well-formed meta-address sends funds to a stranger: UIs
 * must show a checksum-like fingerprint (see {@link fingerprint}) for confirmation.
 */
export function validateMetaAddress(v: unknown): string {
  if (typeof v !== 'string' || !META.test(v)) return fail('TARGET', 'target');
  return v.toLowerCase();
}

/**
 * Short human-comparable fingerprint of a meta-address: first and last 8 hex
 * digits of the payload. Not cryptographic; for visual confirmation only.
 */
export function fingerprint(metaAddress: string): string {
  const hex = validateMetaAddress(metaAddress).slice('st:eth:0x'.length);
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}
