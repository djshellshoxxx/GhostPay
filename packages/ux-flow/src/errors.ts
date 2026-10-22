/** Error codes thrown by ux-flow for malformed input (programmer or untrusted-data errors). */
export type FlowErrorCode =
  | 'PROOF_TOO_LARGE'
  | 'PROOF_ENCODING'
  | 'PROOF_FORMAT'
  | 'PROOF_VERSION'
  | 'BAD_AMOUNT'
  | 'BAD_TX_HASH'
  | 'BAD_NONCE'
  | 'BAD_CHAIN'
  | 'BAD_TOKEN'
  | 'BAD_TIME'
  | 'BAD_TOLERANCE'
  | 'BAD_INVOICE'
  | 'INVALID_TRANSITION'
  | 'BAD_CLOCK'
  | 'BAD_CHANGE'
  | 'DUPLICATE_ID'
  | 'QUEUE_FULL'
  | 'BAD_SNAPSHOT'
  | 'BAD_LINK'
  | 'BAD_ORIGIN'
  | 'BAD_LABEL'
  | 'BAD_OPTION'
  | 'BAD_RETURN';

/**
 * The only error type ux-flow throws. Messages never include secret or untrusted payload text beyond the code.
 * @security Callers can branch on `code`; message text is for developers only.
 */
export class FlowError extends Error {
  readonly code: FlowErrorCode;
  constructor(code: FlowErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'FlowError';
    this.code = code;
  }
}
