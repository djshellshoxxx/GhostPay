import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import {
  applySettingsExchange, buildSettingsExport, DEFAULT_EXPORT_SECTIONS, defaultExchangeSelection, EXCHANGE_SECTIONS, exportSectionAvailable,
  exportSettingsExchange, needsTrustConfirmation, parseSettingsExchange, previewSettingsExchange, selectionChangesSomething,
} from './settingsExchange';

const CHAINS = [84532, 11155111];
const PIN_A = `02${'ab'.repeat(32)}`;
const PIN_B = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const PIN_C = `03${'ab'.repeat(32)}`;
const PREFS = { delayMinSec: 120, delayMaxSec: 900, lockTimeoutMin: 15, theme: 'system', autoClearFragment: true };
const source: Settings = {
  ...DEFAULT_SETTINGS, theme: 'dark', delayMinSec: 0,
  rpcUrls: { '84532': 'https://base.example/v3/KEY', '11155111': 'wss://sep.example/', '1': 'https://unlisted.example/' },
  rpcUrlsSecondary: { '84532': 'https://second.example/' },
  relayerUrl: 'https://relay.example',
  pinnedSigners: [PIN_A, PIN_B],
};
const all = (s: Settings, sections = EXCHANGE_SECTIONS) => {
  const incoming = parseSettingsExchange(exportSettingsExchange(s, sections, CHAINS), CHAINS);
  return { incoming, preview: (current: Settings) => previewSettingsExchange(current, incoming, CHAINS) };
};

describe('settings exchange: export', () => {
  it('defaults to preferences only and keeps the exact v1 envelope that excludes endpoints and signer trust', () => {
    expect(DEFAULT_EXPORT_SECTIONS).toEqual(['preferences']);
    const text = exportSettingsExchange({ ...DEFAULT_SETTINGS, rpcUrls: { '1': 'https://rpc.example/credential' }, relayerUrl: 'https://relay.example', pinnedSigners: [PIN_A] });
    expect(text).toBe(JSON.stringify({ format: 'ghostpay-settings', v: 1, settings: PREFS }));
    expect(text).not.toMatch(/rpc|relayer|credential|pinned|https/);
    expect(parseSettingsExchange(text)).toEqual({ preferences: PREFS });
  });

  it('builds exactly the selected sections, limited to chains this app knows', () => {
    expect(buildSettingsExport(source, ['rpcUrls', 'pinnedSigners'], CHAINS)).toEqual({
      rpcUrls: { '84532': 'https://base.example/v3/KEY', '11155111': 'wss://sep.example/' }, pinnedSigners: [PIN_A, PIN_B],
    });
    expect(buildSettingsExport(source, [], CHAINS)).toEqual({});
    expect(() => exportSettingsExchange(source, [], CHAINS)).toThrow(/cannot be exported/);
    const text = exportSettingsExchange(source, EXCHANGE_SECTIONS, CHAINS);
    expect(JSON.parse(text)).toMatchObject({ v: 2 });
    expect(text).not.toContain('unlisted');
  });

  it('marks empty sections unavailable and never sends them', () => {
    expect(EXCHANGE_SECTIONS.map((section) => exportSectionAvailable(DEFAULT_SETTINGS, section, CHAINS))).toEqual([true, false, false, true, false]);
    expect(buildSettingsExport(DEFAULT_SETTINGS, EXCHANGE_SECTIONS, CHAINS)).toEqual({ preferences: PREFS, relayerUrl: '' });
  });

  it('refuses an export that would not fit one QR with a clear message', () => {
    const rpcUrls = { '84532': `https://a.example/${'k'.repeat(1000)}`, '11155111': `https://b.example/${'k'.repeat(1000)}` };
    expect(() => exportSettingsExchange({ ...source, rpcUrls, rpcUrlsSecondary: rpcUrls }, ['rpcUrls', 'rpcUrlsSecondary'], CHAINS)).toThrow(/too large for one QR/);
  });

  it('refuses to export a stored signer key that is not a valid public key', () => {
    expect(() => exportSettingsExchange({ ...source, pinnedSigners: [`02${'cd'.repeat(32)}`] }, ['pinnedSigners'], CHAINS)).toThrow(/cannot be exported/);
  });
});

