import { type Parsed } from './args.js';
import type { Ctx } from './ctx.js';
import { fromHex } from './hex.js';
import { ioError, usageError } from './io.js';

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/** Option specs for a secret named `prefix`: `--<prefix>-file`, `--<prefix>-env`, `--<prefix>-stdin`. */
export function secretOpts(prefix: string): Readonly<Record<string, 'value' | 'flag'>> {
  return { [`${prefix}-file`]: 'value', [`${prefix}-env`]: 'value', [`${prefix}-stdin`]: 'flag' };
}

export interface SecretRule {
  /** Human noun for messages, e.g. `signing key`. */
  readonly label: string;
  readonly minBytes: number;
  readonly maxBytes: number;
}

/**
 * Reads a hex secret from exactly one of file / environment variable NAME / stdin.
 *
 * @returns Secret bytes (caller must zero them), or `undefined` when none was requested and `required` is false.
 * @throws {CliError} Usage/io errors that never contain the secret or any part of it.
 * @security Trust boundary for key material. Values are never placed in error text; the env option takes a NAME, and a value that is not a valid NAME is rejected without echo (it may be a pasted secret).
 */
export async function readSecret(
  ctx: Ctx,
  a: Parsed,
  prefix: string,
  rule: SecretRule,
  required: boolean,
): Promise<Uint8Array | undefined> {
  const file = a.values.get(`${prefix}-file`);
  const envName = a.values.get(`${prefix}-env`);
  const stdin = a.flags.has(`${prefix}-stdin`);
  const given = [file !== undefined, envName !== undefined, stdin].filter(Boolean).length;
  if (given === 0) {
    if (!required) return undefined;
    throw usageError(
      'SECRET_SOURCE_MISSING',
      `a ${rule.label} is required.`,
      `Provide --${prefix}-file PATH, --${prefix}-env NAME or --${prefix}-stdin.`,
    );
  }
  if (given > 1) throw usageError('SECRET_SOURCE_AMBIGUOUS', `give the ${rule.label} from only one source.`);
  let text: string;
  if (file !== undefined) text = await ctx.secret(file);
  else if (stdin) text = await ctx.stdin();
  else {
    const name = envName as string;
    if (!ENV_NAME_RE.test(name))
      throw usageError(
        'BAD_ENV_NAME',
        `--${prefix}-env takes the NAME of an environment variable, not its value.`,
        'Example: --' + prefix + '-env GHOSTPAY_SIGNING_KEY',
      );
    const v = ctx.io.env[name];
    if (v === undefined || v === '') throw ioError('ENV_UNSET', 'the requested secret environment variable is not set.');
    text = v;
  }
  const bytes = fromHex(text);
  if (bytes === undefined || bytes.length < rule.minBytes || bytes.length > rule.maxBytes) {
    bytes?.fill(0);
    const size = rule.minBytes === rule.maxBytes ? `${rule.minBytes} bytes` : `at least ${rule.minBytes} bytes`;
    throw usageError('BAD_SECRET', `the ${rule.label} must be hex-encoded, ${size} (${rule.minBytes * 2}+ hex characters).`);
  }
  return bytes;
}

export function readPassphrase(ctx: Ctx, a: Parsed, prefix?: string, required?: true): Promise<string>;
export function readPassphrase(ctx: Ctx, a: Parsed, prefix: string, required: false): Promise<string | undefined>;
/** Read a UTF-8 passphrase without placing it in argv or output. Only a terminal line ending is removed. */
export async function readPassphrase(ctx: Ctx, a: Parsed, prefix = 'passphrase', required = true): Promise<string | undefined> {
  const file = a.values.get(`${prefix}-file`);
  const name = a.values.get(`${prefix}-env`);
  const stdin = a.flags.has(`${prefix}-stdin`);
  const given = Number(file !== undefined) + Number(name !== undefined) + Number(stdin);
  if (given === 0) {
    if (!required) return undefined;
    throw usageError('SECRET_SOURCE_MISSING', 'a passphrase source is required.', `Use --${prefix}-file PATH or --${prefix}-stdin.`);
  }
  if (given !== 1) throw usageError('SECRET_SOURCE_AMBIGUOUS', 'give the passphrase from only one source.');
  let text: string;
  if (file !== undefined) text = await ctx.secret(file);
  else if (stdin) text = await ctx.stdin();
  else {
    if (name === undefined || !ENV_NAME_RE.test(name)) throw usageError('BAD_ENV_NAME', 'passphrase environment options take a variable NAME, never its value.');
    const value = ctx.io.env[name];
    if (value === undefined) throw ioError('ENV_UNSET', 'the requested passphrase environment variable is not set.');
    text = value;
  }
  const value = text.replace(/\r?\n$/, '');
  if (value.length === 0 || new TextEncoder().encode(value).length > 1024 || value.includes('\0'))
    throw usageError('BAD_PASSPHRASE', 'passphrase must contain 1–1024 UTF-8 bytes without NUL characters.');
  return value;
}
