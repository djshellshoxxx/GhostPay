import fc from 'fast-check';
import { generateKeySet } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import {
  DEVICE_SETTINGS_SECTIONS, exportDeviceSettingsExchange, exportSettingsExchange, MAX_DEVICE_SETTINGS_EXCHANGE_BYTES,
  MAX_DEVICE_SETTINGS_MAP_ENTRIES, MAX_DEVICE_SETTINGS_PINNED_SIGNERS, parseDeviceSettingsExchange, parseSettingsExchange,
  SettingsExchangeError, validateSettingsDelayRange, validateSharedSettings, type DeviceSettings, type DeviceSettingsOptions,
} from './index.js';

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

// A strict stand-in for the web validators: the package must not depend on web code.
const strictRpc = (raw: string): string => {
  const u = new URL(raw);
  if (u.protocol !== 'https:' && u.protocol !== 'wss:') throw new Error('scheme');
  return u.toString();
};
const strictRelayer = (raw: string): string => {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.search !== '') throw new Error('relayer');
  return u.origin + u.pathname.replace(/\/+$/, '');
};
const options: DeviceSettingsOptions = { allowedChainIds: [1, 10, 8453, 84532, 11155111], validateRpcUrl: strictRpc, validateRelayerUrl: strictRelayer };
const pubkeys = Array.from({ length: MAX_DEVICE_SETTINGS_PINNED_SIGNERS + 2 }, () => bytesToHex(generateKeySet().spendingPublicKey));
const pin = (i: number): string => pubkeys[i] ?? '';
const v2 = (body: unknown, over: Record<string, unknown> = {}): string => JSON.stringify({ format: 'ghostpay-settings', v: 2, settings: body, ...over });
const parse = (text: string): DeviceSettings => parseDeviceSettingsExchange(text, options);
const rejects = (text: string, opts: DeviceSettingsOptions = options): void => {
  expect(() => parseDeviceSettingsExchange(text, opts)).toThrow(SettingsExchangeError);
};

