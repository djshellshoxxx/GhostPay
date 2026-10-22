/** Machine-readable error codes thrown by the sandbox package. */
export type SandboxErrorCode =
  | 'invalid-option'
  | 'invalid-rng'
  | 'invalid-clock'
  | 'invalid-address'
  | 'invalid-amount'
  | 'unknown-account'
  | 'insufficient-funds'
  | 'same-account'
  | 'limit-exceeded'
  | 'id-collision'
  | 'not-test-mode'
  | 'test-data-in-real-context'
  | 'real-data-in-test-context'
  | 'invalid-faucet-source'
  | 'invalid-profile';

/**
 * Error carrying a stable code so UI can map it to an i18n key.
 * @security Messages never include secrets; sandbox data is fake by construction.
 */
export class SandboxError extends Error {
  public readonly code: SandboxErrorCode;

  public constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}
