import { describe, expect, it } from 'vitest';
import { MAX_PROFILE_BYTES, merchantIdFor, signMerchantProfile, verifyMerchantProfile, type MerchantProfileBody } from './merchantProfile.js';
import { signerPublicKeyHex } from './sign.js';

const KEY = new Uint8Array(32).fill(7);
const signer = signerPublicKeyHex(KEY);
const NOW = 1_700_000_000;
const body: MerchantProfileBody = {
  v: 1,
  merchantId: merchantIdFor(signer),
  name: 'Shop',
  signer,
  chains: [8453],
  tokens: ['USDC'],
  templates: [{ id: 't1', amountMinor: '50000', currency: 'USD', expires: 1800 }],
  origins: ['https://shop.example'],
  exp: NOW + 1000,
};
const good = signMerchantProfile(body, KEY);
// This profile is genuinely signed and expired at NOW; changing exp on an existing signed object would only
// exercise the signature failure, not the caller-clock boundary under review.
const expired = signMerchantProfile({ ...body, exp: NOW - 1 }, KEY);
const invalidClocks: readonly [string, unknown][] = [
  ['NaN', Number.NaN],
  ['positive Infinity', Number.POSITIVE_INFINITY],
  ['negative Infinity', Number.NEGATIVE_INFINITY],
  ['undefined', undefined],
  ['null', null],
  ['numeric string', '0'],
  ['empty string', ''],
  ['false', false],
  ['true', true],
  ['bigint', 0n],
  ['symbol', Symbol('clock')],
  ['object', {}],
  ['coercible object', { valueOf: () => NOW - 2 }],
  ['throwing valueOf', { valueOf: () => { throw new Error('clock must not be coerced'); } }],
];

function tampered(patch: Record<string, unknown>): unknown {
  return { ...good, ...patch };
}

