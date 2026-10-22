/** Stable error codes thrown by the sandbox. */
export type SandboxErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'INVALID_CONFIG'
  | 'INVALID_CLOCK'
  | 'FAUCET_LIMIT'
  | 'FAUCET_COOLDOWN'
  | 'REORG_DEPTH'
  | 'NOT_TEST_CHAIN'
  | 'NOT_TEST_INVOICE'
  | 'UNKNOWN_TX';

/** Base class of every error thrown by this package. Messages never embed caller input. */
export class SandboxError extends Error {
  public readonly code: SandboxErrorCode;

  public constructor(code: SandboxErrorCode, message: string) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}
