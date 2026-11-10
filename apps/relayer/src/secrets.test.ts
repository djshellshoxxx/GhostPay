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
import { HOT_KEY_SOURCE, loadSecret } from './secrets.js';

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
