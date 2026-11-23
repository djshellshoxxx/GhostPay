import { describe, expect, it } from 'vitest';
import { buildSolanaPay, parseSolanaPay } from './solana.js';
import { PaymentUriError } from './errors.js';

const SYSTEM = '11111111111111111111111111111111';
const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';

describe('Solana Pay reference validation snapshot', () => {
  it('serializes only the references checked for uniqueness, reading each array value once', () => {
    const references = [SYSTEM, WRAPPED_SOL];
    let reads = 0;
    Object.defineProperty(references, '1', {
      configurable: true,
      get: () => {
        reads++;
        return reads === 1 ? WRAPPED_SOL : SYSTEM;
      },
    });

    const uri = buildSolanaPay({ recipient: SYSTEM, references });

    expect(reads).toBe(1);
    expect(parseSolanaPay(uri).references).toEqual([SYSTEM, WRAPPED_SOL]);
  });

  it('rejects identical references with the existing typed error', () => {
    expect(() => buildSolanaPay({ recipient: SYSTEM, references: [WRAPPED_SOL, WRAPPED_SOL] }))
      .toThrowError(PaymentUriError);
  });

  it('preserves ordinary reference order and repeated reference query keys', () => {
    const uri = buildSolanaPay({ recipient: SYSTEM, references: [SYSTEM, WRAPPED_SOL] });
    expect(parseSolanaPay(uri).references).toEqual([SYSTEM, WRAPPED_SOL]);
    expect(uri.match(/reference=/g)).toHaveLength(2);
  });

  it('rejects more than eight references even when they are caller-supplied', () => {
    expect(() => buildSolanaPay({ recipient: SYSTEM, references: Array.from({ length: 9 }, () => WRAPPED_SOL) }))
      .toThrowError(PaymentUriError);
  });

  it('rejects missing entries rather than silently dropping them', () => {
    const references = new Array<string>(2);
    references[0] = SYSTEM;
    expect(() => buildSolanaPay({ recipient: SYSTEM, references })).toThrowError(PaymentUriError);
  });
});
