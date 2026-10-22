import { readFile, stat, writeFile } from 'node:fs/promises';
import { MAX_INPUT_CHARS, type Io } from './io.js';

/** The slice of `process` the adapter needs; injectable for tests. */
export interface NodeEnv {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly version: string;
  readonly write: (stream: 'stdout' | 'stderr', text: string) => void;
  readonly stdin: AsyncIterable<string | Uint8Array>;
}

/** Real-world adapter. The only module besides `bin.ts` that touches the OS. No network APIs are used. */
export function createNodeIo(p: NodeEnv): Io {
  return {
    stdout: (t) => p.write('stdout', t),
    stderr: (t) => p.write('stderr', t),
    readFile: async (path) => {
      if ((await stat(path)).size > MAX_INPUT_CHARS * 4) throw new Error('too large');
      return readFile(path, 'utf8');
    },
    writeFile: async (path, data, options) => {
      await writeFile(path, data, { encoding: 'utf8', mode: 0o600, flag: options.overwrite ? 'w' : 'wx' });
    },
    readStdin: async () => {
      let out = '';
      for await (const chunk of p.stdin) {
        out += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        if (out.length > MAX_INPUT_CHARS * 4) throw new Error('too large');
      }
      return out;
    },
    env: p.env,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    random: globalThis.crypto,
    nodeVersion: p.version,
  };
}
