import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Base64UrlError, decodeBase64Url, encodeBase64Url } from './index.js';

describe('base64url', () => {
  it('matches Node base64url for arbitrary bytes and round trips', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        const enc = encodeBase64Url(bytes);
        expect(enc).toBe(Buffer.from(bytes).toString('base64url'));
        expect(decodeBase64Url(enc)).toEqual(bytes);
      }),
      { numRuns: 300 },
    );
  });
  it('rejects padding, std alphabet, whitespace, non-ASCII, impossible lengths', () => {
    for (const bad of ['QQ==', 'QQ=', 'a+b/', 'a b', 'ab\n', 'é', 'A', 'AAAAA', '\u0000AAA', 'ab\u{1F600}']) {
      expect(() => decodeBase64Url(bad)).toThrow(Base64UrlError);
    }
  });
  it('rejects non-canonical trailing bits', () => {
    expect(decodeBase64Url('QQ')).toEqual(Uint8Array.of(0x41));
    expect(() => decodeBase64Url('QR')).toThrow(Base64UrlError); // 0x41 with a stray low bit
    expect(() => decodeBase64Url('QUF')).toThrow(Base64UrlError);
    expect(decodeBase64Url('QUE')).toEqual(Uint8Array.of(0x41, 0x41));
  });
  it('empty string is empty bytes', () => {
    expect(decodeBase64Url('')).toEqual(new Uint8Array(0));
    expect(encodeBase64Url(new Uint8Array(0))).toBe('');
  });
});
