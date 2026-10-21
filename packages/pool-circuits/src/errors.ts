/** Error codes raised by `@ghostpay/pool-circuits` helpers. */
export type PoolCircuitErrorCode =
  | 'WRONG_CHAIN'
  | 'NOT_FIELD'
  | 'OUT_OF_RANGE'
  | 'SAME_NULLIFIER'
  | 'BAD_INDEX'
  | 'BAD_PROOF_SHAPE'
  | 'ASP_LABEL_MISSING';

/**
 * Typed error for this package. Messages never contain secret values (nullifier, secret).
 *
 * @security Callers may log `code`; `message` is safe to log (no witness data).
 */
export class PoolCircuitError extends Error {
  public readonly code: PoolCircuitErrorCode;

  public constructor(code: PoolCircuitErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'PoolCircuitError';
    this.code = code;
  }
}

/** Throws a {@link PoolCircuitError}. */
export function fail(code: PoolCircuitErrorCode, message: string): never {
  throw new PoolCircuitError(code, message);
}
