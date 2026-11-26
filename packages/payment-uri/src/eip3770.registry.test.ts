import { describe, expect, it } from 'vitest';
import { buildChainAddress, parseChainAddress, PaymentUriError } from './index.js';

const ADDRESS = '0x0000000000000000000000000000000000000001';

function expectChainIdError(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentUriError);
    expect((error as PaymentUriError).code).toBe('INVALID_CHAIN_ID');
    return;
  }
  throw new Error('expected INVALID_CHAIN_ID');
}

describe('EIP-3770 custom registry validation', () => {
  const invalidMappings: ReadonlyArray<readonly [string, unknown]> = [
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['numeric text', '8453'],
    ['bigint', 8453n],
    ['undefined', undefined],
  ];

  for (const [label, value] of invalidMappings) {
    it(`rejects ${label} registry chain IDs when parsing`, () => {
      const registry = { custom: value } as unknown as Readonly<Record<string, number>>;
      expectChainIdError(() => parseChainAddress(`custom:${ADDRESS}`, registry));
    });

    it(`rejects ${label} registry chain IDs when building`, () => {
      const registry = { custom: value } as unknown as Readonly<Record<string, number>>;
      expectChainIdError(() => buildChainAddress(value as number, ADDRESS, registry));
    });
  }

  it('rejects a reverse mapping with an invalid short name', () => {
    expectChainIdError(() => buildChainAddress(8453, ADDRESS, { bad_name: 8453 }));
  });

  it('preserves valid custom and default chain round trips', () => {
    expect(parseChainAddress(`custom:${ADDRESS}`, { custom: 99 })).toMatchObject({
      shortName: 'custom',
      chainId: 99,
      address: ADDRESS,
    });
    expect(buildChainAddress(99, ADDRESS, { custom: 99 })).toBe(`custom:${ADDRESS}`);
    expect(parseChainAddress(buildChainAddress(8453, ADDRESS))).toMatchObject({
      shortName: 'base',
      chainId: 8453,
      address: ADDRESS,
    });
  });
});
