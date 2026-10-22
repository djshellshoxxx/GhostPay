import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import {
  assertHandle,
  buildConfidentialMetadata,
  isConfidentialMetadata,
  parseConfidentialMetadata,
} from './metadata.js';
import { TOKEN } from './fixtures.testutil.js';
import { CtError } from './errors.js';

const H: Hex = `0x${'ab'.repeat(32)}`;

describe('confidential metadata codec (T4)', () => {
  it('builds exactly 57 bytes with the documented layout', () => {
    const m = buildConfidentialMetadata(0x7e, TOKEN, H);
    expect(m.length).toBe(57);
    expect(m[0]).toBe(0x7e);
    expect(bytesToHex(m.slice(1, 5))).toBe('0x5bebed7e');
    expect(bytesToHex(m.slice(5, 25))).toBe(TOKEN.toLowerCase());
    expect(bytesToHex(m.slice(25))).toBe(H);
  });

  it('round-trips (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.uint8Array({ minLength: 20, maxLength: 20 }), fc.uint8Array({ minLength: 32, maxLength: 32 }), (tag, tok, hnd) => {
        fc.pre(hnd.some((b) => b !== 0));
        const token = bytesToHex(tok);
        const handle = bytesToHex(hnd);
        const parsed = parseConfidentialMetadata(buildConfidentialMetadata(tag, token, handle));
        expect(parsed).not.toBeNull();
        expect(parsed?.viewTag).toBe(tag);
        expect(parsed?.token.toLowerCase()).toBe(token);
        expect(parsed?.amountHandle).toBe(handle);
      }),
    );
  });

  it('rejects wrong length', () => {
    const m = buildConfidentialMetadata(1, TOKEN, H);
    expect(parseConfidentialMetadata(m.slice(0, 56))).toBeNull();
    expect(parseConfidentialMetadata(new Uint8Array([...m, 0]))).toBeNull();
    expect(parseConfidentialMetadata(new Uint8Array())).toBeNull();
  });

  it('rejects the plaintext ERC-20 marker and any other selector byte flip', () => {
    const m = buildConfidentialMetadata(1, TOKEN, H);
    const plain = m.slice();
    plain.set(hexToBytes('0xa9059cbb'), 1);
    expect(parseConfidentialMetadata(plain)).toBeNull();
    for (let i = 1; i <= 4; i++) {
      const x = m.slice();
      x[i] = (x[i] ?? 0) ^ 0x01;
      expect(parseConfidentialMetadata(x)).toBeNull();
    }
  });

  it('rejects the zero handle on both paths', () => {
    const m = buildConfidentialMetadata(1, TOKEN, H);
    m.fill(0, 25);
    expect(parseConfidentialMetadata(m)).toBeNull();
    expect(() => buildConfidentialMetadata(1, TOKEN, `0x${'00'.repeat(32)}`)).toThrow(CtError);
  });

  it('validates builder inputs', () => {
    expect(() => buildConfidentialMetadata(256, TOKEN, H)).toThrow(CtError);
    expect(() => buildConfidentialMetadata(-1, TOKEN, H)).toThrow(CtError);
    expect(() => buildConfidentialMetadata(1.5, TOKEN, H)).toThrow(CtError);
    expect(() => buildConfidentialMetadata(1, '0x1234', H)).toThrow(CtError);
    expect(() => buildConfidentialMetadata(1, TOKEN, '0x1234')).toThrow(CtError);
  });

  it('isConfidentialMetadata mirrors parse', () => {
    expect(isConfidentialMetadata(buildConfidentialMetadata(1, TOKEN, H))).toBe(true);
    expect(isConfidentialMetadata(new Uint8Array(57))).toBe(false);
  });

  it('assertHandle', () => {
    expect(() => assertHandle(H, 'h')).not.toThrow();
    expect(() => assertHandle('0x12', 'h')).toThrow(/h must be/);
  });
});
