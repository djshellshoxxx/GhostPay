import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, checkDelayRange, checkRelayerUrl, checkRpcUrl, loadSettings, sanitizeSettings, saveSettings } from './settings';

describe('settings validation', () => {
  it('accepts https/wss RPC URLs and rejects the rest', () => {
    expect(checkRpcUrl(' https://rpc.example/key ')).toBe('https://rpc.example/key');
    expect(checkRpcUrl('wss://rpc.example/ws')).toBe('wss://rpc.example/ws');
    for (const bad of ['http://rpc.example', 'https://user:pw@rpc.example', 'https://rpc.example/#x', 'ftp://x', 'nope', 'javascript:alert(1)']) {
      expect(() => checkRpcUrl(bad)).toThrow(/RPC URL rejected/);
    }
  });
  it('validates the relayer URL', () => {
    expect(checkRelayerUrl('')).toBe('');
    expect(checkRelayerUrl('https://relay.example/')).toBe('https://relay.example');
    expect(checkRelayerUrl('https://relay.example/api/')).toBe('https://relay.example/api');
    for (const bad of ['http://relay.example', 'https://u:p@relay.example', 'https://relay.example/?a=1', 'https://relay.example/#x']) {
      expect(() => checkRelayerUrl(bad)).toThrow(/must be https/);
    }
    expect(() => checkRelayerUrl('nope')).toThrow(/not a valid URL/);
  });
  it('validates delay ranges', () => {
    expect(() => checkDelayRange(0, 0)).not.toThrow();
    expect(() => checkDelayRange(5, 4)).toThrow(/Delay range/);
    expect(() => checkDelayRange(-1, 4)).toThrow();
    expect(() => checkDelayRange(0, 86_401)).toThrow();
    expect(() => checkDelayRange(1.5, 4)).toThrow();
  });
});

describe('sanitizeSettings', () => {
  it('falls back to defaults for junk', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid fields and drops invalid ones individually', () => {
    const s = sanitizeSettings({
      rpcUrls: { '84532': 'https://rpc.example', 'x': 'https://y', '1': 'http://insecure', '2': 5 },
      relayerUrl: 'https://relay.example',
      delayMinSec: 10,
      delayMaxSec: 20,
      lockTimeoutMin: 5,
      theme: 'dark',
      autoClearFragment: false,
      pinnedSigners: [`02${'a'.repeat(64)}`, 'bad', 5],
    });
    expect(s.rpcUrls).toEqual({ '84532': 'https://rpc.example/' });
    expect(s.rpcUrlsSecondary).toEqual({});
    expect(sanitizeSettings({ rpcUrlsSecondary: { '84532': 'https://rpc2.example', '1': 'http://insecure' } }).rpcUrlsSecondary).toEqual({ '84532': 'https://rpc2.example/' });
    expect(s.relayerUrl).toBe('https://relay.example');
    expect(s.delayMinSec).toBe(10);
    expect(s.theme).toBe('dark');
    expect(s.autoClearFragment).toBe(false);
    expect(s.pinnedSigners).toEqual([`02${'a'.repeat(64)}`]);
    const t = sanitizeSettings({ relayerUrl: 'http://bad', delayMinSec: 9, delayMaxSec: 1, lockTimeoutMin: 0, theme: 'neon', rpcUrls: 5 });
    expect(t.relayerUrl).toBe('');
    expect(t.delayMinSec).toBe(DEFAULT_SETTINGS.delayMinSec);
    expect(t.lockTimeoutMin).toBe(DEFAULT_SETTINGS.lockTimeoutMin);
    expect(t.theme).toBe('system');
    expect(sanitizeSettings({ relayerUrl: 5 }).relayerUrl).toBe('');
  });
});

describe('persistence', () => {
  it('round-trips and survives storage failures', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const s = { ...DEFAULT_SETTINGS, theme: 'light' as const };
    expect(saveSettings(s, storage)).toBe(true);
    expect(store.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(storage).theme).toBe('light');
    expect(loadSettings({ getItem: () => 'not json' })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings({ getItem: () => null })).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(s, { setItem: () => { throw new Error('full'); } })).toBe(false);
  });
  it('never stores key material fields', () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(['autoClearFragment', 'delayMaxSec', 'delayMinSec', 'lockTimeoutMin', 'pinnedSigners', 'relayerUrl', 'rpcUrls', 'rpcUrlsSecondary', 'theme']);
  });
});
