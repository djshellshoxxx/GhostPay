import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode } from './base64url.js';
import { FlowError } from './errors.js';

function failureCode(value: unknown): string {
  try {
    b64urlDecode(value as string);
    return 'ACCEPTED';
  } catch (e) {
    return e instanceof FlowError ? e.code : 'NON_FLOW';
  }
}

describe('base64url decoder runtime input boundary', () => {
  it('rejects every non-string runtime value using the existing typed encoding error', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      0,
      42,
      false,
      true,
      Symbol('invalid'),
      [],
      ['QQ'],
      new String('QQ'),
      { length: 2, charAt: () => 'Q' },
    ];
    for (const value of malformed) {
      expect(failureCode(value)).toBe('PROOF_ENCODING');
    }
  });

  it('retains exact canonical decoding and encoding of valid string inputs', () => {
    expect(b64urlDecode('')).toEqual(new Uint8Array());
    expect(b64urlDecode('QQ')).toEqual(new Uint8Array([65]));
    expect(b64urlDecode('SGVsbG8')).toEqual(new TextEncoder().encode('Hello'));
    for (let length = 0; length <= 64; length++) {
      const original = Uint8Array.from({ length }, (_, i) => (i * 71 + 13) & 255);
      expect(b64urlDecode(b64urlEncode(original))).toEqual(original);
    }
  });

  it('continues rejecting noncanonical or invalid strings with FlowError', () => {
    for (const s of ['A', 'QR', 'QQ==', 'a+b/', 'a b', 'AA=', 'SGVsbG8!']) {
      expect(failureCode(s)).toBe('PROOF_ENCODING');
    }
  });
});
