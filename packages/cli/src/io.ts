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
