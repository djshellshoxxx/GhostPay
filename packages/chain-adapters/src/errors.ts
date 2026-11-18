/** Machine-readable failure codes for @ghostpay/chain-adapters. */
export type AdapterErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_MANIFEST'
  | 'DEPLOYMENT_UNVERIFIED'
  | 'PAYMENT_UNVERIFIED'
  | 'CHAIN_DISABLED'
  | 'CHAIN_MISMATCH'
  | 'PREVIEW_MISMATCH'
  | 'UNSUPPORTED_TOKEN'
  | 'FEE_REJECTED'
  | 'RPC_URL_REJECTED'
  | 'RPC_FAILURE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_LOG'
  | 'QUOTE_FAILED'
  | 'SIGNING_FAILED';

/**
 * Error thrown by every function in this package. Messages are short, fixed-form
 * descriptions of the failure site; they never embed secrets, RPC URLs with
 * credentials or raw chain payloads.
 */
export class ChainAdapterError extends Error {
  /** Machine-readable failure code. */
  public readonly code: AdapterErrorCode;
  /**
   * True only when a JSON-RPC node answered that execution failed: it reverted, ran out of gas or hit an invalid opcode
   * (see `createClient`). A sanitized boolean: the node's message and revert data are never kept, so a dry run can
   * refuse a failing call without echoing node text.
   */
  public readonly reverted: boolean;

  /** True only for a positively identified plain EVM revert, excluding gas/opcode failures and unknown halts. */
  public readonly executionReverted: boolean;

  public constructor(code: AdapterErrorCode, detail: string, options: { readonly reverted?: boolean; readonly executionReverted?: boolean } = {}) {
    super(`${code}: ${detail}`);
    this.name = 'ChainAdapterError';
    this.code = code;
    this.reverted = options.reverted === true;
    this.executionReverted = this.reverted && options.executionReverted === true;
  }
}

/** @internal */
export function fail(code: AdapterErrorCode, detail: string): never {
  throw new ChainAdapterError(code, detail);
}
