import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeIo, MAX_INPUT_CHARS, run } from './index.js';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ghostpay-cli-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<string | Uint8Array> {
  for (const p of parts) yield p;
  await Promise.resolve();
}

function make(stdin: AsyncIterable<string | Uint8Array> = chunks()) {
  const out: string[] = [];
  const err: string[] = [];
  const io = createNodeIo({
    env: { A: '1' },
    version: '22.0.0',
    write: (s, t) => void (s === 'stdout' ? out : err).push(t),
    stdin,
  });
  return { io, out, err };
}

describe('node adapter', () => {
  it('reads and writes files, exclusive unless overwrite, mode 0600', async () => {
    const { io } = make();
    const p = join(dir, 'a.txt');
    await io.writeFile(p, 'one', { overwrite: false });
    await expect(io.writeFile(p, 'two', { overwrite: false })).rejects.toThrow();
    await io.writeFile(p, 'three', { overwrite: true });
    expect(await io.readFile(p)).toBe('three');
    expect((await stat(p)).mode & 0o077).toBe(0);
    await expect(io.readFile(join(dir, 'missing'))).rejects.toThrow();
  });
  it('rejects oversized files and stdin', async () => {
    const big = join(dir, 'big.txt');
    await writeFile(big, 'x'.repeat(MAX_INPUT_CHARS * 4 + 1));
    await expect(make().io.readFile(big)).rejects.toThrow();
    await expect(make(chunks('x'.repeat(MAX_INPUT_CHARS * 4 + 1))).io.readStdin()).rejects.toThrow();
  });
  it('reads stdin from strings and bytes, exposes env, clock, crypto', async () => {
    const { io } = make(chunks('he', new TextEncoder().encode('llo')));
    expect(await io.readStdin()).toBe('hello');
    expect(io.env['A']).toBe('1');
    expect(io.nodeVersion).toBe('22.0.0');
    expect(io.nowSeconds()).toBeGreaterThan(1_700_000_000);
    expect(io.random.getRandomValues(new Uint8Array(4))).toHaveLength(4);
    io.stdout('o');
    io.stderr('e');
  });
  it('end to end through run() with the real adapter: doctor and file output', async () => {
    const h = make();
    expect(await run(['doctor'], h.io)).toBe(0);
    expect(h.out.join('')).toContain('all checks passed');
    const h2 = make();
    const out = join(dir, 'split.json');
    expect(await run(['split', 'compute', '--total', '10', '--share', 'a=10000', '--json'], h2.io)).toBe(0);
    await writeFile(out, h2.out.join(''));
    expect(JSON.parse(await readFile(out, 'utf8'))).toMatchObject({ ok: true, total: '10' });
  });
});
