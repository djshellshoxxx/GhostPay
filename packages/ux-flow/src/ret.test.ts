import { describe, expect, it } from 'vitest';
import { b64urlEncode } from './base64url.js';
import { FlowError } from './errors.js';
import { encodeProof } from './proof.js';
import {
  buildReturnUrl,
  canonicalOrigin,
  checkSignedReturn,
  isAllowedReturn,
  returnStateMessage,
  verifyProofOffline,
} from './ret.js';

const TX = '0x' + 'cd'.repeat(32);
const NONCE = 'deadbeefdeadbeefdeadbeefdeadbeef';
const PROOF = encodeProof({ nonce: NONCE, chainId: 1, txHash: TX });
const O = 'https://shop.example.com';
const inv = { returnOrigin: O };
const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof FlowError ? e.code : 'NON_FLOW';
  }
  return undefined;
};

describe('canonicalOrigin', () => {
  it('accepts exact https origins only', () => {
    expect(canonicalOrigin(O)).toBe(O);
    expect(canonicalOrigin('https://shop.example.com:8443')).toBe('https://shop.example.com:8443');
    expect(canonicalOrigin('http://localhost:3000')).toBeNull();
    expect(canonicalOrigin('http://localhost:3000', true)).toBe('http://localhost:3000');
    for (const bad of [
      undefined,
      '',
      'x',
      `${O}/`,
      `${O}/p`,
      'HTTPS://shop.example.com',
      'https://u@shop.example.com',
      'http://shop.example.com',
      'https://' + 'a'.repeat(300) + '.com',
      `${O}?a`,
    ]) {
      expect(canonicalOrigin(bad)).toBeNull();
    }
  });
});

describe('buildReturnUrl', () => {
  it('T-2 fragment only, no "?"', () => {
    const u = buildReturnUrl(O, PROOF);
    expect(u).toBe(`${O}/#proof=${PROOF}`);
    expect(u).not.toContain('?');
    expect(new URL(u).search).toBe('');
    expect(buildReturnUrl(O, PROOF, '/orders/thanks')).toBe(`${O}/orders/thanks#proof=${PROOF}`);
  });
  it('rejects bad origin, proof, path', () => {
    expect(code(() => buildReturnUrl('http://shop.example.com', PROOF))).toBe('BAD_ORIGIN');
    expect(code(() => buildReturnUrl(`${O}/x`, PROOF))).toBe('BAD_ORIGIN');
    expect(code(() => buildReturnUrl(O, 'x'.repeat(600)))).toBe('PROOF_TOO_LARGE');
    expect(code(() => buildReturnUrl(O, 5 as unknown as string))).toBe('PROOF_TOO_LARGE');
    expect(code(() => buildReturnUrl(O, 'AAAA'))).toBe('PROOF_FORMAT');
    for (const p of ['x', '//evil.com', '/a?b=1', '/a#b', '/../x', '/a/./b', '/a\\b', '/a b']) {
      expect(code(() => buildReturnUrl(O, PROOF, p))).toBe('BAD_RETURN');
    }
  });
});

describe('isAllowedReturn', () => {
  it('T-1 accepts exact origin, rejects lookalikes and http', () => {
    expect(isAllowedReturn(inv, `${O}/thanks#proof=${PROOF}`)).toBe(true);
    expect(isAllowedReturn(inv, O)).toBe(true);
    for (const t of [
      'https://shop.example.com.evil.net/',
      'https://evil.net/https://shop.example.com/',
      'https://shop-example.com/',
      'https://sub.shop.example.com/',
      'http://shop.example.com/',
      'https://shop.example.com:444/',
      'https://shop.example.com@evil.net/',
      'https://user:pw@shop.example.com/',
      'https://shop.example.com\\@evil.net/',
      'https:\\\\evil.net/',
      '//evil.net/',
      '/relative',
      'javascript:alert(1)',
      'data:text/html,x',
      `${O}/a?next=https://evil.net`,
      ` ${O}/`,
      `${O}/\n`,
      `${O}/a\tb`,
      'https:evil.net',
      '',
      'https://shop.example.com/' + 'a'.repeat(3000),
    ])
      expect(isAllowedReturn(inv, t)).toBe(false);
    expect(isAllowedReturn(inv, 5)).toBe(false);
  });
  it('EMBED-3 hidden without returnOrigin; invalid origin never allows', () => {
    expect(isAllowedReturn({}, `${O}/`)).toBe(false);
    expect(isAllowedReturn({ returnOrigin: '*' }, `${O}/`)).toBe(false);
    expect(isAllowedReturn({ returnOrigin: `${O}/` }, `${O}/`)).toBe(false);
    expect(isAllowedReturn({ returnOrigin: 'https://*.example.com' }, 'https://a.example.com/')).toBe(false);
  });
  it('rejects targets that parse to the origin but are not verbatim (parser tolerance)', () => {
    expect(isAllowedReturn(inv, 'https://SHOP.example.com/')).toBe(false);
    expect(isAllowedReturn(inv, 'HTTPS://shop.example.com/')).toBe(false);
  });
});

