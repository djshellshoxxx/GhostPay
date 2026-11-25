/**
 * P13 confidential amounts: stable error codes and the COMMON `ModuleResult` shape.
 * Messages are fixed strings: they never embed amounts, keys, handles or the offending input.
 * Internal, future-only module (docs/future/modules/P13-confidential-amounts/SPEC.md); not exported from the package entry.
 */

/** Stable P13 error codes. */
export type P13Code =
  | 'P13_INVALID_AMOUNT'
  | 'P13_AMOUNT_RANGE'
  | 'P13_PRECISION'
  | 'P13_OVERFLOW'
  | 'P13_CONSERVATION'
  | 'P13_INVALID_ASSET'
  | 'P13_ASSET_NOT_APPROVED'
  | 'P13_NETWORK_REFUSED'
  | 'P13_MANIFEST_MISMATCH'
  | 'P13_DISABLED'
  | 'P13_UNSUPPORTED'
  | 'P13_SETTLEMENT_DISABLED'
  | 'P13_CONSENT_REQUIRED'
  | 'P13_FEE_UNSUPPORTED'
  | 'P13_INVOICE_INCOMPATIBLE'
  | 'P13_STALE'
  | 'P13_CANCELLED'
  | 'P13_TRANSITION'
  | 'P13_SECRET_DISPOSED'
  | 'P13_SECRET_SERIALIZE'
  | 'P13_RECORD_INVALID'
  | 'P13_RECORD_AUTH'
  | 'P13_RECORD_CONFLICT'
  | 'P13_RECORD_ROLLBACK'
  | 'P13_RECORD_LIMIT'
  | 'P13_INTERNAL';

/** COMMON section 3 result shape. */
export type ModuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: P13Code; readonly retryable: boolean };

/** Error carrying a stable {@link P13Code}. */
export class P13Error extends Error {
  /** Machine-readable code. */
  public readonly code: P13Code;
  /** Whether the same call may succeed later without a changed input. */
  public readonly retryable: boolean;

  /**
   * @param code Stable code.
   * @param message Fixed text; must not contain secrets, amounts or input echoes.
   * @param retryable Default false.
   */
  public constructor(code: P13Code, message: string, retryable = false) {
    super(message);
    this.name = 'P13Error';
    this.code = code;
    this.retryable = retryable;
  }
}

/** Throws a {@link P13Error}. */
export function fail(code: P13Code, message: string, retryable = false): never {
  throw new P13Error(code, message, retryable);
}

/** Throws `code` unless `ok`. */
export function check(ok: boolean, code: P13Code, message: string): asserts ok {
  if (!ok) fail(code, message);
}

function failure(e: unknown): { readonly ok: false; readonly code: P13Code; readonly retryable: boolean } {
  // Unknown errors (SDK, platform) are not echoed: their messages may contain provider text or values.
  if (e instanceof P13Error) return { ok: false, code: e.code, retryable: e.retryable };
  return { ok: false, code: 'P13_INTERNAL', retryable: false };
}

/** Runs `fn` and converts a thrown error into a failed {@link ModuleResult}. */
export function toResult<T>(fn: () => T): ModuleResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return failure(e);
  }
}

/** Async variant of {@link toResult}. */
export async function toResultAsync<T>(fn: () => Promise<T>): Promise<ModuleResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return failure(e);
  }
}
