import { describe, expect, it } from 'vitest';
import { sameExecutionSettings } from './executionSettings';
import { DEFAULT_SETTINGS } from './settings';

describe('presentation preferences and execution authority', () => {
  it('excludes only the two new visual and clipboard preferences', () => {
    expect(sameExecutionSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, privacyMode: true, clipboardClearAfterMs: 30_000 })).toBe(true);
    expect(sameExecutionSettings({ ...DEFAULT_SETTINGS, privacyMode: true, clipboardClearAfterMs: 30_000 }, DEFAULT_SETTINGS)).toBe(true);
  });

  it.each([
    ['rpcUrls', { '84532': 'https://rpc.test/' }], ['rpcUrlsSecondary', { '84532': 'https://secondary.test/' }],
    ['relayerUrl', 'https://relayer.test/'], ['delayMinSec', 1], ['delayMaxSec', 2], ['lockTimeoutMin', 1],
    ['theme', 'dark'], ['autoClearFragment', false], ['pinnedSigners', ['02' + '1'.repeat(64)]],
  ] as const)('preserves the existing %s boundary', (field, value) => {
    expect(sameExecutionSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, [field]: value })).toBe(false);
  });

  it('does not equate cloned maps or signer lists with the previous selected configuration', () => {
    expect(sameExecutionSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, rpcUrls: { ...DEFAULT_SETTINGS.rpcUrls } })).toBe(false);
    expect(sameExecutionSettings(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, pinnedSigners: [...DEFAULT_SETTINGS.pinnedSigners] })).toBe(false);
  });

  it('keeps unknown and future fields inside the authority boundary', () => {
    const before = { ...DEFAULT_SETTINGS, futureExecutionOption: 'first' };
    const after = { ...before, futureExecutionOption: 'second' };
    expect(sameExecutionSettings(before, { ...before, privacyMode: true })).toBe(true);
    expect(sameExecutionSettings(before, after)).toBe(false);
    expect(sameExecutionSettings(before, DEFAULT_SETTINGS)).toBe(false);
    expect(sameExecutionSettings(DEFAULT_SETTINGS, before)).toBe(false);
  });
});
