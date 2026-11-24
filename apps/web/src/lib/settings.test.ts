import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, clearRpcSessionOnly, rpcUrlLooksSecret, setRpcSessionOnly, SETTINGS_KEY, checkDelayRange, checkRelayerUrl, checkRpcUrl, loadSettings, sanitizeSettings, saveSettings } from './settings';

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
  it('enables invoice link cleanup only for an explicitly stored delay', () => {
    for (const value of [undefined, null, '30', true, -1, 15, 30.5, 600]) {
      expect(sanitizeSettings({ invoiceLinkClipboardDelaySec: value }).invoiceLinkClipboardDelaySec).toBe(0);
    }
    for (const seconds of [0, 30, 60]) {
      expect(sanitizeSettings({ invoiceLinkClipboardDelaySec: seconds }).invoiceLinkClipboardDelaySec).toBe(seconds);
    }
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
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual(['autoClearFragment', 'delayMaxSec', 'delayMinSec', 'invoiceLinkClipboardDelaySec', 'lockTimeoutMin', 'pinnedSigners', 'relayerUrl', 'rpcUrls', 'rpcUrlsSecondary', 'theme']);
    const store = new Map<string, string>();
    const settingsWithExtraFields = { ...DEFAULT_SETTINGS, theme: 'dark' as const, spendingKey: 'secret-spend', viewingKey: 'secret-view', passphrase: 'secret-password' };
    expect(saveSettings(settingsWithExtraFields, { setItem: (key, value) => { store.set(key, value); } })).toBe(true);
    const saved = store.get(SETTINGS_KEY)!;
    expect(saved).not.toMatch(/spendingKey|viewingKey|passphrase|secret-/);
    expect(JSON.parse(saved)).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });
  it('does not execute a supplied serialization hook when persisting preferences', () => {
    const store = new Map<string, string>();
    const settingsWithHook = { ...DEFAULT_SETTINGS, toJSON: () => ({ privateKey: 'accidental-secret' }) };
    expect(saveSettings(settingsWithHook, { setItem: (key, value) => { store.set(key, value); } })).toBe(true);
    expect(JSON.parse(store.get(SETTINGS_KEY)!)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('RPC URL secrets (TM4)', () => {
  it('flags key-like paths and query parameters', () => {
    for (const u of [
      'https://eth-mainnet.g.alchemy.com/v2/AbCdEf0123456789AbCdEf0123456789',
      'https://rpc.example/?apikey=abc', 'https://rpc.example/?key=1', 'https://rpc.example/?token=x',
      'https://rpc.example/' + 'a1'.repeat(20), 'https://rpc.example/v3/abc123def456',
      'https://rpc.example/?x=' + 'Zz9'.repeat(8), 'wss://rpc.example/ws/v2/abc123def456',
    ]) expect(rpcUrlLooksSecret(u), u).toBe(true);
  });
  it('does not flag ordinary endpoints', () => {
    for (const u of ['https://rpc.example', 'https://rpc.example/', 'https://sepolia.example.org/rpc', 'https://rpc.example/ethereum-sepolia', 'https://rpc.example/?chain=sepolia', 'nope'])
      expect(rpcUrlLooksSecret(u), u).toBe(false);
  });
  it('keeps session-only endpoints out of storage but not other endpoints', () => {
    const secret = 'https://rpc.example/v2/AbCdEf0123456789AbCdEf0123456789';
    const other = 'https://rpc.example/ok';
    let written = '';
    const storage = { setItem: (_k: string, v: string): void => { written = v; } };
    const s = { ...DEFAULT_SETTINGS, rpcUrls: { '1': secret, '10': other }, rpcUrlsSecondary: { '1': secret } };
    try {
      setRpcSessionOnly('primary', '1', secret);
      expect(saveSettings(s, storage)).toBe(true);
      expect(JSON.stringify((JSON.parse(written) as { rpcUrls: unknown }).rpcUrls)).not.toContain('AbCdEf');
      const back = JSON.parse(written) as { rpcUrls: Record<string, string>; rpcUrlsSecondary: Record<string, string> };
      expect(back.rpcUrls).toEqual({ '10': other });
      expect(back.rpcUrlsSecondary).toEqual({ '1': secret }); // secondary slot not marked
      setRpcSessionOnly('primary', '1', undefined);
      saveSettings(s, storage);
      expect((JSON.parse(written) as { rpcUrls: Record<string, string> }).rpcUrls['1']).toBe(secret);
    } finally {
      clearRpcSessionOnly();
    }
  });
  it('flags but never drops a persisted secret-looking URL on load', () => {
    const secret = 'https://rpc.example/?apikey=abc';
    const loaded = loadSettings({ getItem: () => JSON.stringify({ rpcUrls: { '1': secret } }) });
    expect(loaded.rpcUrls['1']).toBe(secret);
    expect(rpcUrlLooksSecret(loaded.rpcUrls['1']!)).toBe(true);
  });
});
