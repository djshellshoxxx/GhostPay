import { mkdtemp, open, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeIo } from './node-io.js';
import { Ctx, OUT_OPTS } from './ctx.js';
import { parseArgs } from './args.js';
import { makeIo } from './fixtures.testutil.js';
import { MAX_BINARY_BYTES, MAX_INPUT_CHARS } from './io.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function* input(chunks: readonly (string | Uint8Array)[]) { for (const chunk of chunks) yield await Promise.resolve(chunk); }
const io = (chunks: readonly (string | Uint8Array)[] = []) => createNodeIo({ env: {}, version: process.versions.node, write: () => {}, stdin: input(chunks) });

describe('binary archive transport', () => {
  it('preserves exact non-UTF8 bytes through private atomic output and bounded input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghostpay-archive-')); dirs.push(dir);
    const path = join(dir, 'archive.gpa'); const bytes = Uint8Array.of(0, 0xff, 0xc3, 0xa9, 0x80);
    await io().writeBinaryFile!(path, bytes, { overwrite: false });
    expect(await io().readBinaryFile!(path)).toEqual(bytes);
    await expect(io().writeBinaryFile!(path, Uint8Array.of(1), { overwrite: false })).rejects.toThrow();
    expect(new Uint8Array(await readFile(path))).toEqual(bytes);
    await io().writeBinaryFile!(path, Uint8Array.of(9, 8), { overwrite: true });
    expect(await io().readBinaryFile!(path)).toEqual(Uint8Array.of(9, 8));
  });
  it('rejects symlinks, directories and oversized binary input before processing an archive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghostpay-archive-')); dirs.push(dir);
    const path = join(dir, 'oversize'); const file = await open(path, 'wx');
    try { await file.truncate(MAX_BINARY_BYTES + 1); } finally { await file.close(); }
    await expect(io().readBinaryFile!(path)).rejects.toThrow();
    await expect(io().readBinaryFile!(dir)).rejects.toThrow();
    const link = join(dir, 'link'); await symlink(path, link);
    await expect(io().readBinaryFile!(link)).rejects.toThrow('symlink');
    await expect(io().writeBinaryFile!(path, new Uint8Array(MAX_BINARY_BYTES + 1), { overwrite: true })).rejects.toThrow('too large');
  });
  it('bounds binary stdin while preserving byte chunks and explicit UTF-8 text chunks', async () => {
    expect(await io([Uint8Array.of(0xff), '雪', Uint8Array.of(0)]).readBinaryStdin!()).toEqual(new Uint8Array([255, ...Buffer.from('雪'), 0]));
    await expect(io([new Uint8Array(MAX_BINARY_BYTES), Uint8Array.of(1)]).readBinaryStdin!()).rejects.toThrow('too large');
  });
  it('permits exactly one winner when two new archive writers publish concurrently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghostpay-archive-')); dirs.push(dir);
    const path = join(dir, 'archive'); const a = new Uint8Array(100_000).fill(0x21); const b = new Uint8Array(80_000).fill(0x47);
    const outcomes = await Promise.allSettled([io().writeBinaryFile!(path, a, { overwrite: false }), io().writeBinaryFile!(path, b, { overwrite: false })]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await io().readBinaryFile!(path)).toEqual(outcomes[0].status === 'fulfilled' ? a : b);
  });
  it('enforces one stdin consumer across text, secrets and binary archive inputs', async () => {
    const source = makeIo({ text: '雪' }); source.stdinText = 'archive';
    const context = new Ctx(source, true);
    expect(await context.readBytes('text')).toEqual(new TextEncoder().encode('雪'));
    expect(await context.readBytes('-')).toEqual(new TextEncoder().encode('archive'));
    await expect(context.secret('-')).rejects.toMatchObject({ code: 'STDIN_TWICE' });
    await expect(context.readBytes('-')).rejects.toMatchObject({ code: 'STDIN_TWICE' });
    const reverse = new Ctx(source, true); await reverse.secret('-');
    await expect(reverse.readBytes('-')).rejects.toMatchObject({ code: 'STDIN_TWICE' });
  });
  it('keeps archive adapter failures generic and independently enforces the binary cap', async () => {
    const source = makeIo(); source.failReads = true;
    await expect(new Ctx(source, true).readBytes('file')).rejects.toMatchObject({ code: 'READ_FAILED' });
    const oversized = { ...makeIo(), readBinaryFile: () => Promise.resolve(new Uint8Array(MAX_BINARY_BYTES + 1)) };
    await expect(new Ctx(oversized, true).readBytes('file')).rejects.toMatchObject({ code: 'READ_FAILED' });
    const broken = { ...makeIo(), readBinaryStdin: () => Promise.reject(new Error('SECRET_INTERNAL_VALUE')) };
    await expect(new Ctx(broken, true).readBytes('-')).rejects.toMatchObject({ code: 'READ_FAILED', message: 'cannot read the bounded archive input.' });
    const cappedSecret = { ...makeIo(), readSecretFile: () => Promise.resolve('x'.repeat(MAX_INPUT_CHARS + 1)) };
    await expect(new Ctx(cappedSecret, true).secret('key')).rejects.toMatchObject({ code: 'SECRET_READ_FAILED' });
  });
  it('requires an explicit binary output adapter and reports atomic publication failures safely', async () => {
    const context = new Ctx(makeIo(), true); const bytes = Uint8Array.of(0xff);
    expect(await context.writeBytesOut(parseArgs([], OUT_OPTS), bytes)).toBe(false);
    const options = parseArgs(['--out', 'archive'], OUT_OPTS);
    await expect(context.writeBytesOut(options, bytes)).rejects.toMatchObject({ code: 'BINARY_IO_UNAVAILABLE' });
    await expect(context.writeBytesOut(options, new Uint8Array(MAX_BINARY_BYTES + 1))).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' });
    const broken = new Ctx({ ...makeIo(), writeBinaryFile: () => Promise.reject(new Error('PRIVATE_FAILURE_DETAIL')) }, true);
    await expect(broken.writeBytesOut(options, bytes)).rejects.toMatchObject({ code: 'WRITE_FAILED', message: 'cannot publish the archive output.' });
  });
});
