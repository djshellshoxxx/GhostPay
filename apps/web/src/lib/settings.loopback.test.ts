import { describe, expect, it } from 'vitest';
import { checkRpcUrl, DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

describe('explicit own-node endpoint configuration', () => {
  it.each(['http://127.0.0.1:8545/', 'http://localhost:8545/', 'http://[::1]:8545/'])('preserves %s through save and reload', (endpoint) => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(checkRpcUrl(endpoint)).toBe(endpoint);
    expect(saveSettings({ ...DEFAULT_SETTINGS, rpcUrls: { '84532': endpoint } }, storage)).toBe(true);
    expect(loadSettings(storage).rpcUrls['84532']).toBe(endpoint);
  });
  it('does not extend loopback permission to a public hostname or lookalike', () => {
    for (const endpoint of ['http://rpc.example/', 'http://localhost.example/', 'http://127.0.0.1.example/', 'http://user:password@localhost/']) {
      expect(() => checkRpcUrl(endpoint)).toThrow();
    }
  });
});
