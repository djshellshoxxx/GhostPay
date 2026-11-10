import { loadSecret, type SecretSource } from '@ghostpay/relayer-guard/secrets';

/**
 * Hot key source for the pool relayer. `POOL_RELAYER_KEY_FILE` (a mode-600 file holding the hex key) is preferred;
 * `POOL_RELAYER_KEY` (the value itself) still works outside production and is refused under `NODE_ENV=production`
 * unless `ALLOW_SECRET_ENV=1`, exactly as for apps/relayer.
 */
export const POOL_RELAYER_KEY_SOURCE: SecretSource = { fileVar: 'POOL_RELAYER_KEY_FILE', valueVar: 'POOL_RELAYER_KEY', minBytes: 32, maxBytes: 32 };

/**
 * Loads the 32-byte hot key through the descriptor-bound loader, then removes both variables from `env`
 * so the key (or its path) is not inherited by anything that later reads the environment.
 *
 * @param env Mutable process environment.
 * @returns The key as 0x-prefixed lowercase hex.
 * @throws {ConfigError} when missing, both set, unreadable, too permissive or malformed; messages name variables only.
 */
export function loadPoolRelayerKey(env: Record<string, string | undefined>): `0x${string}` {
  const bytes = loadSecret(env, POOL_RELAYER_KEY_SOURCE);
  delete env[POOL_RELAYER_KEY_SOURCE.valueVar];
  delete env[POOL_RELAYER_KEY_SOURCE.fileVar];
  return `0x${Buffer.from(bytes).toString('hex')}`;
}
