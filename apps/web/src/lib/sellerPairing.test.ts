import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { clearSession, generateSession, getSessionPublic, type SessionPublic } from './session';
import { MAX_SELLER_PAIRING_BYTES, compareToLoaded, exportSellerPairing, parseSellerPairing } from './sellerPairing';

const REFUSED = /not a supported/;
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function pub(): SessionPublic {
  clearSession();
  generateSession();
  const p = getSessionPublic()!;
  clearSession();
  return p;
}
const text = (p: SessionPublic = pub(), ids: readonly number[] = [11155111]): string => exportSellerPairing(p, ids);
const tamper = (s: string, f: (o: Record<string, unknown>) => void): string => {
  const o = JSON.parse(s) as Record<string, unknown>;
  f(o);
  return JSON.stringify(o);
};
/** Test-side copy of the documented check, so refusals below are proven to come from the field under test, not the check. */
function withValidCheck(o: Record<string, unknown>): string {
  const canonical = JSON.stringify(['ghostpay-seller-public', 1, o['metaAddress'], o['signerPublicKey'], o['chainIds']]);
  return JSON.stringify({ ...o, check: bytesToHex(sha256(utf8ToBytes(canonical))).slice(0, 8) });
}
const base = (p: SessionPublic, over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ format: 'ghostpay-seller-public', v: 1, metaAddress: p.metaAddress, signerPublicKey: p.signerPublicKey, chainIds: [1], ...over });

describe('seller public pairing schema', () => {
  it('round-trips public config and contains no key material fields', () => {
    const p = pub();
    const t = text(p, [137, 1, 1, 11155111]);
    expect(parseSellerPairing(t)).toEqual({ metaAddress: p.metaAddress, signerPublicKey: p.signerPublicKey, chainIds: [1, 137, 11155111] });
    expect(Object.keys(JSON.parse(t) as object).sort(byKey)).toEqual(['chainIds', 'check', 'format', 'metaAddress', 'signerPublicKey', 'v']);
    expect(new TextEncoder().encode(t).byteLength).toBeLessThan(MAX_SELLER_PAIRING_BYTES);
  });
  it('refuses oversize input, including multi-byte content inside a valid JSON string', () => {
    const p = pub();
    expect(() => parseSellerPairing(' '.repeat(MAX_SELLER_PAIRING_BYTES + 1) + text())).toThrow(REFUSED);
    const pad = JSON.stringify({ ...base(p), pad: 'é'.repeat(MAX_SELLER_PAIRING_BYTES / 2 + 1) });
    expect(pad.length).toBeLessThan(MAX_SELLER_PAIRING_BYTES + 200);
    expect(new TextEncoder().encode(pad).byteLength).toBeGreaterThan(MAX_SELLER_PAIRING_BYTES);
    expect(() => parseSellerPairing(pad)).toThrow(REFUSED);
    const multibyteUnderCharLimit = JSON.stringify({ ...base(p), pad: 'é'.repeat(900) });
    expect(multibyteUnderCharLimit.length).toBeLessThan(MAX_SELLER_PAIRING_BYTES);
    expect(new TextEncoder().encode(multibyteUnderCharLimit).byteLength).toBeGreaterThan(MAX_SELLER_PAIRING_BYTES);
    expect(() => parseSellerPairing(multibyteUnderCharLimit)).toThrow(REFUSED);
  });
  it('refuses wrong version, wrong kind and unknown or missing fields', () => {
    const t = text();
    expect(() => parseSellerPairing(tamper(t, (o) => { o['v'] = 2; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['format'] = 'ghostpay-settings'; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['format'] = 'ghostpay-keystore'; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['extra'] = 1; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { delete o['signerPublicKey']; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing('[]')).toThrow(REFUSED);
    expect(() => parseSellerPairing('not json')).toThrow(REFUSED);
  });
  it('refuses duplicate keys through the strict JSON parser', () => {
    const t = text();
    expect(t).toContain('"v":1');
    expect(() => parseSellerPairing(t.replace('"v":1', '"v":1,"v":1'))).toThrow(REFUSED);
    expect(() => parseSellerPairing(t.replace('"v":1', '"v":2,"v":1'))).toThrow(REFUSED);
  });
  it('refuses tampered fields (integrity check, meta-address, signer, chains)', () => {
    const t = text();
    const other = pub();
    expect(() => parseSellerPairing(tamper(t, (o) => { o['signerPublicKey'] = other.signerPublicKey; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['metaAddress'] = other.metaAddress; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['chainIds'] = [1]; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['check'] = '00000000'; }))).toThrow(REFUSED);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['metaAddress'] = 'x'; }))).toThrow(REFUSED);
  });
  it('accepts a correctly checked config built by the test (control for the refusal cases below)', () => {
    const p = pub();
    expect(parseSellerPairing(withValidCheck(base(p, { chainIds: [1, 5] })))).toMatchObject({ chainIds: [1, 5] });
  });
  it('refuses bad chain lists even when the integrity check is valid', () => {
    const p = pub();
    const tooMany = Array.from({ length: 17 }, (_, i) => i + 1);
    for (const ids of ['1', [1.5], [-1], [0], tooMany, [2, 1], [1, 1], [1, '2']]) {
      expect(() => parseSellerPairing(withValidCheck(base(p, { chainIds: ids })))).toThrow(REFUSED);
    }
    expect(() => exportSellerPairing(p, [1.5])).toThrow(REFUSED);
    expect(() => exportSellerPairing(p, tooMany)).toThrow(REFUSED);
  });
  it('refuses signers that are not valid compressed curve points, with a valid check', () => {
    const p = pub();
    const offCurve = ['02', '03'].flatMap((prefix) => [`${prefix}${'00'.repeat(32)}`, `${prefix}${'ff'.repeat(32)}`, `${prefix}${'00'.repeat(31)}05`]);
    for (const signer of offCurve) {
      expect(() => parseSellerPairing(withValidCheck(base(p, { signerPublicKey: signer })))).toThrow(REFUSED);
      expect(() => exportSellerPairing({ metaAddress: p.metaAddress, signerPublicKey: signer }, [])).toThrow(REFUSED);
    }
    expect(() => exportSellerPairing({ ...p, signerPublicKey: 'ab' }, [])).toThrow(REFUSED);
  });
  it('refuses a signing key equal to the spending or viewing key (key reuse)', () => {
    const p = pub();
    for (const reused of [p.spendingPublicKey, p.viewingPublicKey]) {
      expect(() => parseSellerPairing(withValidCheck(base(p, { signerPublicKey: reused })))).toThrow(REFUSED);
      expect(() => exportSellerPairing({ metaAddress: p.metaAddress, signerPublicKey: reused }, [])).toThrow(REFUSED);
    }
  });
  it('round-trips safe-integer chain ids above 2**32 that settings and invoices accept', () => {
    const p = pub();
    const ids = [1, 2 ** 40, Number.MAX_SAFE_INTEGER];
    expect(parseSellerPairing(exportSellerPairing(p, ids)).chainIds).toEqual(ids);
    expect(() => exportSellerPairing(p, [Number.MAX_SAFE_INTEGER + 1])).toThrow(REFUSED);
    expect(() => parseSellerPairing(withValidCheck(base(p, { chainIds: [2 ** 53] })))).toThrow(REFUSED);
  });
  it('compares an imported config with the loaded keys', () => {
    const p = pub();
    const r = parseSellerPairing(text(p));
    expect(compareToLoaded(r, p)).toBe('same');
    expect(compareToLoaded(r, pub())).toBe('different');
    expect(compareToLoaded(r, undefined)).toBe('none');
  });
});
