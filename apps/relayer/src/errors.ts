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

/** Shorthand constructor for a 400 validation failure; `field` is a fixed field name. */
export function invalid(field: string): RelayerError {
  return new RelayerError(400, `invalid_${field}`);
}
