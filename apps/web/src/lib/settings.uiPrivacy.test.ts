import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, UI_PRIVACY_KEY, loadPrivacyPreferences, loadSettings, savePrivacyPreferences, saveSettings } from './settings';

const PRIVATE_KEY = UI_PRIVACY_KEY;
function storage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

describe('separate UI privacy persistence', () => {
  it('leaves existing execution bytes and session-only references untouched on a private-only save', () => {
    const raw = '{  "rpcUrls" : {"84532":"https://configured.example/"}, "theme":"dark"  }';
    const store = storage({ [SETTINGS_KEY]: raw });
    expect(savePrivacyPreferences({ privacyMode: true, clipboardClearAfterMs: 300_000 }, store)).toBe(true);
    expect(store.setItem).toHaveBeenCalledExactlyOnceWith(UI_PRIVACY_KEY, JSON.stringify({ privacyMode: true, clipboardClearAfterMs: 300_000 }));
    expect(store.getItem).not.toHaveBeenCalled();
    expect(store.values.get(SETTINGS_KEY)).toBe(raw);
    const current = { privacyMode: false, clipboardClearAfterMs: 0 as const, rpcUrls: { '84532': 'https://session-only.example/' }, pinnedSigners: ['known signer'] };
    const overlaid = { ...current, ...loadPrivacyPreferences(current, store) };
    expect(overlaid.rpcUrls).toBe(current.rpcUrls);
    expect(overlaid.pinnedSigners).toBe(current.pinnedSigners);
    expect(overlaid).toMatchObject({ privacyMode: true, clipboardClearAfterMs: 300_000 });
  });

  it('retains current choices when storage is missing, corrupt, blocked or has invalid fields', () => {
    const fallback = { privacyMode: true, clipboardClearAfterMs: 60_000 as const };
    for (const raw of [null, '{broken', 'null', '[]', '7', '{"privacyMode":"false","clipboardClearAfterMs":-1}']) {
      expect(loadPrivacyPreferences(fallback, { getItem: () => raw })).toEqual(fallback);
    }
    expect(loadPrivacyPreferences(fallback, { getItem: () => { throw new DOMException('Denied', 'SecurityError'); } })).toEqual(fallback);
    expect(loadPrivacyPreferences(fallback, { getItem: () => '{"privacyMode":false}' })).toEqual({ privacyMode: false, clipboardClearAfterMs: 60_000 });
    expect(loadPrivacyPreferences(fallback, { getItem: () => '{"clipboardClearAfterMs":0}' })).toEqual({ privacyMode: true, clipboardClearAfterMs: 0 });
    expect(loadPrivacyPreferences()).toEqual({ privacyMode: false, clipboardClearAfterMs: 0 });
  });

  it('reports write denial and serializes only the two nonsecret values without supplied hooks', () => {
    const store = storage();
    const supplied = { privacyMode: true, clipboardClearAfterMs: 30_000 as const, secret: 'never stored', toJSON: () => ({ secret: 'never stored' }) };
    expect(savePrivacyPreferences(supplied, store)).toBe(true);
    expect(store.values.get(UI_PRIVACY_KEY)).toBe('{"privacyMode":true,"clipboardClearAfterMs":30000}');
    expect(savePrivacyPreferences(supplied, { setItem: () => { throw new DOMException('Denied', 'SecurityError'); } })).toBe(false);
    expect(savePrivacyPreferences(supplied)).toBe(false); // Node test environment has no browser storage.
  });

  it('loads privacy even when execution data is corrupt and reports a partially refused full save', () => {
    const store = storage({ [SETTINGS_KEY]: '{broken', [PRIVATE_KEY]: '{"privacyMode":true,"clipboardClearAfterMs":30000}' });
    expect(loadSettings(store)).toMatchObject({ rpcUrls: {}, privacyMode: true, clipboardClearAfterMs: 30_000 });
    const denied = { setItem: (key: string, value: string): void => {
      if (key === PRIVATE_KEY) throw new DOMException('Denied', 'SecurityError');
      store.values.set(key, value);
    } };
    expect(saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, denied)).toBe(false);
    expect(JSON.parse(store.values.get(SETTINGS_KEY) ?? '{}')).toMatchObject({ theme: 'dark' });
    expect(store.values.get(PRIVATE_KEY)).toBe('{"privacyMode":true,"clipboardClearAfterMs":30000}');
  });

  it('stores UI privacy outside execution settings on a full settings save', () => {
    const store = storage();
    expect(saveSettings({ ...DEFAULT_SETTINGS, privacyMode: true, clipboardClearAfterMs: 60_000 }, store)).toBe(true);
    const execution = store.values.get(SETTINGS_KEY) ?? '';
    expect(execution).not.toMatch(/privacyMode|clipboardClearAfterMs/);
    expect(JSON.parse(store.values.get(PRIVATE_KEY) ?? 'null')).toEqual({ privacyMode: true, clipboardClearAfterMs: 60_000 });
    expect(loadSettings(store)).toMatchObject({ privacyMode: true, clipboardClearAfterMs: 60_000 });
  });

  it('overlays the dedicated preference key and retains legacy inline choices only as a fallback', () => {
    const store = storage({
      [SETTINGS_KEY]: JSON.stringify({ rpcUrls: { '84532': 'https://node.example/' }, privacyMode: false, clipboardClearAfterMs: 0 }),
      [PRIVATE_KEY]: JSON.stringify({ privacyMode: true, clipboardClearAfterMs: 30_000 }),
    });
    expect(loadSettings(store)).toMatchObject({ rpcUrls: { '84532': 'https://node.example/' }, privacyMode: true, clipboardClearAfterMs: 30_000 });
    store.values.delete(PRIVATE_KEY);
    expect(loadSettings(store)).toMatchObject({ privacyMode: false, clipboardClearAfterMs: 0 });
    store.values.set(SETTINGS_KEY, JSON.stringify({ privacyMode: true, clipboardClearAfterMs: 300_000 }));
    expect(loadSettings(store)).toMatchObject({ privacyMode: true, clipboardClearAfterMs: 300_000 });
  });
});
