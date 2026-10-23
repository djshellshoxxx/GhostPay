import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './settings';
import { exportSettingsExchange, parseSettingsExchange, applySettingsExchange } from './settingsExchange';

describe('nonsecret settings exchange', () => {
  it('exports only five allowlisted preferences and never endpoints or signer trust', () => {
    const source = { ...DEFAULT_SETTINGS, rpcUrls: { '1': 'https://rpc.example/credential' }, relayerUrl: 'https://relay.example', pinnedSigners: ['02' + 'ab'.repeat(32)] };
    const text = exportSettingsExchange(source);
    expect(text).not.toMatch(/rpc|relayer|credential|pinned|https/);
    expect(parseSettingsExchange(text)).toEqual({ delayMinSec: 120, delayMaxSec: 900, lockTimeoutMin: 15, theme: 'system', autoClearFragment: true });
  });
  it('rejects extra fields, duplicates, unsupported versions, oversized text and invalid bounds', () => {
    const good = JSON.parse(exportSettingsExchange(DEFAULT_SETTINGS)) as { v: number; settings: Record<string, unknown> };
    for (const field of ['rpcUrls', 'relayerUrl', 'pinnedSigners', 'privateKey', 'unexpected']) {
      expect(() => parseSettingsExchange(JSON.stringify({ ...good, settings: { ...good.settings, [field]: 'bad' } }))).toThrow();
    }
    expect(() => parseSettingsExchange(JSON.stringify({ ...good, v: 2 }))).toThrow();
    expect(() => parseSettingsExchange(JSON.stringify({ ...good, extra: 1 }))).toThrow();
    expect(() => parseSettingsExchange(exportSettingsExchange(DEFAULT_SETTINGS).replace('"v":1', '"v":1,"v":1'))).toThrow();
    expect(() => parseSettingsExchange(' '.repeat(4097))).toThrow();
    for (const values of [{ delayMinSec: 901 }, { delayMaxSec: 86401 }, { lockTimeoutMin: 0 }, { lockTimeoutMin: 1.5 }, { theme: 'unknown' }, { autoClearFragment: 'false' }]) {
      expect(() => parseSettingsExchange(JSON.stringify({ ...good, settings: { ...good.settings, ...values } }))).toThrow();
    }
  });
  it('applies a validated preview while retaining current URLs and pinned trust', () => {
    const current = { ...DEFAULT_SETTINGS, rpcUrls: { '1': 'https://rpc.example' }, pinnedSigners: ['02' + 'ab'.repeat(32)] };
    const preview = parseSettingsExchange(exportSettingsExchange({ ...DEFAULT_SETTINGS, theme: 'dark' }));
    expect(applySettingsExchange(current, preview)).toEqual({ ...current, theme: 'dark' });
  });
});
