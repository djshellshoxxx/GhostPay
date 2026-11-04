import { describe, expect, it } from 'vitest';
import { clearSession, generateSession, getSessionPublic, type SessionPublic } from './session';
import { MAX_SELLER_PAIRING_BYTES, compareToLoaded, exportSellerPairing, parseSellerPairing } from './sellerPairing';

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

describe('seller public pairing schema', () => {
  it('round-trips public config and contains no key material fields', () => {
    const p = pub();
    const t = text(p, [137, 1, 1, 11155111]);
    expect(parseSellerPairing(t)).toEqual({ metaAddress: p.metaAddress, signerPublicKey: p.signerPublicKey, chainIds: [1, 137, 11155111] });
    expect(Object.keys(JSON.parse(t) as object).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(['chainIds', 'check', 'format', 'metaAddress', 'signerPublicKey', 'v']);
    expect(new TextEncoder().encode(t).byteLength).toBeLessThan(MAX_SELLER_PAIRING_BYTES);
  });
  it('refuses oversize input', () => {
    expect(() => parseSellerPairing(' '.repeat(MAX_SELLER_PAIRING_BYTES + 1) + text())).toThrow(/not a supported/);
    expect(() => parseSellerPairing('é'.repeat(MAX_SELLER_PAIRING_BYTES))).toThrow(/not a supported/);
  });
  it('refuses wrong version, wrong kind and unknown or missing fields', () => {
    const t = text();
    expect(() => parseSellerPairing(tamper(t, (o) => { o['v'] = 2; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['format'] = 'ghostpay-settings'; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['format'] = 'ghostpay-keystore'; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['extra'] = 1; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { delete o['signerPublicKey']; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing('[]')).toThrow(/not a supported/);
    expect(() => parseSellerPairing('not json')).toThrow(/not a supported/);
    expect(() => parseSellerPairing('{"v":1,"v":1}')).toThrow(/not a supported/);
  });
  it('refuses tampered fields (integrity check, meta-address, signer, chains)', () => {
    const t = text();
    const other = pub();
    expect(() => parseSellerPairing(tamper(t, (o) => { o['signerPublicKey'] = other.signerPublicKey; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['metaAddress'] = other.metaAddress; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['chainIds'] = [1]; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['check'] = '00000000'; }))).toThrow(/not a supported/);
    expect(() => parseSellerPairing(tamper(t, (o) => { o['metaAddress'] = 'x'; }))).toThrow(/not a supported/);
  });
  it('refuses bad chain lists and bad signer on export and import', () => {
    const p = pub();
    const bad = (ids: unknown): string => JSON.stringify({ format: 'ghostpay-seller-public', v: 1, metaAddress: p.metaAddress, signerPublicKey: p.signerPublicKey, chainIds: ids, check: 'zzzzzzzz' });
    for (const ids of ['1', [1.5], [-1], [0], Array.from({ length: 17 }, (_, i) => i + 1), [2 ** 40]]) expect(() => parseSellerPairing(bad(ids))).toThrow(/not a supported/);
    expect(() => exportSellerPairing(p, [1.5])).toThrow(/not a supported/);
    expect(() => exportSellerPairing(p, Array.from({ length: 17 }, (_, i) => i + 1))).toThrow(/not a supported/);
    expect(() => exportSellerPairing({ ...p, signerPublicKey: 'ab' }, [])).toThrow(/not a supported/);
  });
  it('compares an imported config with the loaded keys', () => {
    const p = pub();
    const r = parseSellerPairing(text(p));
    expect(compareToLoaded(r, p)).toBe('same');
    expect(compareToLoaded(r, pub())).toBe('different');
    expect(compareToLoaded(r, undefined)).toBe('none');
  });
});
