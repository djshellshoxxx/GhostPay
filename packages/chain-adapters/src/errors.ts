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
   * True only when a JSON-RPC node answered that execution reverted (see `createClient`). A sanitized boolean: the
   * node's message and revert data are never kept, so a dry run can refuse a revert without echoing node text.
   */
  public readonly reverted: boolean;

  public constructor(code: AdapterErrorCode, detail: string, options: { readonly reverted?: boolean } = {}) {
    super(`${code}: ${detail}`);
    this.name = 'ChainAdapterError';
    this.code = code;
    this.reverted = options.reverted === true;
  }
}

/** @internal */
export function fail(code: AdapterErrorCode, detail: string): never {
  throw new ChainAdapterError(code, detail);
}
