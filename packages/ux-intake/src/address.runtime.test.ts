import { describe, expect, it } from 'vitest';
import { validateAddress } from './address.js';
import { BECH, BECHM, EVM } from './fixtures.testutil.js';

describe('validateAddress runtime input boundary', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['array', []],
    ['object', {}],
    ['bigint', 2n],
    ['symbol', Symbol('untrusted-address')],
    ['boolean', true],
  ] as const)('returns a typed bad-address result for %s', (_name, value) => {
    // JSON, plugin and JavaScript entry points can bypass the TypeScript string annotation.
    expect(() => validateAddress(value as unknown as string)).not.toThrow();
    expect(validateAddress(value as unknown as string)).toEqual({ ok: false, code: 'bad-address' });
  });

  it('preserves valid and invalid typed address handling', () => {
    expect(validateAddress(EVM)).toMatchObject({
      ok: true,
      value: { family: 'evm', canonical: EVM, checksumUnverified: false },
    });
    expect(validateAddress(BECH)).toMatchObject({
      ok: true,
      value: { family: 'bech32', canonical: BECH },
    });
    expect(validateAddress(BECHM)).toMatchObject({ ok: true, value: { family: 'bech32' } });
    expect(validateAddress('0x' + '0'.repeat(40))).toEqual({ ok: false, code: 'bad-address' });
    expect(validateAddress('invalid address')).toEqual({ ok: false, code: 'bad-address' });
  });
});
