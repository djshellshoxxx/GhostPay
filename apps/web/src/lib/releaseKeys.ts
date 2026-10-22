declare const __GHOSTPAY_RELEASE_KEYS__: readonly string[] | undefined;

/**
 * Release public keys (33-byte compressed secp256k1, hex) compiled into this bundle at build time from the
 * `GHOSTPAY_RELEASE_PUBKEYS` environment variable (comma separated; see vite.config.ts). EMPTY by default, which makes
 * the app say "unsigned manifest" / "signature not checked" honestly. The keys travel in the same bundle as the code, so
 * they only help if you obtained the bundle itself out of band (README, "Release verification").
 */
export const RELEASE_PUBLIC_KEYS: readonly string[] = typeof __GHOSTPAY_RELEASE_KEYS__ === 'undefined' ? [] : __GHOSTPAY_RELEASE_KEYS__;