describe('my-devices settings exchange (v2)', () => {
  const full: DeviceSettings = {
    preferences: settings,
    rpcUrls: { '1': 'https://eth.example/v3/KEY', '84532': 'wss://base.example/' },
    rpcUrlsSecondary: { '84532': 'https://second.example/' },
    relayerUrl: 'https://relay.example/api',
    pinnedSigners: [pin(0), pin(1)],
  };

  it('lists the five sections in a stable order', () => {
    expect(DEVICE_SETTINGS_SECTIONS).toEqual(['preferences', 'rpcUrls', 'rpcUrlsSecondary', 'relayerUrl', 'pinnedSigners']);
  });

  it('round-trips every section and emits only the selected sections', () => {
    const text = exportDeviceSettingsExchange(full, options);
    expect(JSON.parse(text)).toEqual({ format: 'ghostpay-settings', v: 2, settings: full });
    expect(parse(text)).toEqual(full);
    for (const section of DEVICE_SETTINGS_SECTIONS) {
      const only = { [section]: full[section] } as DeviceSettings;
      const out = exportDeviceSettingsExchange(only, options);
      expect(parse(out)).toEqual(only);
      if (section !== 'preferences') expect(JSON.parse(out)).toEqual({ format: 'ghostpay-settings', v: 2, settings: only });
    }
  });

  it('emits the byte-identical v1 envelope for a preferences-only selection so v1-only readers still accept it', () => {
    const text = exportDeviceSettingsExchange({ preferences: settings }, options);
    expect(text).toBe(JSON.stringify(envelope));
    expect(parseSettingsExchange(text)).toEqual(settings);
  });

  it('parses v1 payloads into the preferences section and a v2 preferences-only payload alike', () => {
    expect(parse(JSON.stringify(envelope))).toEqual({ preferences: settings });
    expect(parse(v2({ preferences: settings }))).toEqual({ preferences: settings });
  });

  it('keeps the legacy v1 API unchanged: it never reads a v2 payload', () => {
    expect(() => parseSettingsExchange(exportDeviceSettingsExchange(full, options))).toThrow(SettingsExchangeError);
  });

  it('normalizes URLs through the injected validators and allows an empty relayer meaning "no relayer"', () => {
    expect(parse(v2({ rpcUrls: { '1': 'https://eth.example' } }))).toEqual({ rpcUrls: { '1': 'https://eth.example/' } });
    expect(parse(v2({ relayerUrl: 'https://relay.example/x/' }))).toEqual({ relayerUrl: 'https://relay.example/x' });
    expect(parse(v2({ relayerUrl: '' }))).toEqual({ relayerUrl: '' });
    expect(parse(v2({ pinnedSigners: [] }))).toEqual({ pinnedSigners: [] });
  });

  it.each([
    ['empty settings', v2({})],
    ['unknown version', JSON.stringify({ format: 'ghostpay-settings', v: 3, settings: { relayerUrl: '' } })],
    ['version zero', JSON.stringify({ format: 'ghostpay-settings', v: 0, settings: { relayerUrl: '' } })],
    ['string version', JSON.stringify({ format: 'ghostpay-settings', v: '2', settings: { relayerUrl: '' } })],
    ['wrong format', JSON.stringify({ format: 'ghostpay-seller', v: 2, settings: { relayerUrl: '' } })],
    ['extra envelope key', v2({ relayerUrl: '' }, { extra: 1 })],
    ['settings array', v2([])],
    ['unknown section', v2({ relayerUrl: '', vault: {} })],
    ['private key section', v2({ relayerUrl: '', privateKey: 'x' })],
    ['v1 fields at the top of v2', v2({ ...settings })],
    ['partial preferences', v2({ preferences: { theme: 'dark' } })],
    ['extra preference', v2({ preferences: { ...settings, signingKey: 'x' } })],
    ['bad preference value', v2({ preferences: { ...settings, theme: 'neon' } })],
    ['duplicate key', v2({ relayerUrl: '' }).replace('"relayerUrl":""', '"relayerUrl":"","relayerUrl":""')],
    ['duplicate chain key', v2({ rpcUrls: { '1': 'https://a.example/' } }).replace('{"1":', '{"1":"https://b.example/","1":')],
    ['null section', v2({ rpcUrls: null })],
    ['array map', v2({ rpcUrls: ['https://a.example/'] })],
    ['empty rpc map', v2({ rpcUrls: {} })],
    ['empty secondary map', v2({ rpcUrlsSecondary: {} })],
    ['non-string url', v2({ rpcUrls: { '1': 1 } })],
    ['http rpc', v2({ rpcUrls: { '1': 'http://a.example/' } })],
    ['javascript rpc', v2({ rpcUrls: { '1': 'javascript:alert(1)' } })],
    ['data rpc', v2({ rpcUrls: { '1': 'data:text/plain,x' } })],
    ['credentials rpc', v2({ rpcUrls: { '1': 'https://user:pw@a.example/' } })],
    ['username rpc', v2({ rpcUrls: { '1': 'https://user@a.example/' } })],
    ['fragment rpc', v2({ rpcUrls: { '1': 'https://a.example/#x' } })],
    ['empty fragment rpc', v2({ rpcUrls: { '1': 'https://a.example/#' } })],
    ['whitespace rpc', v2({ rpcUrls: { '1': ' https://a.example/' } })],
    ['control char rpc', v2({ rpcUrls: { '1': 'https://a.example/\u0000' } })],
    ['not a url', v2({ rpcUrls: { '1': 'rpc.example' } })],
    ['empty url', v2({ rpcUrls: { '1': '' } })],
    ['too long url', v2({ rpcUrls: { '1': `https://a.example/${'a'.repeat(1100)}` } })],
    ['http secondary', v2({ rpcUrlsSecondary: { '1': 'http://a.example/' } })],
    ['wss relayer', v2({ relayerUrl: 'wss://relay.example' })],
    ['http relayer', v2({ relayerUrl: 'http://relay.example' })],
    ['relayer query', v2({ relayerUrl: 'https://relay.example/?token=x' })],
    ['relayer credentials', v2({ relayerUrl: 'https://u:p@relay.example' })],
    ['relayer fragment', v2({ relayerUrl: 'https://relay.example/#a' })],
    ['relayer number', v2({ relayerUrl: 1 })],
    ['leading-zero chain', v2({ rpcUrls: { '01': 'https://a.example/' } })],
    ['negative chain', v2({ rpcUrls: { '-1': 'https://a.example/' } })],
    ['exponent chain', v2({ rpcUrls: { '1e3': 'https://a.example/' } })],
    ['zero chain', v2({ rpcUrls: { '0': 'https://a.example/' } })],
    ['spaced chain', v2({ rpcUrls: { ' 1': 'https://a.example/' } })],
    ['unsafe chain', v2({ rpcUrls: { '9007199254740993': 'https://a.example/' } })],
    ['chain not allowed', v2({ rpcUrls: { '137': 'https://a.example/' } })],
    ['signers not array', v2({ pinnedSigners: pin(0) })],
    ['signer not string', v2({ pinnedSigners: [1] })],
    ['uppercase signer', v2({ pinnedSigners: [pin(0).toUpperCase()] })],
    ['uncompressed prefix', v2({ pinnedSigners: [`04${pin(0).slice(2)}`] })],
    ['short signer', v2({ pinnedSigners: [pin(0).slice(0, 64)] })],
    ['off-curve signer', v2({ pinnedSigners: [`02${'ff'.repeat(32)}`] })],
    ['field-modulus signer', v2({ pinnedSigners: [`02${'ff'.repeat(27)}fffffc2f`] })],
    ['duplicate signer', v2({ pinnedSigners: [pin(0), pin(1), pin(0)] })],
    ['oversized text', ' '.repeat(MAX_DEVICE_SETTINGS_EXCHANGE_BYTES - 20) + v2({ relayerUrl: '' })],
    ['oversized multibyte text', v2({ relayerUrl: '' }) + 'é'.repeat(MAX_DEVICE_SETTINGS_EXCHANGE_BYTES / 2)],
    ['not json', 'not json'],
    ['trailing data', `${v2({ relayerUrl: '' })}x`],
  ])('rejects %s', (_name, text) => { rejects(text); });

  it('rejects maps with more chain entries than the limit even when every chain is allowed', () => {
    const allowedChainIds = Array.from({ length: MAX_DEVICE_SETTINGS_MAP_ENTRIES + 1 }, (_, i) => i + 1);
    const map = Object.fromEntries(allowedChainIds.map((id) => [String(id), 'https://a.example/']));
    const opts = { ...options, allowedChainIds };
    rejects(v2({ rpcUrls: map }), opts);
    const ok = Object.fromEntries(Object.entries(map).slice(0, MAX_DEVICE_SETTINGS_MAP_ENTRIES));
    expect(parseDeviceSettingsExchange(v2({ rpcUrls: ok }), opts)).toEqual({ rpcUrls: ok });
  });

  it('rejects more pinned signers than the limit', () => {
    rejects(v2({ pinnedSigners: pubkeys.slice(0, MAX_DEVICE_SETTINGS_PINNED_SIGNERS + 1) }));
  });

  it('rejects a validator result that is not a non-empty string, and contains validator exceptions', () => {
    rejects(v2({ rpcUrls: { '1': 'https://a.example/' } }), { ...options, validateRpcUrl: () => '' });
    rejects(v2({ rpcUrls: { '1': 'https://a.example/' } }), { ...options, validateRpcUrl: () => 1 as unknown as string });
    rejects(v2({ relayerUrl: 'https://a.example' }), { ...options, validateRelayerUrl: () => { throw new RangeError('x'); } });
    rejects(v2({ relayerUrl: 'https://a.example' }), { ...options, validateRelayerUrl: () => '' });
    // A lax validator cannot widen the package floor, before or after normalization.
    rejects(v2({ rpcUrls: { '1': 'http://a.example/' } }), { ...options, validateRpcUrl: (u) => u });
    rejects(v2({ rpcUrls: { '1': 'https://a.example/' } }), { ...options, validateRpcUrl: () => 'javascript:alert(1)' });
    rejects(v2({ relayerUrl: 'https://a.example' }), { ...options, validateRelayerUrl: () => 'https://a.example/?q=1' });
  });

  it('fails export closed: validates the selection and refuses a payload that does not fit one QR', () => {
    expect(() => exportDeviceSettingsExchange({}, options)).toThrow(SettingsExchangeError);
    expect(() => exportDeviceSettingsExchange({ rpcUrls: { '137': 'https://a.example/' } }, options)).toThrow(SettingsExchangeError);
    expect(() => exportDeviceSettingsExchange({ pinnedSigners: ['PRIVATE_KEY'] }, options)).toThrow(SettingsExchangeError);
    // Structural typing lets callers pass extra fields; they are never serialized.
    const extra = { ...full, vault: 'secret' } as DeviceSettings;
    expect(exportDeviceSettingsExchange(extra, options)).not.toContain('secret');
    const many = pubkeys.slice(0, MAX_DEVICE_SETTINGS_PINNED_SIGNERS);
    const longUrl = `https://a.example/${'k'.repeat(1000)}`;
    let error: unknown;
    try { exportDeviceSettingsExchange({ pinnedSigners: many, rpcUrls: { '1': longUrl } }, options); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(SettingsExchangeError);
    expect(error).toMatchObject({ code: 'SETTINGS_EXCHANGE_TOO_LARGE' });
  });

  it('keeps every accepted export within one byte-mode QR (version 40-L holds 2953 bytes)', () => {
    expect(MAX_DEVICE_SETTINGS_EXCHANGE_BYTES).toBeLessThanOrEqual(2953);
    const big: DeviceSettings = { preferences: settings, relayerUrl: 'https://relay.example', pinnedSigners: pubkeys.slice(0, 16),
      rpcUrls: Object.fromEntries(options.allowedChainIds.map((id) => [String(id), `https://rpc-${String(id)}.example/v3/${'k'.repeat(32)}`])),
      rpcUrlsSecondary: Object.fromEntries(options.allowedChainIds.map((id) => [String(id), `wss://two-${String(id)}.example/${'k'.repeat(32)}`])) };
    const text = exportDeviceSettingsExchange(big, options);
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(MAX_DEVICE_SETTINGS_EXCHANGE_BYTES);
    expect(parse(text)).toEqual(big);
  });

  it('round-trips arbitrary valid selections (property)', () => {
    const host = fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/).map((h) => `${h}.example`);
    const url = fc.tuple(fc.constantFrom('https', 'wss'), host, fc.stringMatching(/^[a-zA-Z0-9_-]{0,24}$/)).map(([s, h, p]) => `${s}://${h}/${p}`);
    const chainMap = fc.dictionary(fc.constantFrom(...options.allowedChainIds.map(String)), url, { minKeys: 1, maxKeys: 5 });
    const prefs = fc.record({ delayMinSec: fc.integer({ min: 0, max: 1000 }), delayMaxSec: fc.integer({ min: 1000, max: 86_400 }),
      lockTimeoutMin: fc.integer({ min: 1, max: 240 }), theme: fc.constantFrom('system' as const, 'light' as const, 'dark' as const), autoClearFragment: fc.boolean() });
    const selection = fc.record({
      preferences: prefs, rpcUrls: chainMap, rpcUrlsSecondary: chainMap,
      relayerUrl: fc.oneof(fc.constant(''), host.map((h) => `https://${h}/r`)),
      pinnedSigners: fc.shuffledSubarray(pubkeys.slice(0, 12), { maxLength: 12 }),
    }, { requiredKeys: [] }).filter((s) => Object.keys(s).length > 0);
    fc.assert(fc.property(selection, (value) => {
      const text = exportDeviceSettingsExchange(value, options);
      expect(parse(text)).toEqual(value);
      expect(exportDeviceSettingsExchange(parse(text), options)).toBe(text);
    }), { numRuns: 200 });
  });
});
