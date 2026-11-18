import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const race = vi.hoisted(() => ({ afterStat: undefined as (() => void) | undefined }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  // Swap the pathname after metadata inspection, before the loader reads the bytes.
  return {
    ...fs,
    statSync: (...args: Parameters<typeof fs.statSync>) => {
      const st = fs.statSync(...args);
      race.afterStat?.();
      return st;
    },
    fstatSync: (...args: Parameters<typeof fs.fstatSync>) => {
      const st = fs.fstatSync(...args);
      race.afterStat?.();
      return st;
    },
  };
});
import { ConfigError, loadOptionalSecret, loadSecret, type SecretSource } from './secrets.js';

const HOT_KEY_SOURCE: SecretSource = { fileVar: 'RELAYER_KEY_FILE', valueVar: 'RELAYER_KEY', minBytes: 32, maxBytes: 32 };

const dirs: string[] = [];
afterEach(() => {
  race.afterStat = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(): { path: string; replacement: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ghostpay-secret-race-'));
  dirs.push(dir);
  const path = join(dir, 'key');
  const replacement = join(dir, 'replacement');
  writeFileSync(path, '11'.repeat(32), { mode: 0o600 });
  writeFileSync(replacement, '22'.repeat(32), { mode: 0o644 });
  return { path, replacement };
}

describe('secret file identity', () => {
  it('reads only the checked file when its path is replaced after inspection', () => {
    const { path, replacement } = fixture();
    race.afterStat = () => renameSync(replacement, path);
    expect(Buffer.from(loadSecret({ RELAYER_KEY_FILE: path }, HOT_KEY_SOURCE)).toString('hex'))
      .toBe('11'.repeat(32));
  });

  it.skipIf(process.platform === 'win32')('refuses symlinks', () => {
    const { path, replacement } = fixture();
    rmSync(path);
    chmodSync(replacement, 0o600);
    symlinkSync(replacement, path);
    expect(() => loadSecret({ RELAYER_KEY_FILE: path }, HOT_KEY_SOURCE)).toThrow();
  });

  it('bounds the read when a checked file grows', () => {
    const { path } = fixture();
    race.afterStat = () => writeFileSync(path, `${'11'.repeat(32)}${' '.repeat(4096)}`);
    expect(() => loadSecret({ RELAYER_KEY_FILE: path }, HOT_KEY_SOURCE)).toThrow(/regular small file/);
  });
});

const QUOTE_SECRET_SOURCE: SecretSource = { fileVar: 'QUOTE_SECRET_FILE', valueVar: 'QUOTE_SECRET', minBytes: 32, maxBytes: 128 };
const QUOTE_SECRET_PREVIOUS_SOURCE: SecretSource = { fileVar: 'QUOTE_SECRET_PREVIOUS_FILE', valueVar: 'QUOTE_SECRET_PREVIOUS', minBytes: 32, maxBytes: 128 };

describe('loadSecret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-sec-'));
  const KEY = '11'.repeat(32);
  const file = (name: string, content: string, mode: number): string => {
    const p = join(dir, name);
    writeFileSync(p, content);
    chmodSync(p, mode);
    return p;
  };

  it('reads a mode-600 file (with or without 0x and trailing newline)', () => {
    expect(loadSecret({ RELAYER_KEY_FILE: file('k1', `${KEY}\n`, 0o600) }, HOT_KEY_SOURCE)).toHaveLength(32);
    expect(loadSecret({ RELAYER_KEY_FILE: file('k2', `0x${KEY}`, 0o400) }, HOT_KEY_SOURCE)).toHaveLength(32);
  });
  it.each([0o640, 0o644, 0o604, 0o660, 0o666, 0o610])('refuses group/world-accessible mode %o', (mode) => {
    const p = file(`m${mode.toString(8)}`, KEY, mode);
    expect(() => loadSecret({ RELAYER_KEY_FILE: p }, HOT_KEY_SOURCE)).toThrow(/mode/);
  });
  it('accepts an env value and rejects invalid sources', () => {
    expect(loadSecret({ RELAYER_KEY: KEY }, HOT_KEY_SOURCE)).toHaveLength(32);
    expect(() => loadSecret({}, HOT_KEY_SOURCE)).toThrow(/required/);
    expect(() => loadSecret({ RELAYER_KEY: '' }, HOT_KEY_SOURCE)).toThrow(/required/);
    expect(() => loadSecret({ RELAYER_KEY: KEY, RELAYER_KEY_FILE: file('both', KEY, 0o600) }, HOT_KEY_SOURCE)).toThrow(/only one/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: join(dir, 'nope') }, HOT_KEY_SOURCE)).toThrow(/not readable/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: dir }, HOT_KEY_SOURCE)).toThrow(/regular/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: file('big', 'a'.repeat(5000), 0o600) }, HOT_KEY_SOURCE)).toThrow(/regular/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: file('short', '1122', 0o600) }, HOT_KEY_SOURCE)).toThrow(/invalid secret format/);
    expect(() => loadSecret({ RELAYER_KEY: 'zz'.repeat(32) }, HOT_KEY_SOURCE)).toThrow(/RELAYER_KEY: invalid/);
    expect(() => loadSecret({ RELAYER_KEY: `${KEY}00` }, HOT_KEY_SOURCE)).toThrow(/invalid secret/);
    expect(loadSecret({ QUOTE_SECRET: 'ab'.repeat(64) }, QUOTE_SECRET_SOURCE)).toHaveLength(64);
    expect(() => loadSecret({ QUOTE_SECRET: 'ab'.repeat(16) }, QUOTE_SECRET_SOURCE)).toThrow();
    expect(loadOptionalSecret({}, QUOTE_SECRET_PREVIOUS_SOURCE)).toBeUndefined();
    expect(loadOptionalSecret({ QUOTE_SECRET_PREVIOUS: 'cd'.repeat(32) }, QUOTE_SECRET_PREVIOUS_SOURCE)).toHaveLength(32);
    expect(() => loadSecret({ RELAYER_KEY: KEY, NODE_ENV: 'production' }, HOT_KEY_SOURCE)).toThrow(/refused in production/);
    expect(loadSecret({ RELAYER_KEY: KEY, NODE_ENV: 'production', ALLOW_SECRET_ENV: '1' }, HOT_KEY_SOURCE)).toHaveLength(32);
  });
  it('never puts the secret in an error message', () => {
    const secret = 'ab'.repeat(33);
    for (const env of [{ RELAYER_KEY: secret }, { RELAYER_KEY_FILE: file('toolong', secret, 0o600) }, { RELAYER_KEY_FILE: file('leaky', secret, 0o644) }]) {
      try {
        loadSecret(env, HOT_KEY_SOURCE);
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toContain(secret);
        expect((e as Error).message).not.toContain('abab');
      }
    }
  });
  it('reports an unreadable file whose stat succeeded', () => {
    const p = file('unreadable', KEY, 0o600);
    chmodSync(p, 0o000);
    if (process.getuid?.() === 0) return; // root can read anything
    expect(() => loadSecret({ RELAYER_KEY_FILE: p }, HOT_KEY_SOURCE)).toThrow(/not readable/);
  });
});

describe('ConfigError', () => {
  it('is a named Error subclass', () => {
    const e = new ConfigError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ConfigError');
  });
});
