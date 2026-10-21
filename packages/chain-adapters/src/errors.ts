/** Machine-readable failure codes for @ghostpay/chain-adapters. */
export type AdapterErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_MANIFEST'
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
  | 'MANIFEST_READBACK_FAILED'
  | 'REGISTRY_UNAVAILABLE'
  | 'SIGNING_FAILED';

/**
 * Error thrown by every function in this package. Messages are short, fixed-form
 * descriptions of the failure site; they never embed secrets, RPC URLs with
 * credentials or raw chain payloads.
 */
export class ChainAdapterError extends Error {
  /** Machine-readable failure code. */
  public readonly code: AdapterErrorCode;

  public constructor(code: AdapterErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ChainAdapterError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: AdapterErrorCode, detail: string): never {
  throw new ChainAdapterError(code, detail);
}
