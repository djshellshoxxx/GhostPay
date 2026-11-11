import { describe, expect, it } from 'vitest';
import { exportSettingsExchange, parseSettingsExchange, SettingsExchangeError, validateSettingsDelayRange, validateSharedSettings } from './index.js';

const settings = { delayMinSec: 120, delayMaxSec: 900, lockTimeoutMin: 15, theme: 'system' as const, autoClearFragment: true };
const envelope = { format: 'ghostpay-settings', v: 1, settings };

describe('shared safe settings exchange', () => {
  it('preserves the existing exact wire format and omits local endpoints, trust and secrets on export', () => {
    const local = { ...settings, rpcUrls: { 1: 'https://private.example/API_TOKEN' }, rpcUrlsSecondary: {},
      relayerUrl: 'https://private.example', pinnedSigners: ['PRIVATE_KEY'], signingKey: 'PRIVATE_KEY' };
    const encoded = exportSettingsExchange(local);
    expect(encoded).toBe(JSON.stringify(envelope));
    expect(encoded).not.toMatch(/rpc|relayer|pinned|PRIVATE|private/);
    expect(parseSettingsExchange(encoded)).toEqual(settings);
    expect(validateSharedSettings(settings)).toEqual(settings);
    expect(validateSharedSettings(settings)).not.toBe(settings);
  });

  it.each(['system', 'light', 'dark'] as const)('round-trips the %s theme and valid lower/upper preference bounds', (theme) => {
    for (const [delayMinSec, delayMaxSec, lockTimeoutMin] of [[0, 0, 1], [86_400, 86_400, 240], [0, 86_400, 15]] as const) {
      const value = { delayMinSec, delayMaxSec, lockTimeoutMin, theme, autoClearFragment: false };
      expect(parseSettingsExchange(exportSettingsExchange(value))).toEqual(value);
      expect(() => validateSettingsDelayRange(delayMinSec, delayMaxSec)).not.toThrow();
    }
  });

  it.each(['not json', 'null', '[]', '1', '{}', '{"v":1,"v":1}', '{"__proto__":{}}', ' '.repeat(4097), 'é'.repeat(2049)])('rejects malformed or oversized public configuration', (text) => {
    expect(() => parseSettingsExchange(text)).toThrow(SettingsExchangeError);
  });

  it.each([{ v: 2 }, { format: 'private-settings' }, { extra: true }, { settings: null }, { settings: [] }, { settings: {} }])('rejects unknown envelopes and settings shapes', (over) => {
    expect(() => parseSettingsExchange(JSON.stringify({ ...envelope, ...over }))).toThrow(SettingsExchangeError);
  });

  it.each([
    { rpcUrls: {} }, { pinnedSigners: [] }, { signingKey: 'PRIVATE' }, { theme: 'neon' }, { theme: 1 },
    { autoClearFragment: 'true' }, { lockTimeoutMin: 0 }, { lockTimeoutMin: 241 }, { lockTimeoutMin: 1.5 },
    { delayMinSec: '120' }, { delayMaxSec: '900' },
  ])('rejects unsafe extra fields and invalid scalar types', (over) => {
    expect(() => parseSettingsExchange(JSON.stringify({ ...envelope, settings: { ...settings, ...over } }))).toThrow(SettingsExchangeError);
  });

  it.each([[-1, 0], [0, 86_401], [901, 900], [1.5, 2], [0, Number.NaN], [0, Number.POSITIVE_INFINITY]])('retains a distinct invalid-delay code for GUI error translation', (min, max) => {
    expect(() => validateSettingsDelayRange(min, max)).toThrow(SettingsExchangeError);
    try { validateSharedSettings({ ...settings, delayMinSec: min, delayMaxSec: max }); }
    catch (error) { expect(error).toMatchObject({ code: 'SETTINGS_DELAY_RANGE' }); }
  });
});