describe('verifyProofOffline', () => {
  const exp = { nonce: NONCE, chainId: 1, txHash: TX };
  it('accepts matching; mismatch and bad proof fail', () => {
    expect(verifyProofOffline(PROOF, exp)).toEqual({ ok: true, proof: exp });
    expect(verifyProofOffline(PROOF, { ...exp, txHash: TX.toUpperCase().replace('0X', '0x') }).ok).toBe(true);
    expect(verifyProofOffline(PROOF, { ...exp, chainId: 2 })).toEqual({ ok: false, error: 'MISMATCH' });
    expect(verifyProofOffline(PROOF, { ...exp, nonce: '00'.repeat(16) })).toEqual({
      ok: false,
      error: 'MISMATCH',
    });
    expect(verifyProofOffline(PROOF, { ...exp, txHash: '0x' + '11'.repeat(32) })).toEqual({
      ok: false,
      error: 'MISMATCH',
    });
    expect(verifyProofOffline('###', exp)).toEqual({ ok: false, error: 'BAD_PROOF' });
  });
});

describe('checkSignedReturn', () => {
  const SIG = b64urlEncode(new Uint8Array([1, 2, 3, 4]));
  const st = { returnOrigin: O, nonce: NONCE, signature: SIG };
  it('passes the exact message and decoded signature to the verifier', () => {
    let seen: [Uint8Array, Uint8Array] | undefined;
    const ok = checkSignedReturn(st, (m, s) => {
      seen = [m, s];
      return true;
    });
    expect(ok).toBe(true);
    expect(new TextDecoder().decode(seen?.[0])).toBe(`ghostpay-return-v1\n${O}\n${NONCE}`);
    expect(seen?.[0]).toEqual(returnStateMessage(O, NONCE));
    expect(Array.from(seen?.[1] ?? [])).toEqual([1, 2, 3, 4]);
  });
  it('fails closed', () => {
    expect(checkSignedReturn(st, () => false)).toBe(false);
    expect(checkSignedReturn(st, (() => 'yes') as never)).toBe(false);
    expect(
      checkSignedReturn(st, () => {
        throw new Error('boom');
      }),
    ).toBe(false);
    expect(checkSignedReturn({ ...st, returnOrigin: `${O}/` }, () => true)).toBe(false);
    expect(checkSignedReturn({ ...st, nonce: 'XYZ' }, () => true)).toBe(false);
    expect(checkSignedReturn({ ...st, nonce: 5 as never }, () => true)).toBe(false);
    expect(checkSignedReturn({ ...st, signature: '***' }, () => true)).toBe(false);
    expect(checkSignedReturn({ ...st, signature: 'A'.repeat(2000) }, () => true)).toBe(false);
    expect(checkSignedReturn({ ...st, signature: 5 as never }, () => true)).toBe(false);
  });
  it('T-3 tampered origin changes the signed message', () => {
    const real = returnStateMessage(O, NONCE);
    const verifier = (m: Uint8Array): boolean => m.length === real.length && m.every((b, i) => b === real[i]);
    expect(checkSignedReturn(st, verifier)).toBe(true);
    expect(checkSignedReturn({ ...st, returnOrigin: 'https://evil.example.com' }, verifier)).toBe(false);
  });
});
