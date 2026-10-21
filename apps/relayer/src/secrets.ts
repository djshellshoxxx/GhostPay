import { readFileSync, statSync } from 'node:fs';

/** Environment view. */
export type Env = Readonly<Record<string, string | undefined>>;

/** Startup failure; messages name variables only, never values. */
export class ConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Where a secret comes from. */
export interface SecretSource {
  /** Env var holding a FILE PATH (preferred). */
  readonly fileVar: string;
  /** Env var holding the VALUE directly. */
  readonly valueVar: string;
  /** Allowed byte length range of the decoded secret. */
  readonly minBytes: number;
  readonly maxBytes: number;
}

/**
 * Loads a hex secret from a file (path in `fileVar`) or an env value.
 *
 * @remarks The file must be a regular file whose mode has no group/world bits (`chmod 600`); otherwise
 * startup is refused. On Windows (no POSIX modes) the mode check is skipped. Contents are never
 * included in error messages or logs.
 *
 * @param env Environment.
 * @param src Source description.
 * @returns Decoded bytes.
 * @throws {ConfigError} when missing, both set, unreadable, malformed or too permissive.
 */
export function loadSecret(env: Env, src: SecretSource): Uint8Array {
  const path = env[src.fileVar];
  const direct = env[src.valueVar];
  if (path !== undefined && path !== '' && direct !== undefined && direct !== '') {
    throw new ConfigError(`set only one of ${src.fileVar} and ${src.valueVar}`);
  }
  let text: string;
  if (path !== undefined && path !== '') {
    let st;
    try {
      st = statSync(path);
    } catch {
      throw new ConfigError(`${src.fileVar}: file not readable`);
    }
    if (!st.isFile() || st.size > 4096) throw new ConfigError(`${src.fileVar}: not a regular small file`);
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
      throw new ConfigError(`${src.fileVar}: file mode must not allow group/world access (chmod 600)`);
    }
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      throw new ConfigError(`${src.fileVar}: file not readable`);
    }
  } else if (direct !== undefined && direct !== '') {
    text = direct;
  } else {
    throw new ConfigError(`${src.fileVar} or ${src.valueVar} is required`);
  }
  const hex = text.trim().replace(/^0x/, '');
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex) || hex.length / 2 < src.minBytes || hex.length / 2 > src.maxBytes) {
    throw new ConfigError(`${path !== undefined && path !== '' ? src.fileVar : src.valueVar}: invalid secret format`);
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/** Hot signing key source: exactly 32 bytes. */
export const HOT_KEY_SOURCE: SecretSource = { fileVar: 'RELAYER_KEY_FILE', valueVar: 'RELAYER_KEY', minBytes: 32, maxBytes: 32 };
/** Quote HMAC secret source: 32..128 bytes. */
export const QUOTE_SECRET_SOURCE: SecretSource = { fileVar: 'QUOTE_SECRET_FILE', valueVar: 'QUOTE_SECRET', minBytes: 32, maxBytes: 128 };
