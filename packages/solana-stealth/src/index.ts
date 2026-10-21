/**
 * @ghostpay/solana-stealth: PROOF OF CONCEPT dual-key ed25519 stealth payments for Solana
 * (SOL + SPL). Not audited. See docs/adr/ADR-0017-solana-stealth.md.
 */
export * from './errors.js';
export { L, secretScalarFromBytes, unsafeRevealSecret, zeroize, type SecretScalar } from './secret.js';
export {
  DOMAIN,
  parsePublicPoint,
  publicFromSecret,
  randomScalar,
  signWithScalar,
  verifySignature,
  type PublicPoint,
  type RandomSource,
} from './ed25519.js';
export * from './keys.js';
export * from './meta-address.js';
export * from './stealth.js';
export * from './announcement.js';
export * from './programs.js';
export * from './instructions.js';
export * from './tx.js';
export * from './rpc.js';
export * from './scan.js';
export type * from './adapter-types.js';
export * from './adapter.js';
