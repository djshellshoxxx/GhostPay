/** Stable error codes thrown by this package. Messages are fixed text and never carry amounts. */
export type AmountBlurErrorCode =
  | 'INVALID_INPUT'
  | 'PART_BELOW_FLOOR'
  | 'HORIZON_TOO_SHORT'
  | 'CAP_EXCEEDED'
  | 'RANDOM_FAILED'
  | 'CHAIN_NOT_ALLOWED';

/** Error carrying a stable {@link AmountBlurErrorCode}. */
export class AmountBlurError extends Error {
  /** Machine-readable code. */
  public readonly code: AmountBlurErrorCode;

  /**
   * @param code Stable code.
   * @param message Fixed text (no caller data).
   */
  public constructor(code: AmountBlurErrorCode, message: string) {
    super(message);
    this.name = 'AmountBlurError';
    this.code = code;
  }
}

/** @internal Throws an {@link AmountBlurError}. */
export function fail(code: AmountBlurErrorCode, message: string): never {
  throw new AmountBlurError(code, message);
}

/** EVM chain ids this testnet-only package accepts: anvil, Ethereum Sepolia, Base Sepolia. */
export const ALLOWED_CHAIN_IDS: readonly number[] = Object.freeze([31337, 11155111, 84532]);

/**
 * Testnet-only guard, called at every exported entry point that takes a chain.
 *
 * @security Refuses mainnet ids so no blur plan can be produced for real funds.
 * @param chainId EIP-155 chain id.
 * @throws {AmountBlurError} `CHAIN_NOT_ALLOWED` for any id outside {@link ALLOWED_CHAIN_IDS}.
 */
export function assertTestnetChain(chainId: number): void {
  if (!Number.isInteger(chainId) || !ALLOWED_CHAIN_IDS.includes(chainId)) {
    fail('CHAIN_NOT_ALLOWED', 'amount-blur is testnet-only (31337, 11155111, 84532)');
  }
}

/** @internal Integer in range check. */
export function requireInt(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail('INVALID_INPUT', `${what} out of range`);
  return v;
}
