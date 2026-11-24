import type { Hex } from 'viem';

/**
 * Error raised anywhere in the relay and mapped one-to-one to an HTTP response.
 *
 * @remarks `code` is a fixed lowercase snake_case class (also the only error text that is ever logged
 * or returned); no request data is ever embedded in it.
 */
export class RelayerError extends Error {
  /** HTTP status to answer with. */
  public readonly status: number;
  /** Stable machine-readable error class. */
  public readonly code: string;
  /** Optional `Retry-After` seconds. */
  public readonly retryAfterSeconds: number | undefined;

  public constructor(status: number, code: string, retryAfterSeconds?: number) {
    super(code);
    this.name = 'RelayerError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Thrown by a {@link import('./chain.js').ChainClient} when the simulation of a sweep reverts.
 *
 * @remarks Only the revert CLASS leaves the chain client: the decoded custom error name of the
 * contract when known, otherwise `undefined`.
 */
export class SimulationRevert extends Error {
  /** Decoded Solidity custom error name, if any. */
  public readonly errorName: string | undefined;

  public constructor(errorName?: string) {
    super('simulation_revert');
    this.name = 'SimulationRevert';
    this.errorName = errorName;
  }
}

/**
 * Thrown by {@link import('./chain.js').ChainClient.sendSweep} only when the transaction certainly did not enter a
 * mempool: it was never handed to the RPC (encoding, chain id check, signing), or the node answered the one
 * `eth_sendRawTransaction` with a rejection of this transaction. Its reservations may be released and its nonce reused.
 */
export class SendRefused extends Error {
  public constructor() {
    super('send_refused');
    this.name = 'SendRefused';
  }
}

/**
 * Thrown by {@link import('./chain.js').ChainClient.sendSweep} when the signed transaction was handed to the RPC and the
 * answer proves nothing (timeout, connection reset, HTTP error, unrecognised or "already known" node error). The
 * transaction may be in a mempool. Any other error from `sendSweep` is treated the same way (fail closed).
 */
export class SendOutcomeUnknown extends Error {
  /** Hash of the signed transaction bytes, so a later receipt lookup can settle it. */
  public readonly txHash: Hex | undefined;

  public constructor(txHash?: Hex) {
    super('send_outcome_unknown');
    this.name = 'SendOutcomeUnknown';
    this.txHash = txHash;
  }
}

/** Shorthand constructor for a 400 validation failure; `field` is a fixed field name. */
export function invalid(field: string): RelayerError {
  return new RelayerError(400, `invalid_${field}`);
}
