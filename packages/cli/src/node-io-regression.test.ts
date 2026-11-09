import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeIo, run } from './index.js';
import { makeIo } from './fixtures.testutil.js';

const directories: string[] = [];
const io = (stdin: AsyncIterable<string | Uint8Array> = (async function* () { yield ''; await Promise.resolve(); })()) => createNodeIo({ env: {}, version: '22.0.0', write: () => {}, stdin });
async function directory() { const d = await mkdtemp(join(tmpdir(), 'ghostpay CLI regression ')); directories.push(d); return d; }
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe('OS adapter regression boundaries', () => {
  it('doctor rejects Node 20 while accepting supported Node 22', async () => {
    const h = makeIo(); h.nodeVersion = '20.19.0';
    expect(await run(['doctor', '--json'], h)).toBe(1);
    const result = JSON.parse(h.out.join('')) as { checks: { name: string; ok: boolean }[] };
    expect(result.checks.find(c => c.name === 'node')?.ok).toBe(false);
  });
  it('decodes byte chunks split inside multibyte UTF-8 sequences', async () => {
    const input = 'héllo 雪 💳';
    async function* bytes() { for (const b of Buffer.from(input)) yield Uint8Array.of(b); await Promise.resolve(); }
    expect(await io(bytes()).readStdin()).toBe(input);
  });
  it('force output replaces broad existing permissions with private permissions', async () => {
    const d = await directory(); const target = join(d, 'output');
    await writeFile(target, 'old'); await chmod(target, 0o644);
    await io().writeFile(target, 'new', { overwrite: true });
    expect(await readFile(target, 'utf8')).toBe('new');
    expect((await stat(target)).mode & 0o077).toBe(0);
  });
  it('refuses existing output symlinks without altering their target', async () => {
    const d = await directory(); const target = join(d, 'target'); const link = join(d, 'link');
    await writeFile(target, 'old'); await symlink(target, link);
    await expect(io().writeFile(link, 'new', { overwrite: true })).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('old');
  });
});
