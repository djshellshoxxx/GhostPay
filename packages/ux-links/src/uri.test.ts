import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildPaymentUri, parsePaymentUri, redactUri, MAX_URI_LENGTH } from './uri.js';
import { checkQrCapacity, buildQrPayload } from './qr.js';
import { code, META_A, SECRET } from './fixtures.testutil.js';

describe('uri build/parse', () => {
  it('canonical vector', () => {
    const u = buildPaymentUri({
      target: META_A,
      amount: '12.5',
      asset: 'USDC',
      chainId: 1,
      expiresAt: 1800003600,
      memo: 'Lunch & (tip)!',
      secret: SECRET,
    });
    expect(u).toBe(
      `ghostpay:${META_A}?amount=12.5&asset=USDC&chain=1&exp=1800003600&memo=Lunch%20%26%20%28tip%29%21#k=${SECRET}`,
    );
    expect(parsePaymentUri(u)).toEqual({
      target: META_A,
      amount: '12.5',
      asset: 'USDC',
      chainId: 1,
      expiresAt: 1800003600,
      memo: 'Lunch & (tip)!',
      secret: SECRET,
    });
  });
  it('target only and case-insensitive scheme', () => {
    expect(buildPaymentUri({ target: META_A })).toBe(`ghostpay:${META_A}`);
    expect(parsePaymentUri(`GhostPay:${META_A}`)).toEqual({ target: META_A });
  });
  it('round-trips arbitrary memos', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }), (m) => {
        let built: string;
        try {
          built = buildPaymentUri({ target: META_A, memo: m });
        } catch {
          return; // invalid text rejected consistently
        }
        expect(parsePaymentUri(built).memo).toBe(m);
      }),
    );
  });
  it('never throws a non-LinkError on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const c = code(() => parsePaymentUri(`ghostpay:${META_A}?${s}`));
        expect(c === undefined || /^[A-Z_]+$/.test(c)).toBe(true);
        expect(c).not.toBe('NON_LINKERROR');
      }),
    );
  });
  it('rejects secrets in the query, however named', () => {
    for (const k of [
      'k',
      'key',
      'secret',
      'seed',
      'privkey',
      'token',
      'password',
      'gpi',
      'Secret',
      'viewKey',
      'sig',
      'mnemonic',
    ]) {
      expect(
        code(() => parsePaymentUri(`ghostpay:${META_A}?${k}=${SECRET}`)),
        k,
      ).toBe('SECRET_IN_QUERY');
    }
  });
  it('rejects malformed links', () => {
    const t = META_A;
    const cases: [unknown, string][] = [
      [5, 'URI_FORMAT'],
      ['', 'URI_FORMAT'],
      [`http:${t}`, 'URI_FORMAT'],
      [`ghostpay:${t} `, 'URI_FORMAT'],
      [`ghostpay:${t}\n`, 'URI_FORMAT'],
      [`ghostpay:${t}?`, 'URI_FORMAT'],
      ['ghostpay:', 'TARGET'],
      [`ghostpay:${t}é`, 'URI_FORMAT'],
      [`ghostpay:${t}x`, 'TARGET'],
      ['x'.repeat(MAX_URI_LENGTH + 1), 'URI_TOO_LARGE'],
      [`ghostpay:${t}?amount`, 'PARAM'],
      [`ghostpay:${t}?=1`, 'PARAM'],
      [`ghostpay:${t}?foo=1`, 'PARAM'],
      [`ghostpay:${t}?amount=1&amount=2`, 'PARAM'],
      [`ghostpay:${t}?amount=`, 'PARAM'],
      [`ghostpay:${t}?amount=1.50`, 'AMOUNT'],
      [`ghostpay:${t}?amount=0`, 'AMOUNT'],
      [`ghostpay:${t}?amount=-1`, 'AMOUNT'],
      [`ghostpay:${t}?asset=usdc`, 'PARAM'],
      [`ghostpay:${t}?chain=0`, 'PARAM'],
      [`ghostpay:${t}?chain=01`, 'PARAM'],
      [`ghostpay:${t}?chain=99999999999999999`, 'PARAM'],
      [`ghostpay:${t}?exp=1.5`, 'PARAM'],
      [`ghostpay:${t}?memo=a+b`, 'PARAM'],
      [`ghostpay:${t}?memo=%zz`, 'PARAM'],
      [`ghostpay:${t}?memo=%e9`, 'PARAM'],
      [`ghostpay:${t}?memo=%7e`, 'PARAM'],
      [`ghostpay:${t}?memo=%41`, 'PARAM'],
      [`ghostpay:${t}?memo=%0A`, 'TEXT'],
      [`ghostpay:${t}?memo=%E2%80%AE`, 'TEXT'],
      [`ghostpay:${t}?memo=a!b`, 'PARAM'],
      [`ghostpay:${t}#`, 'FRAGMENT'],
      [`ghostpay:${t}#x=1`, 'FRAGMENT'],
      [`ghostpay:${t}#k=short`, 'FRAGMENT'],
      [`ghostpay:${t}#k=${SECRET}=`, 'FRAGMENT'],
    ];
    for (const [u, c] of cases)
      expect(
        code(() => parsePaymentUri(u)),
        String(u).slice(0, 80),
      ).toBe(c);
  });
  it('build validates fields', () => {
    expect(code(() => buildPaymentUri({ target: 'x' }))).toBe('TARGET');
    expect(code(() => buildPaymentUri({ target: META_A, amount: '1.0' }))).toBe('AMOUNT');
    expect(code(() => buildPaymentUri({ target: META_A, asset: 'x' }))).toBe('PARAM');
    expect(code(() => buildPaymentUri({ target: META_A, chainId: 0 }))).toBe('PARAM');
    expect(code(() => buildPaymentUri({ target: META_A, expiresAt: -1 }))).toBe('PARAM');
    expect(code(() => buildPaymentUri({ target: META_A, memo: '' }))).toBe('TEXT');
    expect(code(() => buildPaymentUri({ target: META_A, secret: 'bad!' }))).toBe('FRAGMENT');
    const worst = buildPaymentUri({
      target: META_A,
      amount: '1'.repeat(20) + '.' + '1'.repeat(18),
      asset: 'ABCDEFGHIJKL',
      chainId: Number.MAX_SAFE_INTEGER,
      expiresAt: Number.MAX_SAFE_INTEGER,
      memo: '😀'.repeat(140),
      secret: 'A'.repeat(86),
    });
    expect(worst.length).toBeLessThan(MAX_URI_LENGTH);
    expect(parsePaymentUri(worst).memo).toBe('😀'.repeat(140));
  });
  it('error messages never echo input', () => {
    try {
      parsePaymentUri(`ghostpay:${META_A}?secret=${SECRET}`);
    } catch (e) {
      expect(String((e as Error).message)).not.toContain(SECRET);
    }
  });
  it('redacts fragment', () => {
    expect(redactUri(`ghostpay:${META_A}#k=${SECRET}`)).toBe(`ghostpay:${META_A}#[redacted]`);
    expect(redactUri('abc')).toBe('abc');
  });
});