describe('settings exchange: parse', () => {
  it('rejects extra fields, duplicates, unsupported versions, oversized text and invalid bounds', () => {
    const good = JSON.parse(exportSettingsExchange(DEFAULT_SETTINGS)) as { v: number; settings: Record<string, unknown> };
    for (const field of ['rpcUrls', 'relayerUrl', 'pinnedSigners', 'privateKey', 'unexpected']) {
      expect(() => parseSettingsExchange(JSON.stringify({ ...good, settings: { ...good.settings, [field]: 'bad' } }))).toThrow();
    }
    expect(() => parseSettingsExchange(JSON.stringify({ ...good, v: 3 }))).toThrow();
    expect(() => parseSettingsExchange(JSON.stringify({ ...good, v: 2 }))).toThrow();
    expect(() => parseSettingsExchange(JSON.stringify({ ...good, extra: 1 }))).toThrow();
    expect(() => parseSettingsExchange(exportSettingsExchange(DEFAULT_SETTINGS).replace('"v":1', '"v":1,"v":1'))).toThrow();
    expect(() => parseSettingsExchange(' '.repeat(4097))).toThrow();
    for (const values of [{ delayMinSec: 901 }, { delayMaxSec: 86401 }, { lockTimeoutMin: 0 }, { lockTimeoutMin: 1.5 }, { theme: 'unknown' }, { autoClearFragment: 'false' }]) {
      expect(() => parseSettingsExchange(JSON.stringify({ ...good, settings: { ...good.settings, ...values } }))).toThrow();
    }
  });

  it('applies the web URL rules and the chains this device knows', () => {
    const v2 = (settings: unknown): string => JSON.stringify({ format: 'ghostpay-settings', v: 2, settings });
    expect(parseSettingsExchange(v2({ rpcUrls: { '84532': 'https://a.example' } }), CHAINS)).toEqual({ rpcUrls: { '84532': 'https://a.example/' } });
    expect(() => parseSettingsExchange(v2({ rpcUrls: { '84532': 'https://a.example' } }), [])).toThrow(/not a supported/);
    expect(() => parseSettingsExchange(v2({ rpcUrls: { '84532': 'http://a.example' } }), CHAINS)).toThrow(/not a supported/);
    expect(() => parseSettingsExchange(v2({ relayerUrl: 'https://r.example/?k=1' }), CHAINS)).toThrow(/not a supported/);
    expect(() => parseSettingsExchange(v2({ preferences: { ...PREFS, delayMinSec: 901 } }), CHAINS)).toThrow(/Delay range/);
  });
});

