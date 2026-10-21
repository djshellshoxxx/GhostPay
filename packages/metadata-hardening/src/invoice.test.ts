import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { coarsenExpiry, coarsenQuoteTimestamp, padLengthFor, padPrivatePart, stripPrivatePad } from './invoice.js';
import { MetadataHardeningError } from './guard.js';

// Stand-in canonicalizer: sorted keys, no whitespace (same shape as invoice-schema canonical JSON).
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
const enc = new TextEncoder();

describe('MH-INV-1 padding', () => {
  it('plans pad lengths', () => {
    expect(padLengthFor(2)).toEqual({ target: 256, padChars: 245 });
    expect(padLengthFor(247)).toEqual({ target: 256, padChars: 0 });
    expect(padLengthFor(248)).toEqual({ target: 1024, padChars: 767 });
    expect(() => padLengthFor(4088)).toThrow(MetadataHardeningError);
    expect(() => padLengthFor(1)).toThrow(MetadataHardeningError);
    expect(() => padLengthFor(10, [])).toThrow(MetadataHardeningError);
  });
  it('fuzz 1000 memos: plaintext lengths on the bucket set (<= 3 distinct), round trip identical', () => {
    const lengths = new Set<number>();
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }), (memo, items) => {
        const part = { lineItems: items, memo };
        const padded = padPrivatePart(part, canon);
        lengths.add(enc.encode(canon(padded)).length);
        return canon(stripPrivatePad(padded)) === canon(part);
      }),
      { numRuns: 1000 },
    );
    expect(lengths.size).toBeLessThanOrEqual(3);
    for (const l of lengths) expect([256, 1024, 4096]).toContain(l);
  });
  it('padded and unpadded both strip; non-canonical padding rejected', () => {
    expect(stripPrivatePad({ memo: 'a' })).toEqual({ memo: 'a' });
    expect(stripPrivatePad({ memo: 'a', pad: '000' })).toEqual({ memo: 'a' });
    expect(() => stripPrivatePad({ memo: 'a', pad: '0a0' })).toThrow(MetadataHardeningError);
    expect(() => stripPrivatePad({ memo: 'a', pad: 0 })).toThrow(MetadataHardeningError);
  });
  it('rejects existing pad and a canonicalizer that cannot reach the bucket', () => {
    expect(() => padPrivatePart({ pad: '' }, canon)).toThrow(MetadataHardeningError);
    expect(() => padPrivatePart({ memo: 'a' }, () => '{"memo":"a"}'.replace('a', 'ab'))).toThrow(MetadataHardeningError);
  });
});

describe('MH-INV-3 coarse time', () => {
  const c = { chainId: 84532 };
  it('expiry rounds up within one grid', () => {
    expect(coarsenExpiry(1_700_000_000, c)).toBe(1_700_002_800);
    expect(coarsenExpiry(3600, c)).toBe(3600);
    expect(coarsenExpiry(3601, c)).toBe(7200);
    expect(coarsenExpiry(0, c)).toBe(0);
  });
  it('property: expiry in [req, req+grid); quote ts in (now-grid, now]; both on grid', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), fc.integer({ min: 0, max: 86_400 }), fc.integer({ min: 1, max: 86_400 }), (t, d, g) => {
        const e = coarsenExpiry(t + d, { ...c, gridSec: g });
        const q = coarsenQuoteTimestamp(t, t + d, { ...c, gridSec: g });
        return e >= t + d && e < t + d + g && e % g === 0 && q <= t && q > t - g && q % g === 0;
      }),
    );
  });
  it('100 invoices land on the hour grid', () => {
    for (let i = 0; i < 100; i++) {
      const now = 1_760_000_000 + i * 977;
      expect(coarsenExpiry(now + 86_400, c) % 3600).toBe(0);
      expect(coarsenQuoteTimestamp(now, now, c) % 3600).toBe(0);
    }
  });
  it('validates', () => {
    expect(() => coarsenQuoteTimestamp(10, 5, c)).toThrow(MetadataHardeningError);
    expect(() => coarsenExpiry(-1, c)).toThrow(MetadataHardeningError);
    expect(() => coarsenExpiry(1, { ...c, gridSec: 0 })).toThrow(MetadataHardeningError);
    expect(() => coarsenExpiry(1, { chainId: 1 })).toThrow(MetadataHardeningError);
  });
});
