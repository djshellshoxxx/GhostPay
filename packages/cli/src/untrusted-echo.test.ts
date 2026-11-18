import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { displayPath, escapeDisplay } from './io.js';
import { allOutput, KEY_HEX, makeIo, SPEC } from './fixtures.testutil.js';

const LINK = 'https://pay.example/#gpi=v1.SECRETSECRETSECRETSECRETSECRET';

describe('error and human output do not echo raw untrusted text (R11-4)', () => {
  it('READ_FAILED does not echo a mis-pasted bearer payment link, with or without --json', async () => {
    for (const json of [true, false]) {
      const io = makeIo();
      expect(await run(['invoice', 'verify', '--in', LINK, ...(json ? ['--json'] : [])], io)).toBe(3);
      expect(allOutput(io)).not.toContain('SECRETSECRETSECRET');
      expect(allOutput(io)).not.toContain('pay.example');
      expect(allOutput(io)).toContain(json ? 'READ_FAILED' : 'cannot read');
    }
  });

  it('READ_FAILED does not echo a fragment, a query or a bare #gpi document passed as a path', async () => {
    for (const path of ['invoice.json#gpi=v1.SECRETSECRETSECRET', 'dir/x?token=SECRETSECRETSECRET', '#gpi=v1.SECRETSECRETSECRET', 'file:SECRETSECRETSECRET']) {
      const io = makeIo();
      expect(await run(['invoice', 'verify', '--in', path, '--json'], io)).toBe(3);
      expect(allOutput(io)).not.toContain('SECRETSECRETSECRET');
    }
  });

  it('READ_FAILED keeps the basename of a plain missing local path', async () => {
    const io = makeIo();
    expect(await run(['invoice', 'verify', '--in', 'private/dir/missing-invoice.json', '--json'], io)).toBe(3);
    const err = io.err.join('');
    expect(err).toContain('missing-invoice.json');
    expect(err).not.toContain('private/dir');
  });

  it('WRITE_FAILED does not echo a raw --out value with control characters', async () => {
    const io = makeIo({ 'spec.json': JSON.stringify(SPEC), 'key.txt': `${KEY_HEX}\n` });
    io.failWrites = true;
    const code = await run(['invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 'SECRETSECRETSECRET\u001b[2K.json'], io);
    expect(code).toBe(3);
    expect(allOutput(io)).not.toContain('SECRETSECRETSECRET');
    expect(allOutput(io)).not.toContain('\u001b');
  });

  it('WRITE_FAILED names the basename of a plain output path', async () => {
    const io = makeIo({ 'spec.json': JSON.stringify(SPEC), 'key.txt': `${KEY_HEX}\n` });
    io.failWrites = true;
    expect(await run(['invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 'out/signed.json', '--json'], io)).toBe(3);
    expect(io.err.join('')).toContain('signed.json');
  });

  it('displayPath keeps plain basenames and withholds links, documents, control text and long names', () => {
    expect(displayPath('a/b/invoice 1.json')).toBe('"invoice 1.json"');
    expect(displayPath('C:\\Users\\me\\invoice.json')).toBe('"invoice.json"');
    for (const p of [LINK, 'x#y', 'x?y', 'mailto:x', 'a\u0007b', 'a\u202eb', `${'a'.repeat(65)}.json`, '', 'dir/', '{"version":1}'])
      expect(displayPath(p)).toBeUndefined();
  });

  it('i18n check human output does not emit terminal escape characters from catalog keys', async () => {
    const en = JSON.stringify({ hello: 'Hello' });
    const es = '{"hello":"Hola","x\\u001b[1A\\u001b[2Kok   es       10/10":"y"}';
    const io = makeIo({ 'en.json': en, 'es.json': es });
    expect(await run(['i18n', 'check', '--catalog', 'en=en.json', '--catalog', 'es=es.json'], io)).toBe(1);
    const out = io.out.join('');
    expect(out).not.toContain('\u001b');
    expect(out).toContain('\\u001b[1A');
    expect(out.split('\n').filter((l) => l.length > 0)).toHaveLength(2);
  });

  it('escapeDisplay escapes control, bidi and separator characters but keeps ordinary text', () => {
    expect(escapeDisplay('plain.key name')).toBe('plain.key name');
    expect(escapeDisplay('a\u001bb\nc"d')).toBe('a\\u001bb\\nc\\"d');
    expect(escapeDisplay('x\u202ey\u2028z\u0085')).toBe('x\\u202ey\\u2028z\\u0085');
  });
});