describe('settings exchange: preview and apply', () => {
  const target: Settings = { ...DEFAULT_SETTINGS, rpcUrls: { '84532': 'https://old.example/', '1': 'https://keep.example/' }, pinnedSigners: [PIN_B, PIN_C] };

  it('shows current vs incoming per section, with unchanged marking', () => {
    const preview = all(source).preview(target);
    expect(preview.changed).toBe(true);
    expect(preview.preferences).toMatchObject({ changed: true, incoming: { theme: 'dark', delayMinSec: 0 }, current: { theme: 'system' } });
    expect(preview.rpcUrls?.entries).toEqual([
      { chainId: '84532', current: 'https://old.example/', incoming: 'https://base.example/v3/KEY', changed: true },
      { chainId: '11155111', current: undefined, incoming: 'wss://sep.example/', changed: true },
    ]);
    expect(preview.relayerUrl).toEqual({ current: '', incoming: 'https://relay.example', changed: true });
    expect(preview.pinnedSigners).toEqual({ added: [PIN_A], removed: [PIN_C], unchanged: 1, changed: true });
    const same = all(target, ['rpcUrls']).preview(target);
    expect(same.rpcUrls?.entries).toEqual([{ chainId: '84532', current: 'https://old.example/', incoming: 'https://old.example/', changed: false }]);
    expect(same.changed).toBe(false);
  });

  it('preselects only changed preferences and leaves endpoint, relayer and signer sections unticked', () => {
    const preview = all(source).preview(target);
    const selection = defaultExchangeSelection(preview);
    expect(selection).toEqual({ preferences: true, rpcUrls: false, rpcUrlsSecondary: false, relayerUrl: false, addSigners: [], removeSigners: false });
    expect(applySettingsExchange(target, preview, selection)).toEqual({ ...target, theme: 'dark', delayMinSec: 0 });
    expect(defaultExchangeSelection(all(target).preview(target)).preferences).toBe(false);
    // The preselected preferences lower the minimum delay (less timing jitter), so applying them is confirmed.
    expect(needsTrustConfirmation(preview, selection)).toBe(true);
  });

  it('applies only the selected sections, merging RPC chains and adding only ticked signers', () => {
    const preview = all(source).preview(target);
    const next = applySettingsExchange(target, preview, { rpcUrls: true, addSigners: [PIN_A] });
    expect(next).toEqual({ ...target, rpcUrls: { '84532': 'https://base.example/v3/KEY', '1': 'https://keep.example/', '11155111': 'wss://sep.example/' }, pinnedSigners: [PIN_B, PIN_C, PIN_A] });
    expect(applySettingsExchange(target, preview, { rpcUrlsSecondary: true, relayerUrl: true, removeSigners: true })).toEqual({
      ...target, rpcUrlsSecondary: { '84532': 'https://second.example/' }, relayerUrl: 'https://relay.example', pinnedSigners: [PIN_B],
    });
    expect(applySettingsExchange(target, preview, {})).toEqual(target);
    expect(needsTrustConfirmation(preview, { relayerUrl: true })).toBe(true);
    expect(needsTrustConfirmation(preview, { addSigners: [PIN_A] })).toBe(true);
    expect(needsTrustConfirmation(preview, { removeSigners: true })).toBe(true);
    // An imported RPC can misreport payments and sees which addresses are checked: it is a trust change too.
    expect(needsTrustConfirmation(preview, { rpcUrls: true })).toBe(true);
    expect(needsTrustConfirmation(preview, { rpcUrlsSecondary: true })).toBe(true);
    expect(selectionChangesSomething(preview, {})).toBe(false);
    expect(selectionChangesSomething(preview, { rpcUrlsSecondary: true })).toBe(true);
  });

  it('imports an empty relayer as "no relayer" only when selected', () => {
    const current = { ...DEFAULT_SETTINGS, relayerUrl: 'https://mine.example' };
    const preview = all(DEFAULT_SETTINGS, ['relayerUrl']).preview(current);
    expect(preview.relayerUrl).toEqual({ current: 'https://mine.example', incoming: '', changed: true });
    expect(applySettingsExchange(current, preview, defaultExchangeSelection(preview))).toEqual(current);
    expect(applySettingsExchange(current, preview, { relayerUrl: true }).relayerUrl).toBe('');
  });

  it('shows "no changes" when the same code is imported again after applying it', () => {
    const first = all(source).preview(target);
    const applied = applySettingsExchange(target, first, { preferences: true, rpcUrls: true, rpcUrlsSecondary: true, relayerUrl: true, addSigners: [PIN_A], removeSigners: true });
    const again = all(source).preview(applied);
    expect(again.changed).toBe(false);
    expect(applySettingsExchange(applied, again, { preferences: true, rpcUrls: true, rpcUrlsSecondary: true, relayerUrl: true, removeSigners: true })).toEqual(applied);
  });

  it('is all-or-nothing: a stale basis, forged selection or tampered preview throws without a partial result', () => {
    const preview = all(source).preview(target);
    expect(() => applySettingsExchange({ ...target, theme: 'light' }, preview, { preferences: true })).toThrow(/Nothing was changed/);
    expect(() => applySettingsExchange(target, preview, { addSigners: [PIN_B] })).toThrow(/Nothing was changed/);
    expect(() => applySettingsExchange(target, preview, { addSigners: [PIN_A, PIN_A] })).toThrow(/Nothing was changed/);
    const tampered = { ...preview, incoming: { ...preview.incoming, rpcUrls: { '84532': 'http://evil.example/' } } };
    expect(() => applySettingsExchange(target, tampered, { rpcUrls: true })).toThrow(/not a supported/);
    const prefsOnly = all(source, ['preferences']).preview(target);
    expect(() => applySettingsExchange(target, prefsOnly, { rpcUrls: true })).toThrow(/Nothing was changed/);
    expect(() => applySettingsExchange(target, prefsOnly, { removeSigners: true })).toThrow(/Nothing was changed/);
    const full = { ...target, pinnedSigners: Array.from({ length: 50 }, (_, i) => (i === 0 ? PIN_B : `02${i.toString(16).padStart(64, '0')}`)) };
    const many = all(source, ['pinnedSigners']).preview(full);
    expect(() => applySettingsExchange(full, many, { addSigners: [PIN_A] })).toThrow(/Nothing was changed/);
  });
});

describe('settings exchange: preference changes that weaken protection need confirmation', () => {
  const withPrefs = (current: Settings, incoming: Partial<Settings>) =>
    previewSettingsExchange(current, parseSettingsExchange(exportSettingsExchange({ ...current, ...incoming }, ['preferences'], CHAINS), CHAINS), CHAINS);
  const base: Settings = { ...DEFAULT_SETTINGS, delayMinSec: 120, delayMaxSec: 900, lockTimeoutMin: 15, autoClearFragment: true };

  it.each([
    ['a longer idle lock', { lockTimeoutMin: 240 }],
    ['keeping invoices in the address bar', { autoClearFragment: false }],
    ['a shorter minimum delay', { delayMinSec: 0 }],
    ['a shorter maximum delay', { delayMaxSec: 300 }],
  ] as const)('confirms %s', (_name, change) => {
    expect(needsTrustConfirmation(withPrefs(base, change), { preferences: true })).toBe(true);
  });

  it.each([
    ['a shorter idle lock', { lockTimeoutMin: 5 }],
    ['longer delays', { delayMinSec: 300, delayMaxSec: 1800 }],
    ['only the theme', { theme: 'dark' as const }],
  ] as const)('does not ask again for %s', (_name, change) => {
    expect(needsTrustConfirmation(withPrefs(base, change), { preferences: true })).toBe(false);
  });

  it('does not ask when the weaker preferences are not selected', () => {
    expect(needsTrustConfirmation(withPrefs(base, { lockTimeoutMin: 240 }), { preferences: false })).toBe(false);
  });
});

