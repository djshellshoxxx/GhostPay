import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_HEX, SPEC } from './fixtures.testutil.js';
import { createNodeIo } from './node-io.js';
import { run } from './run.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

describe('operator secret file boundary', () => {
  it.skipIf(process.platform === 'win32')('refuses a group-readable signing key before signing and never prints it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ghostpay-secret-')); dirs.push(dir);
    const key = join(dir, 'key'); const input = join(dir, 'invoice.json');
    await writeFile(key, KEY_HEX); await chmod(key, 0o640);
    await writeFile(input, JSON.stringify(SPEC));
    const output: string[] = [];
    const io = createNodeIo({ env: {}, version: process.versions.node, write: (_s, t) => { output.push(t); }, stdin: (async function* () { yield ''; })() });
    expect(await run(['invoice', 'create', '--in', input, '--key-file', key, '--json'], io)).toBe(3);
    expect(output.join('')).not.toContain(KEY_HEX);
    expect(output.join('')).not.toContain('"signed":true');
  });
});
