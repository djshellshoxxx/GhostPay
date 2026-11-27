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

  it('displayPath withholds key=value text and network paths (a link fragment pasted without its #)', () => {
    for (const p of ['gpi=v1.SECRETSECRETSECRETSECRET', 'dir/gpi=v1.SECRETSECRET', 'token=abc', '//pay.example/SECRETSECRET', '\\\\host\\share\\SECRETSECRET'])
      expect(displayPath(p), p).toBeUndefined();
    expect(displayPath('reports/2026-11 (final) [v2].json')).toBe('"2026-11 (final) [v2].json"');
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

// Synthetic, obviously fake values only: never a real key. A mistakenly pasted 32-byte key is 64 hex characters, which
// fits the basename length cap and character allowlist, so a basename that looks like secret material is withheld too.
const HEX64 = 'ab12cd34'.repeat(8);
const HEX32 = 'ab12cd34'.repeat(4);
const B64URL43 = 'Qk3_Zm9v-YmFy0123456789ABCDEFghijklmnopqrst';

describe('secret-shaped basenames are not echoed (R11-4 residual: a pasted key used as a path)', () => {
  const SECRET_PATHS = [
    HEX64,
    HEX64.toUpperCase(),
    HEX32,
    `0x${HEX64}`,
    `some/nested/dir/${HEX64}`,
    `C:\\keys\\${HEX64}`,
    `${HEX64}.json`,
    `key-${HEX64}.txt`,
    B64URL43,
    `nested/${B64URL43}`,
  ];

  it('displayPath withholds hex and opaque-token basenames, including nested ones, and keeps ordinary names', () => {
    expect(B64URL43).toHaveLength(43);
    for (const p of SECRET_PATHS) expect(displayPath(p), p).toBeUndefined();
    for (const p of ['a3f9.json', 'key-2026-11-26.json', 'invoice-0001.json', 'backup of the seller keystore.json', `${'ab'.repeat(15)}.txt`, 'nested/dir/signed-invoice.json'])
      expect(displayPath(p), p).toBeDefined();
  });

  it('READ_FAILED withholds a secret-shaped path in human and JSON modes and keeps its stable code', async () => {
    for (const path of SECRET_PATHS) {
      for (const json of [true, false]) {
        const io = makeIo();
        expect(await run(['invoice', 'verify', '--in', path, ...(json ? ['--json'] : [])], io)).toBe(3);
        const out = allOutput(io);
        expect(out, `${path} json=${String(json)}`).not.toContain('ab12cd34');
        expect(out).not.toContain('AB12CD34');
        expect(out).not.toContain('Qk3_Zm9v');
        expect(out).toContain(json ? 'READ_FAILED' : 'cannot read');
      }
    }
  });

  it('WRITE_FAILED withholds a secret-shaped --out path in human and JSON modes and keeps its stable code', async () => {
    for (const path of SECRET_PATHS) {
      for (const json of [true, false]) {
        const io = makeIo({ 'spec.json': JSON.stringify(SPEC), 'key.txt': `${KEY_HEX}\n` });
        io.failWrites = true;
        expect(await run(['invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', path, ...(json ? ['--json'] : [])], io)).toBe(3);
        const out = allOutput(io);
        expect(out, `${path} json=${String(json)}`).not.toContain('ab12cd34');
        expect(out).not.toContain('AB12CD34');
        expect(out).not.toContain('Qk3_Zm9v');
        expect(out).toContain(json ? 'WRITE_FAILED' : 'cannot write');
      }
    }
  });

  it('READ_FAILED and WRITE_FAILED still name an ordinary filename', async () => {
    const read = makeIo();
    expect(await run(['invoice', 'verify', '--in', 'data/invoice-0001.json', '--json'], read)).toBe(3);
    expect(read.err.join('')).toContain('invoice-0001.json');
    const write = makeIo({ 'spec.json': JSON.stringify(SPEC), 'key.txt': `${KEY_HEX}\n` });
    write.failWrites = true;
    expect(await run(['invoice', 'create', '--in', 'spec.json', '--key-file', 'key.txt', '--out', 'out/signed-0001.json', '--json'], write)).toBe(3);
    expect(write.err.join('')).toContain('signed-0001.json');
  });
});
