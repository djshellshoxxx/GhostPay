import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeIo } from './node-io.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const io = () => createNodeIo({ env: {}, version: process.versions.node, write: () => {}, stdin: (async function* () { yield new Uint8Array(); })() });

describe('binary archive transport', () => {
  it('preserves exact non-UTF8 bytes through private atomic output and bounded input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghostpay-archive-')); dirs.push(dir);
    const path = join(dir, 'archive.gpa'); const bytes = Uint8Array.of(0, 0xff, 0xc3, 0xa9, 0x80);
    await io().writeBinaryFile!(path, bytes, { overwrite: false });
    expect(await io().readBinaryFile!(path)).toEqual(bytes);
    await expect(io().writeBinaryFile!(path, Uint8Array.of(1), { overwrite: false })).rejects.toThrow();
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
  });
});
