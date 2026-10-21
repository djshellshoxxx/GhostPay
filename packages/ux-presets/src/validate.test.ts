import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { preset, record } from './fixtures.testutil.js';
import {
  MAX_AMOUNT,
  isAddressShape,
  isAssetFor,
  isSafeText,
  presetFromJson,
  presetToJson,
  validateAmountRule,
  validatePreset,
  validateRecord,
} from './validate.js';

describe('isSafeText', () => {
  it('accepts normal text and emoji', () => {
    expect(isSafeText('Rent 🏠', 64, false)).toBe(true);
    expect(isSafeText('', 10, true)).toBe(true);
    expect(isSafeText('', 10, false)).toBe(false);
  });
  it('rejects control, bidi, separators, BOM, lone surrogates, NFD, overlong, non-strings', () => {
    for (const bad of [
      'a\nb',
      'a\u0000b',
      'a\u007fb',
      'a\u0085b',
      'a‮b',
      'a⁧b',
      'a b',
      'a‏b',
      '﻿a',
      'a\ud800b',
      'a\udc00',
      'é',
    ]) {
      expect(isSafeText(bad, 64, true), JSON.stringify(bad)).toBe(false);
    }
    expect(isSafeText('x'.repeat(11), 10, true)).toBe(false);
    expect(isSafeText('😀'.repeat(10), 10, true)).toBe(true);
    expect(isSafeText('😀'.repeat(11), 10, true)).toBe(false);
    expect(isSafeText(5, 10, true)).toBe(false);
  });
});

describe('chain / asset / address shape', () => {
  it('asset must belong to chain', () => {
    expect(isAssetFor('eip155:1', 'native')).toBe(true);
    expect(isAssetFor('eip155:1', 'eip155:1/erc20:0xabc')).toBe(true);
    expect(isAssetFor('eip155:1', 'eip155:10/erc20:0xabc')).toBe(false);
    expect(isAssetFor('eip155:1', 'eip155:1/')).toBe(false);
    expect(isAssetFor('eip155:1', 5)).toBe(false);
  });
  it('address shape', () => {
    expect(isAddressShape('abc')).toBe(true);
    for (const b of ['', 'a b', 'a\n', 'x'.repeat(129), 'é', 7]) expect(isAddressShape(b)).toBe(false);
  });
});

describe('validateAmountRule', () => {
  it('accepts the three kinds', () => {
    expect(validateAmountRule({ kind: 'fixed', amount: 5n })).toEqual({
      ok: true,
      value: { kind: 'fixed', amount: 5n },
    });
    expect(validateAmountRule({ kind: 'ask' }).ok).toBe(true);
    expect(validateAmountRule({ kind: 'up-to', max: 9n }).ok).toBe(true);
  });
  it('rejects bad rules', () => {
    for (const b of [
      null,
      [],
      'x',
      { kind: 'fixed' },
      { kind: 'fixed', amount: 0n },
      { kind: 'fixed', amount: -1n },
      { kind: 'fixed', amount: 5 },
      { kind: 'fixed', amount: MAX_AMOUNT },
      { kind: 'fixed', amount: 1n, extra: 1 },
      { kind: 'ask', amount: 1n },
      { kind: 'up-to', max: 0n },
      { kind: 'up-to' },
      { kind: 'nope' },
    ]) {
      expect(
        validateAmountRule(b).ok,
        JSON.stringify(b, (_k, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v)),
      ).toBe(false);
    }
  });
});

describe('validatePreset', () => {
  it('accepts a good preset and returns a fresh copy', () => {
    const p = preset();
    const r = validatePreset(p);
    expect(r).toEqual({ ok: true, value: p });
    expect(r.ok && r.value).not.toBe(p);
  });
  it('rejects each bad field', () => {
    const cases: Record<string, unknown> = {
      id: preset({ id: 'bad id' }),
      label: preset({ label: '' }),
      payeeRef: preset({ payeeRef: 'a b' }),
      chain: preset({ chain: 'ETH' }),
      asset: preset({ asset: 'eip155:10/erc20:x' }),
      rule: preset({ amountRule: { kind: 'fixed', amount: -5n } }),
      profile: preset({ privacyProfile: 'Standard' }),
      memo: preset({ memo: 'x‮y' }),
      ts: preset({ createdAt: 10, updatedAt: 5 }),
      tsFloat: preset({ createdAt: 1.5 }),
      tsBig: preset({ updatedAt: 9e15 }),
    };
    for (const [k, v] of Object.entries(cases)) expect(validatePreset(v).ok, k).toBe(false);
  });
  it('rejects extra / missing keys, arrays, null, non-plain objects', () => {
    expect(validatePreset({ ...preset(), extra: 1 }).ok).toBe(false);
    const missing: Record<string, unknown> = { ...preset() };
    delete missing.memo;
    expect(validatePreset(missing).ok).toBe(false);
    expect(validatePreset(null).ok).toBe(false);
    expect(validatePreset([]).ok).toBe(false);
    expect(validatePreset(new Date()).ok).toBe(false);
  });
});

describe('validateRecord', () => {
  it('accepts good, rejects each bad field', () => {
    expect(validateRecord(record()).ok).toBe(true);
    const cases: Record<string, unknown> = {
      id: record({ id: '' }),
      payee: record({ payeeRef: '' }),
      addr: record({ address: 'a b' }),
      chain: record({ chain: 'x' }),
      asset: record({ asset: 'foo' }),
      amount0: record({ amount: 0n }),
      fee: record({ fee: -1n }),
      feeBig: record({ fee: MAX_AMOUNT }),
      profile: record({ privacyProfile: '1' }),
      memo: record({ memo: 'a'.repeat(141) }),
      risk: record({ addressRisk: 'bad' as never }),
      paid: record({ paidAt: -1 }),
    };
    for (const [k, v] of Object.entries(cases)) expect(validateRecord(v).ok, k).toBe(false);
    expect(validateRecord({ ...record(), x: 1 }).ok).toBe(false);
    expect(validateRecord(undefined).ok).toBe(false);
  });
});

describe('json round trip', () => {
  it('serializes bigint as decimal strings and back', () => {
    for (const amountRule of [
      { kind: 'fixed', amount: 123456789012345678901234567890n },
      { kind: 'up-to', max: 7n },
      { kind: 'ask' },
    ] as const) {
      const p = preset({ amountRule });
      const j = presetToJson(p);
      expect(JSON.parse(JSON.stringify(j))).toEqual(j);
      expect(presetFromJson(JSON.parse(JSON.stringify(j)))).toEqual({ ok: true, value: p });
    }
  });
  it('rejects non-canonical amounts and bad shapes', () => {
    const j = presetToJson(preset());
    const withAmt = (a: unknown) => ({ ...j, amountRule: { kind: 'fixed', amount: a } });
    for (const a of ['007', '-1', '1e3', '0x10', ' 1', 5, '9'.repeat(79)]) {
      expect(presetFromJson(withAmt(a)).ok, String(a)).toBe(false);
    }
    expect(presetFromJson(null).ok).toBe(false);
    expect(presetFromJson({ ...j, amountRule: 'x' }).ok).toBe(false);
    expect(presetFromJson(JSON.parse('{"__proto__":{"x":1}}')).ok).toBe(false);
  });
  it('property: any valid fixed amount round-trips', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: MAX_AMOUNT - 1n }), (amount) => {
        const p = preset({ amountRule: { kind: 'fixed', amount } });
        const r = presetFromJson(JSON.parse(JSON.stringify(presetToJson(p))));
        expect(r).toEqual({ ok: true, value: p });
      }),
    );
  });
});
