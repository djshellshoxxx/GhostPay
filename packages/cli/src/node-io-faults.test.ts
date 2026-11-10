import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeIo } from './node-io.js';
import { MAX_INPUT_CHARS } from './io.js';

const faults = vi.hoisted(() => ({ onOpen: undefined as ((file: FileHandle, path: string) => void) | undefined,
  afterLstat: undefined as ((path: string) => Promise<void>) | undefined }));
vi.mock('node:fs/promises', async (load) => {
  const original = await load<typeof import('node:fs/promises')>();
  return { ...original, rename: vi.fn(original.rename), lstat: async (...args: Parameters<typeof original.lstat>) => {
    const metadata = await original.lstat(...args); await faults.afterLstat?.(String(args[0])); return metadata;
  }, open: async (...args: Parameters<typeof original.open>) => {
    const file = await original.open(...args); faults.onOpen?.(file, String(args[0])); return file;
  } };
});
const dirs: string[] = [];
async function directory() { const dir = await fs.mkdtemp(join(tmpdir(), 'ghostpay-faults-')); dirs.push(dir); return dir; }
const io = () => createNodeIo({ env: {}, version: '22', write: () => {}, stdin: (async function* () { yield ''; await Promise.resolve(); })() });
afterEach(async () => { faults.onOpen = undefined; faults.afterLstat = undefined; vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(d => fs.rm(d, { recursive: true, force: true }))); });

describe('descriptor input and atomic publication fault boundaries', () => {
  it.each(['text', 'binary'] as const)('rejects a %s input replaced between path inspection and descriptor opening', async kind => {
    const d = await directory(); const input = join(d, 'input'); const replacement = join(d, 'replacement');
    await fs.writeFile(input, 'original'); await fs.writeFile(replacement, 'replacement');
    faults.afterLstat = async path => {
      if (path !== input) return;
      faults.afterLstat = undefined;
      await fs.rename(replacement, input);
    };
    await expect(kind === 'text' ? io().readFile(input) : io().readBinaryFile!(input)).rejects.toThrow('input changed before opening');
  });
  it('bounds reads even when an opened file grows after fstat', async () => {
    const d = await directory(); const input = join(d, 'input'); await fs.writeFile(input, 'old');
    faults.onOpen = (file, path) => {
      if (path !== input) return;
      const read = file.read.bind(file);
      vi.spyOn(file, 'read').mockImplementationOnce(async (...args: Parameters<typeof file.read>) => {
        await fs.appendFile(input, 'x'.repeat(MAX_INPUT_CHARS * 4));
        return read(...args);
      });
    };
    await expect(io().readFile(input)).rejects.toThrow('too large');
  });
  it('never switches to a replacement file after opening the input', async () => {
    const d = await directory(); const input = join(d, 'input'); await fs.writeFile(input, 'original');
    faults.onOpen = (file, path) => {
      if (path !== input) return;
      const read = file.read.bind(file);
      vi.spyOn(file, 'read').mockImplementationOnce(async (...args: Parameters<typeof file.read>) => {
        await fs.rename(input, join(d, 'old')); await fs.writeFile(input, 'replacement');
        return read(...args);
      });
    };
    const result = await io().readFile(input).catch(() => 'changed input rejected');
    expect(['original', 'changed input rejected']).toContain(result);
  });
  it('rejects in-place growth below the allocation bound', async () => {
    const d = await directory(); const input = join(d, 'input'); await fs.writeFile(input, 'old');
    faults.onOpen = (file, path) => {
      if (path !== input) return;
      const read = file.read.bind(file);
      vi.spyOn(file, 'read').mockImplementationOnce(async (...args: Parameters<typeof file.read>) => {
        await fs.appendFile(input, 'new'); return read(...args);
      });
    };
    await expect(io().readFile(input)).rejects.toThrow('input changed');
  });
  it('rejects directories, symlinks, malformed UTF-8 and the character limit', async () => {
    const d = await directory(); const input = join(d, 'input');
    await expect(io().readFile(d)).rejects.toThrow();
    await fs.writeFile(input, Uint8Array.of(0xc3));
    await expect(io().readFile(input)).rejects.toThrow();
    await fs.symlink(input, join(d, 'link'));
    await expect(io().readFile(join(d, 'link'))).rejects.toThrow();
    await fs.writeFile(input, 'x'.repeat(MAX_INPUT_CHARS + 1));
    await expect(io().readFile(input)).rejects.toThrow('too large');
  });
  it.skipIf(process.platform === 'win32')('refuses a FIFO without blocking for a writer', async () => {
    const d = await directory(); const input = join(d, 'fifo'); execFileSync('mkfifo', [input]);
    await expect(io().readFile(input)).rejects.toThrow('invalid input');
  });
  it.each(['write', 'sync', 'rename'])('leaves the prior output complete after a failed %s', async (stage) => {
    const d = await directory(); const output = join(d, 'target'); await fs.writeFile(output, 'old');
    if (stage === 'rename') vi.mocked(fs.rename).mockRejectedValueOnce(new Error('interrupted'));
    else faults.onOpen = (file, path) => {
      if (basename(path) !== 'output') return;
      if (stage === 'sync') vi.spyOn(file, 'sync').mockRejectedValueOnce(new Error('interrupted'));
      else {
        const write = file.writeFile.bind(file);
        vi.spyOn(file, 'writeFile').mockImplementationOnce(async () => { await write('partial', 'utf8'); throw new Error('interrupted'); });
      }
    };
    await expect(io().writeFile(output, 'replacement', { overwrite: true })).rejects.toThrow('interrupted');
    expect(await fs.readFile(output, 'utf8')).toBe('old');
    expect(await fs.readdir(d)).toEqual(['target']);
  });
  it('only one simultaneous exclusive writer publishes', async () => {
    const d = await directory(); const output = join(d, 'target');
    const results = await Promise.allSettled(['one', 'two'].map(data => io().writeFile(output, data, { overwrite: false })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(['one', 'two']).toContain(await fs.readFile(output, 'utf8'));
    expect(await fs.readdir(d)).toEqual(['target']);
  });
  it('preserves a BOM and rejects incomplete stdin bytes', async () => {
    const read = (parts: (string | Uint8Array)[]) => createNodeIo({ env: {}, version: '22', write: () => {}, stdin: (async function* () { yield* parts; await Promise.resolve(); })() }).readStdin();
    expect(await read([Uint8Array.of(0xef, 0xbb), Uint8Array.of(0xbf, 0x61)])).toBe('\uFEFFa');
    await expect(read([Uint8Array.of(0xc3)])).rejects.toThrow();
    await expect(read([Uint8Array.of(0xc3), 'text'])).rejects.toThrow();
    await expect(read(['x'.repeat(MAX_INPUT_CHARS + 1)])).rejects.toThrow('too large');
  });
});
