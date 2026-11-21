import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, clearRpcSessionOnly, isRpcSessionOnly, loadSettings, rpcUrlLooksSecret, saveSettings, setRpcSessionOnly } from './settings';
import { buildSettingsExport, exportSectionAvailable, exportSettingsExchange, parseSettingsExchange } from './settingsExchange';

afterEach(clearRpcSessionOnly);

describe('TM4 endpoint confidentiality at persistence and exchange boundaries', () => {
  it('normalizes session-only endpoints before comparison with the saved URL', () => {
    const entered = ' HTTPS://RPC.EXAMPLE:443/?apikey=fixture-value ';
    setRpcSessionOnly('primary', '84532', entered);
    expect(isRpcSessionOnly('primary', '84532', 'https://rpc.example/?apikey=fixture-value')).toBe(true);
    const records = new Map<string, string>();
    expect(saveSettings({ ...DEFAULT_SETTINGS, rpcUrls: { '84532': entered } }, { setItem: (key, value) => { records.set(key, value); } })).toBe(true);
    expect(records.get(SETTINGS_KEY)).not.toContain('fixture-value');
    expect([...records.values()].join()).not.toContain('fixture-value');
    expect(loadSettings({ getItem: (key) => records.get(key) ?? null }).rpcUrls).toEqual({});
  });

  it('detects explicit credential path labels even when encoded or followed by short alphabetic values', () => {
    for (const endpoint of ['https://rpc.example/api-key/fixture', 'https://rpc.example/%74oken/fixture', 'https://rpc.example/auth/fixture']) {
      expect(rpcUrlLooksSecret(endpoint), endpoint).toBe(true);
    }
  });

  it('omits session-only and credential-looking URLs from primary and secondary exports without altering the source', () => {
    const source = {
      ...DEFAULT_SETTINGS,
      rpcUrls: { '84532': 'https://primary.example/?api_key=fixture-value', '11155111': 'https://public.example/' },
      rpcUrlsSecondary: { '84532': 'https://secondary.example/private-endpoint', '11155111': 'https://secondary.example/?token=fixture-value' },
    };
    const before = JSON.stringify(source);
    setRpcSessionOnly('secondary', '84532', source.rpcUrlsSecondary['84532']);
    const chains = [84532, 11155111];
    const sections = ['preferences', 'rpcUrls', 'rpcUrlsSecondary'] as const;
    expect(buildSettingsExport(source, sections, chains)).toMatchObject({ rpcUrls: { '11155111': 'https://public.example/' } });
    expect(buildSettingsExport(source, sections, chains)).not.toHaveProperty('rpcUrlsSecondary');
    const exported = exportSettingsExchange(source, sections, chains);
    expect(exported).not.toMatch(/fixture-value|private-endpoint|primary\.example|secondary\.example/);
    expect(parseSettingsExchange(exported, chains).rpcUrls).toEqual({ '11155111': 'https://public.example/' });
    expect(exportSectionAvailable(source, 'rpcUrlsSecondary', chains)).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('keeps slot and chain consent separate without treating a heuristic miss as safe', () => {
    const endpoint = 'https://rpc.example/undetectable-provider-credential';
    expect(rpcUrlLooksSecret(endpoint)).toBe(false);
    setRpcSessionOnly('primary', '84532', endpoint);
    const source = { ...DEFAULT_SETTINGS, rpcUrls: { '84532': endpoint, '11155111': endpoint }, rpcUrlsSecondary: { '84532': endpoint } };
    const exported = buildSettingsExport(source, ['rpcUrls', 'rpcUrlsSecondary'], [84532, 11155111]);
    expect(exported.rpcUrls).toEqual({ '11155111': endpoint });
    expect(exported.rpcUrlsSecondary).toEqual({ '84532': endpoint });
    expect(isRpcSessionOnly('primary', '84532', 'not a URL')).toBe(false);
  });

  it('omits a credential-looking relayer path without exporting it as an instruction to clear the destination setting', () => {
    const source = { ...DEFAULT_SETTINGS, relayerUrl: 'https://relay.example/api-key/fixture-value' };
    expect(exportSectionAvailable(source, 'relayerUrl', [])).toBe(false);
    expect(buildSettingsExport(source, ['preferences', 'relayerUrl'], [])).not.toHaveProperty('relayerUrl');
    expect(exportSettingsExchange(source, ['preferences', 'relayerUrl'])).not.toContain('fixture-value');
    expect(source.relayerUrl).toBe('https://relay.example/api-key/fixture-value');
    // The user's explicit empty relayer setting still has its existing clear-on-import meaning.
    expect(buildSettingsExport(DEFAULT_SETTINGS, ['relayerUrl'], [])).toEqual({ relayerUrl: '' });
  });
});
