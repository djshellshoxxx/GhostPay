import type { RandomSource } from '@ghostpay/invoice-schema';

/** Process exit codes. */
export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_USAGE = 2;
export const EXIT_IO = 3;

/** Maximum bytes/characters accepted from any file or stdin. */
export const MAX_INPUT_CHARS = 1_048_576;

/** Everything the CLI may touch. Injected so `run` is pure and testable. */
export interface Io {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Reads a UTF-8 text file. Throws on any failure. */
  readonly readFile: (path: string) => Promise<string>;
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

export type ErrorKind = 'usage' | 'io' | 'fail';

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
    return this.kind === 'usage' ? EXIT_USAGE : this.kind === 'io' ? EXIT_IO : EXIT_FAIL;
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