describe('merchant profile', () => {
  it('round-trips through JSON text', () => {
    const r = verifyMerchantProfile(JSON.stringify(good), NOW);
    expect(r).toEqual({ ok: true, profile: good });
    expect(good.merchantId).toMatch(/^[a-z2-7]{16}$/);
  });
  it('rejects changed amount, token, origin and allowAmount (signature)', () => {
    expect(verifyMerchantProfile(tampered({ templates: [{ id: 't1', amountMinor: '1', currency: 'USD', expires: 1800 }] }), NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyMerchantProfile(tampered({ tokens: ['DAI'] }), NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyMerchantProfile(tampered({ origins: ['https://evil.example'] }), NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyMerchantProfile(tampered({ allowAmount: true }), NOW)).toEqual({ ok: false, reason: 'signature' });
  });
  it('rejects bad signatures, wrong signer, wrong merchantId', () => {
    expect(verifyMerchantProfile(tampered({ sig: '0'.repeat(128) }), NOW)).toMatchObject({ ok: false });
    expect(verifyMerchantProfile(tampered({ sig: 'zz' }), NOW)).toEqual({ ok: false, reason: 'format' });
    expect(verifyMerchantProfile(tampered({ merchantId: 'aaaaaaaaaaaaaaaa' }), NOW)).toEqual({ ok: false, reason: 'format' });
    const other = signerPublicKeyHex(new Uint8Array(32).fill(9));
    expect(verifyMerchantProfile(tampered({ signer: other, merchantId: merchantIdFor(other) }), NOW)).toEqual({ ok: false, reason: 'signature' });
  });
  it('rejects expired profiles and oversize input', () => {
    expect(verifyMerchantProfile(JSON.stringify(good), NOW + 1000)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyMerchantProfile(' '.repeat(MAX_PROFILE_BYTES + 1), NOW)).toEqual({ ok: false, reason: 'size' });
  });
  it('rejects unknown keys, bad origins, duplicate template ids, __proto__ and non-objects', () => {
    expect(verifyMerchantProfile(tampered({ extra: 1 }), NOW)).toEqual({ ok: false, reason: 'format' });
    expect(verifyMerchantProfile(tampered({ origins: ['https://shop.example/path'] }), NOW)).toEqual({ ok: false, reason: 'format' });
    expect(verifyMerchantProfile(tampered({ origins: ['http://shop.example'] }), NOW)).toEqual({ ok: false, reason: 'format' });
    expect(verifyMerchantProfile(tampered({ templates: [good.templates[0], good.templates[0]] }), NOW)).toEqual({ ok: false, reason: 'format' });
    expect(verifyMerchantProfile('{"__proto__":{}}', NOW)).toEqual({ ok: false, reason: 'format' });
    for (const x of [null, 1, 'x', [], undefined]) expect(verifyMerchantProfile(x, NOW)).toMatchObject({ ok: false });
  });
  it('refuses to sign with a mismatched key', () => {
    expect(() => signMerchantProfile(body, new Uint8Array(32).fill(9))).toThrow();
  });
  it('establishes a valid signature and ordinary expired control for the clock regression', () => {
    for (const input of [expired, JSON.stringify(expired)]) {
      expect(verifyMerchantProfile(input, expired.exp - 1)).toEqual({ ok: true, profile: expired });
      expect(verifyMerchantProfile(input, NOW)).toEqual({ ok: false, reason: 'expired' });
    }
  });
  for (const encoding of ['object', 'JSON'] as const) {
    describe(`${encoding} signed profile clock`, () => {
      const input = encoding === 'JSON' ? JSON.stringify(expired) : expired;
      it.each(invalidClocks)('rejects %s without coercion or throwing', (_name, now) => {
        // Deliberately exercise JavaScript callers that do not have the TypeScript parameter constraint.
        expect(verifyMerchantProfile(input, now as number)).toEqual({ ok: false, reason: 'expired' });
      });
      it.each([
        ['negative finite', -1],
        ['negative fractional', -0.5],
        ['minimum finite', -Number.MAX_VALUE],
        ['epoch', 0],
        ['negative zero', -0],
        ['smallest positive finite', Number.MIN_VALUE],
        ['whole second before expiry', expired.exp - 1],
        ['fractional second before expiry', expired.exp - 0.25],
      ] as const)('preserves valid comparison at %s', (_name, now) => {
        expect(verifyMerchantProfile(input, now)).toEqual({ ok: true, profile: expired });
      });
      it.each([
        ['exact expiry', expired.exp],
        ['fractional second after expiry', expired.exp + 0.25],
        ['ordinary current time', NOW],
        ['maximum safe integer', Number.MAX_SAFE_INTEGER],
        ['maximum finite', Number.MAX_VALUE],
      ] as const)('preserves expired comparison at %s', (_name, now) => {
        expect(verifyMerchantProfile(input, now)).toEqual({ ok: false, reason: 'expired' });
      });
    });
  }
  it('preserves size, format and signature error precedence when the clock is invalid', () => {
    for (const now of [Number.NaN, undefined, Symbol('clock')]) {
      expect(verifyMerchantProfile(' '.repeat(MAX_PROFILE_BYTES + 1), now as number)).toEqual({ ok: false, reason: 'size' });
      expect(verifyMerchantProfile({ ...expired, extra: 1 }, now as number)).toEqual({ ok: false, reason: 'format' });
      expect(verifyMerchantProfile({ ...expired, name: 'Forged' }, now as number)).toEqual({ ok: false, reason: 'signature' });
    }
  });
  it('fuzz: random single-char mutations never throw and never verify to a different profile', () => {
    let s = 12345;
    const rnd = (): number => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const text = JSON.stringify(good);
    for (let i = 0; i < 500; i++) {
      const pos = Math.floor(rnd() * text.length);
      const m = text.slice(0, pos) + String.fromCharCode(32 + Math.floor(rnd() * 95)) + text.slice(pos + 1);
      if (m === text) continue;
      const r = verifyMerchantProfile(m, NOW);
      if (r.ok) expect(r.profile).toEqual(good);
    }
  });
});
