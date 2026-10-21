import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { b64urlDecode, b64urlEncode } from './base64url.js';
import { FlowError } from './errors.js';
import { decodeProof, encodeProof, normalizeTxHash } from './proof.js';

const TX = '0x' + 'ab'.repeat(32);
const NONCE = '00112233445566778899aabbccddeeff';
const P = { nonce: NONCE, chainId: 8453, txHash: TX };
const enc = (s: string): string => b64urlEncode(new TextEncoder().encode(s));
const code = (e: unknown): string | undefined => (e instanceof FlowError ? e.code : undefined);
const fails = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return code(e) ?? 'NON_FLOW';
  }
  return undefined;
};

describe('base64url', () => {
  it('round-trips arbitrary bytes and is canonical', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (b) => {
        const s = b64urlEncode(b);
        expect(b64urlDecode(s)).toEqual(b);
        expect(s).not.toMatch(/[=+/]/);
      }),
    );
  });
  it('rejects padding, other alphabet, bad length, trailing bits', () => {
    expect(fails(() => b64urlDecode('QQ=='))).toBe('PROOF_ENCODING');
    expect(fails(() => b64urlDecode('a+b/'))).toBe('PROOF_ENCODING');
    expect(fails(() => b64urlDecode('QUJDR'))).toBe('PROOF_ENCODING');
    expect(fails(() => b64urlDecode('QR'))).toBe('PROOF_ENCODING'); // 'QR' has non-zero trailing bits ('QQ' is canonical)
    expect(b64urlEncode(b64urlDecode('QQ'))).toBe('QQ');
  });
});

describe('proof codec', () => {
  it('encodes to a fixed vector and decodes back', () => {
    const s = encodeProof(P);
    expect(s).toBe(enc(`{"v":1,"n":"${NONCE}","c":8453,"t":"${TX}"}`));
    expect(decodeProof(s)).toEqual(P);
  });
  it('T-4 fuzz: decodeProof only throws FlowError', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 700 }), (s) => {
        const r = fails(() => decodeProof(s));
        expect(r === undefined || r !== 'NON_FLOW').toBe(true);
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 120 }), (b) => {
        expect(fails(() => decodeProof(b64urlEncode(b)))).not.toBe('NON_FLOW');
      }),
      { numRuns: 500 },
    );
  });
  it('rejects oversize (PAYRE-2)', () => {
    expect(fails(() => decodeProof('A'.repeat(513)))).toBe('PROOF_TOO_LARGE');
  });
  it('rejects non-string, bad json, arrays, extra keys, unknown/missing version, bad types', () => {
    expect(fails(() => decodeProof(5 as unknown as string))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc('not json')))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc('[]')))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc('null')))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc(`{"v":2,"n":"${NONCE}","c":1,"t":"${TX}"}`)))).toBe('PROOF_VERSION');
    expect(fails(() => decodeProof(enc(`{"v":"1","n":"${NONCE}","c":1,"t":"${TX}"}`)))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc(`{"v":1,"n":"${NONCE}","c":1,"t":"${TX}","x":1}`)))).toBe(
      'PROOF_FORMAT',
    );
    expect(fails(() => decodeProof(enc(`{"v":1,"n":5,"c":1,"t":"${TX}"}`)))).toBe('PROOF_FORMAT');
  });
  it('rejects bad hex, uppercase hash, bad chain, and non-canonical JSON', () => {
    expect(fails(() => decodeProof(enc(`{"v":1,"n":"${NONCE}","c":1,"t":"0x${'zz'.repeat(32)}"}`)))).toBe(
      'BAD_TX_HASH',
    );
    expect(fails(() => decodeProof(enc(`{"v":1,"n":"${NONCE}","c":1,"t":"0x${'AB'.repeat(32)}"}`)))).toBe(
      'BAD_TX_HASH',
    );
    expect(fails(() => decodeProof(enc(`{"v":1,"n":"${NONCE}","c":0,"t":"${TX}"}`)))).toBe('BAD_CHAIN');
    expect(fails(() => decodeProof(enc(`{"v":1,"n":"xyz","c":1,"t":"${TX}"}`)))).toBe('BAD_NONCE');
    expect(fails(() => decodeProof(enc(`{ "v":1,"n":"${NONCE}","c":1,"t":"${TX}"}`)))).toBe('PROOF_FORMAT');
    expect(fails(() => decodeProof(enc(`{"n":"${NONCE}","v":1,"c":1,"t":"${TX}"}`)))).toBe('PROOF_FORMAT');
  });
  it('rejects invalid utf-8', () => {
    expect(fails(() => decodeProof(b64urlEncode(new Uint8Array([0xff, 0xfe, 0xfd]))))).toBe('PROOF_ENCODING');
  });
  it('encodeProof validates', () => {
    expect(fails(() => encodeProof({ ...P, txHash: TX.toUpperCase() }))).toBe('BAD_TX_HASH');
    expect(fails(() => encodeProof({ ...P, chainId: 1.5 }))).toBe('BAD_CHAIN');
    expect(fails(() => encodeProof({ ...P, nonce: 'AB' }))).toBe('BAD_NONCE');
    expect(fails(() => normalizeTxHash(1 as unknown as string))).toBe('BAD_TX_HASH');
    expect(normalizeTxHash(TX.toUpperCase().replace('0X', '0x'))).toBe(TX);
  });
});
