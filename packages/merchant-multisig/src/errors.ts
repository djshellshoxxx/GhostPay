/**
 * Typed failures. Messages are fixed strings and never echo caller input;
 * `path` is only ever a schema-defined field path such as `signers[2].publicKey`.
 */
export type MultisigErrorCode =
  | 'POLICY'
  | 'PROPOSAL'
  | 'SIGNING'
  | 'BINDING'
  | 'REPLAY'
  | 'EXPIRED'
  | 'TIMELOCK'
  | 'THRESHOLD'
  | 'STATE'
  | 'LIMIT';

const MESSAGES: Readonly<Record<MultisigErrorCode, string>> = {
  POLICY: 'invalid multisig policy',
  PROPOSAL: 'invalid proposal',
  SIGNING: 'signing failed',
  BINDING: 'proposal is bound to a different account, chain or policy',
  REPLAY: 'proposal nonce is not the next expected nonce',
  EXPIRED: 'proposal is expired or not yet valid',
  TIMELOCK: 'proposal timelock has not elapsed or cannot elapse before expiry',
  THRESHOLD: 'approval threshold not met',
  STATE: 'invalid account state transition',
  LIMIT: 'size limit exceeded',
};

/** The only error class thrown by this package. */
export class MultisigError extends Error {
  public readonly code: MultisigErrorCode;
  public readonly path: string | undefined;

  public constructor(code: MultisigErrorCode, path?: string) {
    super(path === undefined ? MESSAGES[code] : `${MESSAGES[code]} (${path})`);
    this.name = 'MultisigError';
    this.code = code;
    this.path = path;
  }
}
