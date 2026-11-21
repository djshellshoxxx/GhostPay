import { describe, expect, it } from 'vitest';
import { PaymentUriError } from './errors.js';
import { buildQuery, pctDecode, pctEncode } from './query.js';

function expectInvalidEncoding(encode: () => string): void {
  let thrown: unknown;
  try {
    encode();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(PaymentUriError);
  expect((thrown as PaymentUriError).code).toBe('INVALID_ENCODING');
}

describe('query percent encoding preserves UTF-16 scalar values', () => {
  it('rejects unpaired high and low surrogates instead of replacing them with U+FFFD', () => {
    for (const value of ['\uD800', '\uDFFF', 'before\uD800after', 'before\uDC00after']) {
      expectInvalidEncoding(() => pctEncode(value));
    }
  });

  it('rejects malformed UTF-16 through the exported query builder', () => {
    expectInvalidEncoding(() => buildQuery([['memo', 'before\uD800after']]));
    expectInvalidEncoding(() => buildQuery([['memo', '\uDC00']]));
  });

  it('accepts intact surrogate pairs and round-trips normal Unicode unchanged', () => {
    const value = 'memo 😀 é + %';
    const encoded = pctEncode(value);
    expect(encoded).toContain('%F0%9F%98%80');
    expect(encoded).toContain('%C3%A9');
    expect(pctDecode(encoded)).toBe(value);
    expect(buildQuery([['memo', value]])).toBe('memo=' + encoded);
  });

  it('rejects a dangling surrogate even next to a valid pair', () => {
    expectInvalidEncoding(() => pctEncode('😀\uD800'));
    expectInvalidEncoding(() => pctEncode('\uDC00😀'));
  });
});
