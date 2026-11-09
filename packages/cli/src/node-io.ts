import { constants } from 'node:fs';
import { link, lstat, mkdtemp, open, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fetchTransport } from '@ghostpay/chain-adapters';
import { MAX_BINARY_BYTES, MAX_INPUT_CHARS, type Io } from './io.js';

/** The slice of `process` the adapter needs; injectable for tests. */
export interface NodeEnv {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly version: string;
  /** Explicit for adapter qualification; production defaults to the actual platform. */
  readonly platform?: NodeJS.Platform;
  readonly write: (stream: 'stdout' | 'stderr', text: string) => void;
  readonly stdin: AsyncIterable<string | Uint8Array>;
}

// A Unicode character may occupy four UTF-8 bytes; both limits are enforced.
const MAX_INPUT_BYTES = MAX_INPUT_CHARS * 4;
const decoder = (): TextDecoder => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Read the opened regular file only, with bounded allocation even if it grows after stat. */
async function readTextFile(path: string, secret = false, platform = process.platform): Promise<string> {
  // POSIX mode bits do not establish Windows DACL privacy. Do not quietly accept
  // a key file whose access controls this adapter cannot authenticate.
  if (secret && platform === 'win32') throw new Error('use stdin or a named environment source; private Windows ACL inspection is unavailable');
  if ((await lstat(path)).isSymbolicLink()) throw new Error('symlink input');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_INPUT_BYTES)) throw new Error('invalid input');
    if (secret && (before.nlink !== 1n || (process.platform !== 'win32' &&
      ((before.mode & 0o077n) !== 0n || (process.getuid !== undefined && before.uid !== BigInt(process.getuid()))))))
      throw new Error('private file required');
    const buffer = new Uint8Array(64 * 1024);
    const utf8 = decoder();
    let total = 0;
    let out = '';
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, MAX_INPUT_BYTES + 1 - total), null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_INPUT_BYTES) throw new Error('too large');
      out += utf8.decode(buffer.subarray(0, bytesRead), { stream: true });
      if (out.length > MAX_INPUT_CHARS) throw new Error('too large');
    }
    out += utf8.decode();
    const after = await file.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
      throw new Error('input changed');
    return out;
  } finally {
    await file.close();
  }
}

/** Stage privately, fsync, then publish atomically. Parent directories must be trusted. */
async function writeTextFile(path: string, data: string | Uint8Array, overwrite: boolean): Promise<void> {
  if (typeof data !== 'string' && data.byteLength > MAX_BINARY_BYTES) throw new Error('too large');
  const target = resolve(path);
  const parent = dirname(target);
  try {
    const existing = await lstat(target);
    if (!existing.isFile() || !overwrite) throw new Error('output exists or is not regular');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const staging = await mkdtemp(join(parent, '.ghostpay-write-'));
  try {
    const temporary = join(staging, 'output');
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(data, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    // A hard link is an atomic no-replace publication. Concurrent exclusive writers
    // cannot both succeed. --force intentionally uses last-published-writer wins.
    if (overwrite) await rename(temporary, target);
    else await link(temporary, target);
    // Windows does not support directory fsync; atomic replacement still applies.
    if (process.platform !== 'win32') {
      const directory = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY);
      try { await directory.sync(); } finally { await directory.close(); }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Bounded binary reads preserve encrypted archives without decoding them as UTF-8. */
async function readBinaryFile(path: string): Promise<Uint8Array> {
  if ((await lstat(path)).isSymbolicLink()) throw new Error('symlink input');
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_BINARY_BYTES)) throw new Error('invalid input');
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) {
      const buffer = new Uint8Array(Math.min(64 * 1024, MAX_BINARY_BYTES + 1 - total));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_BINARY_BYTES) throw new Error('too large');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat({ bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
      throw new Error('input changed');
    return new Uint8Array(Buffer.concat(chunks, total));
  } finally { await file.close(); }
}

/** Real-world adapter. Commands must require explicit online consent before using the transport. */
export function createNodeIo(p: NodeEnv): Io {
  return {
    stdout: (t) => p.write('stdout', t),
    stderr: (t) => p.write('stderr', t),
    readFile: readTextFile,
    readSecretFile: (path) => readTextFile(path, true, p.platform ?? process.platform),
    rpcTransport: fetchTransport,
    readBinaryFile,
    writeBinaryFile: (path, data, options) => writeTextFile(path, data, options.overwrite),
    readBinaryStdin: async () => {
      const chunks: Uint8Array[] = []; let total = 0;
      for await (const chunk of p.stdin) {
        const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
        total += bytes.byteLength;
        if (total > MAX_BINARY_BYTES) throw new Error('too large');
        chunks.push(bytes.slice());
      }
      return new Uint8Array(Buffer.concat(chunks, total));
    },
    writeFile: (path, data, options) => writeTextFile(path, data, options.overwrite),
    readStdin: async () => {
      let out = '';
      let bytes = 0;
      const utf8 = decoder();
      for await (const chunk of p.stdin) {
        bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk, 'utf8') : chunk.byteLength;
        if (bytes > MAX_INPUT_BYTES) throw new Error('too large');
        out += typeof chunk === 'string' ? utf8.decode() + chunk : utf8.decode(chunk, { stream: true });
        if (out.length > MAX_INPUT_CHARS) throw new Error('too large');
      }
      return out + utf8.decode();
    },
    env: p.env,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    random: globalThis.crypto,
    nodeVersion: p.version,
  };
}
