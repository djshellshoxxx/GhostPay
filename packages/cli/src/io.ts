import type { RandomSource } from '@ghostpay/invoice-schema';
import type { RpcTransport } from '@ghostpay/chain-adapters';

/** Process exit codes. */
export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;
export const EXIT_IO = 3;
export const EXIT_NETWORK = 4;
export const EXIT_UNSUPPORTED = 5;
export const EXIT_CONFIG = 6;

/** Maximum bytes/characters accepted from any file or stdin. */
export const MAX_INPUT_CHARS = 1_048_576;
/** The GUI's encrypted tag archive limit; allocation remains bounded. */
export const MAX_BINARY_BYTES = 20 * 1024 * 1024;

/** Everything the CLI may touch. Injected so `run` is pure and testable. */
export interface Io {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Reads a UTF-8 text file. Throws on any failure. */
  readonly readFile: (path: string) => Promise<string>;
  /** Reads a private, owned regular file on the same validated descriptor. */
  readonly readSecretFile?: (path: string) => Promise<string>;
  /** Network adapter; only commands with explicit online consent may use it. */
  readonly rpcTransport?: RpcTransport;
  readonly readBinaryFile?: (path: string) => Promise<Uint8Array>;
  readonly readBinaryStdin?: () => Promise<Uint8Array>;
  readonly writeBinaryFile?: (path: string, data: Uint8Array, options: { readonly overwrite: boolean }) => Promise<void>;
  /** Writes a text file. Must fail if it exists and `overwrite` is false. */
  readonly writeFile: (path: string, data: string, options: { readonly overwrite: boolean }) => Promise<void>;
  /** Reads all of stdin as UTF-8. */
  readonly readStdin: () => Promise<string>;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Unix seconds. */
  readonly nowSeconds: () => number;
  readonly random: RandomSource;
  /** e.g. `22.3.0` (no leading `v`). */
  readonly nodeVersion: string;
}

export type ErrorKind = 'usage' | 'io' | 'fail' | 'network' | 'unsupported' | 'config';

/** Expected, user-facing failure. Message and hint must never contain secrets or raw untrusted input. */
export class CliError extends Error {
  public constructor(
    public readonly kind: ErrorKind,
    public readonly code: string,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'CliError';
  }

  public get exitCode(): number {
    return { usage: EXIT_USAGE, io: EXIT_IO, fail: EXIT_FAIL, network: EXIT_NETWORK, unsupported: EXIT_UNSUPPORTED, config: EXIT_CONFIG }[this.kind];
  }
}

export const usageError = (code: string, message: string, hint?: string): CliError =>
  new CliError('usage', code, message, hint);
export const failError = (code: string, message: string, hint?: string): CliError =>
  new CliError('fail', code, message, hint);
export const ioError = (code: string, message: string, hint?: string): CliError =>
  new CliError('io', code, message, hint);

/** Makes arbitrary text safe to show in an error: word characters only, bounded. */
export function safeToken(s: string): string {
  const t = s.replace(/[^A-Za-z0-9_.=-]/g, '?');
  return t.length > 40 ? `${t.slice(0, 40)}...` : t;
}

/**
 * Escapes untrusted text for human terminal output the way JSON.stringify does, and additionally
 * escapes format, bidi, private-use and line/paragraph separator characters, so it cannot move the
 * cursor, erase lines or reorder what is shown.
 */
export function escapeDisplay(s: string): string {
  return JSON.stringify(s).slice(1, -1).replace(/[\p{C}\u2028\u2029]/gu, (c) => `\\u${(c.codePointAt(0) as number).toString(16).padStart(4, '0')}`);
}

/** Longest file name echoed in an error; longer values are more likely a pasted document than a name. */
const MAX_DISPLAY_NAME = 64;

/**
 * The quoted basename of a plain local path, for error messages, or undefined when the value must not be
 * echoed: anything URL-like or carrying a fragment or query (for example a bearer `#gpi=` payment link),
 * control or format characters, document-like punctuation, or an over-long name. Directories are never shown.
 */
export function displayPath(path: string): string | undefined {
  if (/^[A-Za-z][A-Za-z0-9+.-]+:/.test(path) || /[#?\p{C}\u2028\u2029]/u.test(path)) return undefined;
  const base = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  if (base.length === 0 || base.length > MAX_DISPLAY_NAME || !/^[\p{L}\p{N} ._+,=~@()[\]-]+$/u.test(base)) return undefined;
  return JSON.stringify(base);
}
