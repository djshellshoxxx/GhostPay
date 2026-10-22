/** Error codes thrown by `@ghostpay/pool-sdk`. */
export type PoolSdkErrorCode =
  | 'WRONG_CHAIN'
  | 'ROOT_MISMATCH'
  | 'ASP_SET_MISMATCH'
  | 'NOTE_SPENT'
  | 'CROWD_TOO_SMALL'
  | 'FEE_TOO_HIGH'
  | 'VECTOR_MISMATCH'
  | 'BAD_RECIPIENT'
  | 'INVALID_INPUT'
  | 'NOTE_NOT_FOUND'
  | 'STORE_CORRUPT'
  | 'RELAYER_ERROR';

/**
 * Typed SDK error. Messages never contain secret material (nullifier, secret, seed).
 *
 * @security Callers may log `code` and `message`.
 */
export class PoolSdkError extends Error {
  public readonly code: PoolSdkErrorCode;

  public constructor(code: PoolSdkErrorCode, message: string) {
    super(message);
    this.name = 'PoolSdkError';
    this.code = code;
  }
}

/** Throws a {@link PoolSdkError}. */
export function fail(code: PoolSdkErrorCode, message: string): never {
  throw new PoolSdkError(code, message);
}
