import { type Parsed, parseArgs, type OptSpec } from './args.js';
import { ioError, MAX_BINARY_BYTES, MAX_INPUT_CHARS, type Io, usageError } from './io.js';

/** Per-invocation context handed to command handlers. */
export class Ctx {
  public stdinUsed = false;

  public constructor(
    public readonly io: Io,
    public readonly json: boolean,
  ) {}

  /** Prints a result: JSON object in `--json` mode, otherwise the human text. */
  public out(data: Readonly<Record<string, unknown>>, human: string): void {
    this.io.stdout(this.json ? `${JSON.stringify(data)}\n` : human.endsWith('\n') ? human : `${human}\n`);
  }

  /** Advisory text for humans only; suppressed in `--json` mode so stdout/stderr stay machine-clean. */
  public note(text: string): void {
    if (!this.json) this.io.stderr(`${text}\n`);
  }

  /** Reads stdin once per invocation. */
  public async stdin(): Promise<string> {
    if (this.stdinUsed)
      throw usageError('STDIN_TWICE', 'only one input can be read from stdin.', 'Put the other input in a file.');
    this.stdinUsed = true;
    return this.limit(await this.guard(() => this.io.readStdin(), 'stdin'));
  }

  /** Reads a file path, or stdin when the path is `-`. */
  public async read(path: string): Promise<string> {
    if (path === '-') return this.stdin();
    return this.limit(await this.guard(() => this.io.readFile(path), path));
  }

  /** Secret paths use the private descriptor reader; test adapters may use readFile. */
  public async secret(path: string): Promise<string> {
    if (path === '-') return this.stdin();
    try {
      return this.limit(await (this.io.readSecretFile ?? this.io.readFile)(path));
    } catch {
      throw ioError('SECRET_READ_FAILED', 'cannot read the private secret file.', 'Use an owned regular file with owner-only permissions (0600 on POSIX), or stdin.');
    }
  }

  /** Binary input for existing encrypted archives, with the same single-stdin rule. */
  public async readBytes(path: string): Promise<Uint8Array> {
    if (path === '-' && this.stdinUsed) throw usageError('STDIN_TWICE', 'only one input can be read from stdin.');
    if (path === '-') this.stdinUsed = true;
    try {
      const data = path === '-'
        ? this.io.readBinaryStdin === undefined ? new TextEncoder().encode(await this.io.readStdin()) : await this.io.readBinaryStdin()
        : this.io.readBinaryFile === undefined ? new TextEncoder().encode(await this.io.readFile(path)) : await this.io.readBinaryFile(path);
      if (data.byteLength > MAX_BINARY_BYTES) throw new Error('too large');
      return data;
    } catch { throw ioError('READ_FAILED', 'cannot read the bounded archive input.', 'Use a regular file or stdin within the 20 MiB archive limit.'); }
  }

  /** Binary files are explicit outputs; bytes are never accidentally printed to a terminal. */
  public async writeBytesOut(a: Parsed, data: Uint8Array): Promise<boolean> {
    const path = a.values.get('out');
    if (path === undefined) return false;
    if (data.byteLength > MAX_BINARY_BYTES) throw ioError('OUTPUT_TOO_LARGE', 'archive exceeds the 20 MiB output limit.');
    if (this.io.writeBinaryFile === undefined) throw ioError('BINARY_IO_UNAVAILABLE', 'binary output is unavailable in this adapter.');
    try { await this.io.writeBinaryFile(path, data, { overwrite: a.flags.has('force') }); }
    catch { throw ioError('WRITE_FAILED', 'cannot publish the archive output.', 'The output may already exist; select a new path or explicitly use --force.'); }
    return true;
  }

  private async guard(f: () => Promise<string>, what: string): Promise<string> {
    try {
      return await f();
    } catch {
      throw ioError('READ_FAILED', `cannot read ${what === 'stdin' ? 'stdin' : `file ${JSON.stringify(what)}`}.`, 'Check the path and permissions.');
    }
  }

  private limit(text: string): string {
    if (text.length > MAX_INPUT_CHARS)
      throw ioError('INPUT_TOO_LARGE', `input exceeds the ${MAX_INPUT_CHARS} character limit.`);
    return text;
  }

  /** Writes `--out` if requested. @returns whether a file was written. */
  public async writeOut(a: Parsed, data: string): Promise<boolean> {
    const path = a.values.get('out');
    if (path === undefined) return false;
    try {
      await this.io.writeFile(path, data, { overwrite: a.flags.has('force') });
    } catch {
      throw ioError('WRITE_FAILED', `cannot write ${JSON.stringify(path)}.`, 'It may already exist (use --force) or the directory is not writable.');
    }
    return true;
  }
}

export const OUT_OPTS = { out: 'value', force: 'flag' } as const satisfies OptSpec;
export { parseArgs };
