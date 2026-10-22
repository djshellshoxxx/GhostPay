/**
 * Stable machine-readable failure codes of `@ghostpay/policy-scheme`. Messages are
 * fixed strings plus an optional field name chosen by this package; they never
 * embed key bytes, signatures or caller-supplied values.
 */
export type PolicySchemeErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_HEX'
  | 'INVALID_INPUT'
  | 'INVALID_DELAY'
  | 'INVALID_POLICY'
  | 'INVALID_LIMIT'
  | 'DUPLICATE_TOKEN'
  | 'EMPTY_TREE'
  | 'UNKNOWN_TOKEN'
  | 'INVALID_PROOF'
  | 'INVALID_META_ADDRESS'
  | 'INVALID_ANNOUNCEMENT'
  | 'NOT_MATCHED'
  | 'SIGNING_FAILED';

const MESSAGES: Readonly<Record<PolicySchemeErrorCode, string>> = {
  INVALID_ADDRESS: 'invalid address',
  INVALID_HEX: 'invalid hex value',
  INVALID_INPUT: 'invalid input',
  INVALID_DELAY: 'invalid delay',
  INVALID_POLICY: 'invalid policy',
  INVALID_LIMIT: 'invalid token limit',
  DUPLICATE_TOKEN: 'limits tree contains a token more than once',
  EMPTY_TREE: 'limits tree needs at least one leaf',
  UNKNOWN_TOKEN: 'token has no leaf in the limits tree',
  INVALID_PROOF: 'merkle proof does not verify',
  INVALID_META_ADDRESS: 'invalid scheme-2 meta-address',
  INVALID_ANNOUNCEMENT: 'invalid scheme-2 announcement',
  NOT_MATCHED: 'announcement does not pay these keys and policy',
  SIGNING_FAILED: 'signing failed',
};

/** Error type thrown by every function in this package (key errors from core-crypto pass through). */
export class PolicySchemeError extends Error {
  /** Machine-readable failure code. */
  public readonly code: PolicySchemeErrorCode;

  /**
   * @param code Failure code.
   * @param field Optional package-chosen field name (never user data).
   */
  public constructor(code: PolicySchemeErrorCode, field?: string) {
    super(field === undefined ? MESSAGES[code] : `${MESSAGES[code]}: ${field}`);
    this.name = 'PolicySchemeError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: PolicySchemeErrorCode, field?: string): never {
  throw new PolicySchemeError(code, field);
}
