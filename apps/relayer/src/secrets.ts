// The generic loader lives in @ghostpay/relayer-guard/secrets so every relay service loads keys the same way.
export { ConfigError, loadOptionalSecret, loadSecret } from '@ghostpay/relayer-guard/secrets';
export type { Env, SecretSource } from '@ghostpay/relayer-guard/secrets';
import type { SecretSource } from '@ghostpay/relayer-guard/secrets';

/** Hot signing key source: exactly 32 bytes. */
export const HOT_KEY_SOURCE: SecretSource = { fileVar: 'RELAYER_KEY_FILE', valueVar: 'RELAYER_KEY', minBytes: 32, maxBytes: 32 };
/** Quote HMAC secret source: 32..128 bytes. */
export const QUOTE_SECRET_SOURCE: SecretSource = { fileVar: 'QUOTE_SECRET_FILE', valueVar: 'QUOTE_SECRET', minBytes: 32, maxBytes: 128 };

/** Previous quote HMAC key, accepted for verification only during a rotation window. */
export const QUOTE_SECRET_PREVIOUS_SOURCE: SecretSource = {
  fileVar: 'QUOTE_SECRET_PREVIOUS_FILE', valueVar: 'QUOTE_SECRET_PREVIOUS', minBytes: 32, maxBytes: 128,
};
