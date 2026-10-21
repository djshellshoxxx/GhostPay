import { describe, expect, it } from 'vitest';
import { AddressSafetyError } from './errors.js';
import { metaAddressFingerprint, payeeTrust } from './meta.js';

describe('metaAddressFingerprint', () => {
  it('is stable (snapshot) and grouped', () => {
    expect(metaAddressFingerprint('gp1meta')).toMatch(/^([0-9a-f]{4}-){4}[0-9a-f]{4}$/);
  });

  it('matches a known SHA-256 prefix', () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223...
    expect(metaAddressFingerprint('abc')).toBe('ba78-16bf-8f01-cfea-4141');
  });

  it('differs for different inputs', () => {
    expect(metaAddressFingerprint('a')).not.toBe(metaAddressFingerprint('b'));
  });

  it('rejects empty, huge and non-string input', () => {
    expect(() => metaAddressFingerprint('')).toThrow(AddressSafetyError);
    expect(() => metaAddressFingerprint('x'.repeat(4097))).toThrow(AddressSafetyError);
    expect(() => metaAddressFingerprint(1 as unknown as string)).toThrow(AddressSafetyError);
  });
});

describe('payeeTrust', () => {
  it('invalid signature is invalid even if the key is pinned', () => {
    expect(payeeTrust({ signatureValid: false, signer: 'K1' }, ['K1'])).toBe('invalid');
  });

  it('pinned key (array or set, case-insensitive)', () => {
    expect(payeeTrust({ signatureValid: true, signer: 'abC' }, ['ABC'])).toBe('pinned');
    expect(payeeTrust({ signatureValid: true, signer: 'abc' }, new Set(['abc']))).toBe('pinned');
  });

  it('valid but unpinned', () => {
    expect(payeeTrust({ signatureValid: true, signer: 'k2' }, ['k1'])).toBe('unpinned_valid_signature');
    expect(payeeTrust({ signatureValid: true, signer: 'k2' }, new Set())).toBe('unpinned_valid_signature');
  });
});
