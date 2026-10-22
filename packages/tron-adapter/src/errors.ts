/** Stable failure codes. Messages are fixed strings and never embed caller data. */
export type TronErrorCode =
  | 'INVALID_ADDRESS'
  | 'INVALID_META_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'INVALID_INPUT'
  | 'INVALID_MEMO'
  | 'INVALID_PROTOBUF'
  | 'CHAIN_MISMATCH'
  | 'CHAIN_DISABLED'
  | 'TRANSPORT_FAILURE'
  | 'INVALID_RESPONSE'
  | 'INSECURE_ENDPOINT'
  | 'ABORTED'
  | 'UNSUPPORTED'
  | 'KEY_MISMATCH'
  | 'SIGNATURE_INVALID';

const MESSAGES: Readonly<Record<TronErrorCode, string>> = {
  INVALID_ADDRESS: 'invalid TRON address',
  INVALID_META_ADDRESS: 'invalid TRON stealth meta-address',
  INVALID_AMOUNT: 'invalid amount',
  INVALID_INPUT: 'invalid input',
  INVALID_MEMO: 'invalid stealth announcement memo',
  INVALID_PROTOBUF: 'invalid protobuf encoding',
  CHAIN_MISMATCH: 'object is for another chain',
  CHAIN_DISABLED: 'chain is disabled for this adapter',
  TRANSPORT_FAILURE: 'RPC request failed',
  INVALID_RESPONSE: 'RPC returned an invalid response',
  INSECURE_ENDPOINT: 'RPC endpoint must use https (or localhost)',
  ABORTED: 'operation aborted',
  UNSUPPORTED: 'operation is not supported',
  KEY_MISMATCH: 'derived key does not control the announced address',
  SIGNATURE_INVALID: 'produced signature failed verification',
};

/** Error type thrown by every function in this package. */
export class TronAdapterError extends Error {
  public readonly code: TronErrorCode;
  public constructor(code: TronErrorCode) {
    super(MESSAGES[code]);
    this.name = 'TronAdapterError';
    this.code = code;
  }
}

/** @internal */
export function fail(code: TronErrorCode): never {
  throw new TronAdapterError(code);
}
