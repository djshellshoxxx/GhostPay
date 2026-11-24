import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadPoolRelayerKey } from './key.js';

const dir = mkdtempSync(join(tmpdir(), 'gp-pool-key-'));
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });
const KEY = '11'.repeat(32);
const file = (name: string, content: string, mode: number): string => {
  const p = join(dir, name);
  writeFileSync(p, content);
  chmodSync(p, mode);
  return p;
};

describe('loadPoolRelayerKey', () => {
  it('reads a mode-600 key file and clears the variable', () => {
    const env: Record<string, string | undefined> = { POOL_RELAYER_KEY_FILE: file('k', `${KEY}\n`, 0o600) };
    expect(loadPoolRelayerKey(env)).toBe(`0x${KEY}`);
    expect(env['POOL_RELAYER_KEY_FILE']).toBeUndefined();
  });
  it('still accepts the value variable outside production and clears it', () => {
    const env: Record<string, string | undefined> = { POOL_RELAYER_KEY: `0x${KEY}` };
    expect(loadPoolRelayerKey(env)).toBe(`0x${KEY}`);
    expect(env['POOL_RELAYER_KEY']).toBeUndefined();
  });
  it.skipIf(process.platform === 'win32')('refuses a group/world-readable key file', () => {
    expect(() => loadPoolRelayerKey({ POOL_RELAYER_KEY_FILE: file('loose', KEY, 0o644) })).toThrow(/POOL_RELAYER_KEY_FILE: file mode/);
  });
  it('refuses the value variable in production unless explicitly allowed', () => {
    expect(() => loadPoolRelayerKey({ POOL_RELAYER_KEY: KEY, NODE_ENV: 'production' })).toThrow(/refused in production/);
    expect(loadPoolRelayerKey({ POOL_RELAYER_KEY: KEY, NODE_ENV: 'production', ALLOW_SECRET_ENV: '1' })).toBe(`0x${KEY}`);
  });
  it('refuses missing, doubly set and malformed keys without echoing the value', () => {
    expect(() => loadPoolRelayerKey({})).toThrow(/POOL_RELAYER_KEY_FILE or POOL_RELAYER_KEY is required/);
    expect(() => loadPoolRelayerKey({ POOL_RELAYER_KEY: KEY, POOL_RELAYER_KEY_FILE: file('both', KEY, 0o600) })).toThrow(/only one/);
    const bad = 'ab'.repeat(33);
    expect(() => loadPoolRelayerKey({ POOL_RELAYER_KEY: bad })).toThrow(/invalid secret format/);
    try { loadPoolRelayerKey({ POOL_RELAYER_KEY: bad }); } catch (e) { expect((e as Error).message).not.toContain('abab'); }
  });
});