describe('qr', () => {
  it('known capacity anchors', () => {
    expect(checkQrCapacity('a'.repeat(14), 'M')).toMatchObject({
      minVersion: 1,
      fits: true,
      density: 'good',
      bytes: 14,
    });
    expect(checkQrCapacity('a'.repeat(15), 'M').minVersion).toBe(2);
    expect(checkQrCapacity('a'.repeat(2953), 'L').minVersion).toBe(40);
    expect(checkQrCapacity('a'.repeat(2331), 'M').minVersion).toBe(40);
    expect(checkQrCapacity('a'.repeat(1273), 'H').minVersion).toBe(40);
    expect(checkQrCapacity('a'.repeat(2954), 'L')).toMatchObject({
      fits: false,
      minVersion: null,
      density: 'none',
    });
    expect(checkQrCapacity('a'.repeat(7), 'H').minVersion).toBe(1);
    expect(checkQrCapacity('a'.repeat(500), 'Q').density).toBe('dense');
    expect(checkQrCapacity('a'.repeat(1500), 'M').density).toBe('very-dense');
  });
  it('counts UTF-8 bytes and validates args', () => {
    expect(checkQrCapacity('é'.repeat(7), 'M').bytes).toBe(14);
    expect(code(() => checkQrCapacity(''))).toBe('QR');
    expect(code(() => checkQrCapacity(5 as unknown as string))).toBe('QR');
    expect(code(() => checkQrCapacity('a', 'X' as 'L'))).toBe('QR');
    expect(code(() => checkQrCapacity('a', 'toString' as 'L'))).toBe('QR');
  });
  it('tables are monotonic and ordered L>M>Q>H', () => {
    for (const n of [1, 17, 100, 500, 1000, 1273]) {
      const v = (['L', 'M', 'Q', 'H'] as const).map(
        (e) => checkQrCapacity('a'.repeat(n), e).minVersion ?? 99,
      );
      expect(v[0]!).toBeLessThanOrEqual(v[1]!);
      expect(v[1]!).toBeLessThanOrEqual(v[2]!);
      expect(v[2]!).toBeLessThanOrEqual(v[3]!);
    }
    let last = 0;
    for (let n = 1; n <= 2331; n += 7) {
      const mv = checkQrCapacity('a'.repeat(n), 'M').minVersion!;
      expect(mv).toBeGreaterThanOrEqual(last);
      last = mv;
    }
  });
  it('buildQrPayload', () => {
    const r = buildQrPayload({ target: META_A, amount: '1', asset: 'USDC' });
    expect(r.payload.startsWith('ghostpay:')).toBe(true);
    expect(r.capacity.fits).toBe(true);
    expect(
      code(() =>
        buildQrPayload(
          { target: META_A, memo: 'x'.repeat(140), secret: SECRET },
          { ecc: 'H', maxVersion: 5 },
        ),
      ),
    ).toBe('QR');
    expect(code(() => buildQrPayload({ target: META_A }, { maxVersion: 41 }))).toBe('QR');
    expect(code(() => buildQrPayload({ target: META_A }, { maxVersion: 0 }))).toBe('QR');
    expect(code(() => buildQrPayload({ target: META_A, memo: 'x'.repeat(140) }, { maxVersion: 1 }))).toBe(
      'QR',
    );
  });
  it('typical link needs a modest version', () => {
    const u = buildPaymentUri({ target: META_A, amount: '10', asset: 'USDC', expiresAt: 1800000000 });
    expect(checkQrCapacity(u, 'M').minVersion).toBeLessThanOrEqual(10);
  });
});
